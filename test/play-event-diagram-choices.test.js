import test from 'node:test';
import assert from 'node:assert/strict';
import { diagramMappingChoices } from '../site/play-event-diagram-choices.js';

test('E5.3.3b lists actual slots per phase without inferring identity', () => {
  const play = { players: { A: [1, 2], B: [3, 4] },
    phases: [{ players: { A: [7, 8], C: [9, 10] } }] };
  assert.deepEqual(diagramMappingChoices(play), [
    { phaseIndex: 0, slots: ['A', 'B'] },
    { phaseIndex: 1, slots: ['A', 'C'] }
  ]);
  assert.notEqual(diagramMappingChoices(play)[0].slots,
    diagramMappingChoices(play)[1].slots);
});
test('E5.3.3b rejects unsafe or missing slot keys', () => {
  assert.deepEqual(diagramMappingChoices({
    players: { '<script>': [1, 2], '': [2, 3], valid_1: [4, 5] },
    phases: [{ players: {} }]
  }), [{ phaseIndex: 0, slots: ['valid_1'] }, { phaseIndex: 1, slots: [] }]);
  assert.deepEqual(diagramMappingChoices(null), []);
});
