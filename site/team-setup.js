// Team setup reuse rules. Both shared tactics imports and copied settings require
// an explicitly selected, active source team from the same club and effective sport.
export const REUSABLE_TEAM_FIELDS = Object.freeze([
  'venue', 'trainingVenue', 'trainingStart', 'trainingEnd',
  'maxMales', 'field', 'rules', 'bylaws'
]);

export function setupReuseIssue({ source, sourceSport, clubId, sport, copySettings, withLibrary }) {
  if (!copySettings && !withLibrary) return null;
  if (!source || source.archived)
    return { field: 'sourceTeamId', message: 'Choose an active source team to reuse its setup.' };
  if (String(source.team?.clubId || '') !== String(clubId || ''))
    return { field: 'clubId', message: 'Setup and library reuse require the same club. Untick the reuse options to create a fresh team.' };
  if (sourceSport !== sport)
    return { field: 'teamSport', message: 'Setup and library reuse require the same sport. Untick the reuse options to create a fresh team.' };
  return null;
}

export function reuseTeamFields(source, destination) {
  for (const field of REUSABLE_TEAM_FIELDS) {
    if (source[field] !== undefined) destination[field] = JSON.parse(JSON.stringify(source[field]));
  }
  return destination;
}
