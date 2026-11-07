// Read-only projection for the match-staff screen when Home explicitly selects
// one team. Club membership alone must not be represented as a team assignment.
// These filters provide UI context, NOT real person/club authorisation.
const rows = value => Array.isArray(value) ? value : [];

export function isHomeTeamCrewScope(homeScope, team) {
  return !!team?.id && homeScope?.kind === 'team' && homeScope.id === team.id;
}

export function teamCrewDirectory(people, team) {
  if (!team?.id) return [];
  const matchAssigned = new Set(rows(team.matches).flatMap(m =>
    rows(m?.crew).map(assignment => assignment?.personId).filter(Boolean)));
  return rows(people).filter(person => person && (
    rows(person.teamIds).includes(team.id) ||
    Boolean(person.squadYears?.[team.id]) ||
    matchAssigned.has(person.id)
  ));
}

export function teamCrewReadiness(readiness, actions, teamId) {
  const fixtures = rows(readiness?.fixtures).filter(m => m?.teamId === teamId);
  const totals = Object.freeze({
    fixtures: fixtures.length,
    covered: fixtures.filter(m => m.state === 'covered').length,
    attention: fixtures.filter(m => m.state === 'attention').length,
    unverified: fixtures.filter(m => m.state === 'unverified').length
  });
  return Object.freeze({
    readiness: Object.freeze({ ...readiness, totals, fixtures: Object.freeze(fixtures) }),
    actions: Object.freeze(rows(actions).filter(x => x?.teamId === teamId))
  });
}
