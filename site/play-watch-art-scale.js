// Presentation-only density for the Watch animation field.
// Preserve the recorded 50x80 teaching coordinates and playback times while
// fitting lean 27px badges on phone boards and 36px on desktop boards.
// The intermediate range changes smoothly as a tablet/narrow desktop resizes.
// Independent of the viewer's SVG viewBox and browser zoom.
export function watchArtworkScale(canvasWidth, svgWidth = 380, playerRadius = 12) {
  if (![canvasWidth, svgWidth, playerRadius].every(Number.isFinite) ||
      canvasWidth <= 0 || svgWidth <= 0 || playerRadius <= 0) return 1;
  const targetPixels = canvasWidth <= 420 ? 27 : canvasWidth >= 760 ? 36
    : 27 + (canvasWidth - 420) * 9 / 340;
  const raw = targetPixels * svgWidth / (2 * playerRadius * canvasWidth);
  return Math.round(Math.max(0.28, Math.min(2, raw)) * 1000) / 1000;
}
