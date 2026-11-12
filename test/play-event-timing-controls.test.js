import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimelineDraft, editTimelineDraft } from '../site/play-event-draft.js';
import { mountCoachTimingControls } from '../site/play-event-timing-controls.js';

const actors = [
  { actorId: 'LM', type: 'attacker', phases: [{ phaseIndex: 0, slotKey: 'player:LM' }] },
  { actorId: 'RM', type: 'attacker', phases: [{ phaseIndex: 0, slotKey: 'player:RM' }] }
];
function mount(history) {
  const listeners = new Map();
  const root = {
    innerHTML: '',
    addEventListener(name, fn) { listeners.set(name, fn); },
    removeEventListener(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); },
    replaceChildren() { this.innerHTML = ''; }
  };
  return { root, listeners, view: mountCoachTimingControls(root, history) };
}
test('E5.3.2 timing controls show explicit coach fields, accessible labels and unsaved warning', () => {
  const history = createTimelineDraft(actors).history;
  const { root, view } = mount(history);
  assert.match(root.innerHTML, /Coach event timing draft/);
  assert.match(root.innerHTML, /Time \(milliseconds\)/);
  assert.match(root.innerHTML, /Order at same time/);
  assert.match(root.innerHTML, /Unsaved timing draft/);
  assert.match(root.innerHTML, /aria-live="polite"/);
  assert.match(root.innerHTML, /data-action="undo" disabled/);
  assert.equal(view.getHistory(), history);
  view.destroy();
  assert.equal(root.innerHTML, '');
});
test('E5.3.2 event list orders by authored time and sequence, not array position', () => {
  let h = createTimelineDraft(actors).history;
  for (const e of [
    { eventId: 'first', kind: 'possession-set', actorId: 'LM', atMs: 0, sequence: 0 },
    { eventId: 'later', kind: 'run-start', actorId: 'RM', atMs: 900, sequence: 0 },
    { eventId: 'earlier', kind: 'wait-start', actorId: 'LM', atMs: 100, sequence: 0 }
  ]) h = editTimelineDraft(h, { type: 'add-event', event: e }).history;
  const { root } = mount(h);
  assert.ok(root.innerHTML.indexOf('earlier') < root.innerHTML.indexOf('later'));
});
test('E5.3.2 controls reject missing draft and do not attach save or player actions', () => {
  assert.throws(() => mountCoachTimingControls({}, null), TypeError);
  const { root, listeners, view } = mount(createTimelineDraft(actors).history);
  assert.doesNotMatch(root.innerHTML, /data-action="save"/);
  assert.doesNotMatch(root.innerHTML, /data-action="publish"/);
  view.destroy();
  assert.equal(listeners.size, 0);
});
