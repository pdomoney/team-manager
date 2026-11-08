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
