import test from 'node:test';
import assert from 'node:assert/strict';
import {PERSONA_SEASONS,PERSONA_CURRENT_SEASON,personaFixture,validatePersonaFixture} from '../site/persona-fixtures.js';
import {personaSession,personaFixtures,personaAction,personaCurrentState} from '../site/persona-runtime.js';

test('fictional seasons expose separate current and historical fixture records',()=>{
 const manager=personaSession('qa-09','grant:team_manager:team:qa-comets-mixed');
 assert.deepEqual(PERSONA_SEASONS,[2024,2025,2026]);
 assert.equal(PERSONA_CURRENT_SEASON,2026);
 const current=personaFixtures(manager);
 assert.equal(current.length,1);
 assert.equal(current[0].date,'2026-11-14');
 assert.equal(current[0].status,'scheduled');
 assert.equal(personaFixtures(manager,{},2025)[0].status,'completed');
 assert.equal(personaFixtures(manager,{},2024)[0].date,'2024-09-21');
 assert.equal(personaFixture(null),null);
});
test('Manager changes shared team fixture visible to same-team player',()=>{
 const manager=personaSession('qa-09','grant:team_manager:team:qa-comets-mixed');
 const player=personaSession('qa-14','membership:player:team:qa-comets-mixed');
 const data={capability:'fixture-manage',teamId:manager.team.id,season:2026,
   fixture:{date:'2026-11-21',opponent:'Example Coast Team',venue:'Example Central Park'}};
 const action=personaAction(manager,{},data);
 assert.equal(action.error,undefined);
 assert.deepEqual(personaFixtures(player,action.records)[0].date,'2026-11-21');
 assert.equal(personaFixtures(player,action.records)[0].opponent,'Example Coast Team');
 assert.equal(personaFixtures(player,action.records)[0].venue,'Example Central Park');
 assert.equal(personaFixtures(player,action.records,2025)[0].date,'2025-09-20');
 assert.deepEqual(personaCurrentState(manager,action.records).fixtures['2026'],data.fixture);
});
test('same team Coach reads Manager schedule but cannot change it',()=>{
 const manager=personaSession('qa-09','grant:team_manager:team:qa-rangers-16');
 const coach=personaSession('qa-07','grant:team_coach:team:qa-rangers-16');
 const change={capability:'fixture-manage',teamId:manager.team.id,
  fixture:{date:'2026-12-05',opponent:'Example Valley',venue:'Example Rangers Oval'}};
 const result=personaAction(manager,{},change);
 assert.equal(personaFixtures(coach,result.records)[0].opponent,'Example Valley');
 assert.equal(personaAction(coach,result.records,change).error,'This role cannot perform that action');
 assert.equal(personaAction(manager,result.records,{...change,teamId:'qa-stars-women'}).error,
   'Action is outside the selected person and team scope');
});
test('player, guardian, revoked coach and pending manager cannot reschedule',()=>{
 const ids=['qa-14','qa-16','qa-19','qa-20'];
 for(const id of ids){
  const session=personaSession(id);
  const action={capability:'fixture-manage',teamId:session.team?.id||'qa-comets-mixed',
   fixture:{date:'2026-12-05',opponent:'Example Other',venue:'Example Venue'}};
  assert.ok(personaAction(session,{},action).error);
 }
});
test('fixture date, opponent, venue and historical edits are validated',()=>{
 const valid={date:'2026-12-05',opponent:'Example Opposition',venue:'Example Ground'};
 assert.deepEqual(validatePersonaFixture(valid).fixture,valid);
 for(const input of [
  {...valid,date:'2026-02-30'},{...valid,date:'2025-12-05'},
  {...valid,date:'2026-12-99'},{...valid,date:'2026-12-05T10:00:00'},
  {...valid,opponent:' '},{...valid,opponent:'x'.repeat(81)},
  {...valid,venue:' '},{...valid,venue:'a'.repeat(121)}]){
   assert.ok(validatePersonaFixture(input).error,JSON.stringify(input));
 }
 assert.equal(validatePersonaFixture(valid,2025).error,'Historical seasons are read-only');
 const manager=personaSession('qa-09','grant:team_manager:team:qa-comets-mixed');
 const history=personaAction(manager,{}, {capability:'fixture-manage',teamId:manager.team.id,
   season:2025,fixture:valid});
 assert.equal(history.error,'Historical seasons are read-only');
 assert.deepEqual(history.records,{});
});
