import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  connectedPathEndpoint, changeConnectedPathEndpoint, previewConnectedPathChange
} from '../site/play-connected-path-edit.js';
import { actorEndpointLinks, followActorEndpoints } from '../site/play-actor-links.js';
import { inspectPlayMovementLinks, inspectPlayPhaseContinuity } from '../site/play-movement-link-audit.js';

const copy = x => JSON.parse(JSON.stringify(x));
const golden = JSON.parse(readFileSync(new URL('./fixtures/play-engine-e0-golden.json', import.meta.url), 'utf8'));
const phase = () => ({
  players: { LM: [15, 30], RM: [25, 28], LR: [8, 34] },
  defence: { marker: [18, 24], line: [[12, 20], [28, 20]] },
  moves: [
    { moveId: 'm-e412-pass', linkVersion: 1, t: 'pass',
      actorLinks: { start: 'player:LM', end: 'player:RM' }, pts: [[15, 30], [20, 30], [25, 28]] },
    { moveId: 'm-e412-run', linkVersion: 1, t: 'run',
      actorLinks: { start: 'player:RM' }, pts: [[25, 28], [28, 32], [30, 38]] },
    { moveId: 'm-e412-shift', linkVersion: 1, t: 'shift',
      actorLinks: { start: 'defender:0' }, pts: [[12, 20], [13, 23], [16, 27]] },
    { t: 'run', pts: [[15, 30], [18, 35]], custom: { untouched: true } }
  ]
});

test('E4.12 selected start and end controls expose only phase-local explicit tactical actors', () => {
  const p = phase(), before = JSON.stringify(p);
  const a = connectedPathEndpoint(p, 0, 0), b = connectedPathEndpoint(p, 0, 2);
  assert.equal(a.status, 'linked');
  assert.equal(a.actorKey, 'player:LM');
  assert.equal(b.actorKey, 'player:RM');
  assert.equal(b.status, 'linked');
  assert.ok(a.choices.some(x => x.key === 'player:LR'));
  assert.ok(!a.choices.some(x => x.key === 'defender:0'));
  assert.equal(a.canFree, false, 'a pass cannot be unlinked into a verified pass');
  assert.ok(Object.isFrozen(a.choices) && Object.isFrozen(a.choices[0]));
  assert.equal(JSON.stringify(p), before);
});

test('E4.12 touch-sized picker reassigns run end and then frees it without moving bends', () => {
  const p = phase(), old = copy(p);
  assert.equal(previewConnectedPathChange(p, 1, 2, 'player:LR'), true);
  assert.equal(JSON.stringify(p), JSON.stringify(old), 'preview must not mutate draft');
  assert.equal(changeConnectedPathEndpoint(p, 1, 2, 'player:LR'), true);
  assert.deepEqual(p.moves[1].actorLinks, { start: 'player:RM', end: 'player:LR' });
  assert.deepEqual(p.moves[1].pts, [[25, 28], [28, 32], [8, 34]]);
  assert.equal(inspectPlayMovementLinks(p).issues.length, 0);
  const saved = copy(p);
  assert.equal(changeConnectedPathEndpoint(saved, 1, 2, ''), true);
  assert.deepEqual(saved.moves[1].actorLinks, { start: 'player:RM' });
  assert.deepEqual(saved.moves[1].pts.at(-1), [8, 34]);
  assert.equal(followActorEndpoints(saved, actorEndpointLinks(saved, 'player:LR'), 'player:LR', [9, 35]), 0);
  assert.deepEqual(saved.moves[1].pts.at(-1), [8, 34]);
  assert.deepEqual(saved.moves[0], old.moves[0]);
  assert.deepEqual(saved.moves[3], old.moves[3]);
});

test('E4.12 pass control changes only named passer and receiver; never permits free pass', () => {
  const p = phase(), before = copy(p);
  assert.equal(previewConnectedPathChange(p, 0, 0, 'player:LR'), true);
  assert.equal(changeConnectedPathEndpoint(p, 0, 0, 'player:LR'), true);
  assert.equal(changeConnectedPathEndpoint(p, 0, 2, 'player:LM'), true);
  assert.deepEqual(p.moves[0].actorLinks,
    { start: 'player:LR', end: 'player:LM' });
  assert.deepEqual(p.moves[0].pts, [[8, 34], [20, 30], [15, 30]]);
  assert.equal(previewConnectedPathChange(p, 0, 2, ''), false);
  assert.equal(changeConnectedPathEndpoint(p, 0, 2, ''), false);
  assert.deepEqual(p.moves[1], before.moves[1]);
});

test('E4.12 defender/marker start can be rebound and disconnected without changing destination', () => {
  const p = phase(), prior = copy(p.moves[2]);
  assert.equal(changeConnectedPathEndpoint(p, 2, 0, 'marker'), true);
  assert.deepEqual(p.moves[2].pts, [[18, 24], [13, 23], [16, 27]]);
  assert.equal(changeConnectedPathEndpoint(p, 2, 0, ''), true);
  assert.deepEqual(p.moves[2].pts, [[18, 24], [13, 23], [16, 27]]);
  assert.equal(Object.hasOwn(p.moves[2].actorLinks, 'start'), false);
  assert.deepEqual(p.moves[2].pts.slice(1), prior.pts.slice(1));
  assert.equal(connectedPathEndpoint(p, 2, 0).status, 'free-field');
  assert.equal(connectedPathEndpoint(p, 2, 2), null, 'defender end is always a field point');
});

test('E4.12 reselecting a stale actor repairs only that explicit endpoint', () => {
  const p = phase(); p.moves[1].pts[0] = [24, 30];
  assert.equal(connectedPathEndpoint(p, 1, 0).status, 'needs-repair');
  assert.equal(previewConnectedPathChange(p, 1, 0, 'player:RM'), true);
  assert.equal(changeConnectedPathEndpoint(p, 1, 0, 'player:RM'), true);
  assert.deepEqual(p.moves[1].pts[0], [25, 28]);
  assert.equal(connectedPathEndpoint(p, 1, 0).status, 'linked');
  assert.equal(previewConnectedPathChange(p, 1, 0, 'player:RM'), false);
  assert.equal(changeConnectedPathEndpoint(p, 1, 0, 'player:RM'), false);
});

test('E4.12 overlapping actors and too-short run end fail closed with no draft mutation', () => {
  const p = phase(); p.players.LR = [25, 28];
  const before = JSON.stringify(p);
  assert.equal(previewConnectedPathChange(p, 1, 2, 'player:LR'), false);
  assert.equal(changeConnectedPathEndpoint(p, 1, 2, 'player:LR'), false);
  assert.equal(JSON.stringify(p), before);
  const q = phase(), qBefore = JSON.stringify(q);
  assert.equal(connectedPathEndpoint(q, 1, 2).choices.find(x => x.key === 'player:RM').disabled, true);
  assert.equal(previewConnectedPathChange(q, 1, 2, 'player:RM'), false);
  assert.equal(JSON.stringify(q), qBefore);
});

test('E4.12 legacy, unknown version, nonendpoint handle and broken link shapes remain untouched', () => {
  const invalid = [
    [3, 0], [0, 1], [-1, 0], [99, 0], [2, 2], [0, 5]
  ];
  const p = phase(), before = JSON.stringify(p);
  for (const [i, h] of invalid) {
    assert.equal(connectedPathEndpoint(p, i, h), null);
    assert.equal(previewConnectedPathChange(p, i, h, 'player:RM'), false);
    assert.equal(changeConnectedPathEndpoint(p, i, h, 'player:RM'), false);
  }
  assert.equal(JSON.stringify(p), before);
  for (const damage of [
    p => { p.moves[1].linkVersion = 7; },
    p => { p.moves[1].actorLinks = null; },
    p => { p.moves[1].actorLinks = []; },
    p => { p.moves[1].actorLinks.extra = 'player:LM'; },
    p => { p.moves[1].pts[0] = [-1, 22]; },
    p => { p.moves[1].pts = [[25, 28]]; }
  ]) {
    const x = phase(); damage(x); const raw = JSON.stringify(x);
    assert.equal(changeConnectedPathEndpoint(x, 1, 0, 'player:LM'), false);
    assert.equal(JSON.stringify(x), raw);
  }
});

test('E4.12 edited follow-on link remains phase-local and preserved through JSON undo/reload', () => {
  const p = phase(), second = copy(phase());
  second.players.RM = [33, 42];
  second.moves = [{ t: 'run', pts: [[33, 42], [38, 45]], curve: true }];
  p.phases = [second];
  const before = JSON.stringify(p), sibling = JSON.stringify(p.phases[0]);
  assert.equal(changeConnectedPathEndpoint(p, 1, 2, 'player:LR'), true);
  const changed = JSON.stringify(p);
  assert.equal(JSON.stringify(p.phases[0]), sibling);
  assert.equal(inspectPlayPhaseContinuity(p).boundaries[0].status, 'unresolved');
  const undone = JSON.parse(before);
  assert.equal(JSON.stringify(undone), before);
  const reloaded = JSON.parse(changed);
  assert.equal(reloaded.moves[1].actorLinks.end, 'player:LR');
  assert.equal(JSON.stringify(reloaded.phases[0]), sibling);
});

test('E4.12 historical Oztag sample stays byte-identical and cannot gain guessed links', () => {
  const ws = copy(golden.schema4Workspace), before = JSON.stringify(ws);
  const legacy = ws.plays.find(x => x.id === 'coach-legacy-e0');
  assert.equal(connectedPathEndpoint(legacy, 0, 0), null);
  assert.equal(previewConnectedPathChange(legacy, 0, 0, 'player:LM'), false);
  assert.equal(changeConnectedPathEndpoint(legacy, 0, 0, 'player:LM'), false);
  assert.equal(JSON.stringify(ws), before);
  assert.equal(ws.schema, 4);
});
