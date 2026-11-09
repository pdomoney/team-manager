// E0 Play Engine 2.0 compatibility gate: synthetic fixtures only.
// Tests existing source contracts, not an approved sport format or animation engine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCHEMA, migrateWorkspace, legacyTeam, libGet, findTeam } from '../site/model.js';
import { studyCards } from '../site/play-study.js';
import { playTeachingCompatibility } from '../site/p08-play-compatibility.js';
import { actorEndpointLinks, followActorEndpoints } from '../site/play-actor-links.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/play-engine-e0-golden.json', import.meta.url), 'utf8'));
const copy = x => JSON.parse(JSON.stringify(x));
const named = (list, id) => list.find(p => p.id === id);
const snapshot = x => JSON.stringify(x);

test('E0 golden identifies protected old starter, legacy authored, versioned and sport-concept records', () => {
  assert.deepEqual(fixture.legacySingleTeam.plays.map(p => p.id), ['quickie-out', 'coach-legacy-e0']);
  assert.deepEqual(fixture.schema4Workspace.plays.map(p => p.id), [
    'quickie-out', 'coach-legacy-e0', 'coach-v1-e0'
  ]);
  assert.equal(fixture.meta.coordinateUnits, '50x80 teaching canvas, NOT metres');
  assert.equal(fixture.meta.futureSportStatus.includes('CONCEPT ONLY'), true);
  assert.equal(fixture.schema4Workspace.library.plays[0].rev, 2);
});

test('E0 version-2 Oztag plays survive current schema migration and old-team export exactly', () => {
  const src = copy(fixture.legacySingleTeam), raw = snapshot(src.plays);
  const workspace = migrateWorkspace(copy(src));
  assert.equal(workspace.schema, SCHEMA);
  assert.equal(workspace.id, 'team1');
  assert.equal(snapshot(workspace.plays), raw, 'both stored play records untouched');
  assert.equal(snapshot(legacyTeam(workspace, 'team1').plays), raw,
    'older single-team export keeps every legacy phase, movement and note');
  assert.equal(snapshot(migrateWorkspace(copy(workspace)).plays), raw,
    'repeat migration does not rewrite legacy play bytes');
  assert.equal(snapshot(src), snapshot(fixture.legacySingleTeam),
    'original fixture and prior source copy are not mutated');
});

test('E0 schema-4 roundtrip retains all saved plays, library provenance and other sport concept', () => {
  const original = copy(fixture.schema4Workspace), rawPlays = snapshot(original.plays);
  const rawLibrary = snapshot(original.library.plays);
  const oldTitans = snapshot(original.teams[0].plays);
  const workspace = migrateWorkspace(copy(original));
  assert.equal(workspace.schema, SCHEMA);
  assert.equal(snapshot(workspace.plays), rawPlays);
  assert.equal(snapshot(workspace.library.plays), rawLibrary);
  assert.equal(libGet(workspace, 'plays', 'lib-e0keep').steps,
    'Never overwrite a coach-owned library version');
  assert.equal(snapshot(findTeam(workspace, 'testtitansjunior').plays), oldTitans);
  const afterReload = migrateWorkspace(copy(workspace));
  assert.equal(snapshot(afterReload.plays), rawPlays);
  assert.equal(snapshot(afterReload.library.plays), rawLibrary);
  assert.equal(snapshot(findTeam(afterReload, 'testtitansjunior').plays), oldTitans);
  assert.equal(snapshot(original), snapshot(fixture.schema4Workspace),
    'no source fixture or original workspace mutation');
});

test('E0 explicit V1 passer, receiver and follow-on run reconnect after save/reload', () => {
  const play = copy(named(fixture.schema4Workspace.plays, 'coach-v1-e0'));
  const baseline = snapshot(play);
  const reopened = copy(play); // synthetic save/reload JSON boundary
  const links = actorEndpointLinks(reopened, 'player:RM');
  assert.deepEqual(links.map(l => [l.moveIndex, l.pointIndex]), [[0, 1], [1, 0]]);
  reopened.players.RM = [26, 29];
  assert.equal(followActorEndpoints(reopened, links, 'player:RM', [26, 29]), 2);
  assert.deepEqual(reopened.moves[0].pts[1], [26, 29]);
  assert.deepEqual(reopened.moves[1].pts[0], [26, 29]);
  assert.deepEqual(reopened.moves[1].pts[1], [29, 36]);
  assert.equal(snapshot(play), baseline, 'new draft does not modify saved source');
  assert.equal(snapshot(named(fixture.schema4Workspace.plays, 'coach-v1-e0')), baseline);
});

test('E0 legacy endpoints and instructions are not promoted into authored possession or timing', () => {
  const legacy = copy(named(fixture.legacySingleTeam.plays, 'coach-legacy-e0'));
  const bytes = snapshot(legacy);
  const cards = studyCards(legacy, ['Coach explains draw and pass', 'RM supports after catching']);
  assert.equal(cards.length, 2);
  assert.ok(cards.every(c => c.linked === false && c.moves.length === 0),
    'prose cannot prove movement order, passer/receiver or ball ownership');
  assert.equal(legacy.moves.every(m => !('linkVersion' in m) && !('actorLinks' in m)), true);
  assert.equal(snapshot(legacy), bytes);
});

test('E0 unknown new actor-link versions fail closed without rewriting geometry', () => {
  const modern = copy(named(fixture.schema4Workspace.plays, 'coach-v1-e0'));
  modern.moves[0].linkVersion = 2;
  const before = snapshot(modern);
  assert.deepEqual(actorEndpointLinks({...modern, moves: [modern.moves[0]]}, 'player:RM'), [],
    'unknown version is not reinterpreted as legacy geometry');
  assert.equal(snapshot(modern), before);
});

test('E0 Rugby League junior demo remains an unverified teaching concept, not 13-player formation', () => {
  const titans = fixture.schema4Workspace.teams[0], play = titans.plays[0];
  const result = playTeachingCompatibility(play, titans.team);
  assert.equal(result.status, 'cross-sport-review');
  assert.equal(result.diagramMode, 'eight-slot-concept');
  assert.equal(result.fullFormationVerified, false);
  assert.equal(result.reviewRequired, true);
  const unknown = {...play, sport: undefined, builtin: false};
  const unidentified = playTeachingCompatibility(unknown, titans.team);
  assert.equal(unidentified.status, 'unconfirmed-play-sport');
  assert.equal(unidentified.fullFormationVerified, false);
});
