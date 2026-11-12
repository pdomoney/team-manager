import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluatePlayEventTimeline as evaluate } from '../site/play-event-timeline.js';

const timeline = () => ({
  version: 1,
  actors: [
    { actorId: 'LM', type: 'attacker', phases: [{ phaseIndex: 0, slotKey: 'player:LM' }] },
    { actorId: 'RM', type: 'attacker', phases: [
      { phaseIndex: 0, slotKey: 'player:RM' },
      { phaseIndex: 1, slotKey: 'player:RM' }
    ] },
    { actorId: 'D1', type: 'defender', phases: [{ phaseIndex: 0, slotKey: 'defender:1' }] }
  ],
  events: [
    { eventId: 'e1', atMs: 0, sequence: 0, kind: 'possession-set', actorId: 'LM' },
    { eventId: 'e2', atMs: 500, sequence: 0, kind: 'pass-release', actorId: 'LM',
      receiverId: 'RM', movementId: 'm-pass' },
    { eventId: 'e3', atMs: 800, sequence: 0, kind: 'catch', actorId: 'RM', movementId: 'm-pass' },
    { eventId: 'e4', atMs: 800, sequence: 1, kind: 'run-start', actorId: 'RM' },
    { eventId: 'e5', atMs: 1600, sequence: 0, kind: 'run-end', actorId: 'RM' }
  ]
});
const blocked = (t, code) => {
  const result = evaluate(t, 900);
  assert.equal(result.status, 'blocked');
  assert.ok(result.issues.some(x => x.code === code), JSON.stringify(result.issues));
  assert.equal(result.timedPlaybackAllowed, false);
};
test('E5.2 explicit possession release catch and run, deterministic seek and rewind', () => {
  const t = timeline(), original = JSON.stringify(t);
  assert.deepEqual(evaluate(t, 0).ball, { state: 'held', actorId: 'LM' });
  assert.deepEqual(evaluate(t, 600).ball, {
    state: 'in-flight', movementId: 'm-pass', fromActorId: 'LM', receiverId: 'RM'
  });
  assert.deepEqual(evaluate(t, 800).ball, { state: 'held', actorId: 'RM' });
  assert.equal(evaluate(t, 900).motion.RM, 'running');
  assert.deepEqual(evaluate(t, 1700).motion, {});
  const first = evaluate(t, 600);
  evaluate(t, 1700);
  assert.deepEqual(evaluate(t, 600), first);
  assert.equal(JSON.stringify(t), original);
  assert.ok(Object.isFrozen(first.ball));
  assert.equal(first.timedPlaybackAllowed, false);
});
test('E5.2 explicit sequence wins over source array order', () => {
  const t = timeline(), expected = evaluate(t, 800);
  t.events.reverse();
  assert.deepEqual(evaluate(t, 800), expected);
});
test('E5.2 failed catch is loose, never inferred possession', () => {
  const t = timeline();
  t.events.splice(2, 1, { eventId: 'failed', atMs: 800, sequence: 0,
    kind: 'catch-failed', actorId: 'RM', movementId: 'm-pass' });
  assert.deepEqual(evaluate(t, 900).ball, { state: 'loose' });
});
test('E5.2 no catch stays in flight, including after run', () => {
  const t = timeline(); t.events.splice(2, 1);
  assert.equal(evaluate(t, 2000).ball.state, 'in-flight');
});
test('E5.2 rejects wrong receiver and mismatched pass', () => {
  const t = timeline(); t.events[2].actorId = 'LM';
  blocked(t, 'catch-mismatched-pass');
  t.events[2].actorId = 'RM'; t.events[2].movementId = 'm-other';
  blocked(t, 'catch-mismatched-pass');
});
test('E5.2 rejects duplicate IDs, ordering collisions and ambiguous actor mappings', () => {
  const a = timeline(); a.events[1].eventId = 'e1'; blocked(a, 'duplicate-event-id');
  const b = timeline(); b.events[3].sequence = 0; blocked(b, 'duplicate-event-order');
  const c = timeline(); c.actors[2].phases[0].slotKey = 'player:LM';
  blocked(c, 'ambiguous-phase-mapping');
  const d = timeline(); d.actors[1].actorId = 'LM'; blocked(d, 'duplicate-actor-id');
});
test('E5.2 rejects invalid possession, motion, event references and future errors', () => {
  const a = timeline(); a.events[0].actorId = 'D1'; blocked(a, 'ball-event-needs-attacker');
  const b = timeline(); b.events[1].actorId = 'RM'; blocked(b, 'release-without-possession');
  const c = timeline(); c.events[4].actorId = 'LM'; blocked(c, 'motion-end-without-start');
  const d = timeline(); d.events[1].receiverId = 'missing'; blocked(d, 'invalid-pass-reference');
  const e = timeline(); e.events.push({ eventId: 'future', atMs: 9000, sequence: 0,
    kind: 'catch', actorId: 'RM', movementId: 'm-pass' });
  assert.equal(evaluate(e, 0).status, 'blocked');
});
test('E5.2 legacy workspace is untouched and cannot become an implicit timeline', () => {
  const raw = readFileSync(new URL('./fixtures/play-engine-e0-golden.json', import.meta.url), 'utf8');
  const fixture = JSON.parse(raw), before = JSON.stringify(fixture);
  assert.equal(evaluate(fixture.schema4Workspace, 100).status, 'blocked');
  assert.equal(evaluate({ version: 2, actors: [], events: [] }, 0).status, 'blocked');
  assert.equal(evaluate(timeline(), -1).status, 'blocked');
  assert.equal(JSON.stringify(fixture), before);
});
