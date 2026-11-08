import test from 'node:test';
import assert from 'node:assert/strict';
import { editorSnapPoint } from '../site/play-editor-snap.js';

const d = {
  players: { LM: [15, 30], RM: [19, 30], RR: [23, 34] },
  defence: { marker: [15, 23], line: [[12, 21], [22, 21]] }
};

test('freehand default keeps precise endpoint even when it nearly touches a player', () => {
  const p = [15.2, 30.1];
  assert.deepEqual(editorSnapPoint(d, p, 'player', false), p);
  assert.equal(editorSnapPoint(d, p, 'player', false), p);
});

test('opt-in snapping captures only one actor within a small radius', () => {
  assert.deepEqual(editorSnapPoint(d, [15.3, 30.1], 'player', true), [15, 30]);
  assert.deepEqual(editorSnapPoint(d, [16.1, 30], 'player', true), [16.1, 30]);
  assert.deepEqual(editorSnapPoint(d, [15.6, 30], 'player', true), [15, 30]);
});

test('two overlapping actors are ambiguous and never snapped', () => {
  const phase = structuredClone(d);
  phase.players.RR = [15, 30];
  const before = JSON.stringify(phase);
  assert.deepEqual(editorSnapPoint(phase, [15.1, 30], 'player', true), [15.1, 30]);
  assert.equal(JSON.stringify(phase), before);
});

test('defence snapping never grabs an attacking player', () => {
  assert.deepEqual(editorSnapPoint(d, [15.2, 23.1], 'defence', true), [15, 23]);
  assert.deepEqual(editorSnapPoint(d, [15.2, 30.1], 'defence', true), [15.2, 30.1]);
});

test('invalid points and tolerance fail without mutating diagram data', () => {
  const before = JSON.stringify(d);
  assert.deepEqual(editorSnapPoint(d, [15, 30], 'player', true, -1), [15, 30]);
  assert.deepEqual(editorSnapPoint(d, [15, 30], 'player', true, 0), [15, 30]);
  assert.deepEqual(editorSnapPoint(d, [NaN, 30], 'player', true), [NaN, 30]);
  assert.equal(JSON.stringify(d), before);
});
