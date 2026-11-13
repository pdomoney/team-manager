import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../site/app.js', import.meta.url), 'utf8');
const summary = app.slice(app.indexOf('function playTimingSummary('), app.indexOf('function viewPlay('));
const handler = app.slice(app.indexOf("if (k === 'event-timing-seek'"), app.indexOf("if (k === 'anim-seek')"));

test('E5.4c only exposes scrubber for validated authored timelines', () => {
  assert.match(summary, /inspectPlayEventSeek\(play, 0\)/);
  assert.match(summary, /initial\.status !== 'ready'\) return ''/);
  assert.match(summary, /data-input="event-timing-seek"/);
  assert.match(summary, /result\.durationMs === 0 \? 'disabled'/);
  assert.match(summary, /timingSeek\.playId !== play\.id/);
});
test('E5.4c reads a seek snapshot and updates labels without starting animation or saving', () => {
  assert.match(handler, /inspectPlayEventSeek\(play, requested\)/);
  assert.match(handler, /result\.status === 'ready'/);
  assert.match(handler, /textContent = 'Ball: '/);
  assert.match(handler, /textContent = 'Movement: '/);
  assert.doesNotMatch(handler, /animSeek\(|animFrame\(|save\(|render\(/);
});
test('E5.4c preserves independent legacy Watch seek', () => {
  assert.match(app, /if \(k === 'anim-seek'\) animSeek\(e\.target\.value\)/);
  assert.match(app, /studyFigure\(p, side, cards\) : playFigure\(p, side, state\.playPhase\)/);
});
