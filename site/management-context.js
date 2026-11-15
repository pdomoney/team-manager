// M1.2: read-only working context for the existing operational pages.
// It describes the current team and test role; it never grants access or changes
// Home's team selection, the current season, or the published player's view.
const OPERATIONAL_PAGES = new Set([
  'agenda', 'training', 'matches', 'attendance', 'squad',
  'tasks', 'helpers', 'crew', 'notices', 'messages'
]);
const PARTICIPANT_ROLES = new Set(['player', 'guardian', 'helper', 'staff', 'none']);
const teamKey = id => String(id || '').replace(/-/g, '');

export function managementWorkingContext({
  tab, coachView, team, clubName = '', seasonName = '', historical = false,
  session = null
} = {}) {
  if (!coachView || !OPERATIONAL_PAGES.has(tab) || !team?.id) return null;
  if (session) {
    if (PARTICIPANT_ROLES.has(session.role)) return null;
    // The personal Owner's existing workspace includes user-created teams,
    // not only the fixed fictional fixture assignments. Other roles must
    // still match an explicit assigned team.
    if (session.role !== 'personal_owner' &&
        (!Array.isArray(session.allowedTeams) ||
         !session.allowedTeams.some(t => teamKey(t?.id) === teamKey(team.id)))) return null;
  }
  return {
    teamId: String(team.id),
    teamName: String(team.name || 'Unnamed team'),
    clubName: String(clubName || ''),
    seasonName: String(seasonName || ''),
    roleLabel: session ? String(session.label || 'Assigned role') : 'Coach workspace',
    groupLabel: session ? String(session.context?.groupLabel || '') : '',
    fictional: !!session,
    historical: !!historical
  };
}
