import test from 'node:test';
import assert from 'node:assert/strict';
import { planPlayEventFrame } from '../site/play-event-frame-plan.js';

const play = { eventTimeline: { version: 1,
  actors: [{ actorId: 'a', type: 'attacker', phases: [{ phaseIndex: 0, slotKey: 'LA' }] }],
  events: [
    { eventId: 'e1', atMs: 0, sequence: 0, kind: 'possession-set', actorId: 'a' },
    { eventId: 'e2', atMs: 1000, sequence: 0, kind: 'run-start', actorId: 'a' },
    { eventId: 'e3', atMs: 2000, sequence: 0, kind: 'run-end', actorId: 'a' }
  ]
} };

test('plans deterministic, clamped authored states without enabling field animation', () => {
  const before = structuredClone(play);
  const a = planPlayEventFrame(play, 500);
  const b = planPlayEventFrame(play, 500);
  assert.deepEqual(a, b);
  assert.equal(a.status, 'ready');
  assert.equal(a.ball.actorId, 'a');
  assert.deepEqual(a.motion, {});
  assert.equal(planPlayEventFrame(play, 500, { speed: 2 }).motion.a, 'running');
  assert.equal(planPlayEventFrame(play, 5000).done, true);
  assert.equal(a.playbackEnabled, false);
  assert.deepEqual(play, before);
});
test('rejects invalid times, speeds and unsupported timelines without playback', () => {
  for (const elapsed of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(planPlayEventFrame(play, elapsed).status, 'blocked');
  }
  for (const speed of [0, -1, Infinity, 5]) {
    assert.equal(planPlayEventFrame(play, 0, { speed }).status, 'blocked');
  }
  assert.equal(planPlayEventFrame({}, 0).status, 'unavailable');
  assert.equal(planPlayEventFrame(play, Number.MAX_SAFE_INTEGER, { startMs: 1 }).status, 'blocked');
});
