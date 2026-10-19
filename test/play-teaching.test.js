import test from 'node:test';
import assert from 'node:assert/strict';
import { addTeachingStep, teachingSteps, removeTeachingStep, moveTeachingStep, seedTeachingFromLegacy, removeMovementLinks } from '../site/play-teaching.js';

test('the editor adds, orders and deletes study instructions without changing the play drawing', () => {
  const play = { moves: [{ t: 'pass' }], steps: 'Existing', phases: [] };
  const before = JSON.stringify(play.moves);
  assert.equal(addTeachingStep(play), 0);
  assert.equal(addTeachingStep(play), 1);
  play.study[0].text = 'First';
  play.study[1].text = 'Second';
  assert.equal(moveTeachingStep(play, 0, 1, -1), true);
  assert.deepEqual(teachingSteps(play).map(x => x.text), ['Second', 'First']);
  assert.equal(removeTeachingStep(play, 0, 1), true);
  assert.equal(removeTeachingStep(play, 0, 5), false);
  assert.equal(JSON.stringify(play.moves), before);
  assert.equal(play.steps, 'Existing');
});

test('coaches opt in before converting legacy prose to teachable steps', () => {
  const play = { steps: 'Original steps', moves: [], phases: [] };
  assert.equal(play.study, undefined);
  assert.equal(seedTeachingFromLegacy(play, ['LM passes', 'RM catches']), 2);
  assert.deepEqual(play.study.map(x => x.text), ['LM passes', 'RM catches']);
  assert.equal(seedTeachingFromLegacy(play, ['Ignored']), 0);
});

test('phase-led seed leaves phase instructions independent', () => {
  const play = { title: 'Phase 1', moves: [], phases: [{ title: 'Next ruck', moves: [] }] };
  seedTeachingFromLegacy(play, ['Old prose']);
  assert.equal(play.study[0].text, 'Phase 1');
  assert.equal(play.phases[0].study[0].text, 'Next ruck');
  assert.equal(teachingSteps(play, 1).length, 1);
});

test('deleting an SVG movement never silently reassigns a teaching cue to another line', () => {
  const ph = { study: [{ moves: [0, 2, 3], roles: ['LM'] }, { moves: [1] }] };
  removeMovementLinks(ph, 2);
  assert.deepEqual(ph.study[0].moves, [0, 2]);
  assert.deepEqual(ph.study[1].moves, [1]);
});
