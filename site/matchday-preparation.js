// P11L: single, read-only coach preparation summary for non-Oztag fixtures.
// Aggregates existing exact-season data and unresolved competition rules.
// Never derives eligibility, team formations, approved scoring or automatic updates.
import {matchRosterReadiness} from './matchday-roster-readiness.js';
import {rosterRecordReview} from './matchday-roster-review.js';
import {matchArrivalGate} from './matchday-arrival-gate.js';
import {teamSport} from './model.js';
const frozen=Object.freeze;
export function matchPreparationSummary(teamData,match,club=null,today='',rulesChecklist=null){
  const sport=teamSport(teamData?.team,club);
  if(sport==='Oztag')return frozen({state:'legacy-oztag',
    reason:'Existing Oztag Match Day tools remain unchanged.',
    mayEdit:false,mayScore:false,verifiedEligibility:false});
  const readiness=matchRosterReadiness(teamData,match,club);
  const arrival=matchArrivalGate(teamData,match,club,today);
  const records=rosterRecordReview(readiness);
  const hasRoster=readiness.state==='view-only';
  const counts=hasRoster?readiness.groups.map(g=>frozen({id:g.id,label:g.label,count:g.count})):[];
  const arrivalCount=arrival.mode==='blocked'?0:
    arrival.playerIds.filter(id=>match?.arrived?.[id]===true).length;
  const questions=Array.isArray(rulesChecklist?.questions)?rulesChecklist.questions.length:0;
  const blockers=Array.isArray(rulesChecklist?.blockers)?rulesChecklist.blockers.length:0;
  return frozen({
    state:hasRoster?'review-only':'unavailable',
    reason:hasRoster?'Recorded participation is not proof of eligibility.':readiness.reason,
    sport,season:hasRoster?readiness.season:'',
    teamId:typeof teamData?.id==='string'?teamData.id:'',
    matchId:typeof match?.id==='string'?match.id:'',
    seasonId:typeof match?.seasonId==='string'?match.seasonId:'',
    total:hasRoster?readiness.total:0,counts:frozen(counts),
    conflictingRecords:records.total,arrivalCount,
    arrivalMode:arrival.mode,arrivalReason:arrival.reason,
    canOpenRoster:hasRoster,canOpenVenue:hasRoster&&arrival.mode!=='blocked',
    requiredRulesQuestions:questions,scopeRuleBlockers:blockers,
    rulesReady:false,mayScore:false,mayEdit:false,
    approvedLineup:false,verifiedEligibility:false,noWrites:true
  });
}
