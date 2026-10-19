// Coach-only club/team match crew and clearance checks. This is a planning aide,
// NOT a live MySideline verification or an official determination of eligibility.
// Every minimum must be configured against the correct competition requirements.
import { inTeamPool } from './volunteer-intake.js';

export const CREW_ROLES = Object.freeze({
  coach: 'Head coach',
  assistant: 'Assistant coach',
  manager: 'Team manager',
  yellow: 'Yellow · LeagueSafe',
  green: 'Green · League First Aid',
  blue: 'Blue · Level 1 trainer',
  orange: 'Orange · Level 2 trainer',
  firstAid: 'First aid / medical support',
  matchDelegate: 'Game-day delegate',
  groundMarshal: 'Ground marshal'
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
  assistant: 'Assistant coach',
  firstAid: 'First aid / medical support',
  matchDelegate: 'Game-day delegate',
  groundMarshal: 'Ground marshal'
});
const MATCHING = {
  coach: ['coach'], manager: ['manager'], assistant: ['assistant'],
  leagueSafe: ['yellow'], firstResponder: ['green', 'blue', 'orange'],
  level1: ['blue', 'orange'], level2: ['orange'],
  green: ['green'], blue: ['blue'], orange: ['orange'],
  firstAid: ['firstAid'], matchDelegate: ['matchDelegate'], groundMarshal: ['groundMarshal']
};
const TYPE = { coach: 'coach', assistant: 'coach', manager: 'volunteer',
  yellow: 'trainer', green: 'trainer', blue: 'trainer', orange: 'trainer',
  firstAid: 'trainer', matchDelegate: 'volunteer', groundMarshal: 'volunteer' };
// Sport-specific UI / eligibility. Templates describe possible club roles, NOT
// minimum people or legal match-day staffing requirements.
const SHARED = ['coach','assistant','manager','firstAid','matchDelegate'];
export const CREW_SPORTS = Object.freeze({
  'Rugby league': { provider:'MySideline', roles:['coach','assistant','manager','yellow','green','blue','orange','firstAid','matchDelegate','groundMarshal'], requirements:['coach','assistant','manager','leagueSafe','firstResponder','level1','level2','green','blue','orange','firstAid','matchDelegate','groundMarshal'] },
  'League tag': { provider:'MySideline', roles:['coach','assistant','manager','yellow','green','blue','orange','firstAid','matchDelegate'], requirements:['coach','assistant','manager','leagueSafe','firstResponder','level1','level2','green','blue','orange','firstAid','matchDelegate'] },
  'Oztag': { provider:'Assemble / local Oztag association',roles:SHARED,requirements:['coach','assistant','manager','firstAid','matchDelegate'] },
  'Touch football': { provider:'MySideline (Touch Football)',roles:SHARED,requirements:['coach','assistant','manager','firstAid','matchDelegate'] },
  'Rugby union': { provider:'Rugby Xplorer',roles:[...SHARED,'groundMarshal'],requirements:['coach','assistant','manager','firstAid','matchDelegate','groundMarshal'] }
});
const OTHER = {provider:'Applicable sport/competition registry',roles:SHARED,requirements:['coach','assistant','manager','firstAid','matchDelegate']};
export const crewSport = team => words(team?.team?.sport || team?.sport || 'Oztag');
export const crewProfile = sport => CREW_SPORTS[words(sport)] || OTHER;
export const crewRoleAllowed = (sport, role) => crewProfile(sport).roles.includes(role);
export const crewRequirementAllowed = (sport, role) => crewProfile(sport).requirements.includes(role);
const ymd = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) && !Number.isNaN(Date.parse(v + 'T12:00:00Z')) ? v : '';
const words = v => String(v ?? '').trim();
const arr = v => Array.isArray(v) ? v : [];
const obj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const roleList = v => [...new Set(arr(v).filter(x => CREW_ROLES[x]))];
export const normCrewPerson = p => ({
  id: words(p?.id), name: words(p?.name).slice(0, 120),
  clubId: words(p?.clubId), clubIds: [...new Set(arr(p?.clubIds).filter(x => typeof x === 'string' && x.trim()))],
  email: words(p?.email).toLowerCase().slice(0, 254),
  phone: words(p?.phone).slice(0, 40),
  photo: /^data:image\/(?:webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(words(p?.photo)) && words(p?.photo).length <= 80000 ? words(p.photo) : '',
  clubSince: Object.fromEntries(Object.entries(obj(p?.clubSince)).filter(([club,year]) =>
    typeof club === 'string' && /^(?:19|20)\d{2}$/.test(String(year))).map(([club,year])=>[club,String(year)])),
  qualificationSinceBySport: Object.fromEntries(Object.entries(obj(p?.qualificationSinceBySport))
    .filter(([sport])=>typeof sport==='string' && sport.trim())
    .map(([sport,dates])=>[sport,Object.fromEntries(Object.entries(obj(dates))
      .filter(([role,year])=>CREW_ROLES[role] && /^(?:19|20)\d{2}$/.test(String(year)))
      .map(([role,year])=>[role,String(year)]))])),
  accreditationBySport: Object.fromEntries(Object.entries(obj(p?.accreditationBySport))
    .filter(([sport])=>typeof sport==='string' && sport.trim())
    .map(([sport,dates])=>[sport,Object.fromEntries(Object.entries(obj(dates))
      .filter(([role])=>CREW_ROLES[role]).map(([role,date])=>[role,ymd(date)]))])),
  teamIds: [...new Set(arr(p?.teamIds).filter(x => typeof x === 'string'))],
  roles: roleList(p?.roles),
  // Sport assignments are independent; unmodified legacy records remain readable.
  rolesBySport: Object.fromEntries(Object.entries(obj(p?.rolesBySport))
    .filter(([sport]) => typeof sport === 'string' && !!sport.trim())
    .map(([sport,roles]) => [sport, roleList(roles)])),
  registrationBySport: Object.fromEntries(Object.entries(obj(p?.registrationBySport))
    .filter(([sport]) => typeof sport === 'string').map(([sport,rec]) => [sport, Object.fromEntries(['coach','volunteer','trainer'].map(k =>
      [k, /^\d{4}$/.test(String(rec?.[k] || '')) ? String(rec[k]) : '']))])), squadYears: Object.fromEntries(Object.entries(obj(p?.squadYears))
    .filter(([teamId,year]) => typeof teamId === 'string' && /^\d{4}$/.test(String(year))).map(([id,year]) => [id,String(year)])),
  registration: Object.fromEntries(['coach', 'volunteer', 'trainer']
    .map(k => [k, /^\d{4}$/.test(String(p?.registration?.[k] || '')) ? String(p.registration[k]) : ''])),
  accreditation: Object.fromEntries(Object.keys(CREW_ROLES).map(k => [k, ymd(p?.accreditation?.[k])])),
  wwccStatus: p?.wwccStatus === 'checked' ? 'checked' : 'unverified',
  wwccExpiry: ymd(p?.wwccExpiry), // no WWCC number, ID scan or date of birth
  active: p?.active !== false
});
export function crewRolesForSport(person, sport) {
  const p = normCrewPerson(person);
  // When sport roles are explicitly reviewed, other sports cannot inherit
  // shared role names. Legacy records still retain their pre-upgrade roles.
  return Object.keys(p.rolesBySport).length
    ? (p.rolesBySport[sport] || []).filter(role => crewRoleAllowed(sport, role))
    : p.roles.filter(role => crewRoleAllowed(sport, role));
}
// A match-day staffing policy is only authoritative for the exact team and
// competition context that the coach explicitly reviewed. Never infer minimums.
export const crewPolicyContext = (team, competition = null) => {
  const t = obj(team?.team);
  return {
    sport: crewSport(team),
    ageGroup: words(t.ageGroup),
    category: words(t.category),
    division: words(competition?.entry?.division || t.division),
    competitionId: words(competition?.comp?.id)
  };
};
export const policyFitsContext = (rule, team, competition = null) => {
  const p = normCrewRules(rule), ctx = crewPolicyContext(team, competition);
  return ['sport','ageGroup','category','division','competitionId'].every(k=>p[k]===ctx[k]);
};
export const normCrewRules = p => ({
  source: words(p?.source).slice(0, 250),
  sport: words(p?.sport || 'Rugby league'), // legacy reviewed policies were rugby league only
  ageGroup: words(p?.ageGroup).slice(0,80),
  category: words(p?.category).slice(0,40),
  division: words(p?.division).slice(0,120),
  competitionId: words(p?.competitionId).slice(0,80),
  sourceUrl: /^https:\/\/\S+$/i.test(words(p?.sourceUrl)) ? words(p.sourceUrl).slice(0,500) : '',
  reviewedAt: ymd(p?.reviewedAt),
  year: /^\d{4}$/.test(String(p?.year || '')) ? String(p.year) : '',
  rows: arr(p?.rows).filter(r => REQUIREMENT_ROLES[r?.role] && Number.isInteger(+r.min) && +r.min >= 1 && +r.min <= 12)
    .map(r => ({ role: r.role, min: Number(r.min) }))
});
export function canCrewServe(person, team, role, date) {
  const p = normCrewPerson(person);
  const sport = crewSport(team);
  if (!p.active || !CREW_ROLES[role] || !crewRolesForSport(p,sport).includes(role)) return 'Role not eligible for this sport or availability not confirmed';
  if (!inTeamPool(p, team)) return 'Not in this club/team';
  const season = words(date).slice(0, 4);
  const current = p.registrationBySport[sport]?.[TYPE[role]] || (
    (sport === 'Rugby league' || sport === 'League tag') ? p.registration[TYPE[role]] : '');
  if (!ymd(date) || !season || current !== season) return 'Season registration unverified for ' + sport;
  if (p.squadYears[team.id] !== season) return crewProfile(sport).provider + ' team allocation unverified';
  if (p.wwccStatus !== 'checked' || !p.wwccExpiry || p.wwccExpiry < date) return 'WWCC verification missing or expired';
  const needsAcc = ['yellow','green','blue','orange','firstAid'].includes(role)
    || (['coach','assistant'].includes(role) && sport !== 'Oztag');
  const perSport = p.accreditationBySport[sport] || {};
  // An explicitly cleared sport expiry must not revive an old generic clearance.
  const accreditationExpiry = Object.prototype.hasOwnProperty.call(perSport,role)
    ? perSport[role] : p.accreditation[role];
  if (needsAcc && (!accreditationExpiry || accreditationExpiry < date)) return 'Role accreditation unverified or expired';
  return '';
}
export function matchCrewCheck(people, team, match, policy, competition = null) {
  const sport = crewSport(team), rules = normCrewRules(policy);
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
  const contextMatches = policyFitsContext(rules,team,competition) && (!match?.entryId || !!competition?.comp);
  const applicable = contextMatches ? rules.rows.filter(r => crewRequirementAllowed(sport,r.role)) : [];
  const demand = applicable.flatMap((r, index) =>
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
  const covered = applicable.map(() => 0);
  byPerson.forEach(i => { covered[demand[i].index]++; });
  const shortages = applicable.map((r, i) => ({
    ...r, name: REQUIREMENT_ROLES[r.role],
    have: covered[i], missing: Math.max(0, r.min - covered[i])
  }));
  const configured = !!rules.source && contextMatches && rules.year === words(match?.date).slice(0, 4)
    && !!rules.rows.length && applicable.length === rules.rows.length;
  return {
    configured, source: rules.source, slots, shortages,
    ready: configured && shortages.every(x => x.missing === 0) && slots.every(x => x.valid),
    issues: [
      ...(!contextMatches ? ['Staffing rules do not match this match’s sport, age group, category, division or competition. Review the correct official requirements.'] : []),
      ...slots.filter(x => !x.valid).map(x => `${x.name}: ${x.issue}`)
    ]
  };
}


export function crewScheduleClashes(teams, currentTeamId, match) {
  if (!match || match.status && match.status !== 'scheduled' || !match.date) return [];
  const target = arr(match.crew).filter(a => a?.personId && a.confirmed === true);
  const mins = hhmm => /^\d{2}:\d{2}$/.test(hhmm || '') ? Number(hhmm.slice(0,2))*60 + Number(hhmm.slice(3)) : null;
  const results = [];
  for (const team of arr(teams)) {
    for (const other of arr(team.matches)) {
      if (!other || (team.id === currentTeamId && other.id === match.id)
        || other.date !== match.date || (other.status && other.status !== 'scheduled')) continue;
      const m1 = mins(match.start), m2 = mins(other.start);
      if (m1 !== null && m2 !== null && Math.abs(m1 - m2) >= 120) continue;
      for (const a of target) {
        if (!arr(other.crew).some(b => b?.personId === a.personId && b.confirmed === true)) continue;
        results.push({ personId: a.personId, teamId: team.id, opponent: other.opponent || 'TBC',
          start: other.start || '', date: other.date });
      }
    }
  }
  return results;
}
