import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  assignRunOrigin, freeRunOrigin, newLinkedMovement,
  actorEndpointLinks, followActorEndpoints
} from '../site/play-actor-links.js';
import { inspectPlayMovementLinks } from '../site/play-movement-link-audit.js';

const clone = x=>JSON.parse(JSON.stringify(x));
const example = () => {
  const phase = {
    players:{LM:[15,30],RM:[25,28],LW:[8,34]},
    defence:{line:[[12,20]],marker:[18,24]},
    moves:[]
  };
  phase.moves.push(newLinkedMovement(phase,{t:'pass',pts:[[15,30],[25,28]]},'m-prior-pass'));
  phase.moves.push(newLinkedMovement(phase,{t:'run',pts:[[22,30],[23,34],[29,40]]},'m-run-start'));
  return phase;
};

test('E4.7 choosing Run from anchors only start; preserves bends, end and earlier pass',()=>{
  const phase=example(),before=clone(phase);
  assert.deepEqual(phase.moves[1].actorLinks,{});
  assert.equal(assignRunOrigin(phase,1,'RM'),true);
  assert.deepEqual(phase.moves[1].pts,[[25,28],[23,34],[29,40]]);
  assert.deepEqual(phase.moves[1].actorLinks,{start:'player:RM'});
  assert.deepEqual(phase.moves[0],before.moves[0]);
  assert.deepEqual(phase.players,before.players);
  assert.deepEqual(phase.defence,before.defence);
  assert.deepEqual(inspectPlayMovementLinks(phase).issues,[]);
  const copy=clone(phase);
  assert.deepEqual(actorEndpointLinks(copy,'player:RM').map(x=>[x.moveIndex,x.pointIndex]),[[0,1],[1,0]]);
  assert.equal(followActorEndpoints(copy,actorEndpointLinks(copy,'player:RM'),'player:RM',[26,29]),2);
  assert.deepEqual(copy.moves[0].pts[1],[26,29]);
  assert.deepEqual(copy.moves[1].pts[0],[26,29]);
  assert.deepEqual(copy.moves[1].pts.slice(1),[[23,34],[29,40]]);
  assert.deepEqual(phase.moves[0],before.moves[0]);
});

test('E4.7 free field point disconnects explicit run origin without moving any coordinate or other link',()=>{
  const phase=example();
  phase.moves[1].actorLinks={end:'player:LW'};
  phase.moves[1].pts[2]=phase.players.LW.slice();
  assert.equal(assignRunOrigin(phase,1,'RM'),true);
  const before=clone(phase), start=phase.moves[1].pts[0].slice();
  assert.equal(freeRunOrigin(phase,1),true);
  assert.deepEqual(phase.moves[1].actorLinks,{end:'player:LW'});
  assert.deepEqual(phase.moves[1].pts,before.moves[1].pts);
  assert.deepEqual(actorEndpointLinks(phase,'player:RM').map(x=>[x.moveIndex,x.pointIndex]),[[0,1]]);
  assert.equal(followActorEndpoints(phase,actorEndpointLinks(phase,'player:RM'),'player:RM',[30,30]),1);
  assert.deepEqual(phase.moves[1].pts[0],start,'unlinked start stays fixed even at old actor position');
  assert.equal(freeRunOrigin(phase,1),false,'no invisible second edit');
  assert.deepEqual(clone(phase).moves[1].actorLinks,{end:'player:LW'});
});

test('E4.7 reposition a run start from a deliberate field point and reattach after reload',()=>{
  const phase=example();
  assert.equal(assignRunOrigin(phase,1,'LW'),true);
  const reopened=clone(phase);
  assert.equal(freeRunOrigin(reopened,1),true);
  assert.deepEqual(actorEndpointLinks(reopened,'player:LW'),[]);
  assert.equal(assignRunOrigin(reopened,1,'LM'),true);
  assert.equal(reopened.moves[1].actorLinks.start,'player:LM');
  assert.deepEqual(reopened.moves[1].pts[0],reopened.players.LM);
  assert.deepEqual(phase.moves[1].pts[0],phase.players.LW);
  assert.deepEqual(reopened.moves[1].pts.at(-1),phase.moves[1].pts.at(-1));
});

test('E4.7 overlapping player slot and invalid origin refuse linking, no mutation',()=>{
  const phase=example();
  phase.players.LW=phase.players.RM.slice();
  const before=JSON.stringify(phase);
  assert.equal(assignRunOrigin(phase,1,'LW'),false);
  assert.equal(assignRunOrigin(phase,1,'RM'),false);
  assert.equal(JSON.stringify(phase),before);
  assert.equal(freeRunOrigin(phase,1),false);
});

test('E4.7 malformed, future version, wrong-kind and legacy move cannot be changed',()=>{
  const cases=[
    [p=>{p.moves[1].linkVersion=2},1,'RM'],
    [p=>{delete p.moves[1].linkVersion},1,'RM'],
    [p=>{p.moves[1].t='pass'},1,'RM'],
    [p=>{p.moves[1].t='shift'},1,'RM'],
    [p=>{p.moves[1].actorLinks=null},1,'RM'],
    [p=>{p.moves[1].actorLinks=[]},1,'RM'],
    [p=>{p.moves[1].pts=[[22,30]]},1,'RM'],
    [p=>{p.moves[1].pts[1]=[NaN,0]},1,'RM'],
    [p=>{p.moves[1].pts[2]=[51,20]},1,'RM'],
    [p=>{p.players.RM=[51,20]},1,'RM'],
    [p=>{p.players.RM=[-1,20]},1,'RM'],
    [p=>{},-1,'RM'],
    [p=>{},4,'RM'],
    [p=>{},0,'RM'],
    [p=>{},1,'missing'],
    [p=>{},1,'__proto__'],
    [p=>{},1,{}]
  ];
  for(const [alter,index,id] of cases){
    const phase=example();
    alter(phase);
    const before=JSON.stringify(phase);
    assert.equal(assignRunOrigin(phase,index,id),false,`case ${index} ${String(id)}`);
    assert.equal(freeRunOrigin(phase,index),false,`no start link to free ${index}`);
    assert.equal(JSON.stringify(phase),before);
  }
});

test('E4.7 refuse false field detach for missing, fake and unsupported actor start',()=>{
  const cases=[
    null,[],{}, {end:'player:RM'}, {start:null}, {start:23},
    {start:'defender:0'}, {start:'field:12'}, {start:''}
  ];
  for(const links of cases){
    const phase=example();phase.moves[1].actorLinks=links;
    const before=JSON.stringify(phase);
    assert.equal(freeRunOrigin(phase,1),false);
    assert.equal(JSON.stringify(phase),before);
  }
});

test('E4.7 golden Oztag plays and schema 4 remain untouched; no sport/timing assumption',()=>{
  const golden=JSON.parse(readFileSync(new URL('./fixtures/play-engine-e0-golden.json',import.meta.url),'utf8'));
  const before=JSON.stringify(golden);
  const legacy=golden.legacySingleTeam.plays[1];
  assert.equal(assignRunOrigin(legacy,0,'LM'),false);
  assert.equal(freeRunOrigin(legacy,0),false);
  const p=example();
  assert.equal(assignRunOrigin(p,1,'RM'),true);
  const result=inspectPlayMovementLinks(p);
  assert.equal(result.timingVerified,false);
  assert.equal(result.possessionVerified,false);
  assert.equal(JSON.stringify(golden),before);
  assert.equal(golden.schema4Workspace.schema,4);
});
