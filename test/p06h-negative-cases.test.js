import test from 'node:test';
import assert from 'node:assert/strict';
import { canCrewServe, matchCrewCheck, crewScheduleClashes, crewProfile } from '../site/match-crew.js';
import { fixtureReadinessIndex } from '../site/p06-readiness.js';
import { clubCrewActions } from '../site/p06-actions.js';
import { volunteerRemovalCheck } from '../site/p06-volunteer-lifecycle.js';
import { reviewVolunteerAppointments } from '../site/p06-appointments.js';

const date = '2026-11-11';
const club = { id:'sample-club', name:'Synthetic Club', sport:'Oztag' };
const team = (id, sport) => ({
  id, team:{ name:id, sport, clubId:club.id }, players:[],matches:[]
});
const policy = (sport, rows) => ({sport,year:'2026',source:'Synthetic coach review (not official)',
  rows:rows.map(([role,min])=>({role,min}))});
const person = (id, sport, role, teamId, overrides={}) => ({
  id, name:'PRIVATE NAME', clubIds:[club.id],teamIds:[teamId],active:true,
  rolesBySport:{[sport]:[role]},registrationBySport:{[sport]:{coach:'2026',trainer:'2026',volunteer:'2026'}},
  squadYears:{[teamId]:'2026'},accreditationBySport:{[sport]:{[role]:'2027-01-01'}},
  wwccStatus:'checked',wwccExpiry:'2027-01-01',wwccNumber:'PRIVATE-WWCC-NUMBER',
  ...overrides
});
function fixture(sport, role, requirement, opts={}) {
  const t=team('t1',sport), p=person('v1',sport,role,t.id,opts.person || {});
  t.matches=[{id:'m1',date,start:'09:00',status:'scheduled',
    crew:[{personId:p.id,role,confirmed:true}],crewPolicy:policy(sport,[[requirement,1]])}];
  return {ws:{...t, clubs:[{...club}], teams:[],matchOfficials:[p],volunteerAppointments:[], helpers:[]},p};
}

test('P06H Rugby League shirt roles never leak into Oztag or Touch',()=>{
  for (const sport of ['Oztag','Touch football']) {
    assert.equal(crewProfile(sport).roles.includes('yellow'),false);
    assert.equal(crewProfile(sport).roles.includes('blue'),false);
    const t=team('t1',sport), p=person('v1',sport,'yellow','t1');
    assert.match(canCrewServe(p,t,'yellow',date),/Role not eligible/);
    const result=matchCrewCheck([p],t,
      {date,crew:[{personId:'v1',role:'yellow',confirmed:true}]},
      policy(sport,[['coach',1]]));
    assert.equal(result.ready,false);
  }
  const {ws,p}=fixture('Rugby league','yellow','leagueSafe');
  assert.equal(canCrewServe(p,ws,'yellow',date),'');
  assert.equal(fixtureReadinessIndex(ws,club.id).totals.covered,1);
});
test('P06H manually unverified or expired safeguarding and qualification block coverage',()=>{
  for(const changed of [
    {wwccStatus:'unverified'},
    {wwccExpiry:'2026-01-01'},
    {accreditationBySport:{Oztag:{firstAid:'2026-01-01'}}}
  ]) {
    const {ws}=fixture('Oztag','firstAid','firstAid',{person:changed});
    assert.equal(fixtureReadinessIndex(ws,club.id).totals.attention,1);
    const actions=clubCrewActions(ws,club.id);
    assert.ok(actions.some(a=>a.category==='qualification'));
    assert.equal(JSON.stringify(actions).includes('PRIVATE'),false);
  }
  // External revocation is NOT queried. A coach records an unverified status.
});
test('P06H inactive people cannot fulfil previously confirmed match roles',()=>{
  const {ws}=fixture('Oztag','firstAid','firstAid',{person:{active:false}});
  const r=fixtureReadinessIndex(ws,club.id);
  assert.equal(r.totals.attention,1);
  assert.ok(clubCrewActions(ws,club.id).some(x=>x.category==='availability'));
  assert.equal(r.fixtures[0].confirmed,0);
});
test('P06H missing people remain explicit review actions, not silently erased',()=>{
  const {ws}=fixture('Oztag','firstAid','firstAid');
  ws.matchOfficials=[];
  assert.equal(fixtureReadinessIndex(ws,club.id).totals.attention,1);
  assert.ok(clubCrewActions(ws,club.id).some(x=>x.category==='missingPerson'));
});
test('P06H overlapping confirmed assignments are flagged across teams and not marked covered',()=>{
  const {ws,p}=fixture('Oztag','firstAid','firstAid');
  const other=team('t2','Oztag');other.matches=[{id:'m2',date,start:'09:45',status:'scheduled',
    crew:[{personId:p.id,role:'firstAid',confirmed:true}],
    crewPolicy:policy('Oztag',[['firstAid',1]])}];
  ws.teams=[other];p.squadYears.t2='2026';
  assert.equal(crewScheduleClashes([ws,other],ws.id,ws.matches[0]).length,1);
  assert.equal(fixtureReadinessIndex(ws,club.id).totals.attention,2);
  assert.ok(clubCrewActions(ws,club.id).some(x=>x.category==='conflict'));
  other.matches[0].date='2026-11-12';
  assert.equal(crewScheduleClashes([ws,other],ws.id,ws.matches[0]).length,0);
});
test('P06H one person is never used twice for distinct minimum staffing roles',()=>{
  const t=team('t1','Rugby league');
  const p=person('v1','Rugby league','blue',t.id,
    {rolesBySport:{'Rugby league':['blue','orange']}});
  const m={date,crew:[{personId:p.id,role:'blue',confirmed:true},{personId:p.id,role:'orange',confirmed:true}]};
  const result=matchCrewCheck([p],t,m,policy('Rugby league',[['firstResponder',1],['level1',1]]));
  assert.equal(result.ready,false);
  assert.ok(result.issues.some(x=>/assigned twice/i.test(x)));
});
test('P06H match and ended-appointment history block hard deletion',()=>{
  const {ws}=fixture('Oztag','firstAid','firstAid');
  let c=volunteerRemovalCheck(ws,'v1');
  assert.equal(c.allowed,false);assert.equal(c.reason,'match-history');
  ws.matches=[];
  ws.volunteerAppointments=[{id:'a1',personId:'v1',scopeType:'club',scopeId:club.id,role:'Helper coordinator',status:'ended'}];
  c=volunteerRemovalCheck(ws,'v1');
  assert.equal(c.allowed,false);assert.equal(c.reason,'appointment-history');
  ws.volunteerAppointments=[];
  assert.equal(volunteerRemovalCheck(ws,'v1').allowed,true);
  assert.equal(volunteerRemovalCheck(ws,'missing').allowed,false);
});
test('P06H manually accepted appointment is flagged when volunteer becomes inactive',()=>{
 const {ws,p}=fixture('Oztag','firstAid','firstAid');
 ws.volunteerAppointments=[{id:'a1',personId:p.id,scopeType:'club',scopeId:club.id,
   role:'Assistant coordinator',status:'accepted'}];
 assert.equal(reviewVolunteerAppointments([p],ws.volunteerAppointments,{type:'club',id:club.id})[0].active,true);
 p.active=false;
 const reviewed=reviewVolunteerAppointments([p],ws.volunteerAppointments,{type:'club',id:club.id})[0];
 assert.equal(reviewed.active,false);
 assert.ok(reviewed.issues.some(x=>/Inactive volunteer/i.test(x)));
 assert.equal(ws.volunteerAppointments[0].status,'accepted'); // preserve coach's historical state
});
test('P06H helper who is also parent retains historical task reference without name matching',()=>{
 const {ws}=fixture('Oztag','firstAid','firstAid');
 ws.helpers=[{id:'h1',name:'PRIVATE NAME',playerId:'player1',relation:'Parent'}];
 ws.tasks=[{id:'task1',kind:'BBQ',who:'h:h1'}];
 const before=JSON.stringify({helpers:ws.helpers,tasks:ws.tasks});
 ws.matchOfficials[0].active=false;
 assert.equal(JSON.stringify({helpers:ws.helpers,tasks:ws.tasks}),before);
 assert.notEqual(ws.helpers[0].id,ws.matchOfficials[0].id);
 // A shared name is not evidence of a single identity. Explicit linking remains future work.
});
test('P06H unknown match policy cannot become compliant on manually confirmed attendance',()=>{
 const {ws}=fixture('Touch football','firstAid','firstAid');
 ws.matches[0].crewPolicy={};
 assert.equal(fixtureReadinessIndex(ws,club.id).totals.unverified,1);
 assert.ok(clubCrewActions(ws,club.id).some(x=>x.category==='policy'));
});
