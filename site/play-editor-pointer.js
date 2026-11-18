// An interrupted pointer interaction is not a completed authoring action.
// Keep the entire pre-gesture undo history, including the oldest capped entry,
// so cancellation never leaves an invisible edit or a phantom undo step.
export function captureEditorPointer(editor) {
  if (!editor?.draft || !Array.isArray(editor.undo)) return null;
  return {
    draft: JSON.stringify(editor.draft),
    undo: editor.undo.slice(),
    dirty: editor.dirty,
    selection: editor.sel ? { ...editor.sel } : null,
    handle: editor.selH ?? null,
    drawing: editor.drawing ? JSON.stringify(editor.drawing) : null,
    stableViewport: editor.stableViewport ? { ...editor.stableViewport } : null,
    canvasPositioned: editor.canvasPositioned,
  };
}

export function cancelEditorPointer(editor, before) {
  if (!editor || !before || typeof before.draft !== 'string' ||
      !Array.isArray(before.undo)) return false;
  let draft, drawing;
  try {
    draft = JSON.parse(before.draft);
    drawing = before.drawing === null ? null : JSON.parse(before.drawing);
  } catch {
    return false;
  }
  editor.draft = draft;
  editor.undo = before.undo.slice();
  editor.dirty = before.dirty;
  editor.sel = before.selection ? { ...before.selection } : null;
  editor.selH = before.handle;
  editor.drawing = drawing;
  editor.lockView = null;
  editor.stableViewport = before.stableViewport ? { ...before.stableViewport } : null;
  editor.canvasPositioned = before.canvasPositioned;
  return true;
}


// E4.12.2: a pointer belongs to the exact editor, phase, tool and selected
// tactical handle where it started. A second tap on an out-of-stage control
// must not resume that old gesture against another phase or path.
export function captureEditorPointerContext(editor) {
  if (!editor || !Number.isInteger(editor.phase) ||
      typeof editor.tool !== 'string') return null;
  return {
    editor,
    phase: editor.phase,
    tool: editor.tool,
    selection: JSON.stringify(editor.sel ?? null),
    handle: editor.selH ?? null
  };
}

export function matchesEditorPointerContext(editor, context) {
  return !!editor && !!context && editor === context.editor &&
    editor.phase === context.phase && editor.tool === context.tool &&
    JSON.stringify(editor.sel ?? null) === context.selection &&
    (editor.selH ?? null) === context.handle;
}

/** Release a gesture's phantom Undo if snapping returns the entire draft to
 *  its exact pre-pointer state. Never discard earlier completed edits. */
export function settleUnchangedEditorPointer(editor, before) {
  if (!editor || !before || typeof before.draft !== 'string' ||
      !Array.isArray(before.undo)) return false;
  try {
    if (JSON.stringify(editor.draft) !== before.draft) return false;
  } catch {
    return false;
  }
  editor.undo = before.undo.slice();
  editor.dirty = before.dirty;
  return true;
}

// SVG endpoint circles have transparent touch targets which may overlap at
// phone Fit zoom. DOM hit order alone can select a later bend over the point
// the coach actually touched. Resolve by visual-centre distance, but only
// among targets whose ellipse contains the touch. Never infer movement or a
// persistent actor connection here. Return null when nothing or a geometric
// tie is distinguishable so the editor can use its existing hit/precision UI.
export function nearestEditorHandleAtPoint(svg, clientX, clientY) {
  if (!svg || typeof svg.querySelectorAll !== 'function' ||
      !Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
  let nearest = null, best = Infinity, ambiguous = false;
  for (const circle of svg.querySelectorAll('circle.ped-handle-hit[data-h]')) {
    const id = circle.getAttribute?.('data-h');
    if (typeof id !== 'string' || !/^(0|[1-9]\d*)$/.test(id) ||
        typeof circle.getBoundingClientRect !== 'function') continue;
    const rect = circle.getBoundingClientRect();
    if (!rect || ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) ||
        rect.width <= 0 || rect.height <= 0) continue;
    const dx = (clientX - rect.x - rect.width / 2) / (rect.width / 2);
    const dy = (clientY - rect.y - rect.height / 2) / (rect.height / 2);
    const score = dx * dx + dy * dy;
    if (score > 1) continue;
    if (score < best - 1e-9) {
      best = score;
      nearest = Number(id);
      ambiguous = false;
    } else if (Math.abs(score - best) <= 1e-9) {
      ambiguous = true;
    }
  }
  return ambiguous ? null : nearest;
}
