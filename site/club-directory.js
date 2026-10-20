// Club-only, source-linked reference catalogue. Data is public research, not user-owned clubs.
// No registration verification, image licensing or account membership is implied.
import { CLUB_REFERENCE_RECORDS } from './club-directory-data.js';
import { suggestStyle } from './team-style.js';

export const DIRECTORY_SPORTS = ['Rugby league', 'Oztag'];
export const DIRECTORY_STATES = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'];
export const directoryRecords = () => CLUB_REFERENCE_RECORDS;

const words = v => String(v || '').trim().toLocaleLowerCase('en-AU');
export function filterClubDirectory({ query = '', sport = '', state = '' } = {}) {
  const needle = words(query);
  return CLUB_REFERENCE_RECORDS.filter(c => (!sport || c.sport === sport) && (!state || c.state === state)
    && (!needle || [c.name, ...(c.variants || []), c.suburb, c.region, c.state, c.association, c.ground].some(s => words(s).includes(needle))))
    .sort((a,b) => a.name.localeCompare(b.name) || a.state.localeCompare(b.state));
}
export const possibleClubPalette = c => c?.colours ? suggestStyle(c.colours) : '';
export function directoryClubDraft(c) {
  if (!c || !CLUB_REFERENCE_RECORDS.some(r => r.id === c.id)) return null;
  // Deliberately omit third-party imagery, colour styles, provisional organisation IDs and permissions.
  // A coach can edit/review this draft and must explicitly press Create club to copy it to their workspace.
  return {
    name: c.name, shortName: c.name, sport: c.sport, founded: c.founded || '',
    governingBody: c.sport === 'Oztag' ? 'Australian Oztag (association to confirm)' : 'Rugby league (affiliation to confirm)',
    website: c.website || '', email: c.email || '', phone: c.phone || '',
    homeGround: c.ground || '', homeAddress: [c.suburb, c.state, c.postcode].filter(Boolean).join(' '),
    registration: c.registration || '', colours: c.colours || '',
    // Saved privately with the coach's record, not transmitted to other teams as a permission.
    notes: 'Created from an unverified public directory candidate. Confirm current name, registration, contacts and branding with the organisation. Source: ' + (c.sourceUrl || 'research pilot')
  };
}
