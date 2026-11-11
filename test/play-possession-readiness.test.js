import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inspectPlayPossessionPrerequisites } from '../site/play-possession-readiness.js';

const phase = (players, moves = []) => ({
  players, defence: { line: [], marker: null }, moves
});
const pass = (from = 'LM', to = 'RM', a = [15, 30], b = [25, 28]) => ({
  t: 'pass', moveId: 'm-e50-pass', linkVersion: 1,
  actorLinks: { start: 'player:' + from, end: 'player:' + to },
  pts: [a, b]
});
const run = (actor = 'RM', at = [25, 28], id = 'm-e50-run') => ({
  t: 'run', moveId: id, linkVersion: 1,
  actorLinks: { start: 'player:' + actor },
  pts: [at, [at[0] + 2, at[1] - 4]]
});
const single = () => phase({ LM: [15, 30], RM: [25, 28] }, [pass(), run()]);
const twoPhase = () => ({
  ...phase({ LM: [15, 30], RM: [25, 28] }, [pass()]),
  phases: [phase({ LM: [16, 30], RM: [27, 29] }, [run('RM', [27, 29])])]
});
const declared = [{
  fromPhase: 0, toPhase: 1, fromActor: 'player:RM', toActor: 'player:RM'
}];

test('E5.0 same-phase explicit pass/receiver run is a structural candidate, not timed possession', () => {
  const p = single(), before = JSON.stringify(p);
  const result = inspectPlayPossessionPrerequisites(p);
  assert.equal(result.status, 'structural-candidates-only');
  assert.equal(result.passHandoffs.length, 1);
  assert.deepEqual(result.passHandoffs[0], {
    phaseIndex: 0, passMoveId: 'm-e50-pass',
    passerSlot: 'player:LM', receiverSlot: 'player:RM',
    status: 'candidate-unsequenced', candidates: [{
      phaseIndex: 0, moveId: 'm-e50-run',
      startSlot: 'player:RM', basis: 'same-phase-explicit-link'
    }]
  });
  assert.equal(result.timingVerified, false);
  assert.equal(result.possessionVerified, false);
  assert.equal(result.actorIdentityVerified, false);
  assert.equal(result.timedPlaybackAllowed, false);
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(p), before);
  assert.ok(Object.isFrozen(result.passHandoffs[0].candidates));
  assert.throws(() => result.passHandoffs.push({}), TypeError);
});

test('E5.0 matching local slot labels across phases cannot imply the same receiver', () => {
  const p = twoPhase(), before = JSON.stringify(p);
  const report = inspectPlayPossessionPrerequisites(p);
  assert.equal(report.status, 'blocked');
  assert.equal(report.passHandoffs[0].status, 'no-explicit-follow-on');
  assert.equal(report.passHandoffs[0].candidates.length, 0);
  assert.ok(report.issues.some(x => x.code === 'no-explicit-follow-on'));
  assert.equal(JSON.stringify(p), before);
});

test('E5.0 explicit adjacent-phase reviewer assertion permits only an unsequenced candidate', () => {
  const p = twoPhase(), before = JSON.stringify(p);
  const report = inspectPlayPossessionPrerequisites(p, declared);
  assert.equal(report.status, 'structural-candidates-only');
  assert.deepEqual(report.passHandoffs[0].candidates, [{
    phaseIndex: 1, moveId: 'm-e50-run',
    startSlot: 'player:RM', basis: 'declared-adjacent-phase-slot'
  }]);
  assert.equal(report.timedPlaybackAllowed, false);
  assert.equal(report.possessionVerified, false);
  assert.equal(JSON.stringify(p), before);
});

test('E5.0 ambiguous same-phase or multiple next-phase follow-ons refuse a timing guess', () => {
  const p = single();
  p.moves.push(run('RM', [25, 28], 'm-e50-another'));
  const result = inspectPlayPossessionPrerequisites(p);
  assert.equal(result.status, 'blocked');
  assert.equal(result.passHandoffs[0].status, 'ambiguous-follow-on');
  assert.equal(result.passHandoffs[0].candidates.length, 2);
  assert.ok(result.issues.some(x => x.code === 'ambiguous-follow-on'));
  const multi = twoPhase();
  multi.phases[0].moves.push(run('RM', [27, 29], 'm-e50-another'));
  assert.equal(inspectPlayPossessionPrerequisites(multi, declared)
    .passHandoffs[0].status, 'ambiguous-follow-on');
});

test('E5.0 invalid or overlapping phase assertions, bad links and unknown versions fail closed', () => {
  const p = twoPhase();
  const bad = inspectPlayPossessionPrerequisites(p, [{ ...declared[0], toActor: 'player:MISSING' }]);
  assert.equal(bad.status, 'blocked');
  assert.equal(bad.issues[0].code, 'invalid-phase-continuity');
  const conflicting = inspectPlayPossessionPrerequisites(p, [
    ...declared, { ...declared[0], fromActor: 'player:LM' }
  ]);
  assert.equal(conflicting.status, 'blocked');
  assert.equal(inspectPlayPossessionPrerequisites(p, null).status, 'blocked');
  const broken = single(); broken.moves[0].actorLinks.end = 'player:ABSENT';
  assert.equal(inspectPlayPossessionPrerequisites(broken).status, 'blocked');
  broken.moves[0].linkVersion = 77;
  assert.equal(inspectPlayPossessionPrerequisites(broken).status, 'blocked');
});

test('E5.0 cross-phase movement IDs must not collide even when each phase locally validates', () => {
  const p = twoPhase();
  p.phases[0].moves[0].moveId = p.moves[0].moveId;
  const report = inspectPlayPossessionPrerequisites(p, declared);
  assert.equal(report.status, 'blocked');
  assert.ok(report.issues.some(x => x.code === 'duplicate-cross-phase-movement-id'));
  assert.equal(report.timedPlaybackAllowed, false);
});

test('E5.0 invalid JSON, legacy schema-4, and unsaved text never become a timed script', () => {
  assert.equal(inspectPlayPossessionPrerequisites('{invalid').status, 'blocked');
  assert.equal(inspectPlayPossessionPrerequisites(null).status, 'blocked');
  const fixtures = readFileSync(new URL('./fixtures/play-engine-e0-golden.json', import.meta.url), 'utf8');
  const gold = JSON.parse(fixtures), before = JSON.stringify(gold);
  const legacy = gold.schema4Workspace.plays.find(p => p.id === 'coach-legacy-e0');
  const legacyText = JSON.stringify(legacy, null, 2) + '\n';
  const result = inspectPlayPossessionPrerequisites(legacyText);
  assert.equal(result.status, 'blocked');
  assert.ok(result.issues.some(x => x.code === 'legacy-geometry-unresolved'));
  assert.equal(result.events.length, 0);
  assert.equal(result.timedPlaybackAllowed, false);
  assert.equal(JSON.stringify(gold), before);
  assert.equal(gold.schema4Workspace.schema, 4);
});

test('E5.0 drawing order is not event order, and no timeline is produced', () => {
  const a = single();
  const b = single(); b.moves.reverse();
  const first = inspectPlayPossessionPrerequisites(a);
  const reverse = inspectPlayPossessionPrerequisites(b);
  assert.equal(first.status, 'structural-candidates-only');
  assert.equal(reverse.status, 'structural-candidates-only');
  assert.deepEqual(first.passHandoffs[0].candidates, reverse.passHandoffs[0].candidates);
  assert.deepEqual(reverse.events, []);
  assert.equal(reverse.timingVerified, false);
});
