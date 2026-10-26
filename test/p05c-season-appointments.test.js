import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../site/model.js';
import { teamAppointmentRef, playerParticipationRef } from '../site/p05-domain.js';

function workspace() {
  return {
    id: 'team1',
    team: { name: 'Oztag U16', sport: 'Oztag', staff: [{ id: 'staff-01', role: 'Coach', name: 'Taylor', phone: '0400000000' }] },
    players: [{ id: 'player-01', personId: 'person-01', name: 'Jordan', number: '7', positions: ['Link'], status: 'available',
      jerseys: [{ number: '7', issued: '2026-01-01' }] }],
    seasons: [{ id: 'season-26', name: '2026', status: 'active', squad: [{ playerId: 'player-01', number: '7', positions: ['Link'], status: 'available', reg: '' }],
      staff: [{ id: 'staff-01', role: 'Coach', name: 'Taylor' }] }],
    teams: [], clubs: [], competitions: [], sessions: [], matches: [], tasks: [], messages: [], notices: [], lineups: []
  };
}

test('P05C rollover preserves stable staff ID, historical squad and jersey evidence', () => {
  const ws = workspace();
  const jerseyBefore = JSON.stringify(ws.players[0].jerseys);
  const result = M.rollover(ws, {
    name: '2027', carry: [{ playerId: 'player-01', number: '11', positions: ['Wing'] }],
    newPlayers: [], staff: [], activate: true, keepDefaults: false
  }, new Date('2026-10-21T00:00:00Z'));
  assert.ok(result.season.id);
  assert.equal(ws.seasons[0].status, 'completed');
  assert.equal(ws.seasons[0].staff[0].id, 'staff-01');
  assert.equal(teamAppointmentRef(ws, 'team1', 'season-26', 'staff-01', 'Coach').staffId, 'staff-01');
  const old = playerParticipationRef(ws, 'team1', 'season-26', 'player-01');
  assert.deepEqual(old.positions, ['Link']);
  assert.equal(old.number, '7');
  assert.equal(old.historical, true);
  const current = playerParticipationRef(ws, 'team1', result.season.id, 'player-01');
  assert.deepEqual(current.positions, ['Wing']);
  assert.equal(current.number, '11');
  assert.equal(JSON.stringify(ws.players[0].jerseys), jerseyBefore);
  assert.equal(ws.seasons[0].staff[0].name, 'Taylor');
});

test('P05C staff snapshots with no ID remain legacy snapshots, never guessed identities', () => {
  const ws = workspace();
  ws.team.staff = [{ role: 'Manager', name: 'Legacy manager' }];
  M.seasonMove(ws, 'season-26', 'completed', new Date('2026-10-21T00:00:00Z'));
  assert.equal(ws.seasons[0].staff[0].id, undefined);
  assert.equal(teamAppointmentRef(ws, 'team1', 'season-26', 'staff-01', 'Coach'), null);
});

test('P05C completed season refuses mutation by invalid lifecycle transition', () => {
  const ws = workspace();
  M.seasonMove(ws, 'season-26', 'completed', new Date('2026-10-21T00:00:00Z'));
  const before = JSON.stringify(ws);
  assert.equal(M.seasonMove(ws, 'season-26', 'planned'), 'not-allowed');
  assert.equal(JSON.stringify(ws), before);
});
