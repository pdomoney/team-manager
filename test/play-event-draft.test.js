import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTimelineDraft, editTimelineDraft } from '../site/play-event-draft.js';

const actors = () => [
  { actorId: 'LM', type: 'attacker', phases: [{ phaseIndex: 0, slotKey: 'player:LM' }] },
  { actorId: 'RM', type: 'attacker', phases: [{ phaseIndex: 0, slotKey: 'player:RM' }] }
];
const event = (eventId, kind, atMs, sequence, extras = {}) =>
  ({ eventId, kind, atMs, sequence, actorId: 'LM', ...extras });
const add = (history, e) => editTimelineDraft(history, { type: 'add-event', event: e });
const ready = result => {
  assert.equal(result.status, 'ready', JSON.stringify(result.issues));
  return result.history;
};
test('E5.3.1 coach builds an explicit event script with Undo/Redo and immutable snapshots', () => {
  const source = actors(), initial = ready(createTimelineDraft(source));
  source[0].actorId = 'mutated';
  assert.equal(initial.present.actors[0].actorId, 'LM');
  const one = ready(add(initial, event('one', 'possession-set', 0, 0)));
  const two = ready(add(one, event('two', 'pass-release', 500, 0,
    { receiverId: 'RM', movementId: 'm-pass' })));
  const three = ready(add(two, event('three', 'catch', 900, 0,
    { actorId: 'RM', movementId: 'm-pass' })));
  assert.equal(three.present.events.length, 3);
  const undo = ready(editTimelineDraft(three, { type: 'undo' }));
  assert.equal(undo.present.events.length, 2);
  const redo = ready(editTimelineDraft(undo, { type: 'redo' }));
  assert.deepEqual(redo.present, three.present);
  assert.ok(Object.isFrozen(three.present.events));
  assert.equal(initial.present.events.length, 0);
  assert.equal(three.canUndo, true);
});
test('E5.3.1 timing edit is atomic and invalid ordering preserves Undo/Redo', () => {
  const initial = ready(createTimelineDraft(actors()));
  const one = ready(add(initial, event('one', 'possession-set', 0, 0)));
  const two = ready(add(one, event('two', 'pass-release', 500, 0,
    { receiverId: 'RM', movementId: 'm-pass' })));
  const invalid = editTimelineDraft(two, { type: 'update-event', eventId: 'two',
    changes: { atMs: 0, sequence: 0 } });
  assert.equal(invalid.status, 'blocked');
  assert.ok(invalid.issues.some(x => x.code === 'duplicate-event-order'));
  assert.equal(invalid.history, two);
  const moved = ready(editTimelineDraft(two, { type: 'update-event', eventId: 'two',
    changes: { atMs: 700 } }));
  assert.equal(moved.present.events[1].atMs, 700);
  const back = ready(editTimelineDraft(moved, { type: 'undo' }));
  assert.equal(back.present.events[1].atMs, 500);
  const fresh = ready(add(back, event('run', 'run-start', 200, 0)));
  assert.equal(fresh.canRedo, false);
});
test('E5.3.1 negative cases never mutate the draft', () => {
  const initial = ready(createTimelineDraft(actors()));
  const invalid = add(initial, event('bad', 'catch', 0, 0,
    { actorId: 'RM', movementId: 'm-pass' }));
  assert.equal(invalid.status, 'blocked');
  assert.equal(invalid.history, initial);
  assert.equal(initial.present.events.length, 0);
  assert.equal(editTimelineDraft(initial, { type: 'undo' }).issues[0].code, 'nothing-to-undo');
  assert.equal(editTimelineDraft(initial, { type: 'redo' }).issues[0].code, 'nothing-to-redo');
  assert.equal(editTimelineDraft(initial, { type: 'remove-event', eventId: 'missing' })
    .issues[0].code, 'event-not-found');
  assert.equal(editTimelineDraft(initial, { type: 'unknown' }).issues[0].code, 'unsupported-edit');
  assert.equal(createTimelineDraft([{ actorId: 'bad', type: 'attacker', phases: [] }])
    .status, 'blocked');
});
test('E5.3.1 existing encrypted workspace fixture remains unchanged', () => {
  const raw = readFileSync(new URL('./fixtures/play-engine-e0-golden.json', import.meta.url), 'utf8');
  const fixture = JSON.parse(raw), before = JSON.stringify(fixture);
  const initial = ready(createTimelineDraft(actors()));
  ready(add(initial, event('one', 'possession-set', 0, 0)));
  assert.equal(JSON.stringify(fixture), before);
  assert.equal(fixture.schema4Workspace.schema, 4);
});
