import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inspectPlayMovementLinks } from '../site/play-movement-link-audit.js';
import {
  actorEndpointLinks, followActorEndpoints, newLinkedMovement
} from '../site/play-actor-links.js';

const copy = x => JSON.parse(JSON.stringify(x));
const golden = JSON.parse(readFileSync(new URL('./fixtures/play-engine-e0-golden.json', import.meta.url), 'utf8'));
const modern = () => copy(golden.schema4Workspace.plays.find(p => p.id === 'coach-v1-e0'));

test('E4.4 explicit LM pass to RM and RM run form a shared-actor authoring diagnostic, never catch timing', () => {
  const source = modern(), before = JSON.stringify(source);
  const result = inspectPlayMovementLinks(source);
  assert.equal(result.status, 'consistent-links-only');
  assert.equal(result.legacyMovements, 0);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.movements.map(m=>[m.moveId,m.kind,m.startActor,m.endActor]), [
    ['m-e0pass1','pass','player:LM','player:RM'],
    ['m-e0run1','run','player:RM',null]
  ]);
  assert.deepEqual(result.sharedActorPaths, [{
    actorKey:'player:RM',passMoveId:'m-e0pass1',runMoveId:'m-e0run1',
    temporalOrderingVerified:false
  }]);
  assert.equal(result.timingVerified, false);
  assert.equal(result.possessionVerified, false);
  assert.equal(JSON.stringify(source), before);
  assert.ok(Object.isFrozen(result.movements) && Object.isFrozen(result.sharedActorPaths));
  assert.throws(()=>result.movements.push({}),TypeError);
});

test('E4.4 after explicit actor drag and linked endpoint update, inspection remains consistent', () => {
  const phase=modern();
  phase.players.RM=[26,29];
  const links=actorEndpointLinks(phase,'player:RM');
  assert.deepEqual(links.map(x=>[x.moveIndex,x.pointIndex]), [[0,1],[1,0]]);
  // Move the anchored endpoints along with RM: no orphaned pass or follow-on run.
  assert.equal(followActorEndpoints(phase,links,'player:RM',[26,29]),2);
  const result=inspectPlayMovementLinks(copy(phase));
  assert.equal(result.status,'consistent-links-only');
  assert.equal(result.sharedActorPaths.length,1);
  assert.equal(result.issues.length,0);
  assert.equal(result.possessionVerified,false);
});

test('E4.4 stale endpoint, deleted tactical actor and duplicate movement ID are explicit errors', () => {
  const p=modern();
  p.players.RM=[26,29]; // attached coordinates were not updated
  const before=JSON.stringify(p), result=inspectPlayMovementLinks(p);
  assert.equal(result.status,'invalid');
  assert.ok(result.issues.some(x=>x.code==='stale-actor-endpoint'));
  assert.equal(JSON.stringify(p),before,'audit is read-only even on errors');
  const absent=modern();
  delete absent.players.RM;
  const vanished=inspectPlayMovementLinks(absent);
  assert.ok(vanished.issues.some(x=>x.code==='missing-tactical-actor'));
  const duplicate=modern();
  duplicate.moves[1].moveId=duplicate.moves[0].moveId;
  assert.ok(inspectPlayMovementLinks(duplicate).issues.some(x=>x.code==='duplicate-movement-id'));
});

test('E4.4 missing passer/receiver is not promoted to verified pass and legacy is never auto-linked',()=>{
  const legacy=copy(golden.legacySingleTeam.plays[1]), baseline=JSON.stringify(legacy);
  const observed=inspectPlayMovementLinks(legacy);
  assert.equal(observed.status,'partial');
  assert.equal(observed.legacyMovements,legacy.moves.length);
  assert.deepEqual(observed.movements,[]);
  assert.deepEqual(observed.sharedActorPaths,[]);
  assert.equal(JSON.stringify(legacy),baseline);
  const incomplete=modern();
  incomplete.moves[0].actorLinks={start:'player:LM'};
  const result=inspectPlayMovementLinks(incomplete);
  assert.equal(result.status,'invalid');
  assert.ok(result.issues.some(x=>x.code==='pass-receiver-unlinked'));
  assert.deepEqual(result.sharedActorPaths,[]);
  assert.equal(result.possessionVerified,false);
});

test('E4.4 unsupported versions, malformed movement inputs and counterfeit actors fail safely',()=>{
  const cases=[
    [p=>{p.moves[0].linkVersion=2}, 'unsupported-link-version'],
    [p=>{p.moves[0].pts={broken:true}}, 'invalid-movement-geometry'],
    [p=>{p.moves[0].actorLinks={start:'player:LM',end:'player:FAKE'}}, 'missing-tactical-actor'],
    [p=>{p.moves[0].actorLinks={start:'player:LM',end:'defender:0'}}, 'missing-tactical-actor'],
    [p=>{p.moves[0].actorLinks={start:'player:LM',end:'player:RM',spoof:'player:LM'}},'unsupported-link-endpoint'],
    [p=>{p.moves[0].moveId='bad'}, 'invalid-movement-id'],
    [p=>{p.moves[0].pts[1]=[51,29]},'invalid-movement-geometry']
  ];
  for(const [mutate,code] of cases){
    const p=modern();
    mutate(p);
    const before=JSON.stringify(p);
    const result=inspectPlayMovementLinks(p);
    assert.equal(result.status,'invalid',code);
    assert.ok(result.issues.some(x=>x.code===code),`missing ${code}: ${JSON.stringify(result.issues)}`);
    assert.equal(JSON.stringify(p),before);
  }
  const invalid=inspectPlayMovementLinks(null);
  assert.equal(invalid.status,'invalid');
  assert.deepEqual(invalid.issues,[{code:'invalid-phase',moveIndex:-1}]);
});

test('E4.4 defender shift is a separate tactical line, not pass ownership or player identity',()=>{
  const phase={players:{LM:[15,30],RM:[25,28]},defence:{marker:[18,24],line:[[12,20]]},moves:[]};
  phase.moves.push(newLinkedMovement(phase,{t:'shift',pts:[[12,20],[17,25]]},'m-def1'));
  const result=inspectPlayMovementLinks(phase);
  assert.equal(result.status,'consistent-links-only');
  assert.equal(result.movements[0].startActor,'defender:0');
  assert.equal(result.movements[0].endActor,null);
  assert.deepEqual(result.sharedActorPaths,[]);
  assert.equal(result.timingVerified,false);
  const wrong=copy(phase);
  wrong.moves[0].actorLinks.start='player:LM';
  assert.ok(inspectPlayMovementLinks(wrong).issues.some(x=>x.code==='defence-movement-needs-defender'));
});

test('E4.4 graph inspection cannot rewrite a team, play, shared library or distinct phase',()=>{
  const original=copy(golden.schema4Workspace), before=JSON.stringify(original);
  inspectPlayMovementLinks(original.plays.find(p=>p.id==='coach-v1-e0'));
  inspectPlayMovementLinks(original.plays.find(p=>p.id==='coach-legacy-e0'));
  inspectPlayMovementLinks(original.teams[0].plays[0]);
  assert.equal(JSON.stringify(original),before);
  assert.equal(original.schema,4);
  assert.equal(original.library.plays[0].rev,2);
});
