// User-confirmed reconciliation of a research-directory candidate with an existing managed club.
// The catalogue is not proof of a current affiliation. No account access or team ownership changes.
import { directoryRecords } from './club-directory.js';

const fieldLabels = {
  founded: 'Founded', website: 'Website', email: 'Email', phone: 'Phone',
  homeGround: 'Home ground', homeAddress: 'Ground location', registration: 'Registration',
  colours: 'Published colour words (unverified)'
};
const fields = ['founded', 'website', 'email', 'phone', 'homeGround', 'homeAddress', 'registration'];
const clean = value => String(value || '').trim();
export const clubNameKey = value => clean(value).toLocaleLowerCase('en-AU')
  .replace(/\b(junior rugby league football club|rugby league football club|junior rugby league club|jrlfc|rlfc|jrfc|football club|oztag association)\b/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();

const confirmedCandidate = candidate => candidate && directoryRecords().find(c => c.id === candidate.id) || null;
const compatible = (candidate, club) => !!candidate && !!club && candidate.sport === club.sport && !!club.id;

// Rank possible matches to help the coach, but never link or save just because names resemble.
export function managedClubCandidates(candidate, clubs = []) {
  const c = confirmedCandidate(candidate);
  if (!c) return [];
  const keys = [c.name, ...(c.variants || [])].map(clubNameKey).filter(Boolean);
  return clubs.filter(club => compatible(c, club)).map(club => {
    const names = [club.name, club.shortName].map(clubNameKey).filter(Boolean);
    let score = names.some(n => keys.includes(n)) ? 100 : 0;
    if (!score && names.some(n => keys.some(k => (n.startsWith(k + ' ') || k.startsWith(n + ' ')) && n.split(' ').length >= 2))) score = 50;
    if (club.directoryMatch?.id === c.id) score = 200;
    return { club, score };
  }).sort((a, b) => b.score - a.score || a.club.name.localeCompare(b.club.name));
}

// Reuse only direct sourced facts. Do not derive an official style, logo, staff member, roles,
// team sport or registration identity from a research record.
export function clubLinkPreview(managed, candidate, { includeColours = false } = {}) {
  const c = confirmedCandidate(candidate);
  if (!compatible(c, managed)) return null;
  const offered = {
    founded: clean(c.founded),
    website: clean(c.website),
    email: clean(c.email),
    phone: clean(c.phone),
    homeGround: Array.isArray(c.venues) && c.venues.length > 1 ? '' : clean(c.ground),
    homeAddress: c.suburb ? [c.suburb, c.state, c.postcode].filter(Boolean).join(' ') : '',
    registration: Array.isArray(c.registrationLinks) && c.registrationLinks.length > 1 ? '' : clean(c.registration),
    ...(includeColours ? { colours: clean(c.colours) } : {})
  };
  const additions = [], kept = [];
  for (const key of [...fields, ...(includeColours ? ['colours'] : [])]) {
    const proposed = offered[key], current = clean(managed[key]);
    if (!proposed) continue;
    if (current) {
      if (current !== proposed) kept.push({ key, label: fieldLabels[key], current, proposed });
    } else additions.push({ key, label: fieldLabels[key], value: proposed });
  }
  return { additions, kept, alreadyLinked: managed.directoryMatch?.id === c.id,
    blocked: !!managed.directoryMatch?.id && managed.directoryMatch.id !== c.id,
    source: c.sourceUrl || '', reviewed: c.reviewed || '', candidate: c };
}

// This returns a NEW object. The caller must explicitly save it following confirmation.
// Ids, membership, officials, notes, private data, existing values, logo and style survive.
export function applyClubDirectoryMatch(managed, candidate, options = {}) {
  const preview = clubLinkPreview(managed, candidate, options);
  if (!preview || preview.blocked) return null;
  const result = { ...managed };
  for (const entry of preview.additions) result[entry.key] = entry.value;
  result.directoryMatch = {
    id: preview.candidate.id, sourceUrl: preview.source,
    reviewed: preview.reviewed, linkedAt: options.linkedAt || new Date().toISOString(),
    classification: 'user_confirmed_same_club_research_candidate'
  };
  return result;
}
export const linkedDirectoryRecord = club => directoryRecords().find(c => c.id === club?.directoryMatch?.id) || null;
