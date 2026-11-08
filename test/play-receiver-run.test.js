import test from 'node:test';
import assert from 'node:assert/strict';
import { newLinkedMovement, assignPassReceiver, receiverFollowOnRun, actorEndpointLinks, followActorEndpoints } from '../site/play-actor-links.js';

function fixture() {
  const ph = { players: { LM: [15, 30], RM: [25, 30], RW: [40, 34] }, defence: { line: [], marker: null }, moves: [] };
  ph.moves.push(newLinkedMovement(ph, { t: 'pass', pts: [[15, 30], [25, 30]] }, 'm-pass1'));
  return ph;
}

test('coach explicitly switches receiver and the chosen endpoint persists after reload', () => {
  const ph = fixture();
  assert.equal(assignPassReceiver(ph, 0, 'RW'), true);
  assert.deepEqual(ph.moves[0].pts[1], [40, 34]);
  assert.equal(ph.moves[0].actorLinks.end, 'player:RW');
  const saved = JSON.parse(JSON.stringify(ph));
  assert.deepEqual(actorEndpointLinks(saved, 'player:RM'), []);
  assert.deepEqual(actorEndpointLinks(saved, 'player:RW').map(x => [x.moveIndex, x.pointIndex]), [[0, 1]]);
  followActorEndpoints(saved, actorEndpointLinks(saved, 'player:RW'), 'player:RW', [39, 35]);
  assert.deepEqual(saved.moves[0].pts[1], [39, 35]);
  assert.deepEqual(ph.players.RW, [40, 34]);
});

test('a chosen receiver creates a separate versioned editable follow-on run', () => {
  const ph = fixture();
  const original = JSON.stringify(ph);
  const run = receiverFollowOnRun(ph, 0, 'm-run1', [25, 34]);
  assert.equal(run.moveId, 'm-run1');
  assert.equal(run.t, 'run');
  assert.equal(run.actorLinks.start, 'player:RM');
  assert.deepEqual(run.pts, [[25, 30], [25, 34]]);
  assert.equal(JSON.stringify(ph), original, 'creating candidate does not mutate source');
  ph.moves.push(run);
  const reopened = JSON.parse(JSON.stringify(ph));
  followActorEndpoints(reopened, actorEndpointLinks(reopened, 'player:RM'), 'player:RM', [26, 31]);
  assert.deepEqual(reopened.moves[0].pts[1], [26, 31]);
  assert.deepEqual(reopened.moves[1].pts[0], [26, 31]);
  assert.deepEqual(reopened.moves[1].pts[1], [25, 34]);
});

test('invalid targets, overlaps and malformed pass ownership reject without mutations', () => {
  const ph = fixture(); const before = JSON.stringify(ph);
  assert.equal(assignPassReceiver(ph, 0, 'nonexistent'), false);
  assert.equal(assignPassReceiver(ph, 9, 'RW'), false);
  assert.equal(receiverFollowOnRun(ph, 0, 'invalid', [25, 34]), null);
  assert.equal(receiverFollowOnRun(ph, 0, 'm-next1', [25, 30]), null);
  assert.equal(receiverFollowOnRun(ph, 0, 'm-next1', [70, 30]), null);
  assert.equal(JSON.stringify(ph), before);
  ph.players.RW = ph.players.RM.slice();
  const overlapped = JSON.stringify(ph);
  assert.equal(assignPassReceiver(ph, 0, 'RW'), false);
  assert.equal(JSON.stringify(ph), overlapped);
});

test('legacy pass remains unmodified and does not gain an implicit new receiver', () => {
  const ph = fixture();
  ph.moves[0] = { t: 'pass', pts: [[15, 30], [25, 30]] };
  const baseline = JSON.stringify(ph);
  assert.equal(assignPassReceiver(ph, 0, 'RW'), false);
  assert.equal(receiverFollowOnRun(ph, 0, 'm-run2', [25, 34]), null);
  assert.equal(JSON.stringify(ph), baseline);
});

test('wrong move type and unsupported link version refuse E4.3 authoring', () => {
  const ph = fixture();
  ph.moves[0].t = 'kick';
  assert.equal(assignPassReceiver(ph, 0, 'RW'), false);
  assert.equal(receiverFollowOnRun(ph, 0, 'm-run3', [25, 34]), null);
  ph.moves[0].t = 'pass';
  ph.moves[0].linkVersion = 2;
  assert.equal(assignPassReceiver(ph, 0, 'RW'), false);
  assert.equal(receiverFollowOnRun(ph, 0, 'm-run3', [25, 34]), null);
});

test('another phase, coach text and the original play remain unchanged', () => {
  const phaseA = fixture(), phaseB = fixture(), original = structuredClone(phaseB);
  const coachText = { steps: 'Use the support channel', headline: 'Draw the defender' };
  const beforeWords = JSON.stringify(coachText);
  assert.equal(assignPassReceiver(phaseA, 0, 'RW'), true);
  assert.deepEqual(phaseB, original);
  assert.equal(JSON.stringify(coachText), beforeWords);
});
