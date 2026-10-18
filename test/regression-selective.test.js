// Selective scenarios adapted from PR #8 to accepted PR #9 / PR #10 model APIs.
// In particular, corrected issues use jerseyCorrections (not void entries).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../site/model.js';
import { teamView } from '../site/vault.js';

const oldOztag = ['Wing', 'Link', 'Middle', 'Half'];
const make = () => M.migrateWorkspace({
  schema: 3, id: 'team1', team: { name: 'Titans Women', clubId: 'oz', sport: '', positions: oldOztag, jerseyLoan: true },
  clubs: [{ id: 'oz', name: 'Oztag', sport: 'Oztag' }, { id: 'rl', name: 'Rugby league', sport: 'Rugby league' }, { id: 'nb', name: 'Netball', sport: 'Netball' }],
  players: [{ id: 'a', name: 'Amy', number: '7', positions: ['Wing', 'Half'], status: 'available' },
            { id: 'b', name: 'Bea', number: '9', positions: [], status: 'available' }],
  teams: [], library: {}
});
const reloaded = ws => M.migrateWorkspace(JSON.parse(JSON.stringify(ws)));
const p = (ws, id) => ws.players.find(x => x.id === id);

test('PR8 port: legacy Oztag default follows the club, without changing player history', () => {
  const ws = make(), before = p(ws,'a').positions.slice();
  assert.deepEqual(ws.team.positions, M.SPORT_POSITIONS.Oztag, 'old Oztag app list recognised as inherited');
  assert.equal(ws.team.positionsCustom, false);
  ws.team.clubId = 'rl'; M.syncSportPositions(ws);
  assert.deepEqual(ws.team.positions, M.SPORT_POSITIONS['Rugby league']);
  assert.deepEqual(M.positionsFor(ws.team, M.clubOf(ws,ws)), M.SPORT_POSITIONS['Rugby league']);
  assert.deepEqual(p(ws,'a').positions, before, 'historical player positions are not rewritten');
  assert.deepEqual(teamView(M.activeLens(ws), M.clubOf(ws,ws)).team.positions, M.SPORT_POSITIONS['Rugby league']);
  assert.equal(M.stable(reloaded(ws)), M.stable(ws), 'migration is idempotent');
});

test('PR8 port: explicitly customised lists, including reordered legacy lists, remain custom', () => {
  const ws = make();
  ws.team.positions = ['Middle', 'Wing', 'Link', 'Half'];
  ws.team.positionsCustom = true;
  ws.team.clubId = 'nb'; M.syncSportPositions(ws);
  assert.deepEqual(M.positionsFor(ws.team, M.clubOf(ws,ws)), ['Middle', 'Wing', 'Link', 'Half']);
  assert.deepEqual(reloaded(ws).team.positions, ws.team.positions);
  const changed = M.changedSportPositions(
    { ...ws.team, sport: 'Oztag' }, { sport: 'Oztag' },
    { ...ws.team, sport: 'Netball' }, { sport: 'Netball' }, ws.team.positions);
  assert.equal(changed.positionsCustom, true);
  assert.deepEqual(changed.positions, ws.team.positions);
});

test('PR8 port: an earlier returned jersey can legitimately be issued again next season', () => {
  const ws = make(), amy = p(ws,'a');
  assert.equal(amy.jerseys.length, 1);
  assert.ok(M.returnJersey(amy, amy.jerseys[0].id, '2026-09-01'));
  const prior = M.activeSeason(ws).id;
  const next = M.rollover(ws, { name: 'Winter 2027', start: '2027-03-01', activate: true,
    carry: [{ playerId: 'a', number: '7' }] }, new Date(2027,2,1));
  M.syncJerseys(ws, '2027-03-02');
  assert.equal(amy.jerseys.length, 2, 'new-season issue follows prior return');
  assert.equal(M.jerseyReport(ws, prior).rows.find(x=>x.id==='a').status, 'returned');
  assert.equal(M.jerseyReport(ws, next.season.id).rows.find(x=>x.id==='a').status, 'out');
  assert.equal(M.jerseyInventory(ws).outstanding, 2, 'includes Bea outstanding from previous season');
});

test('PR8 port: incorrect issue suppression survives reload and explicit reissue', () => {
  const ws = make(), sid = M.activeSeason(ws).id;
  const amy = p(ws,'a'), id = amy.jerseys[0].id;
  assert.ok(M.removeLoan(amy,id));
  assert.ok(M.correctedJersey(amy,sid,'7'));
  M.syncJerseys(ws,'2026-10-18');
  assert.equal(amy.jerseys.length,0);
  const after = reloaded(ws);
  M.syncJerseys(after,'2026-10-19');
  assert.equal(p(after,'a').jerseys.length,0);
  assert.ok(M.issueJersey(p(after,'a'),'7',sid,'2026-10-20'));
  M.syncJerseys(after,'2026-10-20');
  assert.equal(p(after,'a').jerseys.length,1);
  assert.equal(M.correctedJersey(p(after,'a'),sid,'7'),false);
});

test('PR8 port: conflicting simultaneous jersey edits are surfaced, not silently lost', () => {
  const base = make(), local = structuredClone(base), remote = structuredClone(base);
  const sid = M.activeSeason(local).id;
  M.removeLoan(p(local,'a'),p(local,'a').jerseys[0].id);
  M.returnJersey(p(remote,'a'),p(remote,'a').jerseys[0].id,'2026-10-19');
  const result = M.merge3(base,local,remote);
  assert.ok(result.changes.both.some(x=>x.key.endsWith('/players/a')), 'conflict requires a coach choice');
  const chosen = M.resolve(result,Object.fromEntries(result.changes.both.map(x=>[x.key,'remote'])));
  assert.equal(M.jerseyReport(chosen,sid).rows.find(x=>x.id==='a').status,'returned');
});

test('PR8 port: coach-only jersey corrections and photos never enter a player projection', () => {
  const ws = make(), amy = p(ws,'a');
  amy.photo = 'data:image/png;base64,'+'A'.repeat(1000);
  M.removeLoan(amy,amy.jerseys[0].id);
  const publicCopy = JSON.stringify(teamView(M.activeLens(ws),M.clubOf(ws,ws)));
  for (const key of ['jerseyCorrections','jerseys','data:image/png','phone']) assert.ok(!publicCopy.includes(key), key);
});
