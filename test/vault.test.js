import test from 'node:test';
import assert from 'node:assert/strict';
import { makeLock, seal, unseal, openFile, teamView, toB64Url, fromB64Url, exportKey, importKey, newSalt, toB64, fromB64 } from '../site/vault.js';

// Low iteration count keeps the tests quick; the app uses 600,000.
const FAST = 1000;

const sample = {
  team: { name: 'DragonTag Mixed 20s', event: 'NSW State Cup', eventStart: '2027-03-19', maxMales: 4, positions: ['Wing'] },
  players: [
    { id: 'p1', name: 'Mia Tuala', gender: 'F', number: '4', positions: ['Half'], phone: '0412 345 678', status: 'injured', notes: 'hamstring' }
  ],
  sessions: [{ id: 's1', date: '2026-10-20', start: '18:00', venue: 'Field 2', notes: 'Bring water', cancelled: false, attendance: { p1: 'absent' } }],
  lineups: [{ id: 'l1', name: 'Starting 8', slots: [{ id: 'LW', label: 'LW', name: 'Left wing', group: 'Wing', x: 5, y: 60, playerId: 'p1' }] }],
  messages: [{ id: 'm1', text: 'private log' }],
  notices: [{ id: 'n1', at: '2026-10-14T00:00:00Z', text: 'Uniforms Saturday' }],
  teamPass: 'team-secret-123', teamSalt: 'abc', updatedAt: '2026-10-14T01:00:00Z'
};

test('seal and open round trip with a password', async () => {
  const lock = await makeLock('correct horse battery', newSalt(), FAST);
  const file = await seal(sample, lock, 'coach');
  assert.equal(file.role, 'coach');
  assert.ok(!JSON.stringify(file).includes('Mia'), 'ciphertext must not contain plain text');
  const { value } = await openFile(file, 'correct horse battery', 'coach');
  assert.deepEqual(value, sample);
});

test('the wrong password is rejected', async () => {
  const lock = await makeLock('right password', newSalt(), FAST);
  const file = await seal(sample, lock, 'team');
  await assert.rejects(openFile(file, 'wrong password', 'team'), e => e.code === 'WRONG');
});

test('a file cannot be relabelled as the other role', async () => {
  const lock = await makeLock('shared password', newSalt(), FAST);
  const file = await seal(sample, lock, 'team');
  await assert.rejects(openFile(file, 'shared password', 'coach'), e => e.code === 'WRONG');
  await assert.rejects(unseal({ ...file, role: 'coach' }, lock.key), e => e.code === 'WRONG');
});

test('tampering is detected', async () => {
  const lock = await makeLock('pw-pw-pw-pw', newSalt(), FAST);
  const file = await seal(sample, lock, 'team');
  const bytes = fromB64(file.data); bytes[5] ^= 1;
  await assert.rejects(unseal({ ...file, data: toB64(bytes) }, lock.key), e => e.code === 'WRONG');
});

test('a remembered key opens the file, but not after the password changes', async () => {
  const lock = await makeLock('first password', newSalt(), FAST);
  const file = await seal(sample, lock, 'team');
  const remembered = { key: await importKey(await exportKey(lock.key)), salt: lock.salt, iterations: FAST };
  assert.equal((await openFile(file, remembered, 'team')).value.team.name, sample.team.name);
  const changed = await seal(sample, await makeLock('second password', newSalt(), FAST), 'team');
  await assert.rejects(openFile(changed, remembered, 'team'), e => e.code === 'WRONG');
});

test('the team view leaves out everything private', () => {
  const v = teamView(sample);
  const text = JSON.stringify(v);
  for (const secret of ['0412', 'injured', 'hamstring', 'absent', 'attendance', 'private log', 'team-secret-123', 'teamSalt', 'phone', 'status']) {
    assert.ok(!text.includes(secret), `team view leaked "${secret}"`);
  }
  assert.equal(v.players[0].name, 'Mia Tuala');
  assert.equal(v.sessions[0].notes, 'Bring water');
  assert.equal(v.lineups[0].slots[0].playerId, 'p1');
  assert.equal(v.notices[0].text, 'Uniforms Saturday');
});

test('invite links survive any password characters', () => {
  for (const pw of ['plain', 'with spaces & symbols/+=?', 'Grace O’Brien 🏉']) {
    const enc = toB64Url(pw);
    assert.match(enc, /^[A-Za-z0-9_-]*$/);
    assert.equal(fromB64Url(enc), pw);
  }
});
