import test from 'node:test';
import assert from 'node:assert/strict';
import { editorArtworkScale, editorInteractionScale, editorArtworkTargetDiameter } from '../site/play-editor-art-scale.js';

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

test('mobile editor paint is leaner while desktop retains accepted size', () => {
  for (const width of [350, 390, 420, 500, 640, 760, 1320]) {
    for (const zoom of [.61, 1.18, 1.41, 1.71, 1.93, 3]) {
      const actual = onScreenDiameter(zoom, width);
      const target = editorArtworkTargetDiameter(width);
      assert.ok(Math.abs(actual - target) <= .4,
        `${width}px canvas, zoom ${zoom}: ${actual}px icon vs ${target}px target`);
    }
  }
  assert.equal(editorArtworkTargetDiameter(390), 27);
  assert.equal(editorArtworkTargetDiameter(1320), 36);
  assert.ok(onScreenDiameter(1.18, 390) <= 28);
});

test('transparent touch targets remain desktop-sized despite smaller phone paint', () => {
  for (const width of [350, 390, 500, 760, 1320]) {
    for (const zoom of [.61, 1.18, 1.93]) {
      const pixelsPerUnit = width * zoom / 380;
      const hit = editorInteractionScale(zoom, width);
      assert.ok(Math.abs(30 * hit * pixelsPerUnit - 45) <= .55,
        `actor/handle 45px hit: ${width}px ${zoom}x`);
      assert.ok(Math.abs(24 * hit * pixelsPerUnit - 36) <= .55,
        `movement 36px hit: ${width}px ${zoom}x`);
      if (width <= 420) assert.ok(hit > editorArtworkScale(zoom, width));
      else if (width >= 760) assert.equal(hit, editorArtworkScale(zoom, width));
    }
  }
});

test('intermediate phone/tablet widths do not abruptly jump in artwork density', () => {
  for (const edge of [420, 760]) {
    assert.ok(Math.abs(editorArtworkTargetDiameter(edge - 1) -
                       editorArtworkTargetDiameter(edge + 1)) < .06);
  }
});

test('the scale is bounded at pathological dimensions and never emits NaN', () => {
  assert.equal(editorArtworkScale(.1, 350), 3.5);
  assert.equal(editorArtworkScale(3, 2560), .08);
  assert.equal(editorInteractionScale(3, 2560), .08);
  for (const args of [
    [undefined, 400], [null, 400], [NaN, 400], [Infinity, 400],
    [-1, 400], [0, 400], [1, NaN], [1, -1], [1, 0], [1, Infinity],
    [1, 400, -1], [1, 400, 380, 0], ['1', 400]
  ]) {
    assert.equal(editorArtworkScale(...args), 1);
    assert.equal(editorInteractionScale(...args), 1);
  }
});
