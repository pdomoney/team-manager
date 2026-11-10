import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inspectPlayPhaseContinuity } from '../site/play-movement-link-audit.js';

const copy = x => JSON.parse(JSON.stringify(x));
const golden = JSON.parse(readFileSync(new URL('./fixtures/play-engine-e0-golden.json', import.meta.url), 'utf8'));
const phase = (players, moves = []) => ({
  players, defence: { line: [[12, 20]], marker: [18, 24] }, moves
});
const linkedPass = (from = 'LM', to = 'RM', at = [[15, 30], [25, 28]]) => ({
  t: 'pass', moveId: 'm-phase-pass', linkVersion: 1,
  actorLinks: { start: 'player:' + from, end: 'player:' + to }, pts: at
});
const play = () => ({
  ...phase({ LM: [15, 30], RM: [25, 28] },
    [linkedPass()]),
  phases: [phase({ LM: [17, 30], RM: [27, 30] })]
});

test('E4.10 identical actor labels in adjacent phases are not identity evidence', () => {
  const p = play(), before = JSON.stringify(p);
  const result = inspectPlayPhaseContinuity(p);
  assert.equal(result.status, 'unresolved');
  assert.equal(result.boundaries[0].status, 'unresolved');
  assert.equal(result.boundaries[0].observations.find(x => x.fromActor === 'player:LM').status,
    'same-slot-unverified');
  assert.equal(result.boundaries[0].observations.find(x => x.fromActor === 'player:LM').geometryChanged, true);
  assert.equal(result.actorIdentityVerified, false);
  assert.equal(result.timingVerified, false);
  assert.equal(result.possessionVerified, false);
  assert.equal(JSON.stringify(p), before);
});

test('E4.10 explicit pair links local slots while remaining a non-identity declaration', () => {
  const p = play(), before = JSON.stringify(p);
  const assertions = [
    { fromPhase: 0, toPhase: 1, fromActor: 'player:LM', toActor: 'player:LM' },
    { fromPhase: 0, toPhase: 1, fromActor: 'player:RM', toActor: 'player:RM' },
    { fromPhase: 0, toPhase: 1, fromActor: 'defender:0', toActor: 'defender:0' },
    { fromPhase: 0, toPhase: 1, fromActor: 'marker', toActor: 'marker' }
  ];
  const result = inspectPlayPhaseContinuity(p, assertions);
  assert.equal(result.status, 'declared');
  const rm = result.boundaries[0].observations.find(x => x.fromActor === 'player:RM');
  assert.equal(rm.status, 'declared-continued');
  assert.deepEqual(rm.fromMovementRefs, [{ moveId: 'm-phase-pass', endpoint: 'end' }]);
  assert.deepEqual(rm.toMovementRefs, []);
  assert.equal(result.actorIdentityVerified, false);
  assert.equal(JSON.stringify(p), before);
  assert.ok(Object.isFrozen(result.boundaries[0].observations[0]));
  assert.throws(() => result.boundaries.push({}), TypeError);
});

test('E4.10 explicit changed tactical slot is reported rather than guessed from geometry', () => {
  const p = play();
  delete p.phases[0].players.LM;
  p.phases[0].players.LW = [17, 30];
  const report = inspectPlayPhaseContinuity(p, [{
    fromPhase: 0, toPhase: 1, fromActor: 'player:LM', toActor: 'player:LW'
  }]);
  const lm = report.boundaries[0].observations.find(x => x.fromActor === 'player:LM');
  assert.equal(lm.status, 'declared-changed-slot');
  assert.equal(lm.toActor, 'player:LW');
  assert.equal(report.status, 'unresolved','other actors remain unverified');
});

test('E4.10 conflicts and ambiguous many-to-one declarations fail closed', () => {
  const p = play(), before = JSON.stringify(p);
  const report = inspectPlayPhaseContinuity(p, [
    { fromPhase: 0, toPhase: 1, fromActor: 'player:LM', toActor: 'player:LM' },
    { fromPhase: 0, toPhase: 1, fromActor: 'player:RM', toActor: 'player:LM' }
  ]);
  assert.equal(report.status, 'invalid');
  assert.equal(report.boundaries[0].status, 'ambiguous');
  assert.ok(report.issues.some(x => x.code === 'ambiguous-continuity-declarations'));
  assert.ok(report.boundaries[0].observations.every(x => x.status === 'ambiguous'));
  assert.ok(report.boundaries[0].observations.filter(x => x.fromActor)
    .every(x => x.toActor === null), 'conflicts must not select a destination');
  assert.equal(JSON.stringify(p), before);
});

test('E4.10 invalid types, missing slots and invalid linked geometry never approve continuity', () => {
  const p = play();
  const wrong = inspectPlayPhaseContinuity(p, [
    { fromPhase: 0, toPhase: 1, fromActor: 'player:LM', toActor: 'marker' }
  ]);
  assert.ok(wrong.issues.some(x => x.code === 'invalid-continuity-actors'));
  const absent = inspectPlayPhaseContinuity(p, [
    { fromPhase: 0, toPhase: 1, fromActor: 'player:LM', toActor: 'player:ABSENT' }
  ]);
  assert.ok(absent.issues.some(x => x.code === 'invalid-continuity-actors'));
  p.moves[0].linkVersion = 9;
  const damaged = inspectPlayPhaseContinuity(p, [
    { fromPhase: 0, toPhase: 1, fromActor: 'player:LM', toActor: 'player:LM' }
  ]);
  assert.equal(damaged.boundaries[0].status, 'invalid');
  assert.ok(damaged.boundaries[0].observations.every(x => x.status === 'blocked-invalid-phase'));
  assert.equal(inspectPlayPhaseContinuity(p, null).status, 'invalid');
});

test('E4.10 legacy multi-phase E0 goldens remain exactly unchanged and unresolved', () => {
  const workspace = copy(golden.schema4Workspace);
  const before = JSON.stringify(workspace);
  const legacy = workspace.plays.find(x => x.id === 'coach-legacy-e0');
  const report = inspectPlayPhaseContinuity(legacy);
  assert.equal(report.phases.length, 2);
  assert.equal(report.phases[0].legacyMovements, 2);
  assert.equal(report.phases[1].legacyMovements, 1);
  assert.equal(report.status, 'unresolved');
  assert.ok(report.boundaries[0].observations.every(x =>
    !x.status.startsWith('declared-')));
  assert.equal(JSON.stringify(workspace), before);
  assert.equal(workspace.schema, 4);
  assert.equal(workspace.library.plays[0].rev, 2);
});
