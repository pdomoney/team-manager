import test from 'node:test';
import assert from 'node:assert/strict';
import { bindWatchTimedActors } from '../site/play-watch-actor-binding.js';
const play = () => ({id:'p',players:{A:{},B:{}},phases:[],eventTimeline:{
  version:1,actors:[{actorId:'a',type:'attacker',phases:[{phaseIndex:0,slotKey:'A'}]}],
  events:[{eventId:'e1',kind:'possession-set',actorId:'a',atMs:0,sequence:0},
    {eventId:'e2',kind:'run-start',actorId:'a',atMs:500,sequence:0},
    {eventId:'e3',kind:'run-end',actorId:'a',atMs:1000,sequence:0}] }});
test('binds authored actor to explicit phase slot without moving legacy field',()=>{
 const p=play(),before=structuredClone(p);
 const result=bindWatchTimedActors(p,0,500);
 assert.equal(result.mode,'authored-bound');
 assert.equal(result.bindings[0].slotKey,'A');
 assert.equal(result.bindings[0].motion,'running');
 assert.equal(result.bindings[0].possession,true);
 assert.equal(result.renderTimedField,false);
 assert.deepEqual(p,before);
});
test('missing phase, invalid time and legacy play fail closed',()=>{
 assert.equal(bindWatchTimedActors(play(),1,0).mode,'legacy');
 assert.equal(bindWatchTimedActors(play(),-1,0).mode,'legacy');
 assert.equal(bindWatchTimedActors(play(),0,Number.MAX_SAFE_INTEGER,1).mode,'legacy');
 assert.equal(bindWatchTimedActors({},0,0).mode,'legacy');
});
