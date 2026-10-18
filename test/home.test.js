import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../site/model.js';

// Saturday 17 October 2026, 9:00 am local time.
const NOW = new Date(2026, 9, 17, 9, 0);
const day = n => M.addDays('2026-10-17', n);
const squad = (n, prefix = 'p') => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, name: `P ${i}`, gender: i % 2 ? 'M' : 'F', status: 'available' }));
const lineup = (id, players) => ({ id, name: 'L', slots: players.slice(0, 8).map((p, i) => ({ id: `s${i}`, playerId: p.id })) });
const team = (id, name, extra = {}) => ({ id, team: { name, category: 'mixed', clubId: '', ...(extra.team || {}) }, players: [], sessions: [], matches: [], tasks: [], lineups: [], messages: [], notices: [], ...extra, ...{ team: { name, category: 'mixed', clubId: '', rulesSeen: 1, ...(extra.team || {}) } } });
function workspace(teams, clubs = []) {
  const [first, ...rest] = teams;
  return { schema: 3, ...first, id: 'team1', teams: rest, clubs, library: {} };
}

test('one team: Home shows that team, with no choosing', () => {
  const ws = workspace([team('team1', 'DragonTag')]);
  assert.deepEqual(M.homeScope(ws, { kind: 'all' }), { kind: 'team', id: 'team1' });
  const v = M.homeView(ws, null, NOW);
  assert.equal(v.multi, false);
  assert.equal(v.spotlight, null, 'nothing scheduled, nothing to promote');
  assert.deepEqual(v.upcoming, []); assert.deepEqual(v.actions, []);
  assert.equal(v.insight.players, 0, 'a team with no players still gets its summary');
});

test('several clubs: clubs with their active teams, then No club; archived teams left out', () => {
  const ws = workspace([team('team1', 'DragonTag', { team: { clubId: 'stg' } }), team('u16abc', 'Hills U16', { team: { clubId: 'hills' } }),
    team('loose1', 'Social mixed'), team('old111', 'Old team', { team: { clubId: 'stg' }, archived: true })],
  [{ id: 'stg', name: 'St George Oztag', shortName: 'St George' }, { id: 'hills', name: 'Hills Oztag' }, { id: 'empty', name: 'Empty club' }]);
  const clubs = M.homeClubs(ws);
  assert.deepEqual(clubs.map(c => [c.id, c.teams.map(t => t.id)]), [['hills', ['u16abc']], ['stg', ['team1']], [M.NO_CLUB, ['loose1']]]);
  assert.deepEqual(M.homeScope(ws, null), { kind: 'all', id: '' }, 'several teams start on every club');
  assert.deepEqual(M.homeScope(ws, { kind: 'team', id: 'old111' }), { kind: 'all', id: '' }, 'an archived team is not a valid scope');
  assert.deepEqual(M.homeScope(ws, { kind: 'club', id: 'empty' }), { kind: 'all', id: '' }, 'a club with no active teams is not a valid scope');
  assert.deepEqual(M.scopeTeams(ws, { kind: 'club', id: 'stg' }).map(t => t.id), ['team1']);
  assert.deepEqual(M.scopeTeams(ws, { kind: 'club', id: M.NO_CLUB }).map(t => t.id), ['loose1']);
  assert.deepEqual(M.scopeTeams(ws, { kind: 'team', id: 'u16abc' }).map(t => t.id), ['u16abc']);
});

function busy() {
  const P = squad(12);
  const a = team('team1', 'DragonTag', { team: { clubId: 'stg', event: 'State Cup', eventStart: day(10), eventEnd: day(12), venue: 'Coffs' }, players: P, lineups: [lineup('lu1', P)],
    sessions: [{ id: 's1', date: day(0), start: '18:00', end: '19:30', venue: 'Park' }, { id: 's2', date: day(4), start: '18:00' }, { id: 'sx', date: day(2), start: '18:00', cancelled: true }],
    matches: [{ id: 'm1', date: day(5), start: '10:00', opponent: 'Hornets', status: 'scheduled', lineupId: 'lu1', rsvp: Object.fromEntries(P.map(p => [p.id, 'yes'])) },
      { id: 'mp', date: day(3), start: '09:00', opponent: 'Sharks', status: 'postponed' }],
    tasks: [{ id: 't1', title: 'BBQ', kind: 'other', date: day(5), start: '09:00', need: 2, matchId: 'm1', people: [{ who: 'p:p1', status: 'yes' }, { who: 'p:p2', status: 'yes' }] },
      { id: 'tc', title: 'Cancelled job', date: day(1), need: 3, people: [], cancelled: true }] });
  const b = team('u16abc', 'Hills U16', { team: { clubId: 'hills' }, players: squad(10, 'q'),
    matches: [{ id: 'm9', date: day(1), start: '08:00', opponent: 'Wolves', status: 'scheduled', lineupId: '' }] });
  return workspace([a, b], [{ id: 'stg', name: 'St George Oztag' }, { id: 'hills', name: 'Hills Oztag' }]);
}

test('a critical issue in another team outranks the selected team’s routine events', () => {
  const v = M.homeView(busy(), null, NOW);
  assert.equal(v.spotlight.teamId, 'u16abc');
  assert.equal(v.spotlight.level, 1);
  assert.equal(v.spotlight.label, 'Lineup incomplete');
  assert.match(v.spotlight.issues.join(' '), /No lineup yet/);
  assert.equal(v.urgency.u16abc, 'critical'); assert.equal(v.urgency.team1, '');
  const order = v.items.filter(x => x.date).map(x => `${x.level}:${x.kind}:${x.id}`);
  assert.deepEqual(order.slice(0, 2), ['1:match:m9', '2:session:s1'], 'then training tonight (imminent)');
});

test('levels follow the recorded time: 24 and 72 hours, 7 days', () => {
  const v = M.homeView(busy(), { kind: 'team', id: 'team1' }, NOW);
  const lv = Object.fromEntries(v.items.map(x => [x.id, x.level]));
  assert.equal(lv.s1, 2, 'training tonight');
  assert.equal(lv.s2, 3, 'training in 4 days');
  assert.equal(lv.m1, 3, 'a ready match in 5 days');
  assert.equal(lv.t1, 4, 'a covered task is routine');
  assert.equal(lv.event, 4, 'the tournament in 10 days');
  assert.equal(v.spotlight.id, 's1');
  assert.equal(v.spotlight.label, 'Training today');
  // the same match 30 hours away without a lineup is imminent, not critical
  const ws = busy(); ws.teams[0].matches[0].start = '15:00';
  const m = M.homeView(ws, { kind: 'team', id: 'u16abc' }, NOW).spotlight;
  assert.equal(m.level, 2); assert.equal(m.label, 'Match tomorrow');
});

test('without a start time an event counts by calendar day, and nothing is invented', () => {
  const ws = busy(); const m = ws.teams[0].matches[0]; m.start = ''; m.date = day(1);
  const it = M.homeItems(ws, ws.teams[0], NOW).find(x => x.id === 'm9');
  assert.equal(it.timed, false); assert.equal(it.start, ''); assert.equal(it.level, 1);
  m.date = day(2);
  assert.equal(M.homeItems(ws, ws.teams[0], NOW).find(x => x.id === 'm9').level, 2, 'the day after tomorrow is not within 24 hours');
  m.start = '25:99';
  assert.equal(M.homeItems(ws, ws.teams[0], NOW).find(x => x.id === 'm9').timed, false, 'a malformed time counts as not recorded');
  m.date = '2026-13-40';
  assert.equal(M.homeItems(ws, ws.teams[0], NOW).find(x => x.id === 'm9'), undefined, 'a malformed date is skipped');
});

test('times across midnight and events that are over', () => {
  const late = new Date(2026, 9, 17, 23, 30);
  const ws = busy(); ws.teams[0].matches[0].date = day(1); ws.teams[0].matches[0].start = '00:30';
  assert.equal(M.homeItems(ws, ws.teams[0], late).find(x => x.id === 'm9').level, 1, 'an hour away, the next day');
  const after = new Date(2026, 9, 17, 20, 0);
  assert.ok(!M.homeItems(ws, ws, after).some(x => x.id === 's1'), 'training that finished at 7:30 pm is gone at 8 pm');
  assert.ok(M.homeItems(ws, ws, new Date(2026, 9, 17, 19, 0)).some(x => x.id === 's1'), 'still on at 7 pm');
});

test('too few players confirmed with replies missing is critical within 24 hours', () => {
  const P = squad(12);
  const t = team('team1', 'T', { players: P, lineups: [lineup('lu', P)], matches: [{ id: 'm', date: day(0), start: '15:00', opponent: 'X', status: 'scheduled', lineupId: 'lu', rsvp: {} }] });
  const ws = workspace([t]), m = t.matches[0];
  P.slice(0, 8).forEach(p => { m.rsvp[p.id] = 'yes'; });
  let it = M.homeItems(ws, ws, NOW).find(x => x.id === 'm');
  assert.equal(it.level, 2, 'eight confirmed: enough to play, the four missing replies are not critical');
  m.rsvp = { p0: 'yes', p1: 'yes', p9: 'no' };
  it = M.homeItems(ws, ws, NOW).find(x => x.id === 'm');
  assert.equal(it.level, 1); assert.equal(it.label, 'Availability not in');
  assert.ok(it.issues.includes('2 of 8 players confirmed'));
});

test('transport and volunteers within 24 hours', () => {
  const t = team('team1', 'T', { tasks: [
    { id: 'lift', kind: 'lift', title: 'Lifts', date: day(0), start: '17:00', people: [{ who: 'p:a', role: 'rider', status: 'yes' }] },
    { id: 'bbq', title: 'BBQ', date: day(1), need: 2, people: [{ who: 'h:x', status: 'asked' }] },
    { id: 'far', title: 'Canteen', date: day(20), need: 2, people: [] }] });
  const items = M.homeItems(workspace([t]), workspace([t]), NOW);
  const by = id => items.find(x => x.id === id);
  assert.equal(by('lift').level, 1); assert.equal(by('lift').label, 'Transport needs confirmation');
  assert.equal(by('bbq').level, 1); assert.match(by('bbq').issues[0], /2 of 2 spots not confirmed \(1 invited\)/);
  assert.equal(by('far').level, 4, 'short of people, but three weeks away');
});

test('upcoming: one list in time order, tasks under their event, cancelled and postponed apart', () => {
  const v = M.homeView(busy(), null, NOW);
  assert.deepEqual(v.upcoming.map(x => x.id), ['s1', 'm9', 's2', 'm1', 'event']);
  const m1 = v.upcoming.find(x => x.id === 'm1');
  assert.deepEqual(m1.subs.map(x => x.id), ['t1'], 'the BBQ shows under its match, not twice');
  assert.ok(!v.upcoming.some(x => ['tc', 'sx', 'mp'].includes(x.id)), 'nothing cancelled or postponed in the list');
  assert.deepEqual(v.changed.map(x => [x.id, x.status]), [['sx', 'Cancelled'], ['mp', 'Postponed']]);
  assert.deepEqual(M.homeView(busy(), null, NOW, { days: 7 }).upcoming.map(x => x.id), ['s1', 'm9', 's2', 'm1']);
  // the parent match is cancelled: the task stands on its own
  const ws = busy(); ws.matches[0].status = 'cancelled';
  const u = M.homeView(ws, { kind: 'team', id: 'team1' }, NOW).upcoming;
  assert.ok(u.some(x => x.id === 't1') && !u.some(x => x.id === 'm1'));
});

test('outstanding actions: each tied to its team and record, without repeating the spotlight', () => {
  const ws = busy();
  ws.teams[0].tasks = [{ id: 'q1', title: 'Canteen', date: day(6), need: 2, people: [] }];
  ws.messages = [{ id: 'msg', status: 'prepared', text: 'x' }];
  const v = M.homeView(ws, null, NOW);
  assert.equal(v.spotlight.id, 'm9');
  assert.ok(!v.actions.some(a => a.recId === 'm9'), 'the spotlight match is not repeated');
  assert.ok(v.featured >= 1);
  const can = v.actions.find(a => a.recId === 'q1');
  assert.equal(can.teamId, 'u16abc'); assert.equal(can.act, 'task-open'); assert.equal(can.title, '2 volunteer spots still to find');
  assert.ok(v.actions.some(a => a.kind === 'messages' && a.teamId === 'team1'));
  assert.ok(!v.actions.some(a => a.recId === 'tc'), 'a cancelled task is not work');
  const club = M.homeView(ws, { kind: 'club', id: 'stg' }, NOW);
  assert.ok(club.actions.every(a => a.teamId === 'team1') && club.upcoming.every(x => x.teamId === 'team1'), 'a club scope only has its teams');
});

test('rule updates, results to enter: no deadline, after dated items of the same level', () => {
  const ws = busy();
  ws.team.rulesSeen = 0;
  ws.matches.push({ id: 'old', date: day(-7), start: '10:00', opponent: 'Past', status: 'scheduled' });
  const v = M.homeView(ws, { kind: 'team', id: 'team1' }, NOW);
  const lv3 = v.items.filter(x => x.level === 3).map(x => x.kind);
  assert.deepEqual(lv3, ['session', 'match', 'rules', 'result']);
  assert.ok(v.actions.some(a => a.kind === 'rules' && a.act === 'rules-review'));
  assert.ok(v.actions.some(a => a.kind === 'result' && a.recId === 'old'));
});

test('the same data always gives the same order', () => {
  const ws = busy();
  ws.teams[0].matches.push({ id: 'm8', date: day(1), start: '08:00', opponent: 'Bears', status: 'scheduled' });
  const a = M.homeView(ws, null, NOW).items.map(x => x.id), b = M.homeView(busy(), null, NOW) && M.homeView(ws, null, NOW).items.map(x => x.id);
  assert.deepEqual(a, b);
  assert.deepEqual(a.slice(0, 2), ['m8', 'm9'], 'same level and time: by record id');
});

test('the players’ copy gives nothing private', () => {
  const ws = busy(), t = ws.teams[0];
  const items = M.homeItems(null, t, NOW, false);
  assert.ok(items.every(x => !x.issues.some(i => /lineup|availability|confirmed/i.test(i))));
  assert.ok(!items.some(x => ['rules', 'result', 'messages'].includes(x.kind)));
});

test('team summary for Home', () => {
  const ws = busy();
  ws.sessions.push({ id: 'r1', date: day(-3), start: '18:00', attendance: { p0: 'present', p1: 'late', p2: 'absent' } });
  ws.players[3].status = 'injured';
  const s = M.teamInsight(ws, NOW);
  assert.equal(s.players, 12); assert.equal(s.available, 11); assert.equal(s.injured, 1);
  assert.deepEqual(s.attendance, [{ date: day(-3), attended: 2 }]);
  assert.equal(s.event.state, 'before'); assert.equal(s.event.days, 10);
});
