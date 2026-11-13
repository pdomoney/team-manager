import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectWatchTimedFrame } from '../site/play-watch-timed-frame.js';
const play = () => ({ id: 'watch', players: { A: {} }, phases: [],
  eventTimeline: { version: 1,
    actors: [{ actorId: 'a', type: 'attacker', phases: [{ phaseIndex: 0, slotKey: 'A' }] }],
    events: [
      { eventId: 'e1', kind: 'possession-set', actorId: 'a', atMs: 0, sequence: 0 },
      { eventId: 'e2', kind: 'run-start', actorId: 'a', atMs: 500, sequence: 0 },
      { eventId: 'e3', kind: 'run-end', actorId: 'a', atMs: 1000, sequence: 0 }
    ]
  } });
test('Watch preview derives authored timing without activating field rendering', () => {
  const p = play(), original = structuredClone(p);
  const frame = inspectWatchTimedFrame(p, 250, { speed: 2 });
  assert.equal(frame.mode, 'authored-preview');
  assert.equal(frame.atMs, 500);
  assert.equal(frame.ball.actorId, 'a');
  assert.equal(frame.motion.a, 'running');
  assert.equal(frame.renderTimedField, false);
  assert.deepEqual(p, original);
});
test('legacy, corrupt and overflow timelines retain legacy Watch', () => {
  assert.equal(inspectWatchTimedFrame({ id: 'legacy', players: {}, phases: [] }, 0).mode, 'legacy');
  assert.equal(inspectWatchTimedFrame(play(), Number.MAX_SAFE_INTEGER, { startMs: 1 }).mode, 'legacy');
  const p = play(); p.players = {};
  assert.equal(inspectWatchTimedFrame(p, 100).mode, 'legacy');
});
