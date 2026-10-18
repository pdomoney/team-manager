import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../site/model.js';
import { teamView, makeLock, newSalt, seal, openFile } from '../site/vault.js';

const NOW = new Date(2026, 9, 18, 9, 0);
const players = () => [
  { id: 'p1', name: 'Mia Tuala', gender: 'F', number: '4', positions: ['Middle'], status: 'available', phone: '0400 000 001' },
  { id: 'p2', name: 'Josh Halloran', gender: 'M', number: '1', positions: ['Wing'], status: 'injured', phone: '0400 000 002' },
  { id: 'p3', name: 'Ava Kelleher', gender: 'F', number: '11', positions: ['Link'], status: 'available', phone: '' }
];
// A copy from before seasons (schema 3): one team, with a tournament.
function schema3() {
  return {
    schema: 3, id: 'team1', updatedAt: '2026-10-01T00:00:00.000Z',
    team: { name: 'DragonTag Mixed 20s', category: 'mixed', event: 'NSW State Cup', eventStart: '2027-03-19', eventEnd: '2027-03-21', venue: 'Coffs Harbour', division: 'Mixed 20s',
      staff: [{ role: 'Head coach', name: 'Paul', phone: '0411', email: '' }], trainingVenue: 'Home ground', trainingStart: '18:00', trainingEnd: '19:30' },
    players: players(),
    sessions: [{ id: 's1', date: '2026-10-13', start: '18:00', attendance: { p1: 'present', p2: 'late' }, rsvp: { p1: 'yes' } }, { id: 's2', date: '2026-10-20', start: '18:00', attendance: {}, rsvp: {} }],
    matches: [{ id: 'm1', date: '2026-10-11', opponent: 'Northern Beaches', status: 'played', result: { us: 6, them: 4 }, lineupId: 'lu2', rsvp: {} },
      { id: 'm2', date: '2027-03-19', start: '09:00', opponent: 'Coffs Coast', status: 'scheduled', tournament: true, rsvp: {}, result: {} },
      { id: 'm3', date: '2027-03-20', start: '10:00', opponent: 'In the dates, not marked', status: 'scheduled', rsvp: {}, result: {} }],
    lineups: [{ id: 'lu1', name: 'Starting 8', slots: [{ id: 'LM', playerId: 'p1' }] }, { id: 'lu2', name: 'vs Northern Beaches', slots: [{ id: 'LM', playerId: 'p2' }] }],
    tasks: [{ id: 't1', title: 'BBQ', date: '2026-10-24', need: 2, people: [{ who: 'p:p1', status: 'yes' }], matchId: '' }],
    helpers: [], notices: [{ id: 'n1', at: '2026-10-02T01:00:00.000Z', text: 'Welcome' }], messages: [{ id: 'g1', at: '2026-10-03T01:00:00.000Z', text: 'Hi', status: 'sent' }],
    plays: [], playerSets: [], systems: {}, teams: [], library: {}, clubs: []
  };
}
const migrate = raw => M.migrateWorkspace(JSON.parse(JSON.stringify(raw)));

test('upgrading a copy from before seasons: one active season with the existing squad and records', () => {
  const ws = migrate(schema3());
  assert.equal(ws.schema, 4);
  assert.equal(ws.id, 'team1', 'team id kept');
  assert.equal(ws.seasons.length, 1);
  const s = ws.seasons[0];
  assert.deepEqual([s.id, s.name, s.status, s.start, s.end], ['season1', '2026–27', 'active', '', ''], 'named from the years the records span; no dates made up');
  assert.deepEqual(s.squad.map(m => [m.playerId, m.number, m.status]), [['p1', '4', 'available'], ['p2', '1', 'injured'], ['p3', '11', 'available']]);
  for (const k of M.SEASON_KINDS) assert.ok(ws[k].every(x => x.seasonId === 'season1'), `${k} claimed`);
  assert.equal(ws.lineups.find(l => l.id === 'lu2').seasonId, 'season1', 'a match’s lineup goes with its match');
  assert.equal(ws.lineups.find(l => l.id === 'lu1').seasonId, undefined, 'a saved lineup stays the team’s');
  assert.deepEqual(ws.players.map(p => p.id), ['p1', 'p2', 'p3'], 'player ids kept');
  assert.equal(s.staff[0].name, 'Paul');
});

test('the team’s season setting names the first season', () => {
  const raw = schema3(); raw.team.season = 'Winter 2026';
  assert.equal(migrate(raw).seasons[0].name, 'Winter 2026');
  const bare = migrate({ team: { name: 'New' }, players: [] });
  assert.equal(bare.seasons[0].name, 'Current season');
});

test('upgrading is repeatable: the same copy always gives the same result', () => {
  const once = migrate(schema3()), twice = M.migrateWorkspace(JSON.parse(JSON.stringify(once)));
  assert.equal(M.stable(twice), M.stable(once));
  const again = migrate(schema3());
  assert.equal(M.stable(again), M.stable(once), 'two phones upgrading the same copy agree');
});

test('an older single-team backup (schema 2) upgrades too', () => {
  const raw = schema3(); delete raw.schema; delete raw.teams; delete raw.clubs; delete raw.library; raw.version = 2;
  const ws = migrate(raw);
  assert.equal(ws.schema, 4); assert.equal(ws.seasons[0].status, 'active'); assert.equal(ws.clubs.length >= 0, true);
});

test('the tournament becomes a competition; only matches marked as tournament matches are linked', () => {
  const ws = migrate(schema3());
  assert.equal(ws.competitions.length, 1);
  const c = ws.competitions[0];
  assert.deepEqual([c.name, c.start, c.end, c.format, c.status], ['NSW State Cup', '2027-03-19', '2027-03-21', 'other', 'planned']);
  assert.deepEqual(c.entries.map(e => [e.teamId, e.seasonId, e.division]), [['team1', 'season1', 'Mixed 20s']]);
  assert.equal(ws.team.eventCompId, c.id);
  assert.equal(ws.matches.find(m => m.id === 'm2').entryId, c.entries[0].id);
  assert.equal(ws.matches.find(m => m.id === 'm3').entryId, undefined, 'in the dates but not marked: left for the coach');
  assert.deepEqual(M.unlinkedInDates(ws, c.id, 'team1').map(m => m.id), ['m3'], 'offered to link');
  // two teams at the same event share one competition
  const raw = schema3(); raw.teams = [{ id: 'u16abc', team: { name: 'U16', event: 'NSW State Cup', eventStart: '2027-03-19', eventEnd: '2027-03-21' }, players: [] }];
  const two = migrate(raw);
  assert.equal(two.competitions.length, 1); assert.equal(two.competitions[0].entries.length, 2);
});

function rolled() {
  const ws = migrate(schema3());
  ws.seasons[0].name = 'Winter 2026';
  const r = M.rollover(ws, { name: M.nextSeasonName('Winter 2026'), label: 'Winter', year: '2027', start: '2027-04-01', end: '2027-08-31', activate: true,
    carry: [{ playerId: 'p1', number: '7', positions: ['Rover'] }, { playerId: 'p2', number: '1', positions: ['Wing'] }],
    newPlayers: [{ name: 'Tom New', gender: 'M', number: '15' }], staff: [], keepDefaults: true }, NOW);
  return { ws, r };
}

test('next season: picked players carried over with new numbers, a new player, nothing else copied', () => {
  const { ws, r } = rolled();
  assert.equal(M.nextSeasonName('Winter 2026'), 'Winter 2027');
  assert.equal(M.nextSeasonName('2026–27'), '2027–28');
  assert.equal(ws.id, 'team1', 'the same team');
  const [old, neu] = ws.seasons;
  assert.deepEqual([old.status, neu.status, neu.name], ['completed', 'active', 'Winter 2027']);
  assert.equal(M.activeSeason(ws), neu, 'only one active');
  assert.deepEqual(neu.squad.map(m => m.playerId), ['p1', 'p2', r.added[0].id]);
  assert.ok(!ws.players.some(p => p.name === 'Mia Tuala' && p.id !== 'p1'), 'no second record for a carried player');
  const cur = M.seasonLens(ws, neu.id), past = M.seasonLens(ws, old.id);
  assert.deepEqual(cur.players.map(p => [p.id, p.number]), [['p1', '7'], ['p2', '1'], [r.added[0].id, '15']]);
  assert.equal(cur.players.find(p => p.id === 'p2').status, 'available', 'last season’s injury isn’t carried as current');
  assert.deepEqual(past.players.map(p => [p.id, p.number, p.status]), [['p1', '4', 'available'], ['p2', '1', 'injured'], ['p3', '11', 'available']], 'last season keeps its squad and numbers');
  assert.ok(ws.players.some(p => p.id === 'p3'), 'the player who left stays in the team’s history');
  assert.ok(!cur.players.some(p => p.id === 'p3'));
  for (const k of M.SEASON_KINDS) assert.equal(cur[k].length, 0, `no ${k} copied into the new season`);
  assert.equal(past.sessions.length, 2); assert.equal(past.matches.length, 3);
  assert.equal(past.readOnly, true); assert.equal(cur.readOnly, false);
  assert.deepEqual(ws.team.staff, [], 'staff only when picked');
  assert.equal(ws.team.trainingStart, '18:00', 'training defaults kept when asked');
  assert.equal(ws.team.season, 'Winter 2027');
  // changing this season's number doesn't touch last season
  ws.players.find(p => p.id === 'p1').number = '99'; M.claimRecords(ws);
  assert.equal(M.seasonLens(ws, old.id).players.find(p => p.id === 'p1').number, '4');
  assert.equal(M.seasonLens(ws, neu.id).players.find(p => p.id === 'p1').number, '99');
  // a player added during the season is in it (and only it) without changing the season record
  const sig = M.stable(neu);
  ws.players.push({ id: 'late', name: 'Late Join', gender: 'F', number: '30', positions: [], status: 'available' }); M.claimRecords(ws);
  assert.equal(M.stable(neu), sig, 'adding a player only changes the player record');
  assert.ok(M.seasonLens(ws, neu.id).players.some(p => p.id === 'late') && !M.seasonLens(ws, old.id).players.some(p => p.id === 'late'));
  assert.ok(M.inSeason(ws, neu.id, 'late') && !M.inSeason(ws, old.id, 'late'));
  // completing the season writes its squad down, with the late joiner
  M.seasonMove(ws, neu.id, 'completed', NOW);
  assert.deepEqual(neu.squad.map(m => [m.playerId, m.number]).filter(([id]) => ['p1', 'late'].includes(id)), [['p1', '99'], ['late', '30']]);
  // the match that was played still shows who played in it
  const m1 = past.matches.find(m => m.id === 'm1'), lu = past.lineups.find(l => l.id === m1.lineupId);
  assert.equal(lu.slots[0].playerId, 'p2'); assert.ok(!cur.lineups.some(l => l.id === 'lu2'), 'old match lineups stay with their season');
});

test('season statuses: allowed moves, one active at a time', () => {
  const ws = migrate(schema3());
  const r = M.rollover(ws, { name: 'Winter 2027', carry: [], activate: false }, NOW);
  const s1 = ws.seasons[0], s2 = r.season;
  assert.equal(s2.status, 'planned');
  assert.equal(M.seasonMove(ws, s2.id, 'completed'), 'not-allowed');
  assert.equal(M.seasonMove(ws, s2.id, 'active'), 'other-active');
  assert.equal(M.seasonMove(ws, s1.id, 'archived'), 'not-allowed', 'an active season is completed first');
  assert.equal(M.seasonMove(ws, s1.id, 'completed', NOW), ''); assert.equal(s1.completedAt, '2026-10-18');
  assert.equal(M.seasonMove(ws, s2.id, 'active'), '');
  assert.equal(M.seasonMove(ws, s1.id, 'active'), 'other-active', 'reopening waits for the other to finish');
  assert.equal(M.seasonMove(ws, s1.id, 'archived'), ''); assert.equal(M.seasonMove(ws, s1.id, 'completed'), '', 'archived can come back');
  // two actives (say, from two phones) settle on the first
  const raw = JSON.parse(JSON.stringify(ws)); raw.seasons.forEach(s => { s.status = 'active'; });
  const fixed = M.migrateWorkspace(raw);
  assert.equal(fixed.seasons.filter(s => s.status === 'active').length, 1);
});

test('new records join the season being worked on; leaving a squad keeps the history', () => {
  const { ws } = rolled();
  const [old, neu] = ws.seasons;
  ws.sessions.push({ id: 'new1', date: '2027-04-06', attendance: {}, rsvp: {} });
  M.claimRecords(ws);
  assert.equal(ws.sessions.find(s => s.id === 'new1').seasonId, neu.id);
  ws.matches.push({ id: 'fix1', date: '2026-08-01', opponent: 'Missed one', status: 'played', result: { us: 1, them: 0 } });
  M.claimRecords(ws, old.id);
  assert.equal(ws.matches.find(m => m.id === 'fix1').seasonId, old.id, 'a correction to last season goes into last season');
  assert.equal(M.removeMember(ws, neu.id, 'p2'), 'season', 'played last season: only leaves this squad');
  assert.ok(ws.players.some(p => p.id === 'p2') && M.seasonLens(ws, old.id).players.some(p => p.id === 'p2'));
  const tom = neu.squad[neu.squad.length - 1].playerId;
  assert.equal(M.removeMember(ws, neu.id, tom), 'player', 'only in this season: removed altogether');
  assert.ok(!ws.players.some(p => p.id === tom));
});

test('the players’ copy has this season only: its squad, its records, no past players', () => {
  const { ws } = rolled();
  const v = teamView(M.activeLens(ws), null, M.compsForPlayers(ws, ws));
  const text = JSON.stringify(v);
  assert.deepEqual(v.players.map(p => p.id).sort(), ['p1', 'p2', v.players.find(p => p.name === 'Tom New').id].sort());
  assert.ok(!text.includes('Ava Kelleher'), 'a player who left isn’t in it');
  assert.ok(!text.includes('Northern Beaches') && !text.includes('Welcome'), 'no past matches or notices');
  assert.ok(!text.includes('0400 000'), 'no phone numbers');
  assert.deepEqual(v.competitions, [], 'last season’s competition entry isn’t this season’s');
});

test('seasons and competitions are records when two phones’ changes are merged', () => {
  const base = migrate(schema3());
  const a = JSON.parse(JSON.stringify(base)), b = JSON.parse(JSON.stringify(base));
  M.rollover(a, { name: 'Winter 2027', carry: [], activate: false }, NOW);
  b.competitions[0].name = 'NSW State Cup 2027';
  const r = M.merge3(base, a, b);
  assert.equal(r.changes.both.length, 0, 'no clash: different records');
  assert.equal(r.merged.seasons.length, 2);
  assert.equal(r.merged.competitions[0].name, 'NSW State Cup 2027');
  const keys = [...M.records(base).keys()];
  assert.ok(keys.includes('t/team1/seasons/season1') && keys.some(k => k.startsWith('comp/')));
});

test('competitions: one record, entries for several teams and seasons, no duplicates', () => {
  const raw = schema3(); raw.teams = [{ id: 'men111', team: { name: 'Men’s Open' }, players: [], matches: [] }];
  const ws = migrate(raw);
  ws.competitions.push(M.normComp({ id: 'wl27', name: 'Winter League 2027', format: 'league', start: '2027-04-10', end: '2027-08-28', status: 'planned' }));
  const s1 = ws.seasons[0].id, s2 = ws.teams[0].seasons[0].id;
  const e1 = M.addEntry(ws, 'wl27', 'team1', s1, { division: 'Women’s Open' }).entry;
  const e2 = M.addEntry(ws, 'wl27', 'men111', s2, {}).entry;
  assert.ok(e1 && e2);
  assert.equal(M.addEntry(ws, 'wl27', 'team1', s1, { division: 'women’s open ' }).error, 'duplicate');
  assert.ok(M.addEntry(ws, 'wl27', 'team1', s1, { division: 'Over 30s' }).entry, 'a second division is a separate entry');
  assert.equal(M.addEntry(ws, 'wl27', 'team1', 'nope').error, 'no-season');
  assert.equal(ws.competitions.filter(c => c.id === 'wl27').length, 1);
  assert.equal(M.teamEntries(ws, 'team1', s1).length, 3, 'the State Cup and two Winter League divisions in the same season');
  // fixtures
  const m = { id: 'w1', date: '2027-04-10', start: '09:00', opponent: 'Como', status: 'scheduled', seasonId: s1, rsvp: {}, result: {} };
  ws.matches.push(m);
  assert.equal(M.linkMatch(ws, ws.teams[0], m, e1.id), 'wrong-team');
  assert.equal(M.linkMatch(ws, ws, m, e1.id), '');
  assert.deepEqual([m.entryId, m.compId], [e1.id, 'wl27']);
  assert.equal(M.matchKind(ws, m).kind, 'competition');
  assert.equal(M.matchKind(ws, ws.matches.find(x => x.id === 'm2')).kind, 'competition', 'format “other” is a competition, not a tournament');
  assert.equal(M.matchKind(ws, { ...m, entryId: '', friendly: true }).kind, 'friendly');
  ws.teams[0].matches.push({ id: 'w2', date: '2027-04-10', start: '11:00', opponent: 'Gymea', status: 'played', seasonId: s2, entryId: e2.id, compId: 'wl27', result: { us: 3, them: 1 } });
  assert.deepEqual(M.compMatches(ws, 'wl27').map(x => [x.team.id, x.match.id]), [['team1', 'w1'], ['men111', 'w2']]);
  assert.equal(M.removeEntry(ws, 'wl27', e1.id), 'has-fixtures');
  assert.ok(M.withdrawEntry(ws, 'wl27', e1.id));
  assert.equal(m.entryId, e1.id, 'withdrawing keeps the fixtures');
  assert.equal(M.addEntry(ws, 'wl27', 'team1', s1, { division: 'Women’s Open' }).entry.id, e1.id, 'entering again brings the entry back');
  // archive the team: its entry and results stay
  M.setArchived(ws, 'men111', true);
  const again = M.migrateWorkspace(JSON.parse(JSON.stringify(ws)));
  assert.equal(again.competitions.find(c => c.id === 'wl27').entries.length, 3);
  // a season that's gone takes its entry with it, and its match is unlinked
  const gone = JSON.parse(JSON.stringify(ws)); gone.teams[0].seasons = [{ id: 'other', name: 'X', status: 'active' }];
  const fixed = M.migrateWorkspace(gone);
  assert.equal(fixed.competitions.find(c => c.id === 'wl27').entries.length, 2);
  assert.equal(fixed.teams[0].matches[0].entryId, '');
});

test('the team’s tournament settings follow its competition', () => {
  const ws = migrate(schema3());
  ws.competitions[0].start = '2027-03-26'; ws.competitions[0].end = '2027-03-28';
  M.syncEvents(ws);
  assert.deepEqual([ws.team.eventStart, ws.team.eventEnd], ['2027-03-26', '2027-03-28']);
});

test('Home: only the active season raises anything', () => {
  const { ws } = rolled();
  const past = new Date(2026, 9, 18, 9, 0);   // the old season's BBQ and training are still "upcoming" by date
  const items = M.homeItems(ws, ws, past);
  assert.ok(!items.some(x => ['s2', 't1', 'm2', 'm3'].includes(x.id)), 'completed season: no alerts');
  assert.ok(items.every(x => x.season === 'Winter 2027'));
  assert.equal(M.homeView(ws, null, past).insight.players, 3, 'the summary counts this season’s squad');
});

test('going back: a single team in the earlier format still has every record', () => {
  const { ws } = rolled();
  const legacy = M.legacyTeam(ws, 'team1');
  assert.equal(legacy.version, 2);
  assert.equal(legacy.sessions.length, 2); assert.equal(legacy.players.length, 4);
});

test('each season’s figures side by side', () => {
  const { ws } = rolled();
  const st = M.seasonStats(ws, '2026-10-18');
  assert.deepEqual(st.map(s => [s.name, s.squad, s.matches.won]), [['Winter 2026', 3, 1], ['Winter 2027', 3, 0]]);
  assert.equal(st[1].sessions.avgAttended, null, 'nothing recorded is not a zero');
});

test('an encrypted coach copy from before seasons opens and upgrades', async () => {
  const lock = await makeLock('coach pass', newSalt(), 1000);
  const file = await seal(schema3(), lock, 'coach');
  const { value } = await openFile(file, 'coach pass', 'coach');
  const ws = M.migrateWorkspace(value);
  assert.equal(ws.schema, 4); assert.equal(ws.seasons[0].squad.length, 3); assert.equal(ws.competitions.length, 1);
  const again = await openFile(await seal(ws, lock, 'coach'), 'coach pass', 'coach');
  assert.equal(M.stable(M.migrateWorkspace(again.value)), M.stable(ws), 'sealed again and reopened: unchanged');
});
