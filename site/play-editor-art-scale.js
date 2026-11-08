// Editor-only visual compensation. Geometry, exported plays and viewer art
// do not depend on this scale. Keep a minimum visible/touch-readable glyph
// at extreme zoom instead of shrinking actors to an unusable dot.
export function editorArtworkScale(zoom) {
  if (!Number.isFinite(zoom) || zoom <= 0) return 1;
  return Math.round(Math.max(0.33, Math.min(1.4, 1 / zoom)) * 1000) / 1000;
}
