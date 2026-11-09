// Presentation-only density for the Watch animation field.
// Preserve the recorded 50x80 teaching coordinates and playback times while
// fitting roughly 36 CSS-pixel player badges into the *displayed* board width.
// This value is independent of the viewer's SVG viewBox or browser zoom.
export function watchArtworkScale(canvasWidth, svgWidth = 380, playerRadius = 12) {
  if (![canvasWidth, svgWidth, playerRadius].every(Number.isFinite) ||
      canvasWidth <= 0 || svgWidth <= 0 || playerRadius <= 0) return 1;
  const raw = 36 * svgWidth / (2 * playerRadius * canvasWidth);
  return Math.round(Math.max(0.28, Math.min(2, raw)) * 1000) / 1000;
}
