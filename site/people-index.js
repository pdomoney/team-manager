// P04: legacy-person reconciliation foundation for one trusted coach workspace.
// Pure read-only indexing + non-writing, reversible review plans. Not a login,
// global person directory, guardian legal verification, or security boundary.
// Not connected to site/app.js or persisted by the current schema-4 app.
// Actual individual accounts and per-club permission enforcement: post-P10 #55.
import { teamsOf } from './model.js';

const rows = x => Array.isArray(x) ? x : [];
const word = x => typeof x === 'string' ? x.trim() : '';
const key = (...parts) => JSON.stringify(parts);
const unique = v => [...new Set(v)];
export const PERSON_SOURCE_TYPES = Object.freeze([
  'player', 'helper', 'match-official', 'club-official', 'team-staff', 'season-staff'
]);

// Preserve exact source reference. Staff rows lack stable ID, so their index is
// advisory only; the source must not be reordered without remapping the ledger.
export function buildLocalPeopleIndex(workspace, namespace) {
  const ns = word(namespace);
  if (!ns || !workspace || typeof workspace !== 'object' || Array.isArray(workspace))
    return {error:'Trusted workspace and nonempty source namespace required'};
  const refs = [], groups = new Map(), reviews = [], seen = new Set();
  const add = (kind, parts, name, personId, clubId='', role='') => {
    if (!PERSON_SOURCE_TYPES.includes(kind)) throw Error('Unexpected legacy person kind');
    const ref = key(ns,kind,...parts);
    if (seen.has(ref)) throw Error('Duplicate source person reference requires manual correction');
    seen.add(ref);
    // Existing explicit P03/P05 player-person links are valid *within this workspace*.
    // Never join other records on name/email/phone/photo or inferred family relation.
    const personKey = personId || key(ns,'provisional-person',kind,...parts);
    const row = {sourceRef:ref,kind,personKey,displayName:word(name),
      clubId:word(clubId),role:word(role)};
    refs.push(row);
    if (!groups.has(personKey)) groups.set(personKey,{personKey,sourceRefs:[],roles:[]});
    const g=groups.get(personKey);g.sourceRefs.push(ref);g.roles.push(kind);
    return row;
  };
  const teams = teamsOf(workspace), clubById = new Map(rows(workspace.clubs).map(c=>[c.id,c]));
  const teamIds = new Set();
  for (const t of teams) {
    if (!word(t?.id) || teamIds.has(t.id)) return {error:'Duplicate/missing team ID requires manual review'};
    teamIds.add(t.id);
    const club = word(t.team?.clubId);
    const players = new Map(), helpers = new Set(), seasonIds = new Set();
    for(const p of rows(t.players)){
      if (!word(p?.id) || players.has(p.id)) return {error:'Duplicate/missing player ID requires manual review'};
      players.set(p.id, add('player',[t.id,p.id],p.name,
        word(p.personId) ? key(ns,'existing-explicit-player-personId',p.personId) : '',club,'player'));
    }
    for(const h of rows(t.helpers)){
      if(!word(h?.id) || helpers.has(h.id)) return {error:'Duplicate/missing helper ID requires manual review'};
      helpers.add(h.id);
      const helper = add('helper',[t.id,h.id],h.name,'',club,'general-helper');
      if(word(h.playerId)){
        const player=players.get(h.playerId);
        reviews.push({type:'possible-guardian',helperRef:helper.sourceRef,
          playerRef:player?.sourceRef||null,sourceTeamId:t.id,
          status:'unverified-candidate',accessGranted:false,verifiedAuthority:false});
        if(!player)reviews.push({type:'missing-helper-player',helperRef:helper.sourceRef});
      }
    }
    rows(t.team?.staff).forEach((p,i)=>add('team-staff',[t.id,i],p?.name,'',club,p?.role));
    for(const season of rows(t.seasons)){
      if (!word(season?.id) || seasonIds.has(season.id)) return {error:'Duplicate/missing season ID requires manual review'};
      seasonIds.add(season.id);
      rows(season.staff).forEach((p,i)=>add('season-staff',[t.id,season.id,i],p?.name,'',club,p?.role));
    }
  }
  const clubs = new Set();
  for(const c of rows(workspace.clubs)){
    if(!word(c?.id) || clubs.has(c.id)) return {error:'Duplicate/missing club ID requires manual review'};
    clubs.add(c.id);
    rows(c.officials).forEach((p,i)=>add('club-official',[c.id,i],p?.name,'',c.id,p?.role));
  }
  const crewIds = new Set();
  for(const p of rows(workspace.matchOfficials)){
    if(!word(p?.id) || crewIds.has(p.id)) return {error:'Duplicate/missing match staff ID requires manual review'};
    crewIds.add(p.id);
    add('match-official',[p.id],p.name,'',word(p.clubId),'match-staff');
  }
  const people=[...groups.values()].map(g=>({
    ...g, sourceRefs:g.sourceRefs.slice(), roles:unique(g.roles).sort(),
    confirmedIdentity:false,accountId:null,grantIds:[]
  })).sort((a,b)=>a.personKey.localeCompare(b.personKey));
  refs.sort((a,b)=>a.sourceRef.localeCompare(b.sourceRef));
  return {
    namespace:ns,status:'local-index-not-verified', people, references:refs,
    guardianReviewQueue:reviews, accountIds:[], roleGrants:[],
    contactsExposed:false, qualificationsExposed:false, photoDataExposed:false,
    workspaceClubCount:clubById.size
  };
}

const getRef = (index,ref) => rows(index?.references).find(r=>r.sourceRef===ref);
// Two records can be linked by one *explicitly recorded human decision*;
// the proposer cannot claim identity verification or permission. Keeping the
// two original personKeys makes the operation fully reversible as a review plan.
export function proposeLocalPersonLink(index,{firstRef,secondRef,proposedBy,reason=''}={}) {
  const a=getRef(index,firstRef),b=getRef(index,secondRef);
  if(!a||!b||a.sourceRef===b.sourceRef||!word(proposedBy))
    return {error:'Select two distinct existing local records and a reviewer'};
  if(a.personKey===b.personKey) return {error:'These records already share an explicit player identity'};
  // Align the original identity keys with sorted source references. The
  // reviewer may select either order, but saved links must be deterministic.
  const ordered=[a,b].sort((x,y)=>x.sourceRef.localeCompare(y.sourceRef));
  return {
    id:key('local-person-link',index.namespace,...ordered.map(x=>x.sourceRef)),
    namespace:index.namespace, sourceRefs:ordered.map(x=>x.sourceRef),
    priorPersonKeys:ordered.map(x=>x.personKey),
    proposedBy:word(proposedBy),reason:word(reason).slice(0,240),
    status:'proposed',humanReviewed:false,authorityVerified:false,
    changedLegacyRecords:false,accessGrants:[],accountId:null
  };
}
export function reviewLocalPersonLink(index,proposal,{reviewedBy,confirmed}={}) {
  if(!proposal||proposal.namespace!==index?.namespace||
      proposal.status!=='proposed'||!word(reviewedBy)||typeof confirmed!=='boolean')
    return {error:'Valid pending proposal, current workspace and explicit review required'};
  const refs=rows(proposal.sourceRefs), current=refs.map(ref=>getRef(index,ref));
  if(refs.length!==2||current.some(x=>!x)||current[0].personKey===current[1].personKey ||
      rows(proposal.priorPersonKeys).length!==2 ||
      current.map(x=>x.personKey).sort().join('|')!==rows(proposal.priorPersonKeys).slice().sort().join('|'))
    return {error:'Original distinct person records must still exist with unchanged identity claims'};
  if(!confirmed) return {...proposal,status:'rejected',humanReviewed:true,reviewedBy:word(reviewedBy),
    authorityVerified:false,changedLegacyRecords:false,accessGrants:[]};
  return {...proposal,status:'locally-reviewed-link-only',humanReviewed:true,reviewedBy:word(reviewedBy),
    authorityVerified:false,changedLegacyRecords:false,accessGrants:[]};
}
export function undoLocalPersonLink(proposal,{undoneBy}={}) {
  if(!proposal||proposal.status!=='locally-reviewed-link-only'||!word(undoneBy))
    return {error:'Only an explicitly reviewed local link can be reversed'};
  return {...proposal,status:'reversed',undoneBy:word(undoneBy),
    authorityVerified:false,changedLegacyRecords:false,accessGrants:[]};
}

// Guardian authority is separate even when people have been locally reviewed.
// A helper's playerId suggests a candidate but does not prove parentage.
export function proposeGuardianReview(index,{guardianRef,childPlayerRef,reviewedBy,purpose=''}={}) {
  const g=getRef(index,guardianRef),c=getRef(index,childPlayerRef);
  if(!g||!c||c.kind!=='player'||g.sourceRef===c.sourceRef||!word(reviewedBy))
    return {error:'Choose guardian and player source records and a reviewer'};
  return {
    id:key('guardian-candidate',index.namespace,g.sourceRef,c.sourceRef),
    namespace:index.namespace, guardianRef:g.sourceRef,childPlayerRef:c.sourceRef,
    reviewedBy:word(reviewedBy),purpose:word(purpose).slice(0,200),
    status:'local-review-required',guardianAuthorityVerified:false,
    guardianshipGranted:false,childRecordAccess:false,accessGrants:[]
  };
}
