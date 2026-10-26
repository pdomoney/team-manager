import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceCrewOverview } from '../site/p06-workspace-overview.js';

const workspace=()=>({
 id:'team1',team:{name:'Club 1 Oztag',sport:'Oztag',clubId:'club1'},players:[],
 matches:[{id:'m1',date:'2026-11-17',status:'scheduled',crew:[]}],
 clubs:[{id:'club1',name:'Club One',sport:'Oztag'}, {id:'club2',name:'Club Two',sport:'Rugby league'}],
 teams:[{id:'team2',team:{name:'Club 2 League',sport:'Rugby league',clubId:'club2'},
         players:[],matches:[{id:'m2',date:'2026-11-18',status:'scheduled',crew:[]}]}],
 matchOfficials:[{id:'v1',name:'PRIVATE PERSON',privateNotes:'PRIVATE MEDICAL',active:true}],
 volunteerAppointments:[
  {id:'a1',personId:'v1',scopeType:'club',scopeId:'club1',role:'Volunteer coordinator',status:'accepted'},
  {id:'a2',personId:'v1',scopeType:'club',scopeId:'club2',role:'Assistant',status:'invited'}
 ]
});
test('P06G local overview counts only clubs in the existing encrypted workspace',()=>{
 const ws=workspace(),before=JSON.stringify(ws),result=workspaceCrewOverview(ws);
 assert.equal(result.scope,'single-encrypted-workspace');
 assert.equal(result.clubs.length,2);
 assert.deepEqual(result.totals,{fixtures:2,covered:0,attention:0,unverified:2});
 assert.equal(JSON.stringify(ws),before);
});
test('P06G sport filter distinguishes Oztag and Rugby league without inventing rules',()=>{
 const all=workspaceCrewOverview(workspace(),{sport:'Oztag'});
 assert.deepEqual(all.clubs.map(x=>x.clubId),['club1']);
 assert.deepEqual(all.totals,{fixtures:1,covered:0,attention:0,unverified:1});
 const league=workspaceCrewOverview(workspace(),{sport:'Rugby league'});
 assert.deepEqual(league.clubs.map(x=>x.clubId),['club2']);
});
test('P06G explicit club restrictions cannot query unknown external clubs',()=>{
 const r=workspaceCrewOverview(workspace(),{clubIds:['external-club']});
 assert.equal(r.totals.fixtures,0);
 assert.deepEqual(r.clubs,[]);
 const selected=workspaceCrewOverview(workspace(),{clubIds:['club2','external-club']});
 assert.deepEqual(selected.clubs.map(x=>x.clubId),['club2']);
});
test('P06G summary exposes only counts, never private person data or underlying appointment IDs',()=>{
 const r=workspaceCrewOverview(workspace()),raw=JSON.stringify(r);
 assert.equal(raw.includes('PRIVATE'),false);
 assert.equal(raw.includes('v1'),false);
 assert.equal(raw.includes('a1'),false);
 assert.equal(r.clubs[0].manualAcceptedAppointments,1);
 assert.equal(r.clubs[1].appointmentsNeedingReview,1);
 assert.equal(Object.isFrozen(r),true);
 assert.equal(Object.isFrozen(r.clubs[0]),true);
});
test('P06G empty or mismatched sport produces zero totals without false-ready status',()=>{
 const r=workspaceCrewOverview(workspace(),{sport:'Netball'});
 assert.deepEqual(r.totals,{fixtures:0,covered:0,attention:0,unverified:0});
 assert.equal(r.clubs.length,0);
});
