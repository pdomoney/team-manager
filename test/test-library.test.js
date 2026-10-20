import test from 'node:test';
import assert from 'node:assert/strict';
import { fixStamps, stable, dataCheck, TEST_LIBRARY_VERSION } from '../site/test-library.js';
import * as M from '../site/model.js';

test('ids come from a counter while the test library is built, then random again', () => {
  const a = M.withCountedIds('tst', () => [M.uid(), M.uid(), M.uid()]);
  const b = M.withCountedIds('tst', () => [M.uid(), M.uid(), M.uid()]);
  assert.deepEqual(a, ['tst0000001', 'tst0000002', 'tst0000003']);
  assert.deepEqual(a, b);
  assert.notEqual(M.uid(), 'tst0000004');
  assert.match(M.uid(), /^[a-z0-9]{10}$/);
  assert.throws(() => M.withCountedIds('tst', () => { throw new Error('boom'); }), /boom/);
  assert.doesNotMatch(M.uid(), /^tst/, 'a failed build still puts random ids back');
});

test('times stamped while building become one fixed time; earlier ones are kept', () => {
  const since = '2026-10-20T02:00:00.000Z';
  const ws = { a: { at: '2026-10-20T02:00:00.123Z' }, list: [{ at: '2026-10-20T02:00:01.999Z' }, { at: '2026-10-18T07:00:00.000Z' }], day: '2026-10-20', text: 'not a time' };
  const out = fixStamps(ws, since, '2026-10-20');
  const eight = new Date(2026, 9, 20, 8, 0, 0).toISOString();
  assert.equal(out.a.at, eight); assert.equal(out.list[0].at, eight);
  assert.equal(out.list[1].at, '2026-10-18T07:00:00.000Z', 'a time set on purpose before the build stays');
  assert.equal(out.day, '2026-10-20'); assert.equal(out.text, 'not a time');
  assert.equal(ws.a.at, '2026-10-20T02:00:00.123Z', 'the original is left alone');
});

test('the data check ignores key order, save times and passwords, and changes with the data', () => {
  const a = { teams: [{ id: 't', name: 'A' }], updatedAt: '2026-10-20T01:00:00Z', teamPass: 'one', x: 1 };
  const b = { x: 1, teamPass: 'two', teams: [{ name: 'A', id: 't' }], updatedAt: '2026-10-21T09:00:00Z' };
  assert.equal(stable(a), stable(b));
  assert.equal(dataCheck(a), dataCheck(b));
  assert.match(dataCheck(a), /^[A-Z0-9]{6}$/);
  assert.notEqual(dataCheck(a), dataCheck({ ...a, x: 2 }));
  assert.notEqual(dataCheck(a), dataCheck({ ...a, teams: [{ id: 't', name: 'B' }] }));
  assert.ok(TEST_LIBRARY_VERSION >= 1);
});
