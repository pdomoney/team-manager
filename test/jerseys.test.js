// Jersey records: issue, return, undo, correction (removal), replacement, seasons, and the two reports.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../site/model.js';
import { makeLock, seal, unseal, newSalt, teamView } from '../site/vault.js';

const NOW = new Date(2026, 3, 1, 9, 0);
const ws0 = () => M.migrateWorkspace({ schema: 3, id: 'team1', team: { name: 'Test Team', season: 'Winter 2026', jerseyLoan: true },
  players: [{ id: 'emma', name: 'Player E', number: '', positions: [], status: 'available' }, { id: 'fay', name: 'Player F', number: '', positions: [], status: 'available' }],
  sessions: [], matches: [], tasks: [], teams: [], library: {} });
// What happens on every save in the app (save() → claimRecords, syncJerseys), then a reload: the
// workspace goes through JSON and the upgrade path again, as it does when it's opened.
const save = (ws, day) => { M.claimRecords(ws); M.syncJerseys(ws, day); return ws; };
const reload = ws => M.migrateWorkspace(JSON.parse(JSON.stringify(ws)));
const P = (ws, id) => ws.players.find(p => p.id === id);
const live = p => M.liveLoans(p).map(j => [j.number, j.back]);

test('scenarios 1–4: first issue once, saving again makes no more, a return is kept and not re-issued', () => {
  let ws = ws0(); const e = () => P(ws, 'emma');
  e().number = '7'; save(ws, '2026-04-01');
  assert.deepEqual(live(e()), [['7', '']], '1. one issue record');
  assert.equal(e().jerseys[0].out, '2026-04-01');
  for (let i = 0; i < 5; i++) { save(ws, '2026-04-0' + (i + 2)); ws = reload(ws); }
  assert.equal(e().jerseys.length, 1, '2. no duplicates after repeated saves and reloads');
  assert.ok(M.returnJersey(e(), e().jerseys[0].id, '2026-05-01'));
  save(ws, '2026-05-01'); ws = reload(ws); save(ws, '2026-05-02');
  assert.deepEqual(live(e()), [['7', '2026-05-01']], '3–4. the record keeps its return and nothing new is issued');
});

test('scenario 5: a record removed as a mistake stays removed after save, reload, encryption and publishing', async () => {
  let ws = ws0(); const e = () => P(ws, 'emma');
  e().number = '7'; save(ws, '2026-04-01');
  const id = e().jerseys[0].id;
  assert.ok(M.removeLoan(e(), id, '2026-04-02'));
  save(ws, '2026-04-02');
  assert.deepEqual(live(e()), [], 'not recreated on save');
  ws = reload(ws); save(ws, '2026-04-03');
  assert.deepEqual(live(e()), [], 'not recreated after reload');
  assert.equal(e().jerseys.length, 1, 'kept, marked void, rather than deleted');
  assert.equal(e().jerseys[0].void, '2026-04-02');
  const lock = await makeLock('test-only-password', newSalt(), 1000);
  ws = M.migrateWorkspace(await unseal(await seal(ws, lock, 'coach'), lock.key)); save(ws, '2026-04-04');
  assert.deepEqual(live(e()), [], 'not recreated after the coach file is encrypted and opened again');
  assert.ok(!JSON.stringify(teamView(M.activeLens(ws), null)).includes('jerseys'), 'no jersey records in the players’ copy');
  // another phone that still had the record: the void flag merges through like any change to the player
  const base = reload(ws0()); P(base, 'emma').number = '7'; save(base, '2026-04-01');
  const other = reload(base), mine = reload(ws);
  const m = M.merge3(base, mine, other);
  assert.equal(m.changes.both.length, 0);
  assert.deepEqual(live(P(M.migrateWorkspace(m.merged), 'emma')), [], 'the removal wins over the unchanged copy');
  assert.ok(!M.removeLoan(e(), id), 'removing it again does nothing');
  assert.ok(!M.returnJersey(e(), id, '2026-04-05') && !M.undoReturn(e(), id), 'a removed record can’t be returned or undone');
});

test('scenarios 6–8: a new number keeps the old jersey; each is returned on its own; undo makes no new record', () => {
  const ws = ws0(), e = P(ws, 'emma');
  e.number = '7'; save(ws, '2026-04-01');
  e.number = '12'; save(ws, '2026-04-08');
  assert.deepEqual(live(e), [['7', ''], ['12', '']], '6. #7 is kept and #12 is a new issue');
  assert.deepEqual(M.openLoans(e).map(j => j.number), ['7', '12'], 'two outstanding at once');
  const [j7, j12] = e.jerseys;
  M.returnJersey(e, j7.id, '2026-04-09'); save(ws, '2026-04-09');
  assert.deepEqual(live(e), [['7', '2026-04-09'], ['12', '']], '7. #7 back, #12 still out');
  e.number = '7'; save(ws, '2026-04-10');
  assert.equal(e.jerseys.length, 2, 'going back to #7 this season doesn’t issue it again');
  assert.ok(M.undoReturn(e, j7.id)); save(ws, '2026-04-11');
  assert.deepEqual(live(e), [['7', ''], ['12', '']], '8. undo reinstates the same record');
  assert.equal(e.jerseys.length, 2);
  assert.equal(e.jerseys[0].id, j7.id); assert.equal(e.jerseys[1].id, j12.id);
});

test('scenario 9: a replacement is issued on purpose, after a return or a correction, and normal issues still happen', () => {
  const ws = ws0(), e = P(ws, 'emma'), f = P(ws, 'fay'), sid = M.activeSeason(ws).id;
  e.number = '7'; save(ws, '2026-04-01');
  M.returnJersey(e, e.jerseys[0].id, '2026-04-02');
  const r = M.issueJersey(e, e.number, sid, '2026-04-03'); save(ws, '2026-04-03');
  assert.ok(r && r.manual);
  assert.deepEqual(live(e), [['7', '2026-04-02'], ['7', '']], 'a second #7, issued by hand');
  M.removeLoan(e, r.id, '2026-04-04'); save(ws, '2026-04-04');
  const r2 = M.issueJersey(e, '7', sid, '2026-04-05'); save(ws, '2026-04-05');
  assert.equal(M.openLoans(e).length, 1, 'issued again after a correction'); assert.equal(M.openLoans(e)[0].id, r2.id);
  assert.equal(M.issueJersey(e, '', sid, '2026-04-05'), null, 'needs a number');
  f.number = '3'; save(ws, '2026-04-06');
  assert.deepEqual(live(f), [['3', '']], 'other players still get their jersey automatically');
});

test('auto-issued records have the same id on two phones, so they don’t clash or double up', () => {
  const base = ws0(), a = reload(base), b = reload(base);
  P(a, 'emma').number = '7'; save(a, '2026-04-01');
  P(b, 'emma').number = '7'; save(b, '2026-04-01');
  const m = M.merge3(base, a, b);
  assert.equal(m.changes.both.length, 0, 'identical records: nothing to resolve');
  assert.equal(P(m.merged, 'emma').jerseys.length, 1);
});

test('the Emma example: 2026 #7 issued and returned, 2027 #12 out; each report says only what it should', () => {
  const ws = ws0(), e = () => P(ws, 'emma');
  e().number = '7'; save(ws, '2026-04-01');
  P(ws, 'fay').number = '9'; save(ws, '2026-04-01');
  M.returnJersey(e(), e().jerseys[0].id, '2026-09-01');
  const s26 = M.activeSeason(ws).id;
  const r = M.rollover(ws, { name: 'Winter 2027', start: '2027-03-01', activate: true, carry: [{ playerId: 'emma', number: '12' }] }, new Date(2027, 2, 1));
  save(ws, '2027-03-05');
  const s27 = r.season.id;
  assert.equal(M.findSeason(ws, s26).status, 'completed');
  const h26 = M.seasonJerseys(ws, s26), h27 = M.seasonJerseys(ws, s27), inv = M.jerseyInventory(ws);
  const rowsOf = (rep, id) => rep.rows.filter(x => x.playerId === id).map(x => [x.loan && x.loan.number, x.status]);
  assert.deepEqual(rowsOf(h26, 'emma'), [['7', 'returned']], '2026: #7 returned, nothing about 2027');
  assert.equal(h26.rows.find(x => x.playerId === 'emma').loan.back, '2026-09-01', 'with its return date');
  assert.deepEqual(rowsOf(h26, 'fay'), [['9', 'out']], 'a 2026 jersey that never came back is still out in its own season');
  assert.deepEqual(rowsOf(h27, 'emma'), [['12', 'out']], '2027: #12 out');
  assert.ok(!h27.rows.some(x => x.playerId === 'fay'), 'Fay isn’t in the 2027 squad and got nothing in 2027');
  assert.deepEqual(inv.rows.map(x => [x.playerId, x.loan.number, x.season, x.inSquad]), [['fay', '9', 'Winter 2026', false], ['emma', '12', 'Winter 2027', true]],
    'out now: Fay (left, still holding her 2026 jersey) first, then Emma #12');
  assert.deepEqual([inv.out, inv.gone], [2, 1]);
  // counts are counts of the rows shown
  for (const rep of [h26, h27]) {
    const n = k => rep.rows.filter(x => x.status === k).length;
    assert.deepEqual([rep.out, rep.returned, rep.carried, rep.none, rep.issued], [n('out'), n('returned'), n('carried'), n('none'), n('out') + n('returned')]);
  }
  assert.deepEqual([h26.issued, h26.out, h26.returned], [2, 1, 1]);
  // reporting changes nothing
  const before = M.stable(ws); M.seasonJerseys(ws, s26); M.jerseyInventory(ws); assert.equal(M.stable(ws), before);
});

test('carried over: a jersey still held from last season shows in the new season with its origin, not as a new one', () => {
  const ws = ws0(), e = () => P(ws, 'emma');
  e().number = '7'; save(ws, '2026-04-01');
  const s26 = M.activeSeason(ws).id;
  const r = M.rollover(ws, { name: 'Winter 2027', activate: true, carry: [{ playerId: 'emma', number: '7' }, { playerId: 'fay', number: '' }] }, new Date(2027, 2, 1));
  save(ws, '2027-03-05');
  assert.equal(e().jerseys.length, 1, 'same number still out: no new issue at rollover');
  const h27 = M.seasonJerseys(ws, r.season.id);
  assert.deepEqual(h27.rows.map(x => [x.playerId, x.status, x.loan && x.loan.seasonId]), [['emma', 'carried', s26], ['fay', 'none', null]]);
  assert.deepEqual([h27.issued, h27.carried, h27.none], [0, 1, 1]);
  assert.equal(M.jerseyInventory(ws).rows[0].season, 'Winter 2026', 'origin season kept');
  M.returnJersey(e(), e().jerseys[0].id, '2027-03-10'); save(ws, '2027-03-11');
  assert.equal(e().jerseys.length, 2, 'handed back in 2027 with the number still set: the next save issues a 2027 jersey');
  assert.deepEqual(M.seasonJerseys(ws, s26).rows.map(x => [x.playerId, x.status]), [['emma', 'returned'], ['fay', 'none']], '2026 shows it came back');
});

test('legacy jerseys (no date out) are labelled, and upgrading twice changes nothing', () => {
  const ws = M.migrateWorkspace({ schema: 3, id: 'team1', team: { name: 'T', jerseyLoan: true }, players: [{ id: 'a', name: 'A', number: '4', positions: [], status: 'available' }], teams: [], library: {} });
  const a = P(ws, 'a');
  assert.deepEqual(a.jerseys.map(j => [j.id, j.number, j.out]), [['j-a', '4', '']]);
  assert.equal(M.stable(reload(ws)), M.stable(ws));
  save(ws, '2026-04-01'); assert.equal(a.jerseys.length, 1);
  M.removeLoan(a, 'j-a', '2026-04-01');
  const again = reload(ws);
  assert.equal(M.stable(reload(again)), M.stable(again), 'a void record survives upgrading, unchanged');
  assert.deepEqual(M.liveLoans(P(again, 'a')), []);
});
