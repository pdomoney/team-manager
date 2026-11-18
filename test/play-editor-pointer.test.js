import test from 'node:test';
import assert from 'node:assert/strict';
import { captureEditorPointer, cancelEditorPointer, settleUnchangedEditorPointer, nearestEditorHandleAtPoint } from '../site/play-editor-pointer.js';

const editor = () => ({
  draft: {
    players: { LM: [15, 30], RM: [22, 30] },
    moves: [{ t: 'pass', linkVersion: 1, moveId: 'm-synthetic',
      actorLinks: { start: 'player:LM', end: 'player:RM' },
      pts: [[15, 30], [22, 30]] }],
    phases: []
  },
  undo: [{ draft: '{"old":true}' }],
  dirty: false, sel: { k: 'pl', id: 'LM' }, selH: null,
  stableViewport: { x0: 5, y0: 10, x1: 45, y1: 65 },
  canvasPositioned: true, lockView: null, drawing: null
});

test('pointercancel restores connected endpoints, selected handle and undo', () => {
  const e = editor(), original = structuredClone(e);
  const before = captureEditorPointer(e);
  e.undo.push({ draft: JSON.stringify(e.draft) });
  e.draft.players.LM = [19, 30];
  e.draft.moves[0].pts[0] = [19, 30];
  e.sel = { k: 'mv', i: 0 }; e.selH = 1;
  e.lockView = { x0: 1 }; e.dirty = true;
  assert.equal(cancelEditorPointer(e, before), true);
  assert.deepEqual(e, original);
  assert.deepEqual(e.draft.moves[0].actorLinks, original.draft.moves[0].actorLinks);
});

test('cancel after undo history reaches cap restores oldest snapshot too', () => {
  const e = editor();
  e.undo = Array.from({ length: 60 }, (_, i) => ({ draft: JSON.stringify({ step: i }) }));
  e.dirty = true; e.sel = { k: 'mv', i: 0 }; e.selH = 0;
  const original = structuredClone(e), before = captureEditorPointer(e);
  e.undo.push({ draft: JSON.stringify(e.draft) });
  e.undo.shift();
  e.draft.moves[0].pts.splice(1, 0, [17, 33]);
  e.selH = 1; e.drawing = { pts: [[15, 30], [17, 33]] };
  assert.equal(cancelEditorPointer(e, before), true);
  assert.deepEqual(e, original);
});

test('canceling a newly drawn movement does not create or persist geometry', () => {
  const e = editor(), before = captureEditorPointer(e);
  e.drawing = { pts: [[15, 30], [17, 30]] };
  e.draft.moves.push({ t: 'run', pts: [[15, 30], [17, 30]] });
  e.dirty = true;
  assert.equal(cancelEditorPointer(e, before), true);
  assert.equal(e.drawing, null);
  assert.equal(e.dirty, false);
  assert.equal(e.draft.moves.length, 1);
});

test('invalid snapshot is a no-op, never wipes a working editor', () => {
  const e = editor(), before = structuredClone(e);
  assert.equal(cancelEditorPointer(e, null), false);
  assert.equal(cancelEditorPointer(e, { draft: '{invalid', undo: [] }), false);
  assert.equal(cancelEditorPointer(e, { draft: '{}', undo: null }), false);
  assert.deepEqual(e, before);
  assert.equal(captureEditorPointer({ draft: {}, undo: null }), null);
});

test('E4.12.3 returning a snapped V1 handle to the same actor removes only the phantom Undo', () => {
  const e=editor(), original=structuredClone(e), before=captureEditorPointer(e);
  e.undo.push({ draft: JSON.stringify(e.draft) });
  e.draft.moves[0].pts[0] = [15.4, 30];
  e.draft.moves[0].pts[0] = [15, 30]; // existing Snap On returned to LM
  e.dirty = true;
  assert.equal(settleUnchangedEditorPointer(e, before), true);
  assert.deepEqual(e.undo, original.undo);
  assert.equal(e.dirty, original.dirty);
  assert.deepEqual(e.draft.moves[0].actorLinks, original.draft.moves[0].actorLinks);
});

test('E4.12.3 an actual endpoint edit retains its Undo and previous dirty state', () => {
  const e=editor(), before=captureEditorPointer(e);
  e.undo.push({ draft: JSON.stringify(e.draft) });
  e.draft.moves[0].pts[0] = [17, 31];
  e.draft.moves[0].actorLinks = { end: 'player:RM' };
  e.dirty = true;
  assert.equal(settleUnchangedEditorPointer(e, before), false);
  assert.equal(e.undo.length, 2);
  assert.equal(e.dirty, true);
  assert.deepEqual(e.draft.moves[0].pts[0], [17, 31]);
});

test('E4.12.3 after existing edits, a snap-back keeps prior Undo history and dirty state', () => {
  const e=editor();
  e.undo.push({ draft: '{"earlier":true}' }); e.dirty=true;
  const before=captureEditorPointer(e), snapshot=JSON.stringify(e.draft);
  e.undo.push({ draft: snapshot });
  e.draft.moves[0].pts[0] = [15.4, 30];
  e.draft.moves[0].pts[0] = [15, 30];
  assert.equal(settleUnchangedEditorPointer(e, before), true);
  assert.deepEqual(e.undo, before.undo);
  assert.equal(e.dirty, true);
  assert.equal(settleUnchangedEditorPointer(e, null), false);
});

const fakeHandle = (index, cx, cy, radius = 15) => ({
  getAttribute: name => name === 'data-h' ? String(index) : null,
  getBoundingClientRect: () => ({
    x: cx - radius, y: cy - radius, width: radius * 2, height: radius * 2
  })
});
const fakeSvg = (...handles) => ({
  querySelectorAll: selector => {
    assert.equal(selector, 'circle.ped-handle-hit[data-h]');
    return handles;
  }
});

test('overlapping mobile hit circles select nearest Start even when Bend is on top', () => {
  // The DOM draws Bend later. At Start centre, both targets accept touches,
  // but Bend is not the nearest endpoint and must never steal the selection.
  const hit = fakeSvg(fakeHandle(0, 100, 100), fakeHandle(1, 108, 100),
    fakeHandle(2, 158, 100));
  assert.equal(nearestEditorHandleAtPoint(hit, 100, 100), 0);
  assert.equal(nearestEditorHandleAtPoint(hit, 108, 100), 1);
  assert.equal(nearestEditorHandleAtPoint(hit, 158, 100), 2);
  assert.equal(nearestEditorHandleAtPoint(hit, 104, 100), null,
    'exact halfway ambiguity must use existing hit or precision controls');
});

test('nearest handle resolver never selects outside hit target or from invalid geometry', () => {
  const handles = fakeSvg(fakeHandle(0, 100, 100), fakeHandle(1, 108, 100));
  assert.equal(nearestEditorHandleAtPoint(handles, 130, 130), null);
  assert.equal(nearestEditorHandleAtPoint(handles, NaN, 100), null);
  assert.equal(nearestEditorHandleAtPoint(null, 100, 100), null);
  const broken = fakeSvg({getAttribute: () => '1',
    getBoundingClientRect: () => ({x: 0,y: 0,width: 0,height: 10})},
    {getAttribute: () => 'forged',
     getBoundingClientRect: () => ({x: 0,y: 0,width: 30,height: 30})});
  assert.equal(nearestEditorHandleAtPoint(broken, 0, 0), null);
});

test('nearest handle resolution is read-only and never changes actor-linked play data', () => {
  const e = editor(), before = JSON.stringify(e);
  const svg = fakeSvg(fakeHandle(0, 100, 100), fakeHandle(1, 108, 100));
  assert.equal(nearestEditorHandleAtPoint(svg, 100, 100), 0);
  assert.equal(JSON.stringify(e), before);
  assert.equal(e.draft.moves[0].actorLinks.start, 'player:LM');
});
