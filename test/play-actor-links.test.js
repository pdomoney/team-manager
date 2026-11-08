import test from 'node:test';
import assert from 'node:assert/strict';
import { actorEndpointLinks, followActorEndpoints, diagramActors } from '../site/play-actor-links.js';

const phase = () => ({
  players: { LM: [15, 30], RM: [25, 28], LR: [6, 34] },
  defence: { marker: [19, 25], line: [[12, 20], [30, 20]] },
  moves: [
    { t: 'run', pts: [[15, 30], [17, 29], [20, 25]] },
    { t: 'pass', pts: [[20, 25], [25, 28]] },
    { t: 'run', pts: [[25, 28], [28, 34]] },
    { t: 'shift', pts: [[12, 20], [14, 21]] }
  ]
});

test('E4: a selected RM keeps the pass receiver and follow-on run attached', () => {
  const d = phase(), original = structuredClone(d), links = actorEndpointLinks(d, 'player:RM');
  assert.deepEqual(links.map(x => [x.moveIndex, x.pointIndex]), [[1, 1], [2, 0]]);
  assert.equal(followActorEndpoints(d, links, 'player:RM', [27, 29]), 2);
  assert.deepEqual(d.moves[1].pts[1], [27, 29]);
  assert.deepEqual(d.moves[2].pts[0], [27, 29]);
  assert.deepEqual(d.moves[0], original.moves[0]);
  assert.deepEqual(d.moves[3], original.moves[3]);
  assert.deepEqual(d.players, original.players); // caller updates the selected actor
  assert.deepEqual(structuredClone(d), JSON.parse(JSON.stringify(d))); // legacy format
});

test("E4: LM run remains attached to LM, not to another player\'s path", () => {
  const d = phase();
  const links = actorEndpointLinks(d, 'player:LM');
  assert.deepEqual(links.map(x => [x.moveIndex, x.pointIndex]), [[0, 0]]);
  followActorEndpoints(d, links, 'player:LM', [16, 31]);
  assert.deepEqual(d.moves[0].pts, [[16, 31], [17, 29], [20, 25]]);
  assert.deepEqual(d.moves[1].pts, [[20, 25], [25, 28]]);
});

test('E4: an overlapping player cannot steal an ambiguous pass or run endpoint', () => {
  const d = phase(); d.players.LR = d.players.RM.slice();
  const saved = JSON.stringify(d);
  assert.deepEqual(actorEndpointLinks(d, 'player:RM'), []);
  assert.deepEqual(actorEndpointLinks(d, 'player:LR'), []);
  assert.equal(JSON.stringify(d), saved);
});

test('E4: defender and marker links are scoped to selected diagram actor', () => {
  const d = phase();
  assert.equal(diagramActors(d).filter(x => x.key === 'defender:0').length, 1);
  const links = actorEndpointLinks(d, 'defender:0');
  assert.deepEqual(links.map(x => [x.moveIndex, x.pointIndex]), [[3, 0]]);
  followActorEndpoints(d, links, 'defender:0', [11, 19]);
  assert.deepEqual(d.moves[3].pts[0], [11, 19]);
  assert.deepEqual(actorEndpointLinks(d, 'marker'), []);
});

test('E4: no implicit link to an endpoint that is merely nearby or on a bend', () => {
  const d = phase();
  d.moves.push({ t: 'run', pts: [[8, 30], [15, 30], [19, 35]] });
  d.moves.push({ t: 'pass', pts: [[17, 30], [24.5, 28]] });
  assert.deepEqual(actorEndpointLinks(d, 'player:LM').map(x => x.moveIndex), [0]);
  assert.deepEqual(actorEndpointLinks(d, 'player:RM').map(x => x.moveIndex), [1, 2]);
});

test('E4: invalid/missing actors, malformed movements and wrong-owner links fail closed', () => {
  const d = phase();
  d.moves.push({ t: 'run', pts: null }, { t: 'pass', pts: [[NaN, 2], [25, 28]] });
  assert.deepEqual(actorEndpointLinks(d, 'player:unknown'), []);
  assert.deepEqual(actorEndpointLinks(d, 'player:RM', -1), []);
  const links = actorEndpointLinks(d, 'player:RM');
  const before = JSON.stringify(d, (_k,v) => typeof v === 'number' && !Number.isFinite(v) ? 'NaN' : v);
  assert.equal(followActorEndpoints(d, links, 'player:LM', [30, 40]), 0);
  assert.equal(followActorEndpoints(d, links, 'player:RM', [Infinity, 30]), 0);
  assert.equal(JSON.stringify(d, (_k,v) => typeof v === 'number' && !Number.isFinite(v) ? 'NaN' : v), before);
});

test('E4: a phase change never moves other phase endpoints or edits source by reading', () => {
  const first = phase(), next = phase(), untouched = structuredClone(next);
  const old = structuredClone(first);
  const links = actorEndpointLinks(first, 'player:RM');
  assert.deepEqual(first, old);
  followActorEndpoints(first, links, 'player:RM', [29, 31]);
  assert.deepEqual(next, untouched);
});
