// P06C: privacy-minimised readiness aggregation over the existing match-crew checks.
// No person names, credentials, WWCC details, medical data or login permissions leave this projection.
import { matchCrewCheck, crewScheduleClashes } from './match-crew.js';
import { teamsOf, clubOf, teamSport, matchKind, arr } from './model.js';

export function fixtureReadinessIndex(ws, clubId) {
  const matches = [];
  for (const team of teamsOf(ws)) {
    if (team.archived || clubOf(ws, team)?.id !== clubId) continue;
    const sport = teamSport(team.team, clubOf(ws, team));
    for (const m of arr(team.matches)) {
      if (!m?.id || m.status === 'cancelled') continue;
      const policy = m.crewPolicy || team.team?.crewPolicy;
      const context = matchKind(ws, m);
      const result = matchCrewCheck(arr(ws.matchOfficials), { ...team, team: { ...team.team, sport } }, m, policy, context);
      const clashes = crewScheduleClashes(teamsOf(ws), team.id, m);
      const required = result.configured ? result.shortages.reduce((v, r) => v + r.min, 0) : null;
      const confirmed = result.configured ? result.shortages.reduce((v, r) => v + r.have, 0) : null;
      const missing = result.configured ? result.shortages.reduce((v, r) => v + r.missing, 0) : null;
      matches.push(Object.freeze({
        teamId: team.id, matchId: m.id, date: String(m.date || ''), sport,
        state: !result.configured ? 'unverified' : result.ready && !clashes.length ? 'covered' : 'attention',
        required, confirmed, missing,
        // Aggregated issue categories only, no personally identifying details.
        problemAssignments: result.slots.filter(x => !x.valid).length,
        schedulingClashes: clashes.length
      }));
    }
  }
  const totals = Object.freeze({
    fixtures: matches.length,
    covered: matches.filter(m => m.state === 'covered').length,
    attention: matches.filter(m => m.state === 'attention').length,
    unverified: matches.filter(m => m.state === 'unverified').length
  });
  return Object.freeze({clubId, totals, fixtures: Object.freeze(matches)});
}
