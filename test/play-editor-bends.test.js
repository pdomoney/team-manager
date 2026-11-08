import test from 'node:test';
import assert from 'node:assert/strict';
import { previewBendInsertion, insertMovementBend, canRemoveMovementBend, removeMovementBend } from '../site/play-editor-bends.js';

const legacy = () => ({
  moves: [
    { t: 'run', pts: [[10, 30], [20, 30]] },
    { t: 'pass', moveId: 'm-synthetic-pass', linkVersion: 1,
      actorLinks: { start: 'player:LM', end: 'player:RM' },
      pts: [[10, 30], [15, 35], [20, 40]] }
  ]
});

test('add a midpoint to a legacy run, retain its endpoints, and reverse the change', () => {
  const phase = legacy();
  const original = structuredClone(phase);
  assert.deepEqual(previewBendInsertion(phase, 0, 0), { insertIndex: 1, at: [15, 30] });
  assert.deepEqual(phase, original, 'preview must not mutate');
  assert.equal(insertMovementBend(phase, 0, 0), 1);
  assert.deepEqual(phase.moves[0].pts, [[10, 30], [15, 30], [20, 30]]);
  assert.equal(canRemoveMovementBend(phase, 0, 1), true);
  assert.equal(removeMovementBend(phase, 0, 1), true);
  assert.deepEqual(phase, original, 'inserting then removing preserves legacy bytes');
});

test('add and remove a bend on linked pass without changing stable IDs or actor links', () => {
  const phase = legacy(), before = structuredClone(phase.moves[1]);
  const at = previewBendInsertion(phase, 1, 2);
  assert.deepEqual(at, { insertIndex: 2, at: [17.5, 37.5] });
  assert.equal(insertMovementBend(phase, 1, 2), 2);
  assert.deepEqual(phase.moves[1].actorLinks, before.actorLinks);
  assert.deepEqual([phase.moves[1].pts[0], phase.moves[1].pts.at(-1)],
    [before.pts[0], before.pts.at(-1)]);
  assert.equal(removeMovementBend(phase, 1, 2), true);
  assert.deepEqual(phase.moves[1], before);
});

test('invalid/unsupported/same-point selections cannot change source geometry', () => {
  const phase = legacy();
  phase.moves.push({ t: 'run', linkVersion: 7, pts: [[5, 10], [7, 15]] });
  phase.moves.push({ t: 'run', pts: [[10, 30], [10, 30]] });
  phase.moves.push({ t: 'run', pts: [[NaN, 30], [12, 31]] });
  const before = structuredClone(phase);
  for (const [idx, handle] of [[-1, 0], [0, -1], [0, 3], [0, NaN], [2, 0], [3, 0], [4, 0]]) {
    assert.equal(previewBendInsertion(phase, idx, handle), null);
    assert.equal(insertMovementBend(phase, idx, handle), null);
  }
  for (const [idx, handle] of [[0, 0], [0, 1], [1, 0], [1, 2], [2, 1], [4, 1]]) {
    assert.equal(canRemoveMovementBend(phase, idx, handle), false);
    assert.equal(removeMovementBend(phase, idx, handle), false);
  }
  assert.deepEqual(phase, before);
});

test('very short or long paths fail closed and cannot create phantom midpoints', () => {
  const phase = { moves: [
    { t: 'run', pts: [[10, 20], [10.1, 20]] },
    { t: 'run', pts: Array.from({ length: 24 }, (_, i) => [i, 20]) }
  ] };
  const original = structuredClone(phase);
  assert.equal(insertMovementBend(phase, 0, 0), null);
  assert.equal(insertMovementBend(phase, 1, 0), null);
  assert.deepEqual(phase, original);
});
