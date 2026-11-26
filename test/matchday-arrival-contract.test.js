import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateStage3D5,isStage3D5Read} from '../src/stage3d5-management-contract.js';
const op=(role,action,input)=>({teamId:'example-team',role,action,input});
const write={sessionId:'match-1',fixtureVersion:0,expectedVersion:0,personId:'p1',arrived:true};
test('staff can record arrivals without sporting approval; other roles cannot',()=>{
 for(const role of ['team_coach','team_manager','team_assistant'])assert.ok(validateStage3D5(op(role,'matchday.arrivals.record',write)));
 for(const role of ['team_player','team_volunteer','team_play_viewer','platform_owner'])assert.equal(validateStage3D5(op(role,'matchday.arrivals.record',write)),null);
 assert.equal(validateStage3D5(op('team_player','player.matchday.arrivals.record',write)),null);
 const {personId,...own}=write;
 assert.ok(validateStage3D5(op('team_player','player.matchday.arrivals.record',own)));
 for(const bad of [{...write,arrived:'true'},{...write,fixtureVersion:-1},{...write,expectedVersion:null},{...write,actor:'someone'}])
  assert.equal(validateStage3D5(op('team_coach','matchday.arrivals.record',bad)),null);
 assert.equal(isStage3D5Read('matchday.arrivals.read'),true);
 assert.equal(isStage3D5Read('matchday.arrivals.record'),false);
});
