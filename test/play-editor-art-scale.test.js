import test from 'node:test';
import assert from 'node:assert/strict';
import { editorArtworkScale } from '../site/play-editor-art-scale.js';

test('detail zoom compensates normal editor magnification without changing field coordinates', () => {
  const a=editorArtworkScale(1.41), b=editorArtworkScale(1.71);
  assert.ok(b<a, 'more zoom means smaller SVG symbol radius');
  assert.ok(Math.abs(a*1.41-1)<0.002);
  assert.ok(Math.abs(b*1.71-1)<0.002);
  assert.equal(editorArtworkScale(1),1);
});

test('visibility and usability bounds at extreme zoom', () => {
  assert.equal(editorArtworkScale(0.1),1.4);
  assert.equal(editorArtworkScale(0.5),1.4);
  assert.equal(editorArtworkScale(3),0.333);
  for (const z of [0.1,0.5,0.85,1,1.41,1.71,2.5,3]) {
    assert.ok(editorArtworkScale(z)>=0.33 && editorArtworkScale(z)<=1.4);
  }
});

test('malformed zoom cannot cause invalid SVG transforms or collapsed drawing', () => {
  for (const z of [undefined,null,NaN,Infinity,-Infinity,-1,0,'2']) {
    assert.equal(editorArtworkScale(z),1);
  }
});
