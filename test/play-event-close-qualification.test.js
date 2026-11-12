import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPlayEventDraft, preparePlayTimelineSave } from '../site/play-event-persistence.js';

test('E5.3.5 editor close considers unsaved timing draft changes', () => {
  const app = readFileSync(new URL('../site/app.js', import.meta.url), 'utf8');
  const start = app.indexOf('function requestCloseSheet()');
  const end = app.indexOf('function closeSheet()', start);
  const close = app.slice(start, end);
  assert.match(close, /timelineController\?\.getPersistenceState\(\)\?\.changed/);
  assert.match(close, /E\.dirty \|\| fieldsChanged \|\| timingChanged/);
  assert.match(close, /confirm\('Close without saving the changes to this play\?'\)/);
});
test('E5.3.5 untouched legacy play does not acquire event timing', () => {
  const play = { id: 'legacy', players: {}, phases: [] };
  const loaded = loadPlayEventDraft(play);
  assert.equal(loaded.status, 'empty');
  const saved = preparePlayTimelineSave(play, loaded.history, { changed: false });
  assert.equal(saved.status, 'unchanged');
  assert.equal(Object.hasOwn(saved.play, 'eventTimeline'), false);
});
test('E5.3.5 corrupt saved timing blocks overwrite even without timing edits', () => {
  const play = { id: 'corrupt', players: {}, phases: [],
    eventTimeline: { version: 99, actors: [], events: [] } };
  const loaded = loadPlayEventDraft(play);
  assert.equal(loaded.status, 'blocked');
  const result = preparePlayTimelineSave(play,
    { past: [], present: { version: 1, actors: [], events: [] }, future: [] },
    { changed: false });
  assert.equal(result.status, 'blocked');
  assert.equal(play.eventTimeline.version, 99);
});
