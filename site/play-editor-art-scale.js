// Editor-only display density. Zoom changes the distance between teaching
// coordinates, not the on-screen size of players, notes or movement ink.
//
// The SVG viewBox is 380 units wide and the base player radius is 12 units.
// Measure the available #ped-field width in CSS pixels; a 36 CSS-pixel player
// remains legible at Fit and at detailed zoom without crowding the drawing.
// The source play's 50×80 teaching coordinates and all viewer art are untouched.
export function editorArtworkScale(zoom, canvasWidth, svgWidth = 380, playerRadius = 12) {
  if (![zoom, canvasWidth, svgWidth, playerRadius].every(Number.isFinite) ||
      zoom <= 0 || canvasWidth <= 0 || svgWidth <= 0 || playerRadius <= 0) return 1;
  const pixelsPerUnit = canvasWidth * zoom / svgWidth;
  const desiredDiameter = 36;
  const raw = desiredDiameter / (2 * playerRadius * pixelsPerUnit);
  // Protect odd browser dimensions without making min/max zoom the normal
  // point where the art finally becomes usable.
  return Math.round(Math.max(0.08, Math.min(3.5, raw)) * 1000) / 1000;
}
