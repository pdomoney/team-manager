import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectPlayEventSeek } from '../site/play-event-readonly-seek.js';

const base = () => ({ id: 'p1', players: { A: {}, B: {} }, phases: [],
  eventTimeline: { version: 1,
    actors: [
      { actorId: 'a', type: 'attacker', phases: [{ phaseIndex: 0, slotKey: 'A' }] },
      { actorId: 'b', type: 'attacker', phases: [{ phaseIndex: 0, slotKey: 'B' }] }
    ],
    events: [
      { eventId: 'one', kind: 'possession-set', actorId: 'a', atMs: 0, sequence: 0 },
      { eventId: 'two', kind: 'pass-release', actorId: 'a', receiverId: 'b', movementId: 'pass1', atMs: 100, sequence: 0 },
      { eventId: 'three', kind: 'catch', actorId: 'b', movementId: 'pass1', atMs: 200, sequence: 0 }
    ] } });
test('E5.4a seek is deterministic and preserves the source', () => {
  const play = base(), before = JSON.stringify(play);
  const early = inspectPlayEventSeek(play, 0);
  const flight = inspectPlayEventSeek(play, 150);
  const caught = inspectPlayEventSeek(play, 200);
  assert.equal(early.status, 'ready');
  assert.equal(early.ball.actorId, 'a');
  assert.equal(flight.ball.state, 'in-flight');
  assert.equal(caught.ball.actorId, 'b');
  assert.equal(caught.durationMs, 200);
  assert.equal(caught.timedPlaybackAllowed, false);
  assert.deepEqual(inspectPlayEventSeek(play, 150), flight);
  assert.equal(JSON.stringify(play), before);
});
test('E5.4a refuses legacy, corrupt, stale and invalid seek data', () => {
  const p = base();
  assert.equal(inspectPlayEventSeek({ id: 'legacy', players: {}, phases: [] }, 0).reason, 'no-authored-timeline');
  assert.equal(inspectPlayEventSeek(p, -1).status, 'blocked');
  p.players = { C: {} };
  assert.equal(inspectPlayEventSeek(p, 0).status, 'unavailable');
  p.eventTimeline.version = 99;
  assert.equal(inspectPlayEventSeek(p, 0).status, 'unavailable');
});
