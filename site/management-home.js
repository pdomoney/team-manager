// M1.1: a read-only, exact-team snapshot for the existing Home management shortcuts.
// Counts use the active-season lens and the same RSVP semantics as Home's match priorities.
// This is presentation data, not an approval, competition-eligibility or access-control decision.
import { activeLens, activeSeason, rsvpCounts, teamName } from './model.js';

export function selectedTeamManagement(home, selected) {
  if (!home || !selected || home.scope?.kind !== 'team' ||
      home.scope.id !== selected.id || home.teams?.length !== 1 ||
      home.teams[0]?.id !== selected.id) return null;

  const lens = activeLens(selected);
  const players = Array.isArray(lens.players) ? lens.players : [];
  const matches = Array.isArray(lens.matches) ? lens.matches : [];
  const byId = new Map(matches.filter(m => m && m.status === 'scheduled').map(m => [m.id, m]));
  // Home items have already excluded past, cancelled and malformed-date events.
  // Sort by actual fixture time, not the urgency ranking used for Home's spotlight.
  const nextItem = (Array.isArray(home.items) ? home.items : [])
    .filter(i => i && i.kind === 'match' && i.teamId === selected.id &&
      typeof i.date === 'string' && byId.has(i.id))
    .sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')) ||
      String(a.id).localeCompare(String(b.id)))[0];
  const record = nextItem && byId.get(nextItem.id);
  const available = players.filter(p => p && (!p.status || p.status === 'available'));
  const replies = record ? rsvpCounts(record, available) : null;

  return {
    teamId: selected.id,
    teamName: teamName(selected),
    seasonName: activeSeason(selected)?.name || 'No active season',
    squadCount: players.length,
    nextMatch: record ? {
      id: record.id,
      title: nextItem.title,
      date: nextItem.date,
      start: nextItem.start || '',
      eligibleCount: available.length,
      confirmed: replies.yes,
      unanswered: replies.none,
      unsure: replies.maybe,
      unavailable: replies.no
    } : null
  };
}
