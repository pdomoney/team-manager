import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../site/model.js';
import { teamView } from '../site/vault.js';

const make = () => M.migrateWorkspace({
  schema: 3, id: 'team1',
  team: { name: 'Titans League', sport: 'Rugby league', jerseyLoan: true },
  players: [{ id: 'amy', name: 'Amy Example', number: '7', positions: ['Halfback'],
    phone: '0400 111 222', gender: 'F', status: 'available', notes: 'Private league note' }],
  clubs: [], library: {},
  teams: [{ id: 'team2', team: { name: 'Titans Netball', sport: 'Netball', jerseyLoan: true },
    players: [], sessions: [], lineups: [], matches: [], tasks: [], messages: [] }]
});
const roundTrip = v => M.migrateWorkspace(JSON.parse(JSON.stringify(v)));
const net = w => M.findTeam(w, 'team2');

test('cross-team: same person keeps independent player IDs, positions, kits and season membership', () => {
  const w = make(), source = w.players[0], before = JSON.stringify(source.jerseys);
  const result = M.linkPlayerTeams(w, 'team1', 'amy', 'team2');
  assert.equal(result.error, undefined);
  const other = result.player;
  assert.notEqual(other.id, source.id);
  assert.equal(other.personId, source.personId);
  assert.equal(other.name, source.name);
  assert.equal(other.phone, source.phone);
  assert.deepEqual([other.number, other.positions, other.status, other.notes], ['', [], 'available', '']);
  assert.deepEqual(other.jerseys, [], 'no jersey copied or issued automatically');
  assert.equal(JSON.stringify(source.jerseys), before, 'source kit history not altered');
  assert.ok(M.activeLens(net(w)).players.some(x => x.id === other.id), 'target active season contains new player');
  assert.deepEqual(M.positionsFor(net(w).team, null), M.SPORT_POSITIONS.Netball);
  assert.deepEqual(M.positionsFor(w.team, null), M.SPORT_POSITIONS['Rugby league']);
  other.positions = ['GS', 'GA']; other.number = '12';
  M.syncJerseys(net(w), '2026-10-18');
  assert.deepEqual(M.openLoans(other).map(x => x.number), ['12']);
  assert.deepEqual(M.openLoans(source).map(x => x.number), ['7']);
  assert.ok(M.returnJersey(other, other.jerseys[0].id, '2026-10-19'));
  assert.deepEqual(M.openLoans(other), []);
  assert.equal(M.openLoans(source).length, 1, 'returning one team jersey does not return another');
  assert.equal(M.jerseyReport(net(w), M.activeSeason(net(w)).id).returned, 1);
  assert.equal(M.jerseyReport(w, M.activeSeason(w).id).out, 1);
  assert.equal(M.personTeams(w, 'team1', 'amy').length, 2);
  const linkedKit = M.personTeams(w, 'team1', 'amy').find(x => x.teamId === 'team2');
  assert.equal(linkedKit.jerseyStatus, 'Returned', 'linked team jersey return visible to coach');
  assert.equal(M.personTeams(w, 'team1', 'amy').find(x => x.teamId === 'team1').jerseyStatus, 'With player',
    'source team issued jersey still outstanding');
  const restored = roundTrip(w);
  assert.equal(M.stable(roundTrip(restored)), M.stable(restored), 'linked data migrates idempotently');
  assert.equal(M.personTeams(restored, 'team1', 'amy').length, 2);
});

test('cross-team: a pre-existing target player is linked without overwriting match or kit history', () => {
  const w = make(), t = net(w);
  t.players.push({ id: 'existing', name: 'Amy Example', number: '44', positions: ['GK'],
    notes: 'Different notes', status: 'injured', jerseys: [{ id: 'kit44', seasonId: M.activeSeason(t).id, number: '44', out: '2026-08-01', back: '' }] });
  t.matches.push({ id: 'match1', date: '2026-10-01', seasonId: M.activeSeason(t).id, lineupId: '' });
  const a = M.linkPlayerTeams(w, 'team1', 'amy', 'team2', 'existing');
  assert.ok(a.linkedExisting);
  assert.equal(t.players.length, 1);
  assert.deepEqual([a.player.number, a.player.positions, a.player.status, a.player.notes], ['44', ['GK'], 'injured', 'Different notes']);
  assert.equal(a.player.jerseys[0].id, 'kit44');
  assert.equal(t.matches[0].id, 'match1');
  assert.equal(M.linkPlayerTeams(w, 'team1', 'amy', 'team2').error, 'This player is already linked to that team.');
});

test('cross-team: player names are never used to merge unrelated identities', () => {
  const w = make(), t = net(w);
  t.players.push({ id: 'different', name: 'Amy Example', number: '3', positions: ['C'] });
  assert.equal(M.personTeams(w, 'team1', 'amy').length, 1);
  const linked = M.linkPlayerTeams(w, 'team1', 'amy', 'team2');
  assert.ok(linked.player.id !== 'different', 'same name does not silently link unrelated records');
  assert.equal(t.players[0].personId, undefined);
  assert.equal(t.players.length, 2);
});

test('cross-team: errors do not partially mutate either team or link archived teams', () => {
  const w = make(), baseline = M.stable(w);
  assert.match(M.linkPlayerTeams(w, 'team1', 'amy', 'team1').error, /different/);
  assert.match(M.linkPlayerTeams(w, 'team1', 'missing', 'team2').error, /not found/);
  assert.match(M.linkPlayerTeams(w, 'team1', 'amy', 'team2', 'missing').error, /not found/);
  assert.equal(M.stable(w), baseline);
  net(w).archived = true;
  assert.match(M.linkPlayerTeams(w, 'team1', 'amy', 'team2').error, /active season/);
  assert.equal(w.players[0].personId, undefined);
});

test('cross-team: linked records and jersey details stay out of encrypted public projections', () => {
  const w = make(), p = M.linkPlayerTeams(w, 'team1', 'amy', 'team2').player;
  p.number = '14'; p.positions = ['GS'];
  M.syncJerseys(net(w), '2026-10-18');
  for (const t of [w, net(w)]) {
    const view = JSON.stringify(teamView(M.activeLens(t)));
    assert.ok(view.includes('Amy Example'));
    assert.ok(!view.includes('personId') && !view.includes('jerseys') && !view.includes('jerseyCorrections'));
    assert.ok(!view.includes('0400 111 222') && !view.includes('Private league note'));
  }
});

test('cross-team: linked membership survives a new team season without importing another team status', () => {
  const w = make(), t = net(w), p = M.linkPlayerTeams(w, 'team1', 'amy', 'team2').player;
  p.number = '8'; p.positions = ['GK'];
  M.syncJerseys(t, '2026-10-18');
  const created = M.rollover(t, { name: 'Winter 2027', activate: true,
    carry: [{ playerId: p.id, number: '11', positions: ['GA'] }] }, new Date(2027, 2, 1));
  M.syncJerseys(t, '2027-03-01');
  assert.equal(M.personTeams(w, 'team1', 'amy').length, 2);
  assert.equal(M.activeLens(t).players[0].number, '11');
  assert.deepEqual(M.activeLens(t).players[0].positions, ['GA']);
  assert.equal(M.activeLens(w).players[0].number, '7');
  assert.equal(M.jerseyReport(t, created.season.id).out, 1);
  assert.equal(M.jerseyInventory(t).outstanding, 2, 'both target-season jerseys tracked');
});
