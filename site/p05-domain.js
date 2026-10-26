// P05A: read-only canonical domain references; no new authoritative storage.
// This module never modifies a workspace or exposes coach-only person ledgers.
import { arr, teamsOf, seasonsOf, seasonLens, teamSport, clubOf, findTeam } from './model.js';

const key = (parts) => JSON.stringify(parts);
const str = x => typeof x === 'string' && x.length > 0 ? x : null;
const unique = rows => rows.length === new Set(rows).size;

/** Read-only identity and sport metadata for a team in this workspace. */
export function teamRef(ws, teamId) {
  if (!str(teamId)) return null;
  const matches = teamsOf(ws).filter(t => t?.id === teamId);
  if (matches.length !== 1) return null;
  const t = matches[0];
  return Object.freeze({
    key: key(['team', teamId]), teamId,
    clubId: t.team?.clubId || null,
    sport: teamSport(t.team, clubOf(ws, t)),
    name: t.team?.name || '',
    archived: !!t.archived,
    legacyRoot: t === ws
  });
}

/** Stable composite reference; rejects missing and duplicate season IDs. */
export function teamSeasonRef(ws, teamId, seasonId) {
  const team = teamRef(ws, teamId);
  if (!team || !str(seasonId)) return null;
  const t = findTeam(ws, teamId);
  const matches = seasonsOf(t).filter(s => s?.id === seasonId);
  if (matches.length !== 1) return null;
  return Object.freeze({
    key: key(['team-season', teamId, seasonId]), teamId, seasonId,
    status: matches[0].status || '',
    archived: matches[0].status === 'archived' || matches[0].status === 'completed'
  });
}

/** A player has distinct participation in each team and season, never matched by name. */
export function playerParticipationRef(ws, teamId, seasonId, playerId) {
  const season = teamSeasonRef(ws, teamId, seasonId);
  if (!season || !str(playerId)) return null;
  const t = findTeam(ws, teamId);
  if (arr(t.players).filter(p => p?.id === playerId).length !== 1) return null;
  const view = seasonLens(t, seasonId);
  const members = arr(view.players).filter(p => p?.id === playerId);
  if (members.length !== 1) return null;
  const p = members[0];
  return Object.freeze({
    key: key(['participation', teamId, seasonId, playerId]),
    teamId, seasonId, playerId,
    personId: str(p.personId), sport: teamRef(ws, teamId).sport,
    number: String(p.number ?? ''),
    positions: Object.freeze([...arr(p.positions)]),
    status: p.status || '',
    historical: season.archived
  });
}

/** A P04C appointment reference is only emitted for an existing stable staff ID.
 * Appointment existence and role context are checked within that season's staff.
 * It is not a credential, role grant or person lookup.
 */
export function teamAppointmentRef(ws, teamId, seasonId, staffId, role) {
  const season = teamSeasonRef(ws, teamId, seasonId);
  if (!season || !str(staffId) || !str(role)) return null;
  const t = findTeam(ws, teamId);
  const current = seasonsOf(t).find(s => s.id === seasonId);
  const staff = arr(current.staff).filter(s => s?.id === staffId && s?.role === role);
  if (staff.length !== 1) return null;
  return Object.freeze({
    key: key(['appointment', teamId, seasonId, staffId, role]),
    teamId, seasonId, staffId, role, historical: season.archived
  });
}

/** Diagnostic only: never repairs IDs, never changes the workspace. */
export function domainReferenceIssues(ws) {
  const issues = [], ts = teamsOf(ws);
  const ids = ts.map(t => t?.id);
  if (!unique(ids)) issues.push('duplicate-team-id');
  for (const t of ts) {
    if (!str(t?.id)) { issues.push('missing-team-id'); continue; }
    const ss = seasonsOf(t), pids = arr(t.players).map(p => p?.id);
    if (!unique(pids)) issues.push('duplicate-player-id:' + t.id);
    if (pids.some(id => !str(id))) issues.push('missing-player-id:' + t.id);
    if (!unique(ss.map(s => s?.id))) issues.push('duplicate-season-id:' + t.id);
    for (const s of ss) {
      if (!str(s?.id)) { issues.push('missing-season-id:' + t.id); continue; }
      const members = arr(s.squad).map(m => m?.playerId);
      if (!unique(members)) issues.push('duplicate-squad-player:' + t.id + ':' + s.id);
      if (members.some(id => !pids.includes(id))) issues.push('dangling-squad-player:' + t.id + ':' + s.id);
      const staffIds = arr(s.staff).map(r => r?.id).filter(id => str(id));
      if (!unique(staffIds)) issues.push('duplicate-season-staff-id:' + t.id + ':' + s.id);
    }
  }
  return Object.freeze(issues);
}

/**
 * P05 final consolidation: safe read-only season history index.
 * Uses original team/season/player IDs. Does not fabricate staff identities,
 * copy jerseys across seasons, or export private player and guardian details.
 */
export function seasonHistoryIndex(ws, teamId) {
  const team = teamRef(ws, teamId);
  if (!team) return null;
  const t = findTeam(ws, teamId);
  const rows = seasonsOf(t).map(season => {
    const ref = teamSeasonRef(ws, teamId, season?.id);
    if (!ref) return null;
    const players = arr(seasonLens(t, season.id).players);
    const roster = players.map(p => playerParticipationRef(ws, teamId, season.id, p.id));
    if (roster.some(x => !x)) return null;
    const stableStaff = arr(season.staff)
      .filter(r => str(r?.id) && str(r?.role))
      .map(r => teamAppointmentRef(ws, teamId, season.id, r.id, r.role));
    if (stableStaff.some(x => !x)) return null;
    return Object.freeze({
      teamId, seasonId: season.id, status: ref.status,
      sport: team.sport, historical: ref.archived,
      playerRefs: Object.freeze(roster.map(p => p.key)),
      staffRefs: Object.freeze(stableStaff.map(a => a.key))
    });
  });
  if (rows.some(x => !x)) return null;
  return Object.freeze(rows);
}
