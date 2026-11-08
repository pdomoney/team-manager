import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actorEndpointLinks, followActorEndpoints, newLinkedMovement,
  rebindMovementEndpoint, detachMovementActors
} from '../site/play-actor-links.js';

const makePhase = () => ({
  players: { LM: [15, 30], RM: [25, 28], LR: [7, 34] },
  defence: { marker: [18, 24], line: [[12, 20], [28, 20]] },
  moves: [{ t: 'run', pts: [[15, 30], [18, 29]] }]
});

test('new authored pass has a stable ID and explicit passer/receiver references', () => {
  const ph = makePhase();
  const move = newLinkedMovement(ph, { t: 'pass', pts: [[15, 30], [25, 28]], key: true }, 'm-newpass');
  assert.equal(move.moveId, 'm-newpass');
  assert.equal(move.linkVersion, 1);
  assert.deepEqual(move.actorLinks, { start: 'player:LM', end: 'player:RM' });
  ph.moves.push(move);
  const restored = JSON.parse(JSON.stringify(ph));
  assert.deepEqual(restored.moves[1], move);
  const links = actorEndpointLinks(restored, 'player:RM');
  assert.deepEqual(links.map(x => [x.moveIndex, x.pointIndex]), [[1, 1]]);
  assert.equal(followActorEndpoints(restored, links, 'player:RM', [27, 30]), 1);
  assert.deepEqual(restored.moves[1].pts[1], [27, 30]);
  assert.deepEqual(ph.moves[1].pts[1], [25, 28]);
});

test('a new receiver run stays explicitly linked after save/reload and later move', () => {
  const ph = makePhase();
  const pass = newLinkedMovement(ph, { t: 'pass', pts: [[15, 30], [25, 28]] }, 'm-pass1');
  ph.moves.push(pass);
  ph.moves.push(newLinkedMovement(ph, { t: 'run', pts: [[25, 28], [30, 34]] }, 'm-run1'));
  const reopened = JSON.parse(JSON.stringify(ph));
  followActorEndpoints(reopened, actorEndpointLinks(reopened, 'player:RM'), 'player:RM', [26, 29]);
  assert.deepEqual(reopened.moves[1].pts[1], [26, 29]);
  assert.deepEqual(reopened.moves[2].pts[0], [26, 29]);
  assert.deepEqual(reopened.moves[0], ph.moves[0]);
});

test('unlinked new endpoint never attaches automatically via proximity', () => {
  const ph = makePhase();
  const move = newLinkedMovement(ph, { t: 'pass', pts: [[15, 30], [24, 28]] }, 'm-loose1');
  assert.deepEqual(move.actorLinks, { start: 'player:LM' });
  ph.moves.push(move);
  ph.players.RM = [24, 28]; // now exactly on old end: still unlinked
  assert.deepEqual(actorEndpointLinks(ph, 'player:RM'), []);
});

test('overlap refuses ambiguous links without altering old play geometry', () => {
  const ph = makePhase(), baseline = JSON.stringify(ph);
  ph.players.LR = ph.players.RM.slice();
  const move = newLinkedMovement(ph, { t: 'pass', pts: [[15, 30], [25, 28]] }, 'm-ambiguous');
  assert.deepEqual(move.actorLinks, { start: 'player:LM' });
  assert.equal(JSON.stringify(makePhase()), baseline);
  assert.deepEqual(ph.moves[0], makePhase().moves[0]);
});

test('handle changes rebind only the endpoint deliberately moved, and detaching clears links', () => {
  const ph = makePhase();
  ph.moves.push(newLinkedMovement(ph, { t: 'pass', pts: [[15, 30], [25, 28]] }, 'm-handle1'));
  ph.moves[1].pts[1] = [20, 29]; // freehand, not on RM
  assert.equal(rebindMovementEndpoint(ph, 1, 1), true);
  assert.deepEqual(ph.moves[1].actorLinks, { start: 'player:LM' });
  assert.deepEqual(actorEndpointLinks(ph, 'player:RM'), []);
  ph.moves[1].pts[1] = [25, 28];
  assert.equal(rebindMovementEndpoint(ph, 1, 1), true);
  assert.equal(ph.moves[1].actorLinks.end, 'player:RM');
  assert.equal(detachMovementActors(ph.moves[1]), true);
  assert.deepEqual(ph.moves[1].actorLinks, {});
  assert.deepEqual(actorEndpointLinks(ph, 'player:LM').map(x => x.moveIndex), [0]);
});

test('old moves, movement annotations and other phases preserve their bytes and links', () => {
  const first = makePhase(), other = makePhase();
  const before = JSON.stringify(first), otherBefore = JSON.stringify(other);
  const added = newLinkedMovement(first, { t: 'run', pts: [[25, 28], [31, 32]], curve: true }, 'm-separate1');
  assert.equal(JSON.stringify(first), before); // creating a candidate does not migrate a phase
  first.moves.push(added);
  assert.equal(first.moves[0].moveId, undefined);
  assert.equal(first.moves[0].linkVersion, undefined);
  assert.equal(JSON.stringify(other), otherBefore);
  assert.deepEqual(JSON.parse(JSON.stringify(first.moves[0])), makePhase().moves[0]);
});

test('invalid versions, IDs, missing actors and malformed geometry fail closed', () => {
  const ph = makePhase();
  assert.equal(newLinkedMovement(ph, { t: 'run', pts: [[15, 30], [20, 29]] }, 'bad'), null);
  assert.equal(newLinkedMovement(ph, { t: 'run', pts: [[NaN, 30], [20, 29]] }, 'm-bad1'), null);
  ph.moves.push(newLinkedMovement(ph, { t: 'run', pts: [[15, 30], [20, 29]] }, 'm-good1'));
  assert.equal(newLinkedMovement(ph, { t: 'run', pts: [[15, 30], [20, 29]] }, 'm-good1'), null);
  ph.moves[1].linkVersion = 2;
  assert.deepEqual(actorEndpointLinks(ph, 'player:LM').map(x => x.moveIndex), [0]);
  assert.equal(rebindMovementEndpoint(ph, 1, 0), false);
  assert.equal(detachMovementActors(ph.moves[1]), false);
  const before = JSON.stringify(ph);
  assert.equal(followActorEndpoints(ph, [{ actorKey: 'player:RM', moveIndex: 1, pointIndex: 0 }], 'player:RM', [Infinity, 5]), 0);
  assert.equal(JSON.stringify(ph), before);
});
