import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as M from '../site/model.js';
import { RULES } from '../site/rules.js';
import { compare, isWatchFile } from '../src/rules-watch.js';
import { build } from '../src/build.js';

const allRuleIds = () => new Set(M.ruleSetList().flatMap(x => M.ruleSet(x.id).rules.map(r => r.id)));

test('every rule set resolves, with unique rule ids, a reference and a known rule book', () => {
  const sets = M.ruleSetList();
  assert.ok(sets.length >= 15);
  for (const { id } of sets) {
    const rs = M.ruleSet(id);
    assert.ok(rs, id);
    assert.equal(new Set(rs.rules.map(r => r.id)).size, rs.rules.length, `${id}: duplicate rule ids`);
    rs.rules.forEach(r => { assert.ok(r.text && r.ref && r.topic, `${id}: ${r.id} is missing words, a reference or a topic`); });
    assert.ok(rs.source && rs.source.url.startsWith('https://') && /^\d{4}-\d\d-\d\d$/.test(rs.source.checked), `${id}: rule book`);
    assert.ok(Number.isFinite(rs.values.players) && rs.values.set === 6, `${id}: values`);
  }
});

test('a grade replaces the base rule with the same id and keeps the rest', () => {
  const u13 = M.ruleSet('league/u13-14'), open = M.ruleSet('league/men');
  assert.equal(u13.values.defence, 5);
  assert.equal(open.values.defence, 10);
  assert.match(u13.rules.find(r => r.id === 'league.defence').text, /5 m/);
  assert.equal(u13.rules.length, open.rules.length);
  const mixed = M.ruleSet('oztag/mixed');
  assert.equal(mixed.values.maxMales, 4);
  assert.ok(mixed.rules.some(r => r.id === 'oztag.mixed.try'));
  assert.ok(!M.ruleSet('oztag/men').rules.some(r => r.id === 'oztag.mixed.try'));
  assert.equal(M.ruleSet('nope/x'), null);
  assert.equal(M.ruleSet(''), null);
});

test('the Oztag rule set follows the Australian Oztag rule book', () => {
  const r = Object.fromEntries(M.ruleSet('oztag/mixed').rules.map(x => [x.id, x]));
  assert.match(r['oztag.kick.allowed'].text, /any tag/);
  assert.match(r['oztag.kick.overline'].text, /tap 10 m out/);
  assert.equal(r['oztag.kick.overline'].ref, '7.22–7.24, 7.28');
  assert.match(r['oztag.mixed.try'].text, /female try is worth 2/);
  assert.equal(M.ruleSet('oztag/mixed').values.defence, 7);
});

test('a team gets a rule set from its club’s sport and category unless it chose one', () => {
  assert.equal(M.defaultRuleSet({ category: 'mixed' }, { sport: 'Oztag' }), 'oztag/mixed');
  assert.equal(M.defaultRuleSet({ category: 'women' }, null), 'oztag/women');
  assert.equal(M.defaultRuleSet({ category: 'boys' }, { sport: 'Oztag' }), 'oztag/juniors');
  assert.equal(M.defaultRuleSet({ category: 'boys', ageGroup: 'Under 12' }, { sport: 'Rugby league' }), 'league/u12');
  assert.equal(M.defaultRuleSet({ category: 'women', ageGroup: 'Open' }, { sport: 'Rugby league' }), 'league/women');
  assert.equal(M.defaultRuleSet({ category: 'girls', ageGroup: '8-9' }, { sport: 'League tag' }), 'league-tag/8-9');
  assert.equal(M.ruleSetId({ rules: 'league/men', category: 'mixed' }, { sport: 'Oztag' }), 'league/men');
  assert.equal(M.ruleSetId({ rules: 'gone/away', category: 'mixed' }, null), 'oztag/mixed', 'a rule set that no longer exists falls back');
});

test('most males on field comes from the rule set unless the team has its own number', () => {
  assert.equal(M.maxMalesOf({ category: 'mixed' }), 4);
  assert.equal(M.maxMalesOf({ category: 'mixed', maxMales: '' }), 4);
  assert.equal(M.maxMalesOf({ category: 'mixed', maxMales: 3 }), 3);
  assert.equal(M.maxMalesOf({ category: 'mixed', maxMales: 0 }), 0);
  const t = { team: { category: 'mixed', maxMales: '' }, players: [1, 2, 3, 4, 5].map(i => ({ id: 'p' + i, gender: 'M', status: 'available' })), lineups: [], matches: [] };
  const lu = { slots: t.players.map(p => ({ playerId: p.id })) };
  assert.equal(M.lineupCheck(t, lu, null).maxMales, 4);
});

test('rule updates: what is new for a team, and what it affects', () => {
  const R = { ...RULES, changes: [...RULES.changes, { pack: 2, date: '2027-01-10', sports: ['oztag'], summary: 'Kick height', rules: ['oztag.kick.height'] }, { pack: 3, date: '2027-02-01', sports: ['league'], summary: 'League', rules: ['league.kick'] }] };
  assert.deepEqual(M.rulesNew({}, 'oztag', R).map(c => c.pack), [2, 1]);
  assert.deepEqual(M.rulesNew({ rulesSeen: 1 }, 'oztag', R).map(c => c.pack), [2]);
  assert.deepEqual(M.rulesNew({ rulesSeen: 3 }, 'oztag', R), []);
  assert.deepEqual(M.rulesNew({ rulesSeen: 1 }, 'league', R).map(c => c.pack), [3]);
  const items = [{ kind: 'system', id: 'kick', rules: ['oztag.kick.height', 'oztag.kick.touch'] }, { kind: 'play', id: 'q', rules: ['oztag.ptb'] }];
  const bylaws = [{ id: 'b1', text: 'Kicks below the hip', replaces: 'oztag.kick.height' }, { id: 'b2', text: 'Games 2 × 15', replaces: '' }];
  const rv = M.ruleReview(M.rulesNew({ rulesSeen: 1 }, 'oztag', R), items, bylaws);
  assert.deepEqual(rv.ids, ['oztag.kick.height']);
  assert.deepEqual(rv.items.map(x => [x.id, x.hit]), [['kick', ['oztag.kick.height']]]);
  assert.deepEqual(rv.bylaws.map(b => b.id), ['b1']);
});

test('every rule id named by a change, a game system or a starter play exists', () => {
  const ids = allRuleIds();
  RULES.changes.forEach(c => c.rules.forEach(id => assert.ok(ids.has(id), `change ${c.pack}: ${id}`)));
  const app = fs.readFileSync('site/app.js', 'utf8');
  const named = [...app.matchAll(/rules: \[([^\]]*)\]/g), ...app.matchAll(/'[a-z-]+': \[('oztag\.[^\]]*)\]/g)].flatMap(m => [...m[1].matchAll(/'([a-z0-9.-]+)'/g)].map(x => x[1]));
  assert.ok(named.length > 20);
  named.forEach(id => assert.ok(ids.has(id), `app.js names a rule that doesn't exist: ${id}`));
  assert.equal(RULES.pack, Math.max(...RULES.changes.map(c => c.pack)), 'the pack number is the latest change');
});

test('the game systems no longer use the old kicking assumptions', () => {
  const app = fs.readFileSync('site/app.js', 'utf8'), start = app.indexOf('const SYSTEMS = ['), sys = app.slice(start, app.indexOf('\n];', start));
  assert.doesNotMatch(sys, /no kicks on|they can’t kick|line drop-out|by-law holds/i);
  assert.match(sys, /legal on any tag/);
  assert.match(sys, /50\/10/);
});

test('by-laws keep their shape', () => {
  assert.deepEqual(M.normBylaw({ id: 'a', text: '  Games 2 × 15  ', extra: 1 }), { id: 'a', topic: 'Other', text: 'Games 2 × 15', replaces: '' });
});

test('rules watch: a changed fingerprint is noted, a failed download keeps the last one', () => {
  const t1 = '2026-10-19T08:00:00.000Z', t2 = '2026-10-26T08:00:00.000Z', url = 'https://example.com/a.pdf';
  const a = 'a'.repeat(64), b = 'b'.repeat(64);
  const first = compare(null, { oztag: { url, status: 200, sha256: a, bytes: 10 } }, 1, t1);
  assert.equal(first.first, true); assert.deepEqual(first.changed, []);
  assert.equal(first.watch.sources.oztag.firstSeen, t1);
  const same = compare(first.watch, { oztag: { url, status: 200, sha256: a, bytes: 10 } }, 1, t2);
  assert.deepEqual(same.changed, []); assert.equal(same.watch.sources.oztag.changedAt, null);
  const changed = compare(same.watch, { oztag: { url, status: 200, sha256: b, bytes: 12 } }, 1, t2);
  assert.deepEqual(changed.changed, ['oztag']); assert.equal(changed.watch.sources.oztag.changedAt, t2);
  const failed = compare(changed.watch, { oztag: { url, status: 503, error: 'HTTP 503' } }, 1, t2);
  assert.equal(failed.watch.sources.oztag.sha256, b); assert.equal(failed.watch.sources.oztag.error, 'HTTP 503');
  assert.ok(isWatchFile(JSON.stringify(changed.watch)) && isWatchFile(JSON.stringify(failed.watch)));
  assert.deepEqual(M.sourceAlerts({ sources: { oztag: { changedAt: '2026-10-26T08:00:00.000Z' } } }).map(x => x.id), ['oztag']);
  assert.deepEqual(M.sourceAlerts({ sources: { oztag: { changedAt: '2026-10-01T08:00:00.000Z' } } }), [], 'a change before the rules were checked is already dealt with');
});

test('rules watch: only a file in the exact shape is published with the site', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-watch-')), watchDir = path.join(dir, 'w'), outDir = path.join(dir, 'dist');
  fs.mkdirSync(watchDir);
  const good = compare(null, { oztag: { url: 'https://example.com/a.pdf', status: 200, sha256: 'c'.repeat(64), bytes: 1 } }, 1, '2026-10-19T08:00:00.000Z').watch;
  const quiet = () => {};
  fs.writeFileSync(path.join(watchDir, 'rules-watch.json'), JSON.stringify(good));
  build({ dataDir: path.join(dir, 'none'), outDir, watchDir, log: quiet, version: 'v1' });
  assert.ok(fs.existsSync(path.join(outDir, 'data', 'rules-watch.json')));
  for (const bad of [{ ...good, extra: '<script>' }, { ...good, sources: { oztag: { ...good.sources.oztag, url: 'javascript:alert(1)' } } }, { ...good, sources: { oztag: { ...good.sources.oztag, note: 'x' } } }]) {
    fs.writeFileSync(path.join(watchDir, 'rules-watch.json'), JSON.stringify(bad));
    build({ dataDir: path.join(dir, 'none'), outDir, watchDir, log: quiet, version: 'v1' });
    assert.ok(!fs.existsSync(path.join(outDir, 'data', 'rules-watch.json')));
  }
  assert.match(fs.readFileSync(path.join(outDir, 'model.js'), 'utf8'), /from '\.\/rules\.js\?v=v1'/, 'the rules module is stamped with the release too');
});
