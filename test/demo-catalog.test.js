import test from 'node:test';
import assert from 'node:assert/strict';
import {recognisedDemoWorkspace,appendMissingDemoTeams} from '../site/demo-catalog.js';

const club=(id,name)=>({id,name});
const team=(id,clubId)=>({id,team:{name:id,clubId},plays:[{id:'legacy-oztag',name:'Original Oztag play'}]});
function qa(){
  return {...team('qacometsmixed','qa-comets'),schema:4,
    clubs:[club('qa-comets','Example Comets Club'),club('qa-rangers','Example Rangers Club'),club('qa-stars','Example Stars Club')],
    teams:[team('qarangers16','qa-rangers'),team('qastarswomen','qa-stars')],
    competitions:[],matchOfficials:[],volunteerAppointments:[],
    library:{plays:[{id:'saved-play',name:'My edited play'}],systems:{},playerSets:[]},
    testLibrary:{version:3,day:'2026-11-07'}};
}
function real(){
  return {...team('team1','stgeorge'),schema:4,
    clubs:[club('stgeorge','St George Oztag'),club('penrithoztag','Penrith Oztag'),
      club('engadinedragons','Engadine Dragons'),club('tarenpointtitans','Taren Point Titans')],
    teams:[team('testtitans','tarenpointtitans'),team('testleague','tarenpointtitans')],
    competitions:[{id:'testgala',name:'Gala'}],
    matchOfficials:[{id:'testvol1',name:'Fictional volunteer'}],
    volunteerAppointments:[],
    library:{plays:[],systems:{},playerSets:[]},
    testLibrary:{version:3,day:'2026-11-07'}};
}
test('legacy Safari P12 copy adds missing real clubs and teams without overwriting saved plays or primary identity',()=>{
  const target=qa(),record=target.plays,library=target.library;
  const before=JSON.stringify([target.plays,target.library,target.teams[0]]);
  const result=appendMissingDemoTeams(target,real());
  assert.equal(result.changed,true);
  assert.equal(result.clubs,4);
  assert.equal(result.teams,3);
  assert.equal(result.competitions,1);
  assert.equal(result.matchOfficials,1);
  assert.equal(target.id,'qacometsmixed');
  assert.equal(target.teams.some(t=>t.id==='testtitans'),true);
  const importedPrimary=target.teams.find(t=>t.id==='team1');
  assert.ok(importedPrimary);
  for(const wsKey of ['teams','clubs','library','competitions','testLibrary','matchOfficials'])
    assert.equal(Object.hasOwn(importedPrimary,wsKey),false,'workspace-only field '+wsKey+' must not be nested in a team');
  assert.equal(JSON.stringify([record,library,target.teams[0]]),before);
  assert.equal(target.plays.some(p=>p.id==='legacy-oztag'),true);
  assert.equal(appendMissingDemoTeams(target,real()).changed,false);
  assert.equal(new Set([target.id,...target.teams.map(t=>t.id)]).size,6);
});
test('an older four-club workspace keeps its own team and library when QA teams are supplied separately',()=>{
  const target=real();
  target.clubs.push(club('qa-comets','Example Comets Club'));
  target.teams.push(team('qacometsmixed','qa-comets'));
  const original=JSON.stringify(target);
  assert.equal(recognisedDemoWorkspace(target),true);
  assert.equal(appendMissingDemoTeams(target,real()).changed,false);
  assert.equal(JSON.stringify(target),original);
});
test('unrecognised or unversioned local workspaces are not silently converted',()=>{
  const scratch={...qa(),testLibrary:undefined};
  const before=JSON.stringify(scratch);
  assert.equal(recognisedDemoWorkspace(scratch),false);
  assert.equal(appendMissingDemoTeams(scratch,real()).changed,false);
  assert.equal(JSON.stringify(scratch),before);
  const unrelated={...qa(),id:'other',team:{name:'Private team',clubId:'other'},teams:[]};
  assert.equal(recognisedDemoWorkspace(unrelated),false);
  assert.equal(appendMissingDemoTeams(unrelated,real()).changed,false);
});
