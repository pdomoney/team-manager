import test from 'node:test';
import assert from 'node:assert/strict';
import { studyCards, cueRoles } from '../site/play-study.js';

test('legacy single-phase coaching instructions become browsable learning steps', () => {
  const play = { name: 'Quickie Out', steps: 'a', moves: [{ t: 'run' }] };
  const cards = studyCards(play, ['RM plays the ball', 'LM draws the marker', 'RM runs into space']);
  assert.equal(cards.length, 3);
  assert.deepEqual(cards.map(c => c.phase), [0, 0, 0]);
  assert.deepEqual(cards.map(c => c.linked), [false, false, false]);
  assert.ok(cards.every(c => c.moves.length === 0), 'legacy prose is not falsely synchronized to diagram lines');
});

test('multi-phase plays show an honest phase-led path without assigning prose to the wrong ruck', () => {
  const play = { title: 'First ruck', moves: [], phases: [{ title: 'Second ruck', moves: [] }] };
  const cards = studyCards(play, ['An old play-level instruction']);
  assert.deepEqual(cards.map(c => [c.phase, c.title]), [[0, 'First ruck'], [1, 'Second ruck']]);
});

test('future annotated movement cues accept validated movement indices without mutating play', () => {
  const play = { moves: [{ t: 'run' }, { t: 'pass' }], study: [
    { text: 'LM passes', title: 'Find the gap', moves: [1, 1, -2, 50, 0.2], roles: ['LM', 'LM', null] }
  ] };
  const original = JSON.stringify(play);
  const cards = studyCards(play);
  assert.equal(cards[0].title, 'Find the gap');
  assert.deepEqual(cards[0].moves, [1]);
  assert.deepEqual(cards[0].roles, ['LM']);
  assert.equal(cards[0].linked, true);
  assert.equal(JSON.stringify(play), original);
});

test('left/right mirror callback applies to authored titles and cues', () => {
  const play = { moves: [], study: [{ title: 'Right side', text: 'LM passes right', moves: [] }] };
  const mirror = x => String(x).replace(/right/gi, 'left').replace(/Right/g, 'Left');
  assert.equal(studyCards(play, [], mirror)[0].text, 'LM passes left');
});

test('role detection matches only exact position codes and ignores numeric tag references', () => {
  assert.deepEqual(cueRoles('RM carries; LM runs. Calm down on tag 5.', ['RM', 'LM', '5', 'RW']), ['RM', 'LM']);
  assert.deepEqual(cueRoles('no relevant position', ['RM', 'LM']), []);
});
