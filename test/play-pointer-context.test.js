import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  captureEditorPointer, cancelEditorPointer,
  captureEditorPointerContext, matchesEditorPointerContext
} from '../site/play-editor-pointer.js';

const original = () => ({
  draft: { players: { LM: [20, 30], RM: [30, 30] },
    moves: [{ t: 'run', moveId: 'm-e4122', linkVersion: 1,
      actorLinks: { start: 'player:LM' },
      pts: [[20, 30], [25, 34]] }],
    phases: [{ players: { LM: [22, 50], RM: [32, 50] },
      moves: [{ t: 'run', moveId: 'm-e4122-next', linkVersion: 1,
        actorLinks: { start: 'player:LM' }, pts: [[22, 50], [27, 55]] }] }] },
  phase: 0, tool: 'select', sel: { k: 'mv', i: 0 }, selH: 0,
  undo: [], dirty: false, drawing: null,
  stableViewport: { x0: 0, x1: 50, y0: 0, y1: 80 },
  canvasPositioned: true, lockView: null
});
const copy = x => JSON.parse(JSON.stringify(x));

test('E4.12.2 only the same exact editor/phase/tool/selected handle continues a gesture', () => {
  const e = original();
  const before = JSON.stringify(e.draft);
  const context = captureEditorPointerContext(e);
  assert.equal(matchesEditorPointerContext(e, context), true);
  e.phase = 1;
  assert.equal(matchesEditorPointerContext(e, context), false,
    'same LM labels in phase 2 do not preserve a phase-1 gesture');
  e.phase = 0; e.tool = 'pan';
  assert.equal(matchesEditorPointerContext(e, context), false);
  e.tool = 'select'; e.sel = { k: 'mv', i: 1 };
  assert.equal(matchesEditorPointerContext(e, context), false);
  e.sel = { k: 'mv', i: 0 }; e.selH = 1;
  assert.equal(matchesEditorPointerContext(e, context), false);
  e.selH = 0;
  assert.equal(matchesEditorPointerContext(e, context), true);
  assert.equal(matchesEditorPointerContext(copy(e), context), false,
    'a different editor instance must never be overwritten');
  assert.equal(JSON.stringify(e.draft), before, 'capture and guards are read-only');
});

test('E4.12.2 stale/invalid gesture context fails closed', () => {
  const e = original(), ctx = captureEditorPointerContext(e);
  assert.equal(captureEditorPointerContext(null), null);
  assert.equal(captureEditorPointerContext({ phase: '1', tool: 'select' }), null);
  assert.equal(captureEditorPointerContext({ phase: 0, tool: null }), null);
  assert.equal(matchesEditorPointerContext(e, null), false);
  assert.equal(matchesEditorPointerContext(null, ctx), false);
  assert.equal(matchesEditorPointerContext(e, { ...ctx, phase: 2 }), false);
  assert.equal(matchesEditorPointerContext(e, { ...ctx, handle: null }), false);
});

test('E4.12.2 pointercancel restores linked source and original Undo after a mixed pointer move', () => {
  const e = original(), untouched = copy(e);
  const before = captureEditorPointer(e), originalContext = captureEditorPointerContext(e);
  e.undo.push({ draft: JSON.stringify(e.draft) });
  e.draft.players.LM = [24, 30];
  e.draft.moves[0].pts[0] = [24, 30];
  e.phase = 1; e.sel = null;
  assert.equal(matchesEditorPointerContext(e, originalContext), false);
  assert.equal(cancelEditorPointer(e, before), true);
  assert.deepEqual(e.draft, untouched.draft);
  assert.deepEqual(e.undo, untouched.undo);
  assert.equal(e.dirty, untouched.dirty);
  // The pointer helper leaves active phase choice to the editor controller,
  // which clears stale selection and viewport on a context-changing abort.
  assert.equal(e.phase, 1);
});

test('E4.12.2 historical schema-4 fixture is not rewritten by context checks', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/play-engine-e0-golden.json', import.meta.url), 'utf8'));
  const before = JSON.stringify(fixture);
  const ctx = captureEditorPointerContext(original());
  assert.equal(matchesEditorPointerContext(original(), ctx), false);
  assert.equal(JSON.stringify(fixture), before);
  assert.equal(fixture.schema4Workspace.schema, 4);
});
