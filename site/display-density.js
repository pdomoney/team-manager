// Desktop layout preference only. No DOM, network, team workspace, credentials or zoom.
export function normalizeDensity(value) {
  return value === 'compact' ? 'compact' : 'comfortable';
}
export function mayUseCompactDensity(wide, cssViewportWidth) {
  return wide === true && Number.isFinite(cssViewportWidth) && cssViewportWidth >= 1000;
}
export function activeDensity(value, wide, cssViewportWidth) {
  return mayUseCompactDensity(wide, cssViewportWidth) && normalizeDensity(value) === 'compact'
    ? 'compact' : 'comfortable';
}
