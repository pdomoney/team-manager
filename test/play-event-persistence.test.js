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

test('E5.5: untouched historical schema-4 play preserves metadata and serialized bytes', () => {
  const legacy = { ...play(), schema: 4, sport: 'oztag', phases: [{ title: 'Set', moves: [] }],
    notes: { coach: 'Keep shape' }, customLegacyField: { retained: true } };
  const before = JSON.stringify(legacy);
  const loaded = loadPlayEventDraft(legacy);
  assert.equal(loaded.status, 'empty');
  const saved = preparePlayTimelineSave(legacy, loaded.history, { changed: false });
  assert.equal(saved.status, 'unchanged');
  assert.strictEqual(saved.play, legacy);
  assert.equal(JSON.stringify(saved.play), before);
  assert.equal(Object.hasOwn(legacy, 'eventTimeline'), false);
});

test('E5.5: explicit timing save preserves historical fields and is round-trip stable', () => {
  const original = { ...play(), schema: 4, clubId: 'club-a', season: '2024',
    notes: { coaching: 'Preserve this' }, customLegacyField: [1, 2, 3] };
  const before = JSON.stringify(original);
  const saved = preparePlayTimelineSave(original, history(), { changed: true });
  assert.equal(saved.status, 'ready');
  assert.equal(JSON.stringify(original), before);
  for (const key of Object.keys(original)) assert.deepEqual(saved.play[key], original[key]);
  const reopened = loadPlayEventDraft(JSON.parse(JSON.stringify(saved.play)));
  assert.equal(reopened.status, 'ready');
  const untouched = preparePlayTimelineSave(saved.play, reopened.history, { changed: false });
  assert.equal(untouched.status, 'unchanged');
  assert.equal(JSON.stringify(untouched.play), JSON.stringify(saved.play));
});

test('E5.5: unsupported saved event version cannot be silently removed on unrelated save', () => {
  const original = { ...play(), schema: 4, eventTimeline: { version: 999, actors: [], events: [] } };
  const before = JSON.stringify(original);
  const loaded = loadPlayEventDraft(original);
  assert.equal(loaded.status, 'blocked');
  const result = preparePlayTimelineSave(original, history(), { changed: false });
  assert.equal(result.status, 'blocked');
  assert.equal(JSON.stringify(original), before);
});

test('E5.5 recovery: rollback to a historical play without event timing remains lossless', () => {
  const baseline = { ...play(), schema: 4, clubId: 'club-a', notes: { cue: 'Original' } };
  const backup = JSON.stringify(baseline);
  const edited = preparePlayTimelineSave(baseline, history(), { changed: true });
  assert.equal(edited.status, 'ready');
  assert.equal(loadPlayEventDraft(edited.play).status, 'ready');
  const restored = JSON.parse(backup);
  const loaded = loadPlayEventDraft(restored);
  assert.equal(loaded.status, 'empty');
  const result = preparePlayTimelineSave(restored, loaded.history, { changed: false });
  assert.equal(result.status, 'unchanged');
  assert.equal(JSON.stringify(result.play), backup);
  assert.equal(Object.hasOwn(result.play, 'eventTimeline'), false);
  assert.equal(JSON.stringify(baseline), backup);
});

test('E5.5 recovery: malformed timeline remains intact after blocked save and backup restore', () => {
  const corrupted = { ...play(), schema: 4,
    eventTimeline: { version: 999, actors: [], events: [], evidence: 'retain' } };
  const backup = JSON.stringify(corrupted);
  assert.equal(loadPlayEventDraft(corrupted).status, 'blocked');
  for (const changed of [false, true]) {
    const result = preparePlayTimelineSave(corrupted, history(), { changed });
    assert.equal(result.status, 'blocked');
    assert.equal(JSON.stringify(corrupted), backup);
  }
  const restored = JSON.parse(backup);
  assert.deepEqual(restored, corrupted);
  assert.equal(loadPlayEventDraft(restored).status, 'blocked');
});

test('E5.5 recovery: stale actor mapping does not replace a previously valid saved timeline', () => {
  const baseline = preparePlayTimelineSave(play(), history(), { changed: true }).play;
  assert.equal(loadPlayEventDraft(baseline).status, 'ready');
  const backup = JSON.stringify(baseline);
  const stale = structuredClone(baseline);
  stale.players = { B: [3, 4] };
  const before = JSON.stringify(stale);
  assert.equal(loadPlayEventDraft(stale).status, 'blocked');
  assert.equal(preparePlayTimelineSave(stale, history(), { changed: false }).status, 'blocked');
  assert.equal(preparePlayTimelineSave(stale, history(), { changed: true }).status, 'blocked');
  assert.equal(JSON.stringify(stale), before);
  const restored = JSON.parse(backup);
  assert.equal(loadPlayEventDraft(restored).status, 'ready');
  assert.equal(JSON.stringify(restored), backup);
});
