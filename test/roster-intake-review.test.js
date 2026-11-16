import test from 'node:test';
import assert from 'node:assert/strict';
import {rosterIntakeReview,rosterIntakeMatches,INTAKE_STAGES} from '../site/roster-intake-review.js';
import {recordTeamPlacement,teamPlacementStatus} from '../site/team-placement-decisions.js';
import {teamView} from '../site/vault.js';

const players=()=>Array.from({length:5},(_,i)=>({
  id:'p'+(i+1),name:'Fictional Player '+(i+1),positions:[],number:String(i+1)
}));
const team=()=>({id:'qarangers16',team:{name:'Example Rangers U16',sport:'Oztag'},
 players:players(),teamPlacementEvents:[],sessions:[],matches:[],tasks:[],lineups:[],notices:[]});
const actor=(playerId,role,action,revision,minute)=>({
  playerId,role,action,expectedRevision:revision,
  actorProfileId:role==='team_coach'?'qa-07':'qa-09',
  contextGroupId:'qa-rangers-16',contextId:'grant:'+role+':team:qa-rangers-16',
  contextKind:'access',contextStatus:'active',scopeTeamId:'qarangers16',
  reason:'Fictional team-only placement decision',
  at:'2026-11-03T09:'+String(minute).padStart(2,'0')+':00Z'
});
function apply(t,p,action,minute,role='team_manager'){
  const decision=recordTeamPlacement(t,actor(p,role,action,
    teamPlacementStatus(t,p).revision,minute));
  assert.equal(decision.error,undefined);
  t.teamPlacementEvents=decision.events;
}
test('M2.1 intake stages track exact players and all four D04 placement states',()=>{
 const t=team();
 apply(t,'p2','nominate',1);
 apply(t,'p3','nominate',2,'team_coach');
 apply(t,'p3','approve',3);
 apply(t,'p4','nominate',4);
 apply(t,'p4','withdraw',5);
 const before=structuredClone(t);
 const r=rosterIntakeReview(t,t.players);
 assert.deepEqual({...r.counts},{
   all:5,'not-nominated':2,nominated:1,'team-approved':1,withdrawn:1,unresolved:0
 });
 assert.equal(r.statusByPlayerId.p1,'not-nominated');
 assert.equal(r.statusByPlayerId.p2,'nominated');
 assert.equal(r.statusByPlayerId.p3,'team-approved');
 assert.equal(r.statusByPlayerId.p4,'withdrawn');
 for(const [id,stage] of [['p1','not-nominated'],['p2','nominated'],
                          ['p3','team-approved'],['p4','withdrawn']]){
   assert.equal(rosterIntakeMatches(r,id,stage),true);
   assert.equal(rosterIntakeMatches(r,id,'all'),true);
   assert.equal(rosterIntakeMatches(r,id,'unresolved'),false);
 }
 assert.equal(rosterIntakeMatches(r,'p999','all'),false);
 assert.equal(r.registrationVerified,false);
 assert.equal(r.financiallyCleared,false);
 assert.equal(r.competitionEligible,null);
 assert.equal(r.seasonSpecificVerification,false);
 assert.deepEqual(t,before,'read-only summary cannot change player data or decisions');
});
test('M2.1 ignores duplicate and cross-team rows, and exposes unknown history as unresolved',()=>{
 const t=team();
 t.teamPlacementEvents=[{teamId:t.id,playerId:'p2',state:'unexpected',at:'2026-11-03T09:00:00Z'}];
 const extra={id:'another-team-player',name:'Not in this team'};
 const r=rosterIntakeReview(t,[t.players[0],t.players[0],t.players[1],extra]);
 assert.deepEqual({...r.counts},{
   all:2,'not-nominated':1,nominated:0,'team-approved':0,withdrawn:0,unresolved:1
 });
 assert.equal(rosterIntakeMatches(r,'p2','unresolved'),true);
 assert.equal(rosterIntakeMatches(r,'another-team-player','all'),false);
 assert.equal(rosterIntakeMatches(r,'p1','__proto__'),false);
 assert.equal(rosterIntakeMatches(r,'p1','not-nominated'),true);
 assert.equal(rosterIntakeReview(null,t.players),null);
 assert.equal(rosterIntakeReview(t,{}),null);
 assert.ok(INTAKE_STAGES.some(x=>x.id==='unresolved'));
});
test('M2.1 status is not registration, publication or a player-side data export',()=>{
 const t=team();
 apply(t,'p1','nominate',1);
 apply(t,'p1','approve',2);
 const review=rosterIntakeReview(t,t.players);
 assert.equal(review.counts['team-approved'],1);
 assert.equal(review.registrationVerified,false);
 assert.equal(review.competitionEligible,null);
 const exported=JSON.stringify(teamView(t));
 assert.ok(!exported.includes('teamPlacementEvents'));
 assert.ok(!exported.includes('Fictional team-only placement decision'));
 assert.ok(!exported.includes('intake'));
});
