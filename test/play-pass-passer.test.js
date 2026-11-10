import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  newLinkedMovement, assignPassPasser, actorEndpointLinks, followActorEndpoints
} from '../site/play-actor-links.js';
import { inspectPlayMovementLinks } from '../site/play-movement-link-audit.js';
import { coachPlayConnectionNotice } from '../site/play-link-warning.js';

const copy = x => JSON.parse(JSON.stringify(x));
const phase = () => {
  const p={players:{LM:[15,30],RM:[25,28],LW:[9,34]},defence:{line:[],marker:null},moves:[]};
  p.moves.push(newLinkedMovement(p,{t:'pass',pts:[[15,30],[20,28],[25,28]]},'m-passer-test'));
  return p;
};

test('E4.6 coach can reassign a versioned pass origin to a unique diagram actor',()=>{
  const p=phase(), before=copy(p);
  assert.deepEqual(p.moves[0].actorLinks,{start:'player:LM',end:'player:RM'});
  assert.equal(assignPassPasser(p,0,'LW'),true);
  assert.deepEqual(p.moves[0].pts,[[9,34],[20,28],[25,28]],
    'move just the start, never the bend or receiver');
  assert.deepEqual(p.moves[0].actorLinks,{start:'player:LW',end:'player:RM'});
  assert.deepEqual(p.players,before.players);
  assert.deepEqual(p.defence,before.defence);
  assert.equal(inspectPlayMovementLinks(p).status,'consistent-links-only');
  assert.equal(coachPlayConnectionNotice(p).visible,false);
  const roundtrip=copy(p);
  assert.deepEqual(actorEndpointLinks(roundtrip,'player:LW').map(x=>[x.moveIndex,x.pointIndex]),[[0,0]]);
  assert.equal(followActorEndpoints(roundtrip,actorEndpointLinks(roundtrip,'player:LW'),'player:LW',[10,35]),1);
  assert.deepEqual(roundtrip.moves[0].pts[0],[10,35]);
  assert.deepEqual(roundtrip.moves[0].pts[1],[20,28]);
  assert.deepEqual(roundtrip.moves[0].pts[2],[25,28]);
  assert.deepEqual(before.moves[0].pts[0],[15,30]);
});

test('E4.6 an explicit missing passer is repaired without modifying the receiver',()=>{
  const p=phase();
  p.moves[0].actorLinks={end:'player:RM'};
  p.moves[0].pts[0]=[16,31];
  assert.ok(inspectPlayMovementLinks(p).issues.some(x=>x.code==='pass-passer-unlinked'));
  assert.equal(assignPassPasser(p,0,'LM'),true);
  assert.deepEqual(p.moves[0].pts[0],[15,30]);
  assert.equal(p.moves[0].actorLinks.start,'player:LM');
  assert.equal(p.moves[0].actorLinks.end,'player:RM');
  assert.equal(inspectPlayMovementLinks(p).status,'consistent-links-only');
});

test('E4.6 fail closed on overlapping players with zero mutations',()=>{
  const p=phase();
  p.players.LW=p.players.LM.slice();
  const before=JSON.stringify(p);
  assert.equal(assignPassPasser(p,0,'LW'),false);
  assert.equal(JSON.stringify(p),before);
  assert.equal(assignPassPasser(p,0,'LM'),false);
  assert.equal(JSON.stringify(p),before);
});

test('E4.6 unsupported, legacy, malformed, non-pass and out-of-bounds cases do not change input',()=>{
  const invalid=[
    [p=>{p.moves[0].linkVersion=2},0,'LW'],
    [p=>{delete p.moves[0].linkVersion},0,'LW'],
    [p=>{p.moves[0].t='run'},0,'LW'],
    [p=>{p.moves[0].actorLinks=null},0,'LW'],
    [p=>{p.moves[0].actorLinks=[]},0,'LW'],
    [p=>{p.moves[0].pts=[[15,30]]},0,'LW'],
    [p=>{p.moves[0].pts[1]=[NaN,0]},0,'LW'],
    [p=>{p.players.LW=[51,30]},0,'LW'],
    [p=>{p.players.LW=[9,-1]},0,'LW'],
    [p=>{},-1,'LW'],
    [p=>{},1,'LW'],
    [p=>{},0,'missing-player'],
    [p=>{},0,'__proto__'],
    [p=>{},NaN,'LW']
  ];
  for(const [change,index,id] of invalid){
    const p=phase();
    change(p);
    const before=JSON.stringify(p);
    assert.equal(assignPassPasser(p,index,id),false,`case: ${id}, ${index}, ${before}`);
    assert.equal(JSON.stringify(p),before);
  }
});

test('E4.6 old Step Out and schema-4 golden plays are unchanged and other phases are isolated',()=>{
  const golden=JSON.parse(readFileSync(new URL('./fixtures/play-engine-e0-golden.json',import.meta.url),'utf8'));
  const before=JSON.stringify(golden);
  const legacy=golden.legacySingleTeam.plays[1];
  const old=JSON.stringify(legacy);
  assert.equal(assignPassPasser(legacy,0,'LM'),false);
  assert.equal(JSON.stringify(legacy),old);
  const modern=copy(golden.schema4Workspace.plays.find(p=>p.id==='coach-v1-e0'));
  const oldModern=copy(modern);
  assert.equal(assignPassPasser(modern,0,'LM'),true);
  assert.deepEqual(modern.moves[0].pts[0],modern.players.LM);
  assert.deepEqual(modern.moves[1],oldModern.moves[1]);
  assert.equal(JSON.stringify(golden),before);
  assert.equal(golden.schema4Workspace.schema,4);
});

test('E4.6 no implicit possession, catching sequence or sports formation arises from assigning an origin',()=>{
  const p=phase();
  assert.equal(assignPassPasser(p,0,'LW'),true);
  const result=inspectPlayMovementLinks(p);
  assert.equal(result.timingVerified,false);
  assert.equal(result.possessionVerified,false);
  assert.deepEqual(result.sharedActorPaths,[]);
  assert.ok(!('competition' in p) && !('lineup' in p));
});
