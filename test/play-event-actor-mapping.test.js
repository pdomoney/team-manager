import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimelineDraft, editTimelineDraft } from '../site/play-event-draft.js';
import { mapTimelineActor } from '../site/play-event-actor-mapping.js';

const assign = (history, actorId, phaseIndex, slotKey, actorType = 'attacker') =>
  mapTimelineActor(history, { type: 'assign', actorId, actorType, phaseIndex, slotKey });
test('E5.3.3 explicit mapping across phases and Undo/Redo history', () => {
  const initial = createTimelineDraft().history;
  const one = assign(initial, 'actor-A', 0, 'slot-LM');
  assert.equal(one.status, 'ready');
  const two = assign(one.history, 'actor-A', 1, 'slot-RM');
  assert.equal(two.status, 'ready');
  assert.deepEqual(two.history.present.actors[0].phases, [
    { phaseIndex: 0, slotKey: 'slot-LM' },
    { phaseIndex: 1, slotKey: 'slot-RM' }
  ]);
  const undo = editTimelineDraft(two.history, { type: 'undo' });
  assert.equal(undo.status, 'ready');
  assert.equal(undo.history.present.actors[0].phases.length, 1);
  const redo = editTimelineDraft(undo.history, { type: 'redo' });
  assert.equal(redo.status, 'ready');
  assert.deepEqual(redo.history.present, two.history.present);
  assert.equal(initial.present.actors.length, 0);
});
test('E5.3.3 conflicting slot and actor type fail without mutating history', () => {
  const one = assign(createTimelineDraft().history, 'A', 0, 'LM');
  const conflict = assign(one.history, 'B', 0, 'LM');
  assert.equal(conflict.status, 'blocked');
  assert.equal(conflict.issues[0].code, 'ambiguous-phase-mapping');
  assert.equal(conflict.history, one.history);
  const type = assign(one.history, 'A', 1, 'RM', 'defender');
  assert.equal(type.issues[0].code, 'actor-type-conflict');
  assert.equal(type.history, one.history);
});
test('E5.3.3 cannot remove an actor referenced by an event', () => {
  const one = assign(createTimelineDraft().history, 'A', 0, 'LM');
  const two = editTimelineDraft(one.history, { type: 'add-event', event: {
    eventId: 'initial', kind: 'possession-set', actorId: 'A', atMs: 0, sequence: 0
  } });
  assert.equal(two.status, 'ready');
  const removed = mapTimelineActor(two.history, {
    type: 'unassign', actorId: 'A', phaseIndex: 0, slotKey: 'LM'
  });
  assert.equal(removed.status, 'blocked');
  assert.ok(removed.issues.some(i => i.code === 'unknown-event-actor'));
  assert.equal(removed.history, two.history);
});
test('E5.3.3 invalid mapping and unknown unassign fail closed', () => {
  const initial = createTimelineDraft().history;
  assert.equal(assign(initial, 'A', -1, 'LM').status, 'blocked');
  assert.equal(mapTimelineActor(initial, {
    type: 'unassign', actorId: 'A', phaseIndex: 0, slotKey: 'LM'
  }).issues[0].code, 'mapping-not-found');
});
