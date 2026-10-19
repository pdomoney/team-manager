// Coach-only club/team match crew and clearance checks. This is a planning aide,
// NOT a live MySideline verification or an official determination of eligibility.
// Every minimum must be configured against the correct competition requirements.
export const CREW_ROLES = Object.freeze({
  coach: 'Head coach',
  assistant: 'Assistant coach',
  manager: 'Team manager',
  yellow: 'Yellow · LeagueSafe',
  green: 'Green · League First Aid',
  blue: 'Blue · Level 1 trainer',
  orange: 'Orange · Level 2 trainer'
});
export const REQUIREMENT_ROLES = Object.freeze({
  coach: 'Head coach',
  manager: 'Team manager',
  leagueSafe: 'LeagueSafe (yellow)',
  firstResponder: 'Qualified first responder (green / blue / orange)',
  level1: 'Level 1 or higher (blue / orange)',
  level2: 'Level 2 (orange)',
  green: 'Green shirt',
  blue: 'Blue shirt',
  orange: 'Orange shirt',
  assistant: 'Assistant coach'
});
const MATCHING = {
  coach: ['coach'], manager: ['manager'], assistant: ['assistant'],
  leagueSafe: ['yellow'], firstResponder: ['green', 'blue', 'orange'],
  level1: ['blue', 'orange'], level2: ['orange'],
  green: ['green'], blue: ['blue'], orange: ['orange']
};
const TYPE = { coach: 'coach', assistant: 'coach', manager: 'volunteer',
  yellow: 'trainer', green: 'trainer', blue: 'trainer', orange: 'trainer' };
const ymd = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) && !Number.isNaN(Date.parse(v + 'T12:00:00Z')) ? v : '';
const words = v => String(v ?? '').trim();
const arr = v => Array.isArray(v) ? v : [];
const obj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const roleList = v => [...new Set(arr(v).filter(x => CREW_ROLES[x]))];
export const normCrewPerson = p => ({
  id: words(p?.id), name: words(p?.name).slice(0, 120),
  clubId: words(p?.clubId), teamIds: [...new Set(arr(p?.teamIds).filter(x => typeof x === 'string'))],
  roles: roleList(p?.roles), registration: Object.fromEntries(['coach', 'volunteer', 'trainer']
    .map(k => [k, /^\d{4}$/.test(String(p?.registration?.[k] || '')) ? String(p.registration[k]) : ''])),
  accreditation: Object.fromEntries(Object.keys(CREW_ROLES).map(k => [k, ymd(p?.accreditation?.[k])])),
  wwccStatus: p?.wwccStatus === 'checked' ? 'checked' : 'unverified',
  wwccExpiry: ymd(p?.wwccExpiry), // no WWCC number, ID scan or date of birth
  active: p?.active !== false
});
export const normCrewRules = p => ({
  source: words(p?.source).slice(0, 250),
  year: /^\d{4}$/.test(String(p?.year || '')) ? String(p.year) : '',
  rows: arr(p?.rows).filter(r => REQUIREMENT_ROLES[r?.role] && Number.isInteger(+r.min) && +r.min >= 1 && +r.min <= 12)
    .map(r => ({ role: r.role, min: Number(r.min) }))
});
export function canCrewServe(person, team, role, date) {
  const p = normCrewPerson(person);
  if (!p.active || !CREW_ROLES[role] || !p.roles.includes(role)) return 'Role or availability not confirmed';
  if (!p.teamIds.includes(team.id) && !(p.clubId && p.clubId === team.team?.clubId)) return 'Not in this club/team';
  const season = words(date).slice(0, 4);
  if (!ymd(date) || !season || p.registration[TYPE[role]] !== season) return 'Season registration unverified';
  if (p.wwccStatus !== 'checked' || !p.wwccExpiry || p.wwccExpiry < date) return 'WWCC verification missing or expired';
  if (role !== 'manager' && (!p.accreditation[role] || p.accreditation[role] < date)) return 'Role accreditation unverified or expired';
  return '';
}
export function matchCrewCheck(people, team, match, policy) {
  const rules = normCrewRules(policy);
  const rows = arr(match?.crew).filter(a => a && CREW_ROLES[a.role] && typeof a.personId === 'string');
  const duplicates = [...new Set(rows.map(r => r.personId).filter((id, i) => rows.findIndex(x => x.personId === id) !== i))];
  const slots = rows.map(a => {
    const person = arr(people).find(p => p.id === a.personId);
    const issue = !person ? 'Person no longer available' : canCrewServe(person, team, a.role, match?.date);
    return { ...a, name: person?.name || 'Unknown person', valid: !issue && a.confirmed === true && !duplicates.includes(a.personId),
      issue: duplicates.includes(a.personId) ? 'One person assigned twice' : issue || (a.confirmed === true ? '' : 'Not confirmed for this match') };
  });
  // Solve distinct staffing slots across ALL configured requirements. For example,
  // one blue trainer must not simultaneously satisfy "one Level 1" AND "one first responder".
  // Standard augmenting-path matching reassigns eligible people to avoid false shortages.
  const demand = rules.rows.flatMap((r, index) =>
    Array.from({ length: r.min }, () => ({ role: r.role, index, eligible: MATCHING[r.role] })));
  demand.sort((a, b) => a.eligible.length - b.eligible.length);
  const byPerson = new Map();
  const allocate = (d, seen) => {
    for (const a of slots) {
      if (!a.valid || !demand[d].eligible.includes(a.role) || seen.has(a.personId)) continue;
      seen.add(a.personId);
      const previous = byPerson.get(a.personId);
      if (previous === undefined || allocate(previous, seen)) {
        byPerson.set(a.personId, d);
        return true;
      }
    }
    return false;
  };
  demand.forEach((_, i) => allocate(i, new Set()));
  const covered = rules.rows.map(() => 0);
  byPerson.forEach(i => { covered[demand[i].index]++; });
  const shortages = rules.rows.map((r, i) => ({
    ...r, name: REQUIREMENT_ROLES[r.role],
    have: covered[i], missing: Math.max(0, r.min - covered[i])
  }));
  const configured = !!rules.source && rules.year === words(match?.date).slice(0, 4) && !!rules.rows.length;
  return {
    configured, source: rules.source, slots, shortages,
    ready: configured && shortages.every(x => x.missing === 0) && slots.every(x => x.valid),
    issues: slots.filter(x => !x.valid).map(x => `${x.name}: ${x.issue}`)
  };
}
