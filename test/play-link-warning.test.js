import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { coachPlayConnectionNotice } from '../site/play-link-warning.js';

const golden = JSON.parse(readFileSync(new URL('./fixtures/play-engine-e0-golden.json', import.meta.url), 'utf8'));
const modern = () => structuredClone(golden.schema4Workspace.plays.find(p => p.id === 'coach-v1-e0'));

test('E4.5 consistent explicit pass and receiver run do not distract the coach', () => {
  const phase = modern(), before = JSON.stringify(phase);
  const notice = coachPlayConnectionNotice(phase);
  assert.deepEqual(notice, {
    visible: false, text: '', affectedMovements: 0, firstMoveIndex: null
  });
  assert.equal(JSON.stringify(phase), before);
});

test('E4.5 legacy Step Out and coach-authored unversioned geometry receive no false warnings', () => {
  for (const play of [golden.legacySingleTeam.plays[0],golden.legacySingleTeam.plays[1]]) {
    const before = JSON.stringify(play);
    const notice = coachPlayConnectionNotice(play);
    assert.equal(notice.visible,false);
    assert.equal(notice.text,'');
    assert.equal(JSON.stringify(play),before);
  }
});

test('E4.5 detached receiver reports the affected movement without guessing another recipient', () => {
  const phase=modern(), beforePlay=JSON.stringify(golden.schema4Workspace.plays);
  phase.moves[0].actorLinks.end='player:unlisted';
  const before=JSON.stringify(phase);
  const notice=coachPlayConnectionNotice(phase);
  assert.equal(notice.visible,true);
  assert.equal(notice.firstMoveIndex,0);
  assert.equal(notice.affectedMovements,1);
  assert.match(notice.text,/Movement 1/);
  assert.match(notice.text,/no longer exists/);
  assert.match(notice.text,/No drawing is changed automatically/);
  assert.equal(JSON.stringify(phase),before);
  assert.equal(JSON.stringify(golden.schema4Workspace.plays),beforePlay);
});

test('E4.5 stale endpoint and several bad movements produce one compact actionable warning', () => {
  const phase=modern();
  phase.players.RM=[30,33];
  phase.moves[0].moveId='bad';
  const notice=coachPlayConnectionNotice(phase);
  assert.equal(notice.visible,true);
  assert.equal(notice.affectedMovements,2);
  assert.match(notice.text,/2 diagram movements/);
  assert.match(notice.text,/Movement 1/);
  assert.ok(notice.text.length < 300, 'compact text must not overwhelm drawing workspace');
  assert.ok(Object.isFrozen(notice));
});

test('E4.5 unsupported movement version and missing passer remain warnings, not automatic migrations', () => {
  const version=modern(), before=JSON.stringify(version);
  version.moves[0].linkVersion=2;
  assert.match(coachPlayConnectionNotice(version).text,/unsupported connection version/);
  assert.equal(JSON.stringify(modern()),before);
  const noPasser=modern();noPasser.moves[0].actorLinks={end:'player:RM'};
  assert.match(coachPlayConnectionNotice(noPasser).text,/no explicitly connected passer/);
});

test('E4.5 invalid phases are handled without throwing or leaking technical details', () => {
  const result = coachPlayConnectionNotice(null);
  assert.equal(result.visible, true);
  assert.equal(result.firstMoveIndex, null);
  assert.match(result.text,/Diagram:/);
  assert.ok(!result.text.includes('undefined'));
});
