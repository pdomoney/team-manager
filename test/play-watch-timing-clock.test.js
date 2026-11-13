import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceWatchTiming } from '../site/play-watch-timing-clock.js';
const play = { id:'p', players:{A:{}}, phases:[], eventTimeline:{ version:1,
  actors:[{actorId:'a',type:'attacker',phases:[{phaseIndex:0,slotKey:'A'}]}],
  events:[{eventId:'e1',atMs:0,sequence:0,kind:'possession-set',actorId:'a'},
          {eventId:'e2',atMs:500,sequence:0,kind:'run-start',actorId:'a'},
          {eventId:'e3',atMs:1000,sequence:0,kind:'run-end',actorId:'a'}] } };
test('advances authored Watch preview deterministically and clamps at end',()=>{
  const before=structuredClone(play);
  const mid=advanceWatchTiming(play,0,250,2);
  assert.equal(mid.mode,'authored-preview');
  assert.equal(mid.atMs,500);
  assert.equal(mid.motion.a,'running');
  assert.equal(mid.playing,true);
  assert.equal(mid.renderTimedField,false);
  const end=advanceWatchTiming(play,500,1000);
  assert.equal(end.atMs,1000);
  assert.equal(end.playing,false);
  assert.deepEqual(play,before);
});
test('legacy and invalid clock values cannot activate timed playback',()=>{
  assert.equal(advanceWatchTiming({},0,100).mode,'legacy');
  for(const value of [-1,0.5,Number.MAX_SAFE_INTEGER+1]) assert.equal(advanceWatchTiming(play,value,100).mode,'legacy');
  assert.equal(advanceWatchTiming(play,0,100,0).mode,'legacy');
  assert.equal(advanceWatchTiming(play,Number.MAX_SAFE_INTEGER,1).mode,'legacy');
});
