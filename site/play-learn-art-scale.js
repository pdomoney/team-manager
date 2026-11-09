// Player-facing Learn diagram only. Preserve the approved phone-sized art;
// desktop field expansion must add tactical space, not inflate players.
// SVG viewBox is 380 units wide, with a 12-unit radius player symbol.
export function learnArtworkScale(canvasWidth, svgWidth = 380, playerRadius = 12) {
  if (![canvasWidth, svgWidth, playerRadius].every(Number.isFinite) ||
      canvasWidth <= 0 || svgWidth <= 0 || playerRadius <= 0) return 1;
  const widthFor36px = 36 * svgWidth / (2 * playerRadius);
  const scale = Math.min(1, widthFor36px / canvasWidth);
  return Math.round(Math.max(0.28, scale) * 1000) / 1000;
}
