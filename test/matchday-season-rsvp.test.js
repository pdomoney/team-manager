import test from 'node:test';
import assert from 'node:assert/strict';
import {matchReplyRosterScope as scope} from '../site/matchday-season-rsvp.js';
const sample=()=>({
 id:'team1',team:{sport:'Netball'},players:[
 {id:'a',name:'2019 roster',status:'available',positions:[]},
 {id:'b',name:'2026 roster',status:'available',positions:[]},
 {id:'c',name:'Unassigned',status:'available',positions:[]}],
 seasons:[
 {id:'past',name:'2019',status:'completed',squad:[{playerId:'a',status:'available',number:'9',positions:[]}]},
 {id:'current',name:'2026',status:'active',squad:[{playerId:'b',status:'available',number:'6',positions:[]}]}]
});
test('P11J archived match uses only its actual archived-season members',()=>{
 const d=sample(),m={id:'old-fixture',seasonId:'past'},before=structuredClone({d,m});
 const p=scope(d,m);
 assert.equal(p.mode,'fixture-season');
 assert.deepEqual(p.playerIds,['a']);
 assert.equal(p.seasonId,'past');
 assert.equal(p.verifiedEligibility,false);
 assert.equal(p.changesWorkspace,false);
 assert.ok(Object.isFrozen(p)&&Object.isFrozen(p.playerIds));
 assert.deepEqual({d,m},before);
});
test('P11J missing or invalid season cannot borrow the current squad',()=>{
 const d=sample();
 for(const sid of ['','orphaned-season']){
  const p=scope(d,{id:'f',seasonId:sid});
  assert.equal(p.mode,'blocked');
  assert.deepEqual(p.playerIds,[]);
  assert.match(p.reason,/no valid recorded season/);
 }
});
test('P11J current active season follows existing season-lens fallback membership',()=>{
 const d=sample(),p=scope(d,{id:'f',seasonId:'current'});
 assert.equal(p.mode,'fixture-season');
 assert.deepEqual(p.playerIds,['b','c']);
});
test('P11J league/tag/touch/netball review scope stays distinct from an Oztag RSVP',()=>{
 const d=sample(),m={id:'f',seasonId:'past'};
 for(const sport of ['Rugby league','League tag','Touch football','Netball','Rugby union','AFL']){
  d.team.sport=sport;
  const p=scope(d,m);
  assert.equal(p.mode,'fixture-season',sport);
  assert.deepEqual(p.playerIds,['a'],sport);
 }
 d.team.sport='Oztag';
 const existing=scope(d,m);
 assert.equal(existing.mode,'legacy-oztag');
 assert.deepEqual(existing.playerIds,[]);
});
test('P11J unknown fixture/team blocks RSVP rather than exposing current roster',()=>{
 for(const [a,b] of [[null,{id:'f'}],[sample(),null],[sample(),{}],['bad',{id:'f'}]]){
  const p=scope(a,b);
  assert.equal(p.mode,'blocked');
  assert.equal(p.changesWorkspace,false);
 }
});
