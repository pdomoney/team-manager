import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../site/model.js';
import { teamView } from '../site/vault.js';

const NOW = new Date(2026, 9, 18, 9, 0), TODAY = '2026-10-18';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
const ws0 = () => M.migrateWorkspace({ schema: 3, id: 'team1', team: { name: 'Titans Women', clubId: 'tp', positions: ['Wing', 'Link', 'Rover', 'Middle'] },
  players: [{ id: 'a', name: 'Amy', number: '4', positions: [], status: 'available', photo: PNG }, { id: 'b', name: 'Bea', number: '', positions: [], status: 'available' }],
  clubs: [{ id: 'tp', name: 'Taren Point Titans', sport: 'Rugby league' }], teams: [], library: {} });

test('sports: a list to pick from, positions for each, rule sets only where the app has them', () => {
  for (const s of ['Oztag', 'Rugby league', 'League tag', 'Touch football', 'Rugby union', 'Netball', 'AFL', 'Football (soccer)']) assert.ok(M.SPORTS.includes(s), s);
  M.SPORTS.forEach(s => assert.ok(Array.isArray(M.SPORT_POSITIONS[s]), `positions for ${s}`));
  assert.equal(M.defaultRuleSet({ category: 'women' }, { sport: 'Rugby league' }), 'league/women');
  assert.match(M.defaultRuleSet({ sport: 'League tag', category: 'women' }, { sport: 'Rugby league' }), /^league-tag\//, 'a league tag team in a rugby league club plays league tag');
  assert.equal(M.defaultRuleSet({}, { sport: 'Netball' }), '', 'no rule set made up for a sport the app has none for');
  assert.equal(M.defaultRuleSet({}, { sport: 'Rugby union' }), '', 'rugby union is not rugby league');
  assert.equal(M.teamRules({}, { sport: 'Touch football' }), null);
  assert.equal(M.defaultRuleSet({ category: 'mixed' }, null), 'oztag/mixed', 'no sport at all: Oztag, as before');
  assert.deepEqual(M.positionsFor({}, { sport: 'Netball' }), M.SPORT_POSITIONS.Netball);
  assert.deepEqual(M.positionsFor({ sport: 'Rugby union' }, { sport: 'Oztag' }), M.SPORT_POSITIONS['Rugby union'], 'the team’s own sport first');
  assert.deepEqual(M.positionsFor({ positions: ['A', 'B'] }, null), ['A', 'B'], 'a team’s own list wins');
});

test('a team made with the Oztag positions in a rugby league club gets league positions', () => {
  const ws = ws0();
  assert.deepEqual(ws.team.positions, M.SPORT_POSITIONS['Rugby league']);
  const own = M.migrateWorkspace({ team: { name: 'X', clubId: 'tp', positions: ['Front', 'Back'] }, players: [], clubs: [{ id: 'tp', name: 'TP', sport: 'Rugby league' }] });
  assert.deepEqual(own.team.positions, ['Front', 'Back'], 'a list the coach changed is left alone');
});

test('photos: small images only, and only in the coach’s copy', () => {
  assert.ok(M.validPhoto(PNG));
  assert.ok(!M.validPhoto('data:image/svg+xml;base64,PHN2Zz4=') && !M.validPhoto('https://x/y.png') && !M.validPhoto('data:image/png;base64,' + 'A'.repeat(M.PHOTO_MAX)));
  const ws = ws0(), v = teamView(M.activeLens(ws), null);
  assert.ok(!JSON.stringify(v).includes('data:image/png'), 'no photo in the players’ file');
  assert.ok(!JSON.stringify(v).includes('jerseys'), 'no jersey records in the players’ file');
});

test('jerseys: a number given out is a jersey out; returns, undo, remove', () => {
  const ws = ws0(), amy = ws.players.find(p => p.id === 'a'), bea = ws.players.find(p => p.id === 'b');
  assert.deepEqual(amy.jerseys.map(j => [j.number, j.out, j.back]), [['4', '', '']], 'had a number before: jersey out, date not known');
  assert.deepEqual(bea.jerseys, []);
  assert.equal(M.stable(M.migrateWorkspace(JSON.parse(JSON.stringify(ws)))), M.stable(ws), 'upgrading again changes nothing');
  bea.number = '9'; M.syncJerseys(ws, TODAY);
  assert.deepEqual(bea.jerseys.map(j => [j.number, j.out]), [['9', TODAY]]);
  M.syncJerseys(ws, TODAY); assert.equal(bea.jerseys.length, 1, 'once only');
  bea.number = '19'; M.syncJerseys(ws, '2026-10-20');
  assert.deepEqual(bea.jerseys.map(j => [j.number, j.back]), [['9', ''], ['19', '']], 'a new number is a second jersey; the first stays out until it’s handed back');
  assert.ok(M.returnJersey(bea, bea.jerseys[0].id, '2026-10-21'));
  M.syncJerseys(ws, '2026-10-21'); assert.equal(bea.jerseys.length, 2, 'a returned jersey isn’t given out again just because the number is still set');
  assert.ok(!M.returnJersey(bea, bea.jerseys[0].id, '2026-10-22'), 'already back');
  assert.deepEqual(M.openLoans(bea).map(j => j.number), ['19']);
  assert.ok(M.undoReturn(bea, bea.jerseys[0].id)); assert.equal(M.openLoans(bea).length, 2);
  assert.ok(M.removeLoan(bea, bea.jerseys[0].id, TODAY)); assert.equal(M.liveLoans(bea).length, 1);
  assert.equal(bea.jerseys.length, 2, 'the removed record is kept, marked void, so it isn’t made again');
});

test('the jersey report: who has one, who gave it back, and anyone who left still holding one', () => {
  const ws = ws0();
  ws.players.push({ id: 'c', name: 'Cat', number: '12', positions: [], status: 'available' }); M.syncJerseys(ws, TODAY);
  const s1 = ws.seasons[0].id;
  // next season: Amy comes back with the same number, Cat leaves with her jersey, Bea returned nothing (she had none)
  const r = M.rollover(ws, { name: 'Winter 2027', activate: true, carry: [{ playerId: 'a', number: '4' }, { playerId: 'b', number: '' }] }, NOW);
  M.syncJerseys(ws, '2027-04-01');
  assert.equal(ws.players.find(p => p.id === 'a').jerseys.length, 1, 'same number, same jersey: still the one she had');
  const rep = M.seasonJerseys(ws, r.season.id), inv = M.jerseyInventory(ws);
  const row = id => rep.rows.find(x => x.playerId === id);
  assert.equal(row('a').status, 'carried', 'Amy still has last season’s #4'); assert.equal(row('b').status, 'none');
  assert.ok(!row('c'), 'Cat isn’t in this season and got nothing in it');
  assert.deepEqual(inv.rows.map(x => [x.playerId, x.inSquad]), [['c', false], ['a', true]], 'out now: Cat left still holding #12, and Amy');
  const cat = ws.players.find(p => p.id === 'c'); M.returnJersey(cat, cat.jerseys[0].id, '2027-04-02');
  assert.ok(!M.jerseyInventory(ws).rows.some(x => x.playerId === 'c'), 'once it’s back she drops off the list of jerseys out');
  assert.equal(M.seasonJerseys(ws, s1).rows.find(x => x.playerId === 'c').status, 'returned', 'last season shows it came back');
});

test('active competitions for Home: where they’re up to and our results', () => {
  const ws = ws0(), sid = ws.seasons[0].id;
  ws.competitions.push(M.normComp({ id: 'cup', name: 'State Cup', format: 'championship', start: '2026-10-17', end: '2026-10-19', status: 'active' }));
  const e = M.addEntry(ws, 'cup', 'team1', sid, { division: 'Women' }).entry;
  ws.matches = []; ws.matches.push({ id: 'x1', date: '2026-10-17', start: '09:00', opponent: 'A', status: 'played', result: { us: 3, them: 1 }, entryId: e.id, seasonId: sid },
    { id: 'x2', date: '2026-10-18', start: '08:00', opponent: 'B', status: 'played', result: { us: 1, them: 2 }, entryId: e.id, seasonId: sid },
    { id: 'x3', date: '2026-10-18', start: '13:00', opponent: 'C', status: 'scheduled', entryId: e.id, seasonId: sid },
    { id: 'x4', date: '2026-10-19', start: '10:00', opponent: 'D', status: 'scheduled', entryId: e.id, seasonId: sid });
  const live = M.liveComps(ws, [ws], NOW);
  assert.equal(live.length, 1);
  assert.deepEqual(live[0].phase, { kind: 'day', n: 2, of: 3 });
  const r = live[0].rows[0];
  assert.deepEqual([r.record.won, r.record.lost, r.today.map(m => m.id), r.next.id, r.last.id], [1, 1, ['x2', 'x3'], 'x3', 'x2']);
  ws.competitions[0].status = 'planned';
  assert.equal(M.liveComps(ws, [ws], NOW).length, 0, 'only active competitions');
  assert.deepEqual(M.compPhase({ start: '2026-04-01', end: '2026-09-30' }, new Date(2026, 4, 1)), { kind: 'week', n: 5, of: 27 });
  assert.equal(M.compPhase({ start: '2026-11-01' }, NOW).kind, 'before');
});
