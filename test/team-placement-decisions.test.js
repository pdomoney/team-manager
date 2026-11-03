import test from 'node:test';
import assert from 'node:assert/strict';
import {recordTeamPlacement,teamPlacementStatus} from '../site/team-placement-decisions.js';
import {reviewTeamParticipation} from '../site/future-role-decisions.js';
import {teamView} from '../site/vault.js';

const team=()=>({id:'qarangers16',team:{name:'Example Rangers U16',sport:'Oztag'},
 players:[{id:'p1',name:'Fictional Player One',number:'9',positions:[]},
  {id:'p2',name:'Fictional Player Two',number:'10',positions:[]}],
 teamPlacementEvents:[],matches:[],tasks:[],sessions:[],lineups:[],notices:[]});
const at='2026-11-03T09:00:00Z';
const actor=(role,contextGroupId='qa-rangers-16')=>({
 role,actorProfileId:role==='team_coach'?'qa-07':'qa-09',
 contextId:`grant:${role}:team:${contextGroupId}`,
 contextGroupId,contextKind:'access',contextStatus:'active',scopeTeamId:'qarangers16'
});
const act=(t,role,action,reason='Team acceptance recorded')=>{
 const res=recordTeamPlacement(t,{...actor(role),playerId:'p1',action,reason,
 expectedRevision:teamPlacementStatus(t,'p1').revision,at});
 if(!res.error)t.teamPlacementEvents=res.events;
 return res;
};

test('D04 Coach and Manager can nominate then approve exactly one fictional team player',()=>{
 const t=team(),initial=structuredClone(t);
 assert.equal(teamPlacementStatus(t,'p1').state,'not-nominated');
 assert.equal(act(t,'team_coach','nominate').status.state,'nominated');
 assert.equal(act(t,'team_manager','approve').status.state,'team-approved');
 assert.equal(t.teamPlacementEvents.length,2);
 assert.deepEqual(t.players,initial.players);
 assert.deepEqual(t.teamPlacementEvents.map(e=>e.actorProfileId),['qa-07','qa-09']);
 assert.deepEqual(t.teamPlacementEvents.map(e=>e.role),['team_coach','team_manager']);
 assert.equal(teamPlacementStatus(t,'p2').state,'not-nominated');
 assert.equal(teamPlacementStatus(t,'p1').competitionEligible,null);
 assert.equal(teamPlacementStatus(t,'p1').financiallyCleared,false);
 const model=reviewTeamParticipation({
   teamId:'qarangers16',clubId:'qa-rangers',
   nomination:{teamId:'qarangers16',by:'qa-07',role:'team_coach'},
   teamApproval:{teamId:'qarangers16',by:'qa-09',role:'team_manager',auditId:t.teamPlacementEvents.at(-1).id}
 });
 assert.equal(model.teamAccepted,true);
 assert.equal(model.fullyRegistered,false);
 assert.equal(model.clearedToPlay,null);
});
test('D04 same authorised Team Manager can nominate and approve, both actions audited',()=>{
 const t=team();
 assert.equal(act(t,'team_manager','nominate').error,undefined);
 assert.equal(act(t,'team_manager','approve').error,undefined);
 assert.equal(t.teamPlacementEvents[0].actorProfileId,t.teamPlacementEvents[1].actorProfileId);
 assert.equal(act(t,'team_manager','withdraw','Player no longer joining').status.state,'withdrawn');
 assert.equal(act(t,'team_coach','nominate').status.state,'nominated');
});
test('D02/D20 role scope and inactive/pending credentials must fail closed',()=>{
 const t=team();
 const base={...actor('team_manager'),playerId:'p1',action:'nominate',reason:'Team selection',expectedRevision:0,at};
 for(const bad of [
   {contextGroupId:'qa-comets-mixed'},
   {contextId:'grant:team_manager:team:qa-comets-mixed'},
   {contextStatus:'revoked'},
   {contextStatus:'proposed'},
   {contextKind:'membership'},
   {scopeTeamId:'qacometsmixed'},
   {role:'club_admin'},
   {actorProfileId:'pdomoney'},
   {playerId:'another-teams-player'},
   {reason:'x'},
   {action:'edit-financial-status'},
   {at:'bad'}
 ]){
   assert.ok(recordTeamPlacement(t,{...base,...bad}).error,JSON.stringify(bad));
   assert.deepEqual(t.teamPlacementEvents,[]);
 }
});
test('D04 revision check prevents stale or invalid transition, no mutation on error',()=>{
 const t=team(),candidate={...actor('team_coach'),playerId:'p1',action:'nominate',
 reason:'Welcome to squad',at,expectedRevision:0};
 const first=recordTeamPlacement(t,candidate);
 assert.equal(first.error,undefined);
 assert.deepEqual(t.teamPlacementEvents,[],'pure function does not commit until caller applies');
 t.teamPlacementEvents=first.events;
 assert.match(recordTeamPlacement(t,candidate).error,/changed since/);
 const bad=recordTeamPlacement(t,{...candidate,action:'nominate',expectedRevision:1});
 assert.match(bad.error,/not valid/);
 const approval=recordTeamPlacement(t,{...candidate,action:'approve',expectedRevision:1});
 assert.equal(approval.error,undefined);
});
test('D04 team placement decisions remain private to the Coach copy, not Player export',()=>{
 const t=team();
 act(t,'team_coach','nominate');
 const exported=JSON.stringify(teamView(t));
 assert.equal(exported.includes('teamPlacementEvents'),false);
 assert.equal(exported.includes('Team acceptance recorded'),false);
 assert.equal(exported.includes('qa-07'),false);
 assert.ok(exported.includes('Fictional Player One'));
});
