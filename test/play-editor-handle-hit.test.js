import test from 'node:test';
import assert from 'node:assert/strict';
import { nearestEditorHandle } from '../site/play-editor-handle-hit.js';

const overlap = [
  { index: 0, x: 110, y: 100, radius: 22 },
  { index: 1, x: 115, y: 100, radius: 22 },
  { index: 2, x: 120, y: 100, radius: 22 }
];

test('E4.12.4 picks nearest actual endpoint, not topmost overlapping SVG circle', () => {
  assert.equal(nearestEditorHandle(overlap, 110, 100), 0);
  assert.equal(nearestEditorHandle(overlap, 120, 100), 2);
  assert.equal(nearestEditorHandle(overlap, 114, 100), 1);
  assert.equal(nearestEditorHandle(overlap.slice().reverse(), 110, 100), 0,
    'DOM rendering order cannot override geometrical proximity');
});

test('E4.12.4 truly coincident or equally distant handle centres fail closed', () => {
  const same = [{ index: 0, x: 50, y: 50, radius: 17 },
    { index: 1, x: 50, y: 50, radius: 17 }];
  assert.equal(nearestEditorHandle(same, 50, 50), null);
  assert.equal(nearestEditorHandle(overlap, 112.5, 100), null);
  assert.equal(nearestEditorHandle(overlap, 100, 100), 0);
  assert.equal(nearestEditorHandle(overlap, 1000, 1000), null);
});

test('E4.12.4 nearest-handle decision is stable under canvas zoom/translation', () => {
  for (const zoom of [0.61, 1, 1.93, 2.5]) {
    const translated = overlap.map(h => ({
      ...h, x: 60 + h.x * zoom, y: 40 + h.y * zoom,
      radius: h.radius * zoom
    }));
    assert.equal(nearestEditorHandle(translated, 60 + 110 * zoom, 40 + 100 * zoom), 0,
      `Start remains selectable at zoom ${zoom}`);
    assert.equal(nearestEditorHandle(translated, 60 + 120 * zoom, 40 + 100 * zoom), 2,
      `End remains selectable at zoom ${zoom}`);
  }
});

test('E4.12.4 invalid, invisible and out-of-hit-area choices never infer a link', () => {
  assert.equal(nearestEditorHandle([], 12, 12), null);
  assert.equal(nearestEditorHandle(null, 12, 12), null);
  assert.equal(nearestEditorHandle(overlap, NaN, 100), null);
  assert.equal(nearestEditorHandle(overlap, 110, 100, -1), null);
  assert.equal(nearestEditorHandle([{index:0,x:110,y:100,radius:0}], 110, 100), null);
  assert.equal(nearestEditorHandle([{index:0,x:110,y:100,radius:NaN}], 110, 100), null);
  assert.equal(nearestEditorHandle([{index:0,x:110,y:100,radius:3}], 118, 100), null);
});
