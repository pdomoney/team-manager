import test from 'node:test';
import assert from 'node:assert/strict';
import { watchArtworkScale } from '../site/play-watch-art-scale.js';

const diameter = width => 24 * width / 380 * watchArtworkScale(width);
const target = width => width <= 420 ? 27 : width >= 760 ? 36 : 27 + (width - 420) * 9 / 340;

test('Watch has deliberately leaner phone artwork and retains desktop density', () => {
  const sizes = [300, 350, 390, 760, 920, 1200, 1400];
  for (const width of sizes) {
    const actual = diameter(width);
    assert.ok(Math.abs(actual - target(width)) < 0.5, `${width}px Watch board: ${actual}px icon, expected ${target(width)}px`);
  }
  assert.ok(diameter(350) < diameter(760) - 8,
    'phone symbols are materially smaller than desktop symbols');
  assert.ok(watchArtworkScale(1200) < watchArtworkScale(350),
    'large desktop viewer uses smaller SVG glyphs, not larger on-screen badges');
});

test('extreme board widths and invalid values fail to safe bounded scale', () => {
  assert.equal(watchArtworkScale(100), 2);
  assert.equal(watchArtworkScale(4000), .28);
  for (const args of [
    [null], [undefined], [NaN], [Infinity], [0], [-1], ['600'],
    [600, 0], [600, -1], [600, 380, 0], [600, 380, Infinity]
  ]) assert.equal(watchArtworkScale(...args), 1);
});

test('watch density calculation is pure and idempotent at source dimensions', () => {
  assert.equal(watchArtworkScale(850), watchArtworkScale(850));
  assert.ok(Math.abs(diameter(850)-36)<.1);
});

test('narrow Watch board does not jump in badge size at responsive thresholds', () => {
  for (const edge of [420, 760]) {
    assert.ok(Math.abs(diameter(edge - 1) - diameter(edge + 1)) < .15,
      `badge does not jump around ${edge}px`);
  }
});
