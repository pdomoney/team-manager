import test from 'node:test';
import assert from 'node:assert/strict';
import { projectWatchField } from '../site/play-watch-field-projection.js';
const play=()=>({players:{A:[10,20]},eventTimeline:{version:1,
 actors:[{actorId:'a',type:'attacker',phases:[{phaseIndex:0,slotKey:'A'}]}],
 events:[{eventId:'e1',kind:'possession-set',actorId:'a',atMs:0,sequence:0},
 {eventId:'e2',kind:'run-start',actorId:'a',atMs:500,sequence:0},
 {eventId:'e3',kind:'run-end',actorId:'a',atMs:1000,sequence:0}]}});
test('projects validated authored possession onto explicit field slot without mutation',()=>{
 const p=play(),before=structuredClone(p);
 const result=projectWatchField(p,0,500,p.players);
 assert.equal(result.mode,'field-preview');
 assert.deepEqual(result.possessionPoint,[10,20]);
 assert.equal(result.positions[0].motion,'running');
 assert.equal(result.renderTimedField,false);
 assert.deepEqual(p,before);
});
test('missing and malformed coordinates fail closed',()=>{
 const p=play();
 for(const field of [{}, {A:[NaN,3]}, {A:[1]}, {A:[90,2]}, null]) {
  assert.equal(projectWatchField(p,0,0,field).mode,'legacy');
 }
 assert.equal(projectWatchField(p,1,0,p.players).mode,'legacy');
 assert.equal(projectWatchField({},0,0,p.players).mode,'legacy');
});

test('E5.4e: field projection is deterministic across repeated seek and does not move source coordinates',()=>{
 const p=play(), before=JSON.stringify(p), field={A:[10,20]};
 const a=projectWatchField(p,0,500,field);
 const b=projectWatchField(p,0,500,field);
 assert.deepEqual(a,b);
 assert.equal(a.positions[0].motion,'running');
 assert.equal(projectWatchField(p,0,1000,field).positions[0].motion,'stationary');
 assert.equal(a.renderTimedField,false);
 assert.equal(JSON.stringify(p),before);
 assert.deepEqual(field,{A:[10,20]});
});
test('E5.4e: invalid phases and missing actor mappings never infer field positions',()=>{
 const p=play();
 for(const phase of [-1,0.5,1,Number.MAX_SAFE_INTEGER+1]){
  const result=projectWatchField(p,phase,500,p.players);
  assert.equal(result.mode,'legacy');
  assert.equal(result.renderTimedField,false);
 }
});
test('E5.4e: a released pass never fabricates a holder or a catch',()=>{
 const p={id:'pass',players:{A:[10,20],B:[30,20]},phases:[],eventTimeline:{version:1,
  actors:[
   {actorId:'a',type:'attacker',phases:[{phaseIndex:0,slotKey:'A'}]},
   {actorId:'b',type:'attacker',phases:[{phaseIndex:0,slotKey:'B'}]}
  ],
  events:[
   {eventId:'e1',kind:'possession-set',actorId:'a',atMs:0,sequence:0},
   {eventId:'e2',kind:'pass-release',actorId:'a',receiverId:'b',movementId:'m1',atMs:100,sequence:0},
   {eventId:'e3',kind:'catch',actorId:'b',movementId:'m1',atMs:300,sequence:0}
  ]}};
 const flight=projectWatchField(p,0,200,p.players);
 assert.equal(flight.mode,'field-preview');
 assert.equal(flight.ball.state,'in-flight');
 assert.equal(flight.possessionPoint,null);
 assert.equal(flight.positions.some(x=>x.possession),false);
 const caught=projectWatchField(p,0,300,p.players);
 assert.equal(caught.ball.actorId,'b');
 assert.deepEqual(caught.possessionPoint,[30,20]);
});
