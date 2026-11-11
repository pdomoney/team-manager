// E4.12.3: distinguish a selection tap from a deliberate movement in CSS
// pixels, not tactical field units. Field-to-screen scale changes with Fit,
// manual zoom and browser viewport, but finger/pen acquisition does not.
// This is a UI gesture threshold only; it never changes saved coordinates.
export function editorPointerSlop(pointerType) {
  return pointerType === 'touch' ? 8 : pointerType === 'pen' ? 5 : 3;
}

export function beginsEditorPointerDrag(origin, x, y) {
  if (!origin || ![origin.x, origin.y, x, y].every(Number.isFinite)) return false;
  const displacement = Math.hypot(x - origin.x, y - origin.y);
  return displacement >= editorPointerSlop(origin.pointerType);
}
