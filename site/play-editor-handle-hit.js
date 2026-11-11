// E4.12.4: overlapping SVG endpoint hit circles can target the topmost
// DOM node, not the closest actual endpoint (especially in WebKit touch).
// Use CSS-pixel geometry to choose the nearest distinct centre only when
// the pointer has already hit an endpoint. Do not guess indistinguishable
// points: the coach can use the existing Start/End precision toolbar.
export function nearestEditorHandle(handles, x, y, tiePixels = 1.5) {
  if (!Array.isArray(handles) || ![x, y, tiePixels].every(Number.isFinite) ||
      tiePixels < 0) return null;
  const hits = handles.flatMap(h => {
    if (!h || !Number.isInteger(h.index) || h.index < 0 ||
        ![h.x, h.y, h.radius].every(Number.isFinite) || h.radius <= 0) return [];
    const distance = Math.hypot(x - h.x, y - h.y);
    return distance <= h.radius + 0.5 ? [{ index: h.index, distance }] : [];
  }).sort((a, b) => a.distance - b.distance);
  if (!hits.length) return null;
  // Even a tiny physical overlap is ambiguous when two centres coincide.
  if (hits.length > 1 && hits[1].distance - hits[0].distance <= tiePixels) return null;
  return hits[0].index;
}
