import test from 'node:test';
import assert from 'node:assert/strict';
import { learnArtworkScale } from '../site/play-learn-art-scale.js';

const size = width => 24 * width / 380 * learnArtworkScale(width);

test('Learn preserves phone artwork, but caps desktop badge size', () => {
  for (const width of [280, 350, 390, 540, 570])
    assert.equal(learnArtworkScale(width), 1, `phone/narrow board ${width}`);
  for (const width of [760, 900, 1120, 1400]) {
    assert.ok(Math.abs(size(width) - 36) < .5,
      `desktop Learn board ${width}: ${size(width)}px`);
  }
  assert.ok(size(390) < size(1120) && size(1120) <= 36.5);
});

test('Learn density is continuous at the cap and bounded on unusual sizes', () => {
  assert.ok(Math.abs(size(569) - size(571)) < .2);
  assert.equal(learnArtworkScale(4000), .28);
  for (const args of [[null], [undefined], [NaN], [Infinity], [0], [-1], ['390'],
    [600, 0], [600, 380, -1], [600, Infinity, 12]])
    assert.equal(learnArtworkScale(...args), 1);
});
