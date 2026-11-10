import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  newLinkedMovement, assignDefenderOrigin, freeDefenderOrigin,
  actorEndpointLinks, followActorEndpoints
} from '../site/play-actor-links.js';
import { inspectPlayMovementLinks } from '../site/play-movement-link-audit.js';

const copy = value => JSON.parse(JSON.stringify(value));
const phase = () => {
  const p = {
    players: { LM: [15, 30], RM: [25, 28] },
    defence: { line: [[12, 20], [28, 20]], marker: [18, 24] },
    moves: []
  };
  p.moves.push(newLinkedMovement(p, { t: 'pass', pts: [[15, 30], [25, 28]] }, 'm-existing-pass'));
  p.moves.push(newLinkedMovement(p, {
    t: 'shift', pts: [[14, 21], [15, 23], [16, 27]], curve: true
  }, 'm-defender-test'));
  return p;
};

test('E4.9 unique defender explicitly owns a shift start; bends, end, other lines untouched', () => {
  const p = phase(), original = copy(p);
  assert.deepEqual(p.moves[1].actorLinks, {});
  assert.equal(assignDefenderOrigin(p, 1, 'defender:0'), true);
  assert.deepEqual(p.moves[1].actorLinks, { start: 'defender:0' });
  assert.deepEqual(p.moves[1].pts, [[12,20],[15,23],[16,27]]);
  assert.deepEqual(p.moves[0], original.moves[0]);
  assert.deepEqual(p.players, original.players);
  assert.deepEqual(p.defence, original.defence);
  assert.deepEqual(inspectPlayMovementLinks(p).issues, []);
  assert.equal(inspectPlayMovementLinks(p).possessionVerified, false);
  const reopened = copy(p), links = actorEndpointLinks(reopened, 'defender:0');
  assert.deepEqual(links.map(l => [l.moveIndex,l.pointIndex]), [[1,0]]);
  assert.equal(followActorEndpoints(reopened, links, 'defender:0', [11,19]), 1);
  assert.deepEqual(reopened.moves[1].pts, [[11,19],[15,23],[16,27]]);
  assert.deepEqual(reopened.moves[0], original.moves[0]);
  assert.deepEqual(p.moves[1].pts[0], [12,20]);
});

test('E4.9 marker can own the same shift after reassignment, still without a defender decision', () => {
  const p = phase();
  assert.equal(assignDefenderOrigin(p, 1, 'defender:0'), true);
  assert.equal(assignDefenderOrigin(p, 1, 'marker'), true);
  assert.deepEqual(p.moves[1].actorLinks, {start:'marker'});
  assert.deepEqual(p.moves[1].pts, [[18,24],[15,23],[16,27]]);
  const restored = copy(p);
  assert.equal(followActorEndpoints(restored, actorEndpointLinks(restored, 'marker'), 'marker', [19,25]), 1);
  assert.deepEqual(restored.moves[1].pts[0],[19,25]);
  assert.deepEqual(restored.moves[1].pts.slice(1),[[15,23],[16,27]]);
  assert.equal(inspectPlayMovementLinks(p).timingVerified,false);
});

test('E4.9 Leave start on field unlinks only start, retaining exact drawn coordinates', () => {
  const p = phase();
  assert.equal(assignDefenderOrigin(p,1,'marker'),true);
  const before=copy(p), location=p.moves[1].pts[0].slice();
  assert.equal(freeDefenderOrigin(p,1),true);
  assert.deepEqual(p.moves[1].actorLinks,{});
  assert.deepEqual(p.moves[1].pts,before.moves[1].pts);
  assert.deepEqual(p.moves[0],before.moves[0]);
  assert.deepEqual(actorEndpointLinks(p,'marker'),[]);
  assert.equal(followActorEndpoints(p,actorEndpointLinks(p,'marker'),'marker',[20,25]),0);
  assert.deepEqual(p.moves[1].pts[0],location);
  assert.equal(freeDefenderOrigin(p,1),false);
});

test('E4.9 overlapping defenders or marker reject actor selection without mutation', () => {
  const p=phase();
  p.defence.line[1]=p.defence.line[0].slice();
  const old=JSON.stringify(p);
  assert.equal(assignDefenderOrigin(p,1,'defender:0'),false);
  assert.equal(assignDefenderOrigin(p,1,'defender:1'),false);
  assert.equal(JSON.stringify(p),old);
  p.defence.line[1]=[28,20];
  p.defence.marker=p.defence.line[0].slice();
  const same=JSON.stringify(p);
  assert.equal(assignDefenderOrigin(p,1,'defender:0'),false);
  assert.equal(assignDefenderOrigin(p,1,'marker'),false);
  assert.equal(JSON.stringify(p),same);
});

test('E4.9 nondefensive actor, missing marker, invalid slots and out-of-field geometry fail closed', () => {
  const actors=['player:LM','defender:99','defender:01','defender:-1','__proto__','defender:NaN','',17,null];
  for(const actor of actors) {
    const p=phase(), before=JSON.stringify(p);
    assert.equal(assignDefenderOrigin(p,1,actor),false, String(actor));
    assert.equal(JSON.stringify(p),before);
  }
  for(const update of [p=>{p.defence.line[0]=[51,20];},
    p=>{p.defence.line[0]=[Infinity,20];}]) {
    const p=phase();
    update(p);
    const prior=JSON.stringify(p);
    assert.equal(assignDefenderOrigin(p,1,'defender:0'),false);
    assert.equal(JSON.stringify(p),prior);
  }
  const absent=phase();absent.defence.marker=null;
  assert.equal(assignDefenderOrigin(absent,1,'marker'),false);
});

test('E4.9 legacy, future-version, malformed, attacking and end-linked shifts reject without mutation', () => {
  const cases=[
    [p=>{delete p.moves[1].linkVersion},1],
    [p=>{p.moves[1].linkVersion=2},1],
    [p=>{p.moves[1].t='run'},1],
    [p=>{p.moves[1].t='pass'},1],
    [p=>{p.moves[1].actorLinks=null},1],
    [p=>{p.moves[1].actorLinks=[]},1],
    [p=>{p.moves[1].actorLinks.end='player:LM'},1],
    [p=>{p.moves[1].pts=[[14,21]]},1],
    [p=>{p.moves[1].pts[1]=[NaN,23]},1],
    [p=>{p.moves[1].pts[2]=[-1,27]},1],
    [p=>{},0],
    [p=>{},-1],
    [p=>{},42]
  ];
  for(const [update,index] of cases) {
    const p=phase();update(p);const before=JSON.stringify(p);
    assert.equal(assignDefenderOrigin(p,index,'defender:0'),false,String(index));
    assert.equal(freeDefenderOrigin(p,index),false,String(index));
    assert.equal(JSON.stringify(p),before);
  }
  for(const value of [null,[],{}, {end:'player:RM'}, {start:null},
    {start:19}, {start:'player:LM'}, {start:'defender:01'}, {start:''}]) {
    const p=phase();p.moves[1].actorLinks=value;const before=JSON.stringify(p);
    assert.equal(freeDefenderOrigin(p,1),false);
    assert.equal(JSON.stringify(p),before);
  }
});

test('E4.9 historical Step Out, sibling phases, original schema-4 workspace stay unchanged', () => {
  const golden=JSON.parse(readFileSync(new URL('./fixtures/play-engine-e0-golden.json',import.meta.url),'utf8'));
  const old=JSON.stringify(golden),other=phase(),otherBefore=JSON.stringify(other);
  assert.equal(assignDefenderOrigin(golden.legacySingleTeam.plays[1],0,'defender:0'),false);
  assert.equal(freeDefenderOrigin(golden.legacySingleTeam.plays[1],0),false);
  const p=phase();
  assert.equal(assignDefenderOrigin(p,1,'defender:1'),true);
  assert.deepEqual(p.moves[1].pts[0],[28,20]);
  assert.equal(JSON.stringify(other),otherBefore);
  assert.equal(JSON.stringify(golden),old);
  assert.equal(golden.schema4Workspace.schema,4);
});
