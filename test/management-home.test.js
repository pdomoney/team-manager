import test from 'node:test';
import assert from 'node:assert/strict';
import { selectedTeamManagement } from '../site/management-home.js';

const player = (id, status = 'available') => ({ id, name: id, status });
const fixture = (id, rsvp = {}) => ({ id, status: 'scheduled', date: '2026-11-20', start: '10:00', opponent: id, rsvp });
const team = (id = 't1') => ({
  id, team: { name: 'Team ' + id }, players: [player('p1'), player('p2'), player('p3', 'injured')],
  matches: [fixture('later', { p1: 'yes' }), fixture('next', { p1: { v: 'yes', at: '2026-11-10T00:00:00Z' }, p2: 'maybe' })],
  sessions: [], tasks: []
});
const home = (t, scope = { kind: 'team', id: t.id }) => ({
  scope, teams: [t], items: [
    { teamId: t.id, kind: 'match', id: 'later', date: '2026-11-20', start: '10:00', title: 'vs Later', level: 1 },
    { teamId: t.id, kind: 'match', id: 'next', date: '2026-11-19', start: '10:00', title: 'vs Next', level: 3 }
  ]
});

test('M1.1 selected team summary shows exact active squad and earliest upcoming match replies', () => {
  const t = team(), before = JSON.stringify(t), h = home(t);
  const result = selectedTeamManagement(h, t);
  assert.equal(result.teamId, 't1');
  assert.equal(result.squadCount, 3);
  assert.equal(result.nextMatch.id, 'next', 'earliest date wins, not spotlight urgency');
  assert.deepEqual(
    [result.nextMatch.eligibleCount, result.nextMatch.confirmed, result.nextMatch.unanswered,
     result.nextMatch.unsure, result.nextMatch.unavailable],
    [2, 1, 0, 1, 0],
    'injured player is excluded and legacy/object replies are both counted'
  );
  assert.equal(result.seasonName, 'No active season');
  assert.equal(JSON.stringify(t), before, 'the summary never mutates the workspace');
});

test('M1.1 never creates a misleading team summary for all-club, club or different-team scope', () => {
  const t = team(), other = team('other');
  assert.equal(selectedTeamManagement(home(t, { kind: 'all', id: '' }), t), null);
  assert.equal(selectedTeamManagement(home(t, { kind: 'club', id: 'c1' }), t), null);
  assert.equal(selectedTeamManagement(home(other), t), null);
  assert.equal(selectedTeamManagement({ ...home(t), teams: [t, other] }, t), null);
  assert.equal(selectedTeamManagement(null, t), null);
});

test('M1.1 rejects stale or cancelled fixtures and handles no squad or scheduled match', () => {
  const t = team();
  t.matches[1].status = 'cancelled';
  let result = selectedTeamManagement(home(t), t);
  assert.equal(result.nextMatch.id, 'later');
  t.matches = [];
  t.players = [];
  result = selectedTeamManagement(home(t), t);
  assert.equal(result.nextMatch, null);
  assert.equal(result.squadCount, 0);
});

test('M1.1 uses the active season, not a previous season or another team player', () => {
  const t = team();
  t.seasons = [
    { id: 'old', name: '2025', status: 'completed', squad: [{ playerId: 'p3' }] },
    { id: 'current', name: '2026', status: 'active', squad: [{ playerId: 'p1' }, { playerId: 'p2' }] }
  ];
  t.matches[0].seasonId = 'old';
  t.matches[1].seasonId = 'current';
  const result = selectedTeamManagement(home(t), t);
  assert.equal(result.seasonName, '2026');
  assert.equal(result.squadCount, 2);
  assert.equal(result.nextMatch.id, 'next');
  assert.equal(result.nextMatch.eligibleCount, 2);
});
