import test from 'node:test';
import assert from 'node:assert/strict';
import { editorArtworkScale } from '../site/play-editor-art-scale.js';

const onScreenDiameter = (zoom, width) =>
  24 * editorArtworkScale(zoom, width) * (width * zoom / 380);

test('editor Fit 61% and 118%/193% detail zoom keep player diameter near 36 CSS px', () => {
  const width = 1320; // synthetic full-width desktop play stage
  const fit = editorArtworkScale(.61, width);
  const mid = editorArtworkScale(1.18, width);
  const detail = editorArtworkScale(1.93, width);
  assert.ok(fit > mid && mid > detail);
  // Previous 100%-anchored inverse scaling rendered ~81px players at Fit 61%.
  assert.ok(onScreenDiameter(.61, width) < 40);
  for (const zoom of [.61, 1.18, 1.93]) {
    assert.ok(Math.abs(onScreenDiameter(zoom, width) - 36) <= .15,
      `zoom ${zoom}: player should be ~36px; got ${onScreenDiameter(zoom,width)}px`);
  }
});

test('constant visual size across phone/medium/desktop canvas widths', () => {
  for (const width of [350, 760, 1320]) {
    for (const zoom of [.61, 1.18, 1.41, 1.71, 1.93, 3]) {
      assert.ok(Math.abs(onScreenDiameter(zoom, width) - 36) <= .4,
        `${width}px canvas, zoom ${zoom}: stable symbol diameter`);
    }
  }
});

test('the scale is bounded at pathological dimensions and never emits NaN', () => {
  assert.equal(editorArtworkScale(.1, 350), 3.5);
  assert.equal(editorArtworkScale(3, 2560), .08);
  for (const args of [
    [undefined, 400], [null, 400], [NaN, 400], [Infinity, 400],
    [-1, 400], [0, 400], [1, NaN], [1, -1], [1, 0], [1, Infinity],
    [1, 400, -1], [1, 400, 380, 0], ['1', 400]
  ]) assert.equal(editorArtworkScale(...args), 1);
});
