// P06D: actionable, privacy-minimised checks derived from existing match-crew evidence.
// This is a coach planning aid, not an official qualification or safeguarding determination.
import { matchCrewCheck, crewScheduleClashes } from './match-crew.js';
import { teamsOf, clubOf, teamSport, matchKind, arr } from './model.js';

const ACTIONS = Object.freeze({
  policy: 'Verify the applicable competition staffing policy',
  coverage: 'Assign additional eligible, confirmed staff',
  qualification: 'Review expired or missing qualification, registration and WWCC evidence',
  confirmation: 'Obtain assignment confirmations',
  conflict: 'Resolve overlapping confirmed match assignments'
});

export function clubCrewActions(ws, clubId) {
  const actions = [];
  if (!clubId) return Object.freeze(actions);
  for (const team of teamsOf(ws)) {
    if (team?.archived || clubOf(ws, team)?.id !== clubId) continue;
    const sport = teamSport(team.team, clubOf(ws, team));
    for (const match of arr(team.matches)) {
      if (!match?.id || match.status === 'cancelled') continue;
      const evaluated = matchCrewCheck(arr(ws.matchOfficials),
        { ...team, team: { ...team.team, sport } }, match,
        match.crewPolicy || team.team?.crewPolicy, matchKind(ws, match));
      const conflicts = crewScheduleClashes(teamsOf(ws), team.id, match);
      const keys = [];
      if (!evaluated.configured) keys.push('policy');
      if (evaluated.configured && evaluated.shortages.some(x => x.missing > 0)) keys.push('coverage');
      if (evaluated.slots.some(x => /WWCC|accreditation|registration|unverified|expired|not in this club|allocation/i.test(x.issue || ''))) keys.push('qualification');
      if (evaluated.slots.some(x => /not confirmed/i.test(x.issue || ''))) keys.push('confirmation');
      if (conflicts.length || evaluated.slots.some(x => /assigned twice/i.test(x.issue || ''))) keys.push('conflict');
      for (const key of keys) actions.push(Object.freeze({
        teamId: team.id, matchId: match.id, date: String(match.date || ''),
        sport, category: key, action: ACTIONS[key]
      }));
    }
  }
  return Object.freeze(actions);
}
