import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../site/model.js';

const TODAY = '2026-10-18';
const team = () => ({
  team: { name: 'DragonTag Mixed 20s', maxMales: 4, eventStart: '2027-03-19', eventEnd: '2027-03-21' },
  players: [
    { id: 'p1', name: 'Mia Tuala', gender: 'F', status: 'available' },
    { id: 'p2', name: 'Josh Halloran', gender: 'M', status: 'available' },
    { id: 'p3', name: 'Kai Brennan', gender: 'M', status: 'injured' }
  ],
  helpers: [{ id: 'h1', name: 'Rachel Tuala', playerId: 'p1' }],
  sessions: [
    { id: 's1', date: '2026-10-06', start: '18:00', end: '19:30', venue: 'Field 2', attendance: { p1: 'present', p2: 'late', p3: 'apology' }, rsvp: { p1: { v: 'yes' }, p2: 'no' } },
    { id: 's2', date: '2026-10-13', start: '18:00', end: '19:30', venue: 'Field 2', attendance: {}, rsvp: { p1: 'yes' } },
    { id: 's3', date: '2026-10-15', cancelled: true, attendance: {}, rsvp: { p1: 'yes' } },
    { id: 's4', date: '2026-10-20', start: '18:00', end: '19:30', venue: 'Field 2', attendance: {}, rsvp: { p1: 'maybe' } }
  ],
  lineups: [{ id: 'l1', name: 'Starting 8', slots: [{ id: 'LW', label: 'LW', playerId: 'p1' }, { id: 'RW', label: 'RW', playerId: 'p2' }] }],
  matches: [],
  tasks: [
    { id: 't1', title: 'Gear bag', kind: 'gear', date: '2026-10-20', start: '18:00', end: '19:30', place: 'Field 2', sessionId: 's4', need: 1, people: [{ who: 'p:p1', status: 'asked' }] },
    { id: 't2', title: 'Run the BBQ', kind: 'bbq', date: '2026-10-24', need: 3, people: [{ who: 'h:h1', status: 'yes' }, { who: 'p:p2', status: 'asked' }, { who: 'p:p3', status: 'no' }] }
  ],
  notices: [], messages: [], plays: [], playerSets: [], systems: {}
});

test('an old single-team copy becomes the first team of a workspace, the same way every time', () => {
  const old = { version: 2, ...team(), teamPass: 'secret', updatedAt: '2026-10-17T00:00:00Z' };
  const a = M.migrateWorkspace(JSON.parse(JSON.stringify(old)));
  const b = M.migrateWorkspace(JSON.parse(JSON.stringify(old)));
  assert.equal(a.schema, M.SCHEMA);
  assert.equal(a.id, 'team1');
  assert.deepEqual(a.teams, []);
  assert.deepEqual(a, b, 'deterministic');
  assert.deepEqual(M.migrateWorkspace(JSON.parse(JSON.stringify(a))), a, 'migrating again changes nothing');
  assert.equal(a.players.length, 3);
  assert.equal(a.teamPass, 'secret');
  // the first team is still readable by the previous app version, and can be exported for a rollback
  const legacy = M.legacyTeam(a, 'team1');
  assert.equal(legacy.version, 2);
  for (const k of ['schema', 'teams', 'library']) assert.ok(!(k in legacy));
  assert.deepEqual(legacy.players.map(({ jerseys, ...p }) => p), old.players, 'players as they were (plus their jersey record)');
});

test('teams stay separate, and at least one stays active', () => {
  const ws = M.migrateWorkspace(team());
  const u2 = M.addTeam(ws, { ...team(), team: { name: 'Under 16s' }, players: [{ id: 'q1', name: 'Ava' }] });
  assert.match(u2.id, /^[a-z0-9]{3,32}$/);
  assert.equal(M.teamFile(ws, ws), 'team.enc.json');
  assert.equal(M.teamFile(ws, u2), `team-${u2.id}.enc.json`);
  assert.ok(M.TEAM_FILE.test(M.teamFile(ws, u2)));
  assert.ok(M.setArchived(ws, 'team1', true));
  assert.equal(M.setArchived(ws, u2.id, true), false, 'the last active team cannot be archived');
  assert.deepEqual(M.activeTeams(ws).map(t => t.id), [u2.id]);
  assert.ok(M.setArchived(ws, 'team1', false));
  const again = M.migrateWorkspace(JSON.parse(JSON.stringify(ws)));
  assert.equal(again.teams[0].id, u2.id, 'team ids are kept');
  assert.equal(again.teams[0].players[0].name, 'Ava');
  assert.ok(!('teams' in again.teams[0]), 'teams do not nest');
});

test('repair takes out links to records that are gone', () => {
  const t = team();
  t.players = t.players.filter(p => p.id !== 'p2');
  t.helpers = [];
  t.sessions = t.sessions.filter(s => s.id !== 's4');
  t.tasks.push({ id: 't3', title: 'Lifts', kind: 'lift', date: '2026-10-24', people: [{ who: 'p:p1', role: 'rider', status: 'yes', car: 'h:h1' }] });
  t.matches = [{ id: 'm1', date: '2026-10-25', lineupId: 'gone' }];
  const fixes = M.repairTeam(t);
  assert.ok(fixes.length >= 4);
  assert.equal(t.tasks[0].sessionId, '');
  assert.deepEqual(t.tasks[1].people.map(p => p.who), ['p:p3']);
  assert.equal(t.tasks[2].people[0].car, '');
  assert.equal(t.lineups[0].slots[1].playerId, null);
  assert.equal(t.matches[0].lineupId, '');
  assert.deepEqual(M.repairTeam(t), [], 'nothing left to fix');
});

test('starting the squad over clears everything that pointed at the players', () => {
  const t = team();
  const n = M.resetTeam(t, ['squad'], () => []);
  assert.equal(n.squad, 3);
  assert.deepEqual(t.players, []);
  assert.ok(t.sessions.every(s => !Object.keys(s.attendance).length && !Object.keys(s.rsvp).length));
  assert.ok(t.lineups[0].slots.every(s => s.playerId === null));
  assert.deepEqual(t.tasks[0].people, []);
  assert.deepEqual(t.tasks[1].people.map(p => p.who), ['h:h1'], 'helpers stay on their tasks');
  assert.equal(t.helpers[0].playerId, '');
  assert.equal(t.sessions.length, 4, 'sessions kept');
});

test('clearing training keeps the tasks but unlinks them; settings and plays are never cleared', () => {
  const t = team();
  t.plays = [{ id: 'x' }]; t.teamPass = 'keep';
  M.resetTeam(t, ['training', 'helpers', 'messages', 'nonsense'], () => [{ id: 'fresh', slots: [] }]);
  assert.deepEqual(t.sessions, []);
  assert.equal(t.tasks[0].sessionId, '');
  assert.deepEqual(t.tasks[1].people.map(p => p.who), ['p:p2', 'p:p3']);
  assert.equal(t.plays.length, 1);
  assert.equal(t.teamPass, 'keep');
  assert.equal(t.lineups[0].id, 'l1', 'lineups only reset when asked');
});

test('tasks follow their session when it moves, keeping their own times', () => {
  const t = team();
  t.tasks.push({ id: 't9', title: 'BBQ', kind: 'bbq', date: '2026-10-20', start: '17:00', place: 'Field 2', sessionId: 's4', people: [] });
  const from = { date: '2026-10-20', start: '18:00', end: '19:30', place: 'Field 2' }, to = { date: '2026-10-21', start: '18:30', end: '20:00', place: 'Oval' };
  assert.ok(M.whenChanged(from, to));
  assert.equal(M.followEvent(t, 'session', 's4', from, to), 2);
  assert.deepEqual([t.tasks[0].date, t.tasks[0].start, t.tasks[0].end, t.tasks[0].place], ['2026-10-21', '18:30', '20:00', 'Oval']);
  assert.deepEqual([t.tasks[2].date, t.tasks[2].start, t.tasks[2].place], ['2026-10-21', '17:00', 'Oval']);
});

test('cancelling a session can cancel its tasks, and reinstating brings them back', () => {
  const t = team();
  t.tasks[1].cancelled = true;                       // cancelled on its own: not brought back
  t.tasks[1].sessionId = 's4';
  assert.equal(M.cancelTasks(t, 'session', 's4'), 1);
  assert.equal(t.tasks[0].cancelled, true);
  assert.equal(M.reinstateTasks(t, 'session', 's4'), 1);
  assert.equal(t.tasks[0].cancelled, false);
  assert.equal(t.tasks[1].cancelled, true);
  assert.equal(M.detachTasks(t, 'session', 's4'), 2);
  assert.equal(M.linkedTasks(t, 'session', 's4').length, 0);
  t.tasks[0].sessionId = 's4';
  assert.equal(M.removeTasks(t, 'session', 's4'), 1);
  assert.deepEqual(t.tasks.map(x => x.id), ['t2']);
});

test('only accepted and done replies fill a spot; invitations are counted apart', () => {
  const c = M.coverage(team().tasks[1]);
  assert.deepEqual({ need: c.need, confirmed: c.confirmed, invited: c.invited, declined: c.declined, short: c.short, toFind: c.toFind },
    { need: 3, confirmed: 1, invited: 1, declined: 1, short: 2, toFind: 1 });
  assert.deepEqual(M.spotsOf(c), ['confirmed', 'invited', 'open']);
  const asked = M.coverage(team().tasks[0]);
  assert.equal(asked.confirmed, 0, 'an unanswered invitation is not cover');
  assert.equal(asked.toFind, 0, 'but nobody else needs asking');
  assert.equal(M.coverage({ kind: 'bbq', need: 2, people: [{ who: 'p:p1', status: 'done' }, { who: 'p:p2', status: 'done' }] }).complete, true);
  // the players' copy: spots without names
  assert.deepEqual(M.spotsOf(M.coverage({ kind: 'bbq', need: 3, spots: ['done', 'invited'] })), ['done', 'invited', 'open']);
  assert.deepEqual(M.spotsOf(M.coverage({ kind: 'bbq', need: 2, spots: ['taken'] })), ['confirmed', 'open'], 'older copies still read');
});

test('lifts: seats only count once a driver accepts, and filling never overloads a car', () => {
  const lift = { id: 'l', kind: 'lift', people: [
    { who: 'h:a', role: 'driver', seats: 2, status: 'yes' }, { who: 'h:b', role: 'driver', seats: 3, status: 'asked' },
    { who: 'p:1', role: 'rider', status: 'yes', car: 'h:a' }, { who: 'p:2', role: 'rider', status: 'yes', car: 'h:b' },
    { who: 'p:3', role: 'rider', status: 'yes', car: '' }, { who: 'p:4', role: 'rider', status: 'yes', car: '' }] };
  let L = M.liftPlan(lift);
  assert.deepEqual([L.riders, L.seated, L.tentative, L.waiting, L.confirmedSeats, L.possibleSeats], [4, 1, 1, 2, 2, 5]);
  assert.ok(M.liftShort(L));
  assert.equal(M.canSeat(lift, 'h:a', 'p:3'), true);
  assert.equal(M.fillSeats(lift), 1, 'one free confirmed seat');
  L = M.liftPlan(lift);
  assert.equal(L.cars[0].over, 0);
  assert.equal(M.canSeat(lift, 'h:a', 'p:4'), false, 'car is full');
  assert.equal(M.canSeat(lift, 'h:a', 'p:1'), true, 'already in it');
  // the driver can't go: their riders lose the seat
  M.setReply(lift, 'h:a', 'no');
  L = M.liftPlan(lift);
  assert.equal(L.cars.length, 1);
  assert.equal(lift.people.filter(p => p.car === 'h:a').length, 0);
  assert.equal(L.waiting, 3);
});

test('RSVPs are kept apart from attendance and counted against the squad', () => {
  const s = { id: 'x', rsvp: {} };
  M.setRsvp(s, 'p1', 'yes', '2026-10-18T00:00:00Z');
  M.setRsvp(s, 'p2', 'maybe');
  M.setRsvp(s, 'p2', '');
  assert.deepEqual(s.rsvp.p1, { v: 'yes', at: '2026-10-18T00:00:00Z', via: 'coach' });
  assert.equal(M.rsvpOf(s, 'p2'), '');
  assert.equal(M.rsvpOf({ rsvp: { p1: 'no' } }, 'p1'), 'no', 'plain strings still read');
  assert.deepEqual(M.rsvpCounts(s, team().players), { yes: 1, no: 0, maybe: 0, none: 2 });
});

test('match results: outcomes only from recorded scores, and a missing result is not a zero', () => {
  const ms = [
    { id: 'a', date: '2026-10-03', status: 'played', result: { us: 5, them: 3 } },
    { id: 'b', date: '2026-10-04', status: 'played', result: { us: 2, them: 2 } },
    { id: 'c', date: '2026-10-05', status: 'played', result: { us: '', them: '' } },
    { id: 'd', date: '2026-10-10', status: 'scheduled' },
    { id: 'e', date: '2026-10-11', status: 'forfeit', result: { forfeit: 'them' } },
    { id: 'f', date: '2026-10-12', status: 'cancelled' },
    { id: 'g', date: '2026-11-01', status: 'scheduled' }
  ];
  assert.equal(M.matchOutcome(ms[0]), 'win');
  assert.equal(M.matchOutcome(ms[2]), null);
  const r = M.teamRecord(ms, TODAY);
  assert.deepEqual([r.withResult, r.won, r.drawn, r.lost, r.forfeits, r.awaiting, r.upcoming, r.offField], [3, 2, 1, 0, 1, 2, 1, 1]);
  assert.deepEqual([r.scored, r.conceded, r.diff, r.scoredGames], [7, 5, 2, 2]);
  assert.deepEqual(M.teamRecord([], TODAY).withResult, 0);
});

test('lineup check: composition, injuries and replies', () => {
  const t = team();
  t.players.push({ id: 'p4', name: 'Tom', gender: 'M', status: 'available' }, { id: 'p5', name: 'Liam', gender: 'M', status: 'available' }, { id: 'p6', name: 'Noah', gender: 'M', status: 'available' });
  const lu = { slots: ['p2', 'p3', 'p4', 'p5', 'p6', 'p1', null, null].map((pid, i) => ({ id: 'S' + i, playerId: pid })) };
  const rec = { rsvp: { p1: 'no', p2: 'yes', p4: 'maybe' } };
  const c = M.lineupCheck(t, lu, rec);
  assert.equal(c.males, 5);
  assert.equal(c.ready, false);
  assert.ok(c.issues.some(x => x.includes('2 positions empty')));
  assert.ok(c.issues.some(x => x.includes('5 males')));
  assert.ok(c.issues.some(x => x.includes('Kai Brennan is marked injured')));
  assert.ok(c.issues.some(x => x.includes('Mia Tuala said they can’t play')));
  assert.equal(c.unsure.length, 1);
  assert.equal(c.noReply.length, 3);
});

test('attendance trend: cancelled and unrecorded sessions are not zeros', () => {
  const tr = M.attendanceTrend(team().sessions, TODAY);
  assert.deepEqual(tr.map(x => [x.id, x.status, x.attended]), [['s1', 'recorded', 2], ['s2', 'missing', null], ['s3', 'cancelled', null]]);
});

test('planned against actual only uses sessions with both an RSVP and a roll call', () => {
  const ss = team().sessions;
  ss.push({ id: 's0', date: '2026-09-29', attendance: { p1: 'present' }, rsvp: {} });
  const r = M.plannedVsActual(ss, TODAY);
  assert.equal(r.used, 1);
  assert.deepEqual([r.noRoll, r.noRsvp, r.cancelled], [1, 1, 1]);
  assert.deepEqual(r.rows.yes, { came: 1, missed: 0 });
  assert.deepEqual(r.rows.no, { came: 1, missed: 0 }, 'said no but came (late)');
  assert.deepEqual(r.rows.none, { came: 0, missed: 1 });
});

test('participation, position use and volunteering come from records only', () => {
  const t = team();
  t.matches = [
    { id: 'm1', date: '2026-10-10', status: 'played', lineupId: 'l1', result: { us: 3, them: 1 } },
    { id: 'm2', date: '2026-10-11', status: 'cancelled', lineupId: 'l1' },
    { id: 'm3', date: '2026-11-11', status: 'scheduled', lineupId: 'l1' }
  ];
  const p = M.participation(t, TODAY);
  const mia = p.find(x => x.id === 'p1'), kai = p.find(x => x.id === 'p3');
  assert.deepEqual(mia.training, { recorded: 1, attended: 1, late: 0, apology: 0, pct: 100 });
  assert.deepEqual(mia.rsvp, { asked: 3, yes: 2, no: 0, maybe: 1, none: 0 }, 'the cancelled session is left out');
  assert.deepEqual(mia.matches, { withLineup: 1, named: 1 });
  assert.deepEqual(mia.positions, { LW: 1 });
  assert.equal(kai.training.pct, 0, 'an apology is a recorded absence');
  const fresh = M.participation({ ...t, players: [{ id: 'new', name: 'New' }] }, TODAY)[0];
  assert.equal(fresh.training.pct, null, 'never on a roll call: no figure, not 0%');
  const u = M.positionUsage(t, TODAY);
  assert.equal(u.matches, 1);
  assert.equal(u.use.LW.players.p1, 1);
  const load = M.volunteerLoad({ tasks: [...t.tasks, { id: 'old', date: '2026-10-01', people: [{ who: 'h:h1', status: 'yes' }, { who: 'p:p1', status: 'done' }] },
    { id: 'off', date: '2026-10-01', cancelled: true, people: [{ who: 'p:p1', status: 'done' }] }] }, TODAY);
  assert.deepEqual(M.loadOf(load, 'h:h1'), { done: 0, accepted: 1, invited: 0, declined: 0, unmarked: 1 });
  assert.deepEqual(M.loadOf(load, 'p:p1'), { done: 1, accepted: 0, invited: 1, declined: 0, unmarked: 0 });
  assert.deepEqual(M.loadOf(load, 'p:nobody'), { done: 0, accepted: 0, invited: 0, declined: 0, unmarked: 0 });
});

test('outstanding items and the season summary', () => {
  const t = team();
  t.matches = [{ id: 'm1', date: '2026-10-25', status: 'scheduled', rsvp: { p1: 'yes' } }, { id: 'm0', date: '2026-10-11', status: 'scheduled' }];
  t.messages = [{ id: 'a', status: 'sent' }, { id: 'b' }];
  const o = M.outstanding(t, TODAY);
  assert.deepEqual(o.rsvp.map(x => [x.kind, x.id, x.missing]), [['session', 's4', 1], ['match', 'm1', 1]], 'injured players are not chased');
  assert.deepEqual(o.noLineup, ['m1']);
  assert.deepEqual(o.noResult, ['m0']);
  assert.deepEqual(o.toFind, [{ id: 't2', n: 1 }]);
  assert.deepEqual(o.awaiting.map(x => x.id), ['t1', 't2']);
  assert.equal(o.unconfirmed, 1);
  const s = M.summary(t, '', '', TODAY);
  assert.deepEqual([s.sessions.held, s.sessions.cancelled, s.sessions.recorded, s.sessions.missing, s.sessions.avgAttended], [2, 1, 1, 1, 2]);
  assert.equal(s.matches.awaiting, 1);
  const none = M.summary({ ...t, sessions: [] }, '', '', TODAY);
  assert.equal(none.sessions.avgAttended, null);
});

test('WhatsApp messages are only "sent" once the coach confirms', () => {
  const m = M.logEntry('Hi', 'Mia', 'task:t1:p:p1', '2026-10-18T00:00:00Z');
  assert.equal(M.msgStatus(m), 'prepared');
  assert.equal(M.msgStatus({ text: 'logged before tracking' }), 'prepared');
  M.markSent(m, true, '2026-10-18T00:05:00Z');
  assert.deepEqual([M.msgStatus(m), m.sentAt], ['sent', '2026-10-18T00:05:00Z']);
  M.markSent(m, false);
  assert.equal(M.msgStatus(m), 'prepared');
  assert.equal(M.lastMessage([m], 'task:t1:p:p1'), m);
});

test('library: linked copies, versions, and team edits kept', () => {
  const ws = M.migrateWorkspace(team());
  const t2 = M.addTeam(ws, { ...team(), plays: [], playerSets: [], systems: {} });
  ws.plays = [{ id: 'otb', name: 'Out the back', builtin: true, rev: 3, moves: [1], set: 'custom1' }];
  const r1 = M.libSave(ws, ws, 'plays', 'otb', { setDef: { name: 'League tag', labels: [{ code: 'A', name: 'A' }] } });
  assert.equal(r1.rev, 1);
  const li = M.libGet(ws, 'plays', r1.id);
  assert.ok(!('builtin' in li) && li.setDef.name === 'League tag');
  const copy = M.libAdd(ws, t2, 'plays', r1.id);
  assert.notEqual(copy.id, 'otb');
  assert.equal(t2.playerSets[0].id, 'custom1', 'the play’s player list comes with it');
  assert.equal(M.libStatus(ws, 'plays', copy), 'current');
  assert.equal(M.libAdd(ws, t2, 'plays', r1.id), copy, 'added once');
  // a new library version updates the unedited copy
  ws.plays[0].moves = [1, 2];
  let r2 = M.libSave(ws, ws, 'plays', 'otb');
  assert.deepEqual([r2.rev, r2.updated, r2.kept], [2, [t2.id], []]);
  assert.deepEqual(t2.plays[0].moves, [1, 2]);
  assert.equal(t2.plays[0].id, copy.id, 'the copy keeps its id');
  // an edited copy is kept, and shows a newer version is available
  M.libMarkEdited(t2.plays[0]); t2.plays[0].moves = ['mine'];
  ws.plays[0].moves = [1, 2, 3];
  r2 = M.libSave(ws, ws, 'plays', 'otb');
  assert.deepEqual(r2.kept, [t2.id]);
  assert.deepEqual(t2.plays[0].moves, ['mine']);
  assert.equal(M.libStatus(ws, 'plays', t2.plays[0]), 'edited-behind');
  M.libUpdate(ws, t2, 'plays', copy.id);
  assert.deepEqual(t2.plays[0].moves, [1, 2, 3]);
  assert.equal(M.libStatus(ws, 'plays', t2.plays[0]), 'current');
  assert.deepEqual(M.libUsage(ws, 'plays', r1.id).map(u => u.team.id), ['team1', t2.id]);
  M.libRemove(ws, 'plays', r1.id);
  assert.equal(t2.plays[0].lib, undefined, 'teams keep their copies');
  assert.deepEqual(ws.library.plays, []);
});

test('library game systems are keyed by system and follow the same rules', () => {
  const ws = M.migrateWorkspace(team());
  const t2 = M.addTeam(ws, team());
  ws.systems.slide = { pos: { LW: [1, 2] }, points: ['Talk'] };
  M.libSave(ws, ws, 'systems', 'slide');
  M.libAdd(ws, t2, 'systems', 'slide');
  assert.deepEqual(t2.systems.slide, { pos: { LW: [1, 2] }, points: ['Talk'], lib: { id: 'slide', rev: 1 } });
  ws.systems.slide.points = ['Talk', 'Slide'];
  M.libSave(ws, ws, 'systems', 'slide');
  assert.deepEqual(t2.systems.slide.points, ['Talk', 'Slide']);
  // export and import into another coach's workspace
  const other = M.migrateWorkspace(team());
  assert.deepEqual(M.libImport(other, JSON.parse(JSON.stringify(M.libExport(ws)))), { added: 1, updated: 0, same: 0 });
  assert.equal(M.libImport(other, { format: 'nope' }), null);
  assert.ok(!JSON.stringify(M.libExport(ws)).includes('Mia'), 'no people in a library file');
});

test('three-way merge: one-sided changes combine, two-sided ones are listed', () => {
  const base = M.migrateWorkspace(team());
  const local = JSON.parse(JSON.stringify(base)), remote = JSON.parse(JSON.stringify(base));
  local.players[0].number = '9';                                  // only here
  local.notices.push({ id: 'n1', text: 'Uniforms Saturday' });     // added here
  remote.sessions[0].attendance.p3 = 'absent';                     // only there
  remote.tasks = remote.tasks.filter(x => x.id !== 't2');          // deleted there
  local.players[1].name = 'Joshua Halloran';                       // both
  remote.players[1].name = 'Josh H';
  local.updatedAt = '2026-10-18T02:00:00Z'; remote.updatedAt = '2026-10-18T01:00:00Z';
  const r = M.merge3(base, local, remote);
  assert.ok(r.threeWay);
  assert.deepEqual(r.changes.local.map(c => c.label).sort(), ['Notice: Uniforms Saturday', 'Player: Mia Tuala']);
  assert.deepEqual(r.changes.remote.map(c => c.label).sort(), ['Task: Run the BBQ, 2026-10-24', 'Training: 2026-10-06']);
  assert.deepEqual(r.changes.both.map(c => c.label), ['Player: Joshua Halloran']);
  assert.equal(r.merged.players[0].number, '9');
  assert.equal(r.merged.sessions[0].attendance.p3, 'absent');
  assert.equal(r.merged.tasks.length, 1);
  assert.equal(r.merged.notices.length, 1);
  assert.equal(r.merged.players[1].name, 'Joshua Halloran', 'this device by default');
  assert.equal(r.merged.updatedAt, '2026-10-18T02:00:00Z');
  const m2 = M.resolve(M.merge3(base, local, remote), { [r.changes.both[0].key]: 'remote' });
  assert.equal(m2.players[1].name, 'Josh H');
});

test('merge brings across a team added on one device, and works without a base', () => {
  const base = M.migrateWorkspace(team());
  const local = JSON.parse(JSON.stringify(base)), remote = JSON.parse(JSON.stringify(base));
  M.addTeam(local, { id: 'u16abc', team: { name: 'Under 16s' }, players: [{ id: 'q', name: 'Ava' }], tasks: [], sessions: [] });
  const r = M.merge3(base, local, remote);
  assert.equal(r.merged.teams.length, 1);
  assert.equal(r.merged.teams[0].team.name, 'Under 16s');
  assert.equal(r.merged.teams[0].players[0].name, 'Ava');
  const two = M.merge3(null, local, remote);
  assert.equal(two.threeWay, false);
  assert.ok(two.changes.both.length >= 2, 'every difference is listed when there is no base');
  assert.equal(M.merge3(base, base, JSON.parse(JSON.stringify(base))).changes.both.length, 0, 'identical copies have no differences');
});

test('agenda lists sessions, matches and tasks in order', () => {
  const t = team();
  t.matches = [{ id: 'm1', date: '2026-10-20', start: '09:00', status: 'scheduled', opponent: 'Coffs' }];
  const a = M.agenda(t, TODAY, 14);
  assert.deepEqual(a.map(x => x.kind + ':' + x.id), ['match:m1', 'session:s4', 'task:t1', 'task:t2']);
  t.matches.push({ id: 'm2', date: '2027-03-20', start: '08:00' }, { id: 'm3', date: '2027-03-19', start: '10:00' }, { id: 'm4', date: '2026-12-01', tournament: true });
  assert.deepEqual(M.tournamentDays(t).map(d => [d.date, d.matches.map(m => m.id)]), [['2026-12-01', ['m4']], ['2027-03-19', ['m3']], ['2027-03-20', ['m2']]]);
});

test('clubs: St George Oztag is added once on upgrade, with DragonTag in it', () => {
  const old = { version: 2, ...team() };
  const ws = M.migrateWorkspace(JSON.parse(JSON.stringify(old)));
  assert.deepEqual(ws.clubs.map(c => c.id), ['stgeorge']);
  assert.equal(ws.team.clubId, 'stgeorge');
  assert.equal(M.clubOf(ws, ws).name, 'St George Oztag');
  assert.deepEqual(M.migrateWorkspace(JSON.parse(JSON.stringify(ws))), ws, 'upgrading again changes nothing');
  // a coach who deleted every club doesn't get it back
  M.removeClub(ws, 'stgeorge');
  assert.equal(ws.team.clubId, '');
  assert.deepEqual(M.migrateWorkspace(JSON.parse(JSON.stringify(ws))).clubs, []);
  // a team that isn't DragonTag isn't put in the club
  const other = M.migrateWorkspace({ ...team(), team: { name: 'Hills Hornets' } });
  assert.equal(other.team.clubId || '', '');
});

test('clubs: links to a missing club are cleared, and the players see the public details only', () => {
  const ws = M.migrateWorkspace({ ...team(), team: { name: 'U16', clubId: 'gone' }, clubs: [] });
  assert.equal(ws.team.clubId, '');
  const c = M.normClub({ name: 'St George Oztag', email: 'club@x', officials: [{ role: 'President', name: 'Pat', phone: '0400 000 000' }], notes: 'private' });
  const pub = M.clubForPlayers(c);
  assert.equal(pub.name, 'St George Oztag');
  assert.ok(!('officials' in pub) && !('notes' in pub));
});

test('clubs merge record by record', () => {
  const base = M.migrateWorkspace({ ...team(), team: { name: 'DragonTag Mixed 20s' } });
  const local = JSON.parse(JSON.stringify(base)), remote = JSON.parse(JSON.stringify(base));
  local.clubs[0].homeGround = 'Kogarah Park';
  remote.clubs.push(M.normClub({ id: 'hills', name: 'Hills Oztag' }));
  const r = M.merge3(base, local, remote);
  assert.deepEqual(r.merged.clubs.map(c => c.id).sort(), ['hills', 'stgeorge']);
  assert.equal(r.merged.clubs.find(c => c.id === 'stgeorge').homeGround, 'Kogarah Park');
});

test('the males-on-field check only applies to mixed teams', () => {
  const t = team();
  t.players = Array.from({ length: 8 }, (_, i) => ({ id: 'm' + i, name: 'M' + i, gender: 'M', status: 'available' }));
  const lu = { slots: t.players.map((p, i) => ({ id: 'S' + i, playerId: p.id })) };
  assert.ok(M.lineupCheck(t, lu).issues.some(x => x.includes('males')));
  t.team.category = 'men';
  assert.equal(M.lineupCheck(t, lu).ready, true);
});

test('club logos: a small PNG, JPEG or WebP image kept with the club, nothing else', () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
  assert.equal(M.normClub({ name: 'A', logo: png }).logo, png);
  for (const bad of ['data:image/svg+xml;base64,PHN2Zz4=', 'javascript:alert(1)', 'https://example.com/logo.png', 'data:image/png;base64,' + 'A'.repeat(M.LOGO_MAX), 'data:image/png;base64,abc"onerror=x']) {
    assert.equal(M.normClub({ name: 'A', logo: bad }).logo, '', bad.slice(0, 30));
  }
  assert.ok(M.CLUB_PUBLIC.includes('logo'), 'players see their club’s logo');
  const ws = M.migrateWorkspace({ team: { name: 'T', clubId: 'c1' }, players: [], clubs: [{ id: 'c1', name: 'Club', logo: png }] });
  assert.equal(M.homeClubs(ws)[0].logo, png);
});

test('match-day volunteers added or changed on different devices all survive a merge', () => {
  const base = M.migrateWorkspace(team());
  base.matchOfficials = [{ id: 'v1', name: 'Casey Morgan', clubIds: [], teamIds: [], active: true }];
  const local = JSON.parse(JSON.stringify(base)), remote = JSON.parse(JSON.stringify(base));
  local.matchOfficials.push({ id: 'v2', name: 'Frances Lee', active: true });          // added on this phone
  remote.matchOfficials.push({ id: 'v3', name: 'Priya Shah', active: true });          // added on the laptop
  remote.matchOfficials[0].phone = '0400 000 000';                                     // changed on the laptop
  const r = M.merge3(base, local, remote);
  assert.deepEqual(r.merged.matchOfficials.map(p => p.id).sort(), ['v1', 'v2', 'v3']);
  assert.equal(r.merged.matchOfficials.find(p => p.id === 'v1').phone, '0400 000 000');
  assert.deepEqual(r.changes.local.map(c => c.label), ['Match-day volunteer: Frances Lee']);
  assert.equal(r.changes.both.length, 0);
  // removed on one side only: removed
  const gone = JSON.parse(JSON.stringify(base)); gone.matchOfficials = [];
  assert.equal(M.merge3(base, gone, JSON.parse(JSON.stringify(base))).merged.matchOfficials.length, 0);
  // changed on both sides: listed for the coach to choose
  const a = JSON.parse(JSON.stringify(base)), b = JSON.parse(JSON.stringify(base));
  a.matchOfficials[0].name = 'Casey M'; b.matchOfficials[0].name = 'Casey Morgan-Lee';
  const both = M.merge3(base, a, b);
  assert.deepEqual(both.changes.both.map(c => c.label), ['Match-day volunteer: Casey M']);
  assert.equal(M.resolve(both, { [both.changes.both[0].key]: 'remote' }).matchOfficials[0].name, 'Casey Morgan-Lee');
});
