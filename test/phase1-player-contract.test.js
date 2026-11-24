import test from 'node:test';
import assert from 'node:assert/strict';
import {validateStage3D5,isStage3D5Read} from '../src/stage3d5-management-contract.js';

const base={teamId:'stgeorge-mixed20',role:'team_player',
 action:'player.team.read',input:{}};
test('Player can request only a read-only scoped team projection',()=>{
 assert.deepEqual(validateStage3D5(base),base);
 assert.equal(isStage3D5Read(base.action),true);
 for(const action of ['settings.read','team.members','jerseys.read','invite.issue',
  'messages.read','competitions.fixtures']){
   assert.equal(validateStage3D5({...base,action}),null,action);
 }
 assert.equal(validateStage3D5({...base,input:{teamId:'other-team'}}),null);
 assert.equal(validateStage3D5({...base,role:'team_manager'}),null);
 assert.equal(validateStage3D5({...base,role:'platform_owner'}),null);
});
test('Coach and Manager may read their own tournament fixtures only through checked grants',()=>{
 for(const role of ['team_coach','team_manager']){
  const c=validateStage3D5({...base,role,action:'competitions.fixtures'});
  assert(c);
  assert.equal(isStage3D5Read(c.action),true);
 }
 assert.equal(validateStage3D5({...base,role:'team_coach',
   action:'competitions.fixtures',input:{competitionId:'foreign'}}),null);
});
