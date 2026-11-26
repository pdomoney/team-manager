import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateStage3D5,isStage3D5Read} from '../src/stage3d5-management-contract.js';
const payload={sessionId:'match-1',expectedVersion:1,fixtureVersion:0,ruleId:'approved-profile'};
const request=(role,action,input=payload)=>validateStage3D5({teamId:'example-team',role,action,input});
test('explicit role permissions for match record actions',()=>{
 for(const role of ['team_coach','team_manager','team_assistant']){
  assert.ok(request(role,'matchday.score.record',{...payload,side:'home',personId:'player-1'}));
  assert.ok(request(role,'matchday.clock.pause'));
  assert.equal(!!request(role,'matchday.lineup.approve'),role==='team_coach');
  assert.equal(!!request(role,'matchday.result.approve',{...payload,confirmed:true}),role==='team_coach');
  assert.equal(!!request(role,'matchday.result.publish'),role!=='team_assistant');
 }
 assert.equal(request('team_player','matchday.score.record',{...payload,side:'away',category:'a'}),null);
 assert.ok(request('team_player','player.matchday.read',{sessionId:'match-1'}));
 assert.equal(request('team_player','matchday.read',{sessionId:'match-1'}),null);
 assert.equal(isStage3D5Read('player.matchday.read'),true);
});
test('caller cannot pass an arbitrary score, rules activation, identity or duplicate lineup',()=>{
 for(const value of [{...payload,side:'home',personId:'p1',points:9},{...payload,side:'home',personId:'p1',category:'b'},
  {...payload,side:'away',category:'b',personId:'p1'},{...payload,side:'away',category:'unknown'},
  {...payload,side:'away',category:'b',ruleId:''},{...payload,side:'away',category:'b',actor:'owner'}])
   assert.equal(request('team_coach','matchday.score.record',value),null);
 assert.equal(request('team_coach','matchday.rules.approve',payload),null);
 const p={personId:'p1',category:'b',onField:true};
 assert.equal(request('team_coach','matchday.lineup.save',{...payload,lineup:[p,p]}),null);
 assert.ok(request('team_assistant','matchday.lineup.save',{...payload,lineup:[p]}));
 assert.equal(request('team_manager','matchday.lineup.save',{...payload,lineup:[p]}),null);
});
