import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inspectPlayGraphCompatibility } from '../site/play-graph-compatibility.js';

const copy = x => JSON.parse(JSON.stringify(x));
const golden = JSON.parse(readFileSync(new URL('./fixtures/play-engine-e0-golden.json', import.meta.url), 'utf8'));
const modern = () => copy(golden.schema4Workspace.plays.find(x => x.id === 'coach-v1-e0'));
const legacy = () => copy(golden.schema4Workspace.plays.find(x => x.id === 'coach-legacy-e0'));

test('E4.11 explicit V1 pass and follow-on run form only local slot connections', () => {
  const p = modern(), before = JSON.stringify(p);
  const projection = inspectPlayGraphCompatibility(p);
  assert.equal(projection.status, 'v1-only');
  assert.equal(projection.projectionVersion, 1);
  const edges = projection.phases[0].movements;
  assert.deepEqual(edges.map(x => x.representation), ['linked-v1', 'linked-v1']);
  assert.deepEqual(edges[0].start, { status: 'known-local-slot', actorKey: 'player:LM' });
  assert.deepEqual(edges[0].end, { status: 'known-local-slot', actorKey: 'player:RM' });
  assert.deepEqual(edges[1].start, { status: 'known-local-slot', actorKey: 'player:RM' });
  assert.deepEqual(edges[1].end, { status: 'free-field-point', point: [29, 36] });
  assert.equal(projection.actorIdentityVerified, false);
  assert.equal(projection.timingVerified, false);
  assert.equal(projection.possessionVerified, false);
  assert.equal(JSON.stringify(p), before);
  assert.deepEqual(JSON.parse(projection.sourceJson), p);
});

test('E4.11 original text preserves exact bytes including formatting and unknown fields', () => {
  const original = JSON.stringify(legacy(), null, 2)
    .replace('"id": "coach-legacy-e0"', '"id": "coach-legacy-e0", "extra": {"odd\\\\u006bey": "a\\\\n b"}') + '\n';
  const bytes = Buffer.from(original);
  const projection = inspectPlayGraphCompatibility(original);
  assert.equal(projection.sourceWasExactText, true);
  assert.equal(projection.sourceJson, original);
  assert.ok(Buffer.from(projection.sourceJson).equals(bytes));
  assert.equal(projection.status, 'mixed-or-legacy');
  const first = projection.phases[0].movements[0];
  assert.equal(first.resolution, 'unresolved-legacy');
  assert.deepEqual(first.raw, JSON.parse(original).moves[0]);
  assert.deepEqual(first.geometry, JSON.parse(original).moves[0].pts);
  assert.equal(first.start, null);
  assert.equal(first.end, null);
  assert.equal(projection.phases[1].legacyMovements, 1);
});

test('E4.11 unknown legacy movement attributes and multiphase source are untouched', () => {
  const p = legacy();
  p.moves[0].custom = { bezier: [1, 2], note: 'unknown future authoring field' };
  const before = JSON.stringify(p);
  const graph = inspectPlayGraphCompatibility(p);
  assert.equal(graph.status, 'mixed-or-legacy');
  assert.equal(graph.phases.length, 2);
  assert.deepEqual(graph.phases[0].movements[0].raw, p.moves[0]);
  assert.deepEqual(graph.phases[1].movements[0].raw, p.phases[0].moves[0]);
  assert.equal(graph.phases[0].movements[1].resolution, 'unresolved-legacy');
  assert.equal(JSON.stringify(p), before);
});

test('E4.11 corrupt V1 links and unrecognised versions never become known graph edges', () => {
  const p = modern();
  p.moves[0].actorLinks.end = 'player:NOT_PRESENT';
  p.moves[1].linkVersion = 12;
  const before = JSON.stringify(p);
  const graph = inspectPlayGraphCompatibility(p);
  assert.equal(graph.status, 'invalid');
  assert.equal(graph.phases[0].movements[0].representation, 'invalid-v1');
  assert.equal(graph.phases[0].movements[0].resolution, 'unresolved');
  assert.equal(graph.phases[0].movements[0].start, null);
  assert.ok(graph.phases[0].movements[0].issues.includes('missing-tactical-actor'));
  assert.equal(graph.phases[0].movements[1].representation, 'unsupported-or-invalid');
  assert.equal(JSON.stringify(p), before);
});

test('E4.11 detached V1 run endpoints stay deliberate free field points', () => {
  const p = modern();
  delete p.moves[1].actorLinks.start;
  const graph = inspectPlayGraphCompatibility(p);
  assert.equal(graph.status, 'v1-only');
  assert.deepEqual(graph.phases[0].movements[1].start,
    { status: 'free-field-point', point: [25, 28] });
  assert.equal(graph.phases[0].movements[1].resolution, 'field-only');
});

test('E4.11 unknown V1 movement type is unresolved even if its actor links look valid', () => {
  const p = modern();
  p.moves[0].t = 'teleport';
  const before = JSON.stringify(p);
  const graph = inspectPlayGraphCompatibility(p);
  assert.equal(graph.status, 'invalid');
  assert.equal(graph.phases[0].movements[0].representation, 'invalid-v1');
  assert.equal(graph.phases[0].movements[0].resolution, 'unresolved');
  assert.ok(graph.phases[0].movements[0].issues.includes('unsupported-movement-type'));
  assert.equal(graph.phases[0].movements[0].start, null);
  assert.equal(JSON.stringify(p), before);
});

test('E4.11 immutable projection cannot modify the original workspace or saved play', () => {
  const ws = copy(golden.schema4Workspace), original = JSON.stringify(ws);
  const graph = inspectPlayGraphCompatibility(ws.plays[1]);
  assert.ok(Object.isFrozen(graph) && Object.isFrozen(graph.phases[0].movements[0].raw));
  assert.throws(() => { graph.phases[0].movements[0].raw.pts[0][0] = 999; }, TypeError);
  assert.equal(JSON.stringify(ws), original);
  assert.equal(ws.schema, 4);
  assert.equal(ws.library.plays[0].rev, 2);
});

test('E4.11 malformed JSON and values not representable losslessly as JSON fail closed', () => {
  assert.equal(inspectPlayGraphCompatibility('{invalid json').status, 'invalid');
  assert.equal(inspectPlayGraphCompatibility(null).status, 'invalid');
  assert.equal(inspectPlayGraphCompatibility({ moves: [{ t: 'run', pts: undefined }] }).status, 'invalid');
  assert.equal(inspectPlayGraphCompatibility({ moves: [{ pts: [[NaN, 2], [1, 2]] }] }).status, 'invalid');
  const cyclic = {}; cyclic.phases = [cyclic];
  assert.equal(inspectPlayGraphCompatibility(cyclic).status, 'invalid');
  assert.equal(inspectPlayGraphCompatibility({ phases: {} }).status, 'invalid');
});
