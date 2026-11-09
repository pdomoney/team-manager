// Editor-only display density. Zoom expands/contract the distance between
// teaching coordinates, not the visible player/line artwork. Phone fields
// should be leaner than desktop fields, without shrinking touch hit areas.
//
// The SVG viewBox is 380 units wide and the base player radius is 12 units.
// Field coordinates, Watch/Learn artwork and all saved play data are unchanged.
export function editorArtworkTargetDiameter(canvasWidth) {
  if (!Number.isFinite(canvasWidth) || canvasWidth <= 0) return 36;
  if (canvasWidth <= 420) return 27;
  if (canvasWidth >= 760) return 36;
  return 27 + (canvasWidth - 420) * 9 / 340;
}

function scaleForDiameter(target, zoom, canvasWidth, svgWidth, playerRadius) {
  if (![zoom, canvasWidth, svgWidth, playerRadius].every(Number.isFinite) ||
      zoom <= 0 || canvasWidth <= 0 || svgWidth <= 0 || playerRadius <= 0) return 1;
  const pixelsPerUnit = canvasWidth * zoom / svgWidth;
  const raw = target / (2 * playerRadius * pixelsPerUnit);
  // Retain the established zoom bounds, even for pathological dimensions.
  return Math.round(Math.max(0.08, Math.min(3.5, raw)) * 1000) / 1000;
}

export function editorArtworkScale(zoom, canvasWidth, svgWidth = 380, playerRadius = 12) {
  return scaleForDiameter(editorArtworkTargetDiameter(canvasWidth),
    zoom, canvasWidth, svgWidth, playerRadius);
}

// Separate INVISIBLE interaction geometry: mobile art can be 27px while the
// player, line and bend hit areas retain their prior ~45/36 CSS-pixel sizes.
export function editorInteractionScale(zoom, canvasWidth, svgWidth = 380, playerRadius = 12) {
  return scaleForDiameter(36, zoom, canvasWidth, svgWidth, playerRadius);
}
