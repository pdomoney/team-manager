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
