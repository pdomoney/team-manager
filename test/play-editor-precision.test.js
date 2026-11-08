import test from 'node:test';
import assert from 'node:assert/strict';
import { previewSelectionNudge, applySelectionNudge } from '../site/play-editor-precision.js';
import { newLinkedMovement, actorEndpointLinks } from '../site/play-actor-links.js';

const phase = () => {
  const p = {
    players: { LM: [15, 30], RM: [25, 28], LR: [7, 34] },
    defence: { marker: [19, 23], line: [[12, 20], [30, 20]] },
    labels: [{ at: [32, 28], text: 'Go' }],
    moves: [{ t: 'run', pts: [[15, 30], [17, 28], [20, 25]] }],
    notes: { LM: { text: 'Dummy half' } }
  };
  p.moves.push(newLinkedMovement(p, { t: 'pass', pts: [[15, 30], [25, 28]] }, 'm-testpass'));
  p.moves.push(newLinkedMovement(p, { t: 'run', pts: [[25, 28], [29, 33]] }, 'm-testrun'));
  return p;
};

test('B4: nudging an actor preserves legacy run and explicit pass endpoints', () => {
  const p = phase(), old = structuredClone(p), select = { k: 'pl', id: 'LM' };
  assert.deepEqual(previewSelectionNudge(p, select, null, 0.5, 0), { to: [15.5, 30], actorKey: 'player:LM' });
  assert.deepEqual(p, old, 'preview is pure and safe before undo snapshot');
  assert.equal(applySelectionNudge(p, select, null, 0.5, 0), true);
  assert.deepEqual(p.players.LM, [15.5, 30]);
  assert.deepEqual(p.moves[0].pts[0], [15.5, 30]);
  assert.deepEqual(p.moves[1].pts[0], [15.5, 30]);
  assert.deepEqual(p.moves[1].actorLinks, old.moves[1].actorLinks);
  assert.deepEqual(p.moves[1].pts[1], old.moves[1].pts[1]);
  assert.deepEqual(p.notes, old.notes);
});

test('B4: receiving actor nudge moves pass destination and follow-on run start', () => {
  const p = phase();
  assert.equal(applySelectionNudge(p, { k: 'pl', id: 'RM' }, null, 1, 0), true);
  assert.deepEqual(p.moves[1].pts[1], [26, 28]);
  assert.deepEqual(p.moves[2].pts[0], [26, 28]);
  assert.deepEqual(p.moves[2].pts[1], [29, 33]);
});

test('B4: defender, marker and labels move without affecting other actors', () => {
  const p = phase();
  const before = structuredClone(p);
  assert.equal(applySelectionNudge(p, { k: 'df', i: 0 }, null, -0.5, 0), true);
  assert.equal(applySelectionNudge(p, { k: 'mk' }, null, 0, 0.5), true);
  assert.equal(applySelectionNudge(p, { k: 'lb', i: 0 }, null, -2, 0), true);
  assert.deepEqual(p.defence.line[0], [11.5, 20]);
  assert.deepEqual(p.defence.marker, [19, 23.5]);
  assert.deepEqual(p.labels[0].at, [30, 28]);
  assert.deepEqual(p.players, before.players);
  assert.deepEqual(p.moves, before.moves);
});

test('B4: moving a new pass endpoint explicitly detaches its receiver link', () => {
  const p = phase();
  assert.equal(applySelectionNudge(p, { k: 'mv', i: 1 }, 1, 0, 1), true);
  assert.deepEqual(p.moves[1].pts[1], [25, 29]);
  assert.deepEqual(p.moves[1].actorLinks, { start: 'player:LM' });
  assert.deepEqual(actorEndpointLinks(p, 'player:RM').map(x=>x.moveIndex), [2]);
  assert.equal(applySelectionNudge(p, { k: 'mv', i: 1 }, 0, 0, 0.5), true);
  assert.deepEqual(p.moves[1].actorLinks, {});
});

test('B4: empty, unsupported, malformed and out-of-range selections do not mutate', () => {
  const p = phase(), original = JSON.stringify(p);
  const bad = [
    [null, null, 1, 0], [{ k: 'pl', id: 'absent' }, null, 1, 0],
    [{ k: 'df', i: 8 }, null, 1, 0], [{ k: 'mk' }, null, Infinity, 0],
    [{ k: 'mv', i: 1 }, null, 0, 1], [{ k: 'mv', i: 1 }, 90, 1, 0],
    [{ k: 'lb', i: -1 }, null, 1, 0], [{ k: 'pl', id: 'LM' }, null, 99, 0],
    [{ k: 'pl', id: 'LM' }, null, 0, 0]
  ];
  for (const [sel,h,dx,dy] of bad) {
    assert.equal(previewSelectionNudge(p, sel, h, dx, dy), null);
    assert.equal(applySelectionNudge(p, sel, h, dx, dy), false);
  }
  p.moves[1].linkVersion = 9;
  assert.equal(applySelectionNudge(p, { k: 'mv', i: 1 }, 1, 1, 0), false);
  p.moves[1].linkVersion = 1;
  assert.equal(JSON.stringify(p), original);
});

test('B4: boundaries clamp without creating invisible changes or mutating other phases', () => {
  const p = phase(), next = phase(), oldNext = structuredClone(next);
  p.players.LM = [49.8, 79.9];
  assert.equal(applySelectionNudge(p, { k: 'pl', id: 'LM' }, null, 2, 2), true);
  assert.deepEqual(p.players.LM, [50, 80]);
  assert.equal(previewSelectionNudge(p, { k: 'pl', id: 'LM' }, null, 0.5, 0.5), null);
  assert.equal(applySelectionNudge(p, { k: 'pl', id: 'LM' }, null, 0.5, 0.5), false);
  assert.deepEqual(next, oldNext);
});

test('B4: overlapping diagram actors do not inherit each other\'s legacy movement', () => {
  const p = phase();
  p.players.LR = p.players.RM.slice();
  const legacy = { t: 'pass', pts: [[19, 20], [25, 28]] };
  p.moves.push(legacy);
  assert.equal(applySelectionNudge(p, { k: 'pl', id: 'RM' }, null, 0.5, 0), true);
  assert.deepEqual(legacy.pts[1], [25, 28]);
});
