// P07A: deterministic fixture provenance audit of local coach-owned records.
// This does NOT verify an organiser, confirm an external feed or grant data access.
import { teamsOf, findTeam, findEntry, clubOf, teamSport, matchKind, arr } from './model.js';

const word = x => typeof x === 'string' ? x.trim() : '';
const CLASSES = new Set(['friendly','unlinked','competition','tournament']);
const issue = (list,message)=>{if(!list.includes(message))list.push(message);};

export function fixtureAuthority(ws, teamId, matchId) {
  const team=findTeam(ws,teamId);
  const match=arr(team?.matches).find(m=>m?.id===matchId);
  if(!team||!match)return null;
  const problems=[];
  const club=clubOf(ws,team), sport=teamSport(team.team,club);
  const requestedEntry=word(match.entryId);
  const relation=requestedEntry ? findEntry(ws,requestedEntry) : null;
  let kind=match.friendly ? 'friendly' : 'unlinked', entryStatus='none', competitionId='';
  if(requestedEntry){
    if(!relation) {
      entryStatus='missing';
      issue(problems,'Competition entry reference is missing from this workspace');
    } else if(relation.entry.teamId!==team.id){
      entryStatus='wrong-team';
      issue(problems,'Competition entry belongs to another team; never borrow its fixture authority');
    } else {
      entryStatus=relation.entry.status === 'withdrawn' ? 'withdrawn' : 'entered';
      competitionId=word(relation.comp.id);
      kind=matchKind(ws,match).kind;
      if(relation.entry.status==='withdrawn')
        issue(problems,'Competition entry is withdrawn; confirm before treating fixture as scheduled');
      if(word(relation.comp.sport) && word(relation.comp.sport)!==sport)
        issue(problems,'Competition sport does not match this team');
      if(word(relation.entry.seasonId) && !arr(team.seasons).some(s=>s?.id===relation.entry.seasonId))
        issue(problems,'Competition entry season is not present in the team history');
    }
    if(match.friendly)issue(problems,'Friendly flag conflicts with an attached competition entry');
  }
  if(match.status === 'cancelled') issue(problems,'Fixture is cancelled; preserve historical record');
  if(!CLASSES.has(kind))kind='unlinked';
  return Object.freeze({
    teamId:team.id,matchId:match.id,clubId:word(team.team?.clubId),
    sport,kind,competitionId,entryStatus,
    recordedDate:word(match.date),recordedStatus:word(match.status),
    recordAuthority:'local-coach-workspace',
    sourceVerification:'not-independently-verified',
    officialFixture:false,
    reviewRequired:problems.length>0,
    issues:Object.freeze(problems)
  });
}

export function fixtureAuthoritySummary(ws, clubId='') {
  const required=word(clubId),fixtures=[];
  for(const team of teamsOf(ws)) {
    if(team?.archived || (required && word(team?.team?.clubId)!==required))continue;
    for(const match of arr(team.matches)){
      if(!match?.id)continue;
      const item=fixtureAuthority(ws,team.id,match.id);
      if(item) fixtures.push(item);
    }
  }
  const counts={fixtures:fixtures.length,linked:0,unlinked:0,review:0,
    notIndependentlyVerified:fixtures.length};
  for(const f of fixtures){
    if(f.kind==='competition'||f.kind==='tournament')counts.linked++;
    else counts.unlinked++;
    if(f.reviewRequired)counts.review++;
  }
  // No person details, student/player names, outcomes, medical or identity data.
  return Object.freeze({scope:'existing-encrypted-workspace',clubId:required,
    totals:Object.freeze(counts),
    fixtures:Object.freeze(fixtures)});
}
