import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimelineDraft } from '../site/play-event-draft.js';
import { loadPlayEventDraft, preparePlayTimelineSave } from '../site/play-event-persistence.js';

const play = () => ({ id: 'p1', name: 'Sample', players: { A: [1, 2] }, phases: [] });
const history = () => createTimelineDraft([
  { actorId: 'runner', type: 'attacker', phases: [{ phaseIndex: 0, slotKey: 'A' }] }
]).history;

test('legacy play without timeline remains byte-equivalent when draft untouched', () => {
  const original = play(), before = JSON.stringify(original);
  const loaded = loadPlayEventDraft(original);
  assert.equal(loaded.status, 'empty');
  const result = preparePlayTimelineSave(original, loaded.history, { changed: false });
  assert.equal(result.status, 'unchanged');
  assert.equal(JSON.stringify(original), before);
  assert.equal(Object.hasOwn(original, 'eventTimeline'), false);
});
test('explicit mapped timeline saves and reloads without altering source play', () => {
  const original = play(), h = history();
  const result = preparePlayTimelineSave(original, h, { changed: true });
  assert.equal(result.status, 'ready');
  assert.equal(Object.hasOwn(original, 'eventTimeline'), false);
  assert.equal(result.play.eventTimeline.actors[0].actorId, 'runner');
  const reopened = loadPlayEventDraft(JSON.parse(JSON.stringify(result.play)));
  assert.equal(reopened.status, 'ready');
  assert.deepEqual(reopened.history.present, h.present);
  assert.equal(reopened.history.canUndo, false);
});
test('stale slot mapping cannot replace valid timeline', () => {
  const saved = preparePlayTimelineSave(play(), history(), { changed: true }).play;
  const before = JSON.stringify(saved);
  saved.players = { B: [3, 4] };
  assert.equal(loadPlayEventDraft(saved).status, 'blocked');
  assert.equal(preparePlayTimelineSave(saved, history(), { changed: true }).status, 'blocked');
  assert.equal(saved.eventTimeline.actors[0].phases[0].slotKey, 'A');
  assert.notEqual(JSON.stringify(saved), before);
});
test('invalid saved timeline blocks loading instead of clearing existing data', () => {
  const original = { ...play(), eventTimeline: { version: 99, actors: [], events: [] } };
  assert.equal(loadPlayEventDraft(original).status, 'blocked');
  assert.equal(original.eventTimeline.version, 99);
});
