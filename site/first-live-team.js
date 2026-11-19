// Public, non-identifying first-team presentation identity.
// An authenticated team grant still comes only from Supabase. This label is
// NEVER an account, Person, grant, sporting registration or permission.
export const FIRST_LIVE_TEAM = Object.freeze({
  teamId: 'stgeorge-mixed20',
  club: 'St George Oztag',
  name: 'Mixed 20',
  sport: 'oztag'
});

export function teamDisplayName(context) {
  if (context?.teamId === FIRST_LIVE_TEAM.teamId &&
      context?.club === FIRST_LIVE_TEAM.club)
    return FIRST_LIVE_TEAM.name;
  return typeof context?.teamId === 'string' ? context.teamId : '';
}

// Explicit club context is shown for every team, but a first-team label
// must never fabricate a grant when the server supplies an unknown context.
export function teamContextLabel(context) {
  const name = teamDisplayName(context);
  return [context?.club, name].filter(Boolean).join(' · ');
}
