import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const app = readFileSync(new URL('../site/app.js', import.meta.url), 'utf8');
test('E5.4b Watch/Learn timing summary uses the validated read-only adapter', () => {
  assert.match(app, /import \{ inspectPlayEventSeek \} from '\.\/play-event-readonly-seek\.js'/);
  const helper = app.slice(app.indexOf('function playTimingSummary('), app.indexOf('function viewPlay('));
  assert.match(helper, /inspectPlayEventSeek\(play, 0\)/);
  assert.match(helper, /result\.status !== 'ready'\) return ''/);
  assert.match(helper, /timed playback is not enabled/);
  assert.doesNotMatch(helper, /save\(|animFrame\(|anim\.playing/);
});
test('E5.4b preserves Watch/Learn viewer modes and animation renderer', () => {
  const viewer = app.slice(app.indexOf('function viewPlay('), app.indexOf('function syncLearnArtwork('));
  assert.match(viewer, /playTimingSummary\(p\)/);
  assert.match(viewer, /data-mode="learn"/);
  assert.match(viewer, /data-mode="watch"/);
  assert.match(viewer, /playFigure\(p, side, state\.playPhase\)/);
  assert.match(viewer, /studyFigure\(p, side, cards\)/);
});
