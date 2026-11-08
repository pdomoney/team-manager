import test from 'node:test';
import assert from 'node:assert/strict';
import { editorSnapPoint, editorSnapDetails } from '../site/play-editor-snap.js';

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

test('snap feedback reports the exact player or defender selected by geometry', () => {
  const before = JSON.stringify(d);
  const player = editorSnapDetails(d, [15.3, 30.1], 'player', true);
  assert.deepEqual(player, { status: 'ready', point: [15, 30], target: 'LM' });
  assert.deepEqual(editorSnapPoint(d, [15.3, 30.1], 'player', true), player.point);
  assert.deepEqual(editorSnapDetails(d, [15.2, 23.1], 'defence', true),
    { status: 'ready', point: [15, 23], target: 'Marker' });
  assert.deepEqual(editorSnapDetails(d, [12.1, 21.1], 'defence', true),
    { status: 'ready', point: [12, 21], target: 'Defender 1' });
  assert.equal(JSON.stringify(d), before);
});

test('ambiguous, distant and disabled snapping cannot claim an actor', () => {
  const phase = structuredClone(d);
  phase.players.RR = [15, 30];
  const ambiguous = editorSnapDetails(phase, [15.1, 30], 'player', true);
  assert.equal(ambiguous.status, 'ambiguous');
  assert.equal(ambiguous.target, null);
  assert.deepEqual(ambiguous.point, [15.1, 30]);
  assert.deepEqual(editorSnapDetails(d, [40, 60], 'player', true),
    { status: 'none', point: [40, 60], target: null });
  const p = [15.1, 30];
  const disabled = editorSnapDetails(d, p, 'player', false);
  assert.equal(disabled.status, 'off');
  assert.equal(disabled.point, p);
  assert.deepEqual(editorSnapDetails(d, p, 'unknown', true),
    { status: 'invalid', point: p, target: null });
  assert.deepEqual(editorSnapDetails(d, [NaN, 30], 'player', true).status, 'invalid');
});
