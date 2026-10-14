import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build, isEncryptedFile } from '../src/build.js';
import { makeLock, seal, newSalt } from '../site/vault.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'team-build-'));
const quiet = () => {};

test('publishes encrypted files alongside the app', async () => {
  const dataDir = tmp(), outDir = path.join(tmp(), 'dist');
  const lock = await makeLock('a long coach password', newSalt(), 1000);
  fs.writeFileSync(path.join(dataDir, 'team.enc.json'), JSON.stringify(await seal({ players: [{ name: 'Mia' }] }, lock, 'team')));
  fs.writeFileSync(path.join(dataDir, 'coach.enc.json'), JSON.stringify(await seal({ secret: 1 }, lock, 'coach')));
  fs.writeFileSync(path.join(dataDir, 'notes.txt'), 'Mia 0412 345 678');
  const published = build({ dataDir, outDir, log: quiet });
  assert.deepEqual(published, ['team.enc.json', 'coach.enc.json']);
  assert.ok(fs.existsSync(path.join(outDir, 'index.html')));
  assert.ok(fs.existsSync(path.join(outDir, 'app.js')));
  assert.ok(!fs.existsSync(path.join(outDir, 'data', 'notes.txt')), 'only known data files are published');
  const all = fs.readdirSync(path.join(outDir, 'data')).map(f => fs.readFileSync(path.join(outDir, 'data', f), 'utf8')).join('');
  assert.ok(!all.includes('Mia'));
});

test('refuses to publish a plain-text data file', () => {
  const dataDir = tmp(), outDir = path.join(tmp(), 'dist');
  fs.writeFileSync(path.join(dataDir, 'team.enc.json'), JSON.stringify({ players: [{ name: 'Mia', phone: '0412' }] }));
  assert.throws(() => build({ dataDir, outDir, log: quiet }), /not an encrypted team file/);
});

test('refuses an encrypted-looking file with extra plain fields', () => {
  assert.equal(isEncryptedFile(JSON.stringify({ format: 'team-manager', role: 'team', salt: 'a', iv: 'b', data: 'c', players: ['Mia'] })), false);
});

test('builds an empty site before the team is set up', () => {
  const outDir = path.join(tmp(), 'dist');
  assert.deepEqual(build({ dataDir: path.join(tmp(), 'missing'), outDir, log: quiet }), []);
  assert.ok(fs.existsSync(path.join(outDir, 'data', 'manifest.json')));
});
