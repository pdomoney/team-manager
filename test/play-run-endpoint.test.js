import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assignRunEndpoint, freeRunEndpoint, assignRunOrigin,
  newLinkedMovement, actorEndpointLinks, followActorEndpoints } from '../site/play-actor-links.js';
import { inspectPlayMovementLinks } from '../site/play-movement-link-audit.js';

const copy = x=>JSON.parse(JSON.stringify(x));
function phase() {
  const p={players:{LM:[15,30],RM:[25,28],LW:[8,34]},
    defence:{marker:[18,24],line:[[12,20]]},moves:[]};
  p.moves.push(newLinkedMovement(p,{t:'pass',pts:[[15,30],[25,28]]},'m-prior-pass'));
  p.moves.push(newLinkedMovement(p,{t:'run',pts:[[15,30],[20,33],[35,37]]},'m-run-end'));
  return p;
}

test('E4.8 explicitly attaches run end to diagram actor and preserves origin, bends, existing pass',()=>{
  const p=phase(), before=copy(p);
  assert.deepEqual(p.moves[1].actorLinks,{start:'player:LM'});
  assert.equal(assignRunEndpoint(p,1,'RM'),true);
  assert.deepEqual(p.moves[1].actorLinks,{start:'player:LM',end:'player:RM'});
  assert.deepEqual(p.moves[1].pts,[[15,30],[20,33],[25,28]]);
  assert.deepEqual(p.moves[0],before.moves[0]);
  assert.deepEqual(p.players,before.players);
  assert.deepEqual(p.defence,before.defence);
  assert.equal(inspectPlayMovementLinks(p).status,'consistent-links-only');
  assert.equal(inspectPlayMovementLinks(p).possessionVerified,false);
  const restored=copy(p), links=actorEndpointLinks(restored,'player:RM');
  assert.deepEqual(links.map(l=>[l.moveIndex,l.pointIndex]),[[0,1],[1,2]]);
  assert.equal(followActorEndpoints(restored,links,'player:RM',[27,29]),2);
  assert.deepEqual(restored.moves[0].pts[1],[27,29]);
  assert.deepEqual(restored.moves[1].pts[2],[27,29]);
  assert.deepEqual(restored.moves[1].pts.slice(0,2),[[15,30],[20,33]]);
});

test('E4.8 Leave end on field unlinks only end and retains coordinates and origin',()=>{
  const p=phase();
  assert.equal(assignRunEndpoint(p,1,'RM'),true);
  const before=copy(p);
  assert.equal(freeRunEndpoint(p,1),true);
  assert.deepEqual(p.moves[1].actorLinks,{start:'player:LM'});
  assert.deepEqual(p.moves[1].pts,before.moves[1].pts);
  assert.deepEqual(p.moves[0],before.moves[0]);
  assert.deepEqual(actorEndpointLinks(p,'player:RM').map(x=>x.moveIndex),[0]);
  assert.equal(followActorEndpoints(p,actorEndpointLinks(p,'player:RM'),'player:RM',[30,29]),1);
  assert.deepEqual(p.moves[1].pts.at(-1),[25,28],
    'free endpoint stays fixed at its authored coordinate');
  assert.equal(freeRunEndpoint(p,1),false,'second no-op never becomes an edit');
});

test('E4.8 Run from and Run ends at remain independent through save/reload and undo-shaped copy',()=>{
  const p=phase();
  assert.equal(assignRunOrigin(p,1,'LW'),true);
  assert.equal(assignRunEndpoint(p,1,'RM'),true);
  const after=copy(p);
  assert.deepEqual(after.moves[1].actorLinks,{start:'player:LW',end:'player:RM'});
  assert.deepEqual(after.moves[1].pts,[[8,34],[20,33],[25,28]]);
  assert.equal(freeRunEndpoint(after,1),true);
  assert.deepEqual(after.moves[1].actorLinks,{start:'player:LW'});
  assert.deepEqual(after.moves[1].pts[0],[8,34]);
  assert.deepEqual(after.moves[1].pts[1],[20,33]);
  assert.deepEqual(p.moves[1].actorLinks.end,'player:RM');
});

test('E4.8 overlap and same-start target fail closed without any mutation',()=>{
  const p=phase();
  const before=JSON.stringify(p);
  assert.equal(assignRunEndpoint(p,1,'LM'),false,'a zero-length start/end is not a run');
  assert.equal(JSON.stringify(p),before);
  p.players.LW=p.players.RM.slice();
  const crossed=JSON.stringify(p);
  assert.equal(assignRunEndpoint(p,1,'RM'),false,'overlapped actor not uniquely selectable');
  assert.equal(assignRunEndpoint(p,1,'LW'),false);
  assert.equal(JSON.stringify(p),crossed);
});

test('E4.8 legacy, unsupported, malformed and wrong-kind movements reject changes without mutations',()=>{
  const bad=[
    [p=>{delete p.moves[1].linkVersion},1,'RM'],
    [p=>{p.moves[1].linkVersion=2},1,'RM'],
    [p=>{p.moves[1].t='pass'},1,'RM'],
    [p=>{p.moves[1].t='shift'},1,'RM'],
    [p=>{p.moves[1].actorLinks=null},1,'RM'],
    [p=>{p.moves[1].actorLinks=[]},1,'RM'],
    [p=>{p.moves[1].pts=[[15,30]]},1,'RM'],
    [p=>{p.moves[1].pts[1]=[Infinity,0]},1,'RM'],
    [p=>{p.moves[1].pts.at(-1)[0]=51},1,'RM'],
    [p=>{p.players.RM=[-1,25]},1,'RM'],
    [p=>{p.players.RM=[51,25]},1,'RM'],
    [p=>{},-1,'RM'],
    [p=>{},4,'RM'],
    [p=>{},0,'RM'],
    [p=>{},1,'missing'],
    [p=>{},1,'__proto__'],
    [p=>{},1,{}]
  ];
  for(const [mutate,index,actor] of bad){
    const p=phase();mutate(p);
    const before=JSON.stringify(p);
    assert.equal(assignRunEndpoint(p,index,actor),false);
    assert.equal(freeRunEndpoint(p,index),false);
    assert.equal(JSON.stringify(p),before);
  }
});

test('E4.8 invalid link shapes never detach and cannot change geometry',()=>{
  for(const links of [null,[],{}, {start:'player:LM'}, {end:undefined},
      {end:null},{end:12},{end:'marker'}, {end:'defender:0'}, {end:''}]){
    const p=phase();p.moves[1].actorLinks=links;
    const before=JSON.stringify(p);
    assert.equal(freeRunEndpoint(p,1),false);
    assert.equal(JSON.stringify(p),before);
  }
});

test('E4.8 old Oztag Step Out and schema-4 workspace stay bytewise identical',()=>{
  const golden=JSON.parse(readFileSync(new URL('./fixtures/play-engine-e0-golden.json',import.meta.url),'utf8'));
  const before=JSON.stringify(golden);
  const legacy=golden.legacySingleTeam.plays[1];
  assert.equal(assignRunEndpoint(legacy,0,'RM'),false);
  assert.equal(freeRunEndpoint(legacy,0),false);
  const p=phase();
  assert.equal(assignRunEndpoint(p,1,'RM'),true);
  const review=inspectPlayMovementLinks(p);
  assert.equal(review.timingVerified,false);
  assert.equal(review.possessionVerified,false);
  assert.equal(JSON.stringify(golden),before);
  assert.equal(golden.schema4Workspace.schema,4);
});
