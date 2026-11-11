import test from 'node:test';
import assert from 'node:assert/strict';
import { editorPointerSlop, beginsEditorPointerDrag } from '../site/play-editor-drag-intent.js';

test('E4.12.3 touch jitter is selection, not a line move, independent of field zoom', () => {
  assert.equal(editorPointerSlop('touch'), 8);
  for (const zoom of [0.45, 0.61, 1, 1.93, 2.5, 3]) {
    const origin = { x: 130, y: 220, pointerType: 'touch' };
    assert.equal(beginsEditorPointerDrag(origin, 137, 220), false, `no unintended detach at zoom ${zoom}`);
    assert.equal(beginsEditorPointerDrag(origin, 138, 220), true, `intentional touch drag at zoom ${zoom}`);
  }
});
test('E4.12.3 pen and mouse require less screen movement than a finger', () => {
  assert.equal(editorPointerSlop('pen'), 5);
  assert.equal(editorPointerSlop('mouse'), 3);
  const origin = { x: 100, y: 100 };
  for (const [type, below, start] of [['touch', 7, 8], ['pen', 4, 5], ['mouse', 2, 3]]) {
    const o = { ...origin, pointerType: type };
    assert.equal(beginsEditorPointerDrag(o, 100 + below, 100), false);
    assert.equal(beginsEditorPointerDrag(o, 100 + start, 100), true);
    assert.equal(beginsEditorPointerDrag(o, 100, 100 - start), true);
  }
});
test('E4.12.3 diagonal displacement and reverse travel use absolute pixel distance', () => {
  const origin = { x: 100, y: 100, pointerType: 'touch' };
  assert.equal(beginsEditorPointerDrag(origin, 104, 105), false);
  assert.equal(beginsEditorPointerDrag(origin, 106, 106), true);
  assert.equal(beginsEditorPointerDrag(origin, 94, 94), true);
  assert.equal(beginsEditorPointerDrag(origin, 100, 100), false);
});
test('E4.12.3 malformed coordinates cannot initiate a destructive gesture', () => {
  for (const bad of [null, {}, {x: NaN,y:3}, {x:Infinity,y:0}, {x:5,y:'5'}]) {
    assert.equal(beginsEditorPointerDrag(bad, 18, 20), false);
  }
  assert.equal(beginsEditorPointerDrag({x:3,y:4,pointerType:'mouse'}, NaN, 7), false);
  assert.equal(beginsEditorPointerDrag({x:3,y:4,pointerType:'touch'}, 12, Infinity), false);
  assert.equal(editorPointerSlop('unexpected'), 3);
});
