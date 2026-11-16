// M2.1: Read-only intake stages for the current team's existing Squad records.
// Reuses the D04 team placement history. Neither an approved team placement
// nor an old placement event is registration, finance or match eligibility.
import {teamPlacementStatus} from './team-placement-decisions.js';

export const INTAKE_STAGES=Object.freeze([
  Object.freeze({id:'all',label:'All'}),
  Object.freeze({id:'not-nominated',label:'Not nominated'}),
  Object.freeze({id:'nominated',label:'Awaiting approval'}),
  Object.freeze({id:'team-approved',label:'Team approved'}),
  Object.freeze({id:'withdrawn',label:'Withdrawn'}),
  Object.freeze({id:'unresolved',label:'Review record'})
]);
const KNOWN=new Set(INTAKE_STAGES.map(x=>x.id).filter(x=>x!=='all'));
const validId=x=>typeof x==='string'&&x.length>0;

export function rosterIntakeReview(team,visiblePlayers){
  if(!team||!validId(team.id)||!Array.isArray(team.players)||
     !Array.isArray(visiblePlayers))return null;
  const members=new Set(team.players.filter(x=>validId(x?.id)).map(x=>x.id));
  const seen=new Set(),statusByPlayerId=Object.create(null);
  const counts=Object.fromEntries(INTAKE_STAGES.map(x=>[x.id,0]));
  for(const player of visiblePlayers){
    const id=player?.id;
    // Do not count a stale/cross-team row or duplicate as a current member.
    if(!validId(id)||!members.has(id)||seen.has(id))continue;
    seen.add(id);
    const state=teamPlacementStatus(team,id).state;
    const stage=KNOWN.has(state)?state:'unresolved';
    statusByPlayerId[id]=stage;
    counts[stage]++;
    counts.all++;
  }
  return Object.freeze({
    teamId:team.id,
    total:counts.all,
    counts:Object.freeze(counts),
    statusByPlayerId:Object.freeze(statusByPlayerId),
    // Explicitly *not* inferred from team placement, squad membership or time.
    registrationVerified:false,financiallyCleared:false,competitionEligible:null,
    seasonSpecificVerification:false
  });
}

export function rosterIntakeMatches(review,playerId,filter='all'){
  if(!review||!validId(playerId)||!Object.hasOwn(review.statusByPlayerId,playerId))return false;
  return filter==='all'||KNOWN.has(filter)&&review.statusByPlayerId[playerId]===filter;
}
