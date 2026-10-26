import test from 'node:test';
import assert from 'node:assert/strict';
import {rosterRecordReview as review} from '../site/matchday-roster-review.js';
import {matchRosterReadiness as roster} from '../site/matchday-roster-readiness.js';
const d=()=>({team:{sport:'Netball'},id:'team1',
 players:[
 {id:'p1',name:'A',status:'available',positions:[]},
 {id:'p2',name:'B',status:'injured',positions:[]},
 {id:'p3',name:'C',status:'available',positions:[]},
 {id:'p4',name:'D',status:'unavailable',positions:[]},
 {id:'p5',name:'E',status:'available',positions:[]},
 {id:'p6',name:'F',status:'available',positions:[]}],
 seasons:[{id:'s',name:'2026',status:'active',
  squad:['p1','p2','p3','p4','p5','p6'].map(playerId=>({playerId,number:'',positions:[],status:'available'}))}]
});
const m=()=>({id:'match1',seasonId:'s',rsvp:{
 p1:{v:'no'},p2:{v:'yes'},p3:{v:'maybe'},p4:{v:'yes'},p6:{v:'yes'}
},arrived:{p1:true,p2:true,p3:true,p4:false,p5:true,p6:false}});
test('P11H identifies contradictions without calculating eligibility or writing anything',()=>{
 const data=d(),match=m(),before=structuredClone({data,match});
 const r=review(roster(data,match));
 assert.equal(r.state,'review-only');
 assert.equal(r.total,5);
 assert.deepEqual(r.players.map(x=>x.name),['A','B','C','D','E']);
 assert.deepEqual(r.players.find(x=>x.name==='A').issues.map(x=>x.code),['arrivedDeclined']);
 assert.deepEqual(r.players.find(x=>x.name==='B').issues.map(x=>x.code),
  ['arrivedUnavailable','acceptedUnavailable']);
 assert.deepEqual(r.players.find(x=>x.name==='C').issues.map(x=>x.code),['arrivedUnsure']);
 assert.deepEqual(r.players.find(x=>x.name==='D').issues.map(x=>x.code),['acceptedUnavailable']);
 assert.deepEqual(r.players.find(x=>x.name==='E').issues.map(x=>x.code),['arrivedNoReply']);
 assert.equal(r.eligibleToPlay,null);assert.equal(r.noWrites,true);assert.equal(r.canAutoResolve,false);
 assert.ok(Object.isFrozen(r)&&Object.isFrozen(r.players)&&Object.isFrozen(r.players[1].issues));
 assert.deepEqual({data,match},before);
});
test('P11H no contradictions leaves an explicit zero review state',()=>{
 const x=d(),match={id:'fixture',seasonId:'s',rsvp:{p1:{v:'yes'}},arrived:{}};
 const r=review(roster(x,match));
 assert.equal(r.total,0);assert.equal(r.requiresHumanReview,false);
 assert.equal(r.eligibleToPlay,null);
});
test('P11H missing match season fails closed; no active-season fallback',()=>{
 const r=review(roster(d(),{id:'fixture',seasonId:'missing',rsvp:{},arrived:{p1:true}}));
 assert.equal(r.state,'unavailable');assert.equal(r.total,0);assert.equal(r.noWrites,true);
});
test('P11H keeps read-only flags across multiple sports without guessing athlete requirements',()=>{
 const team=d();
 for(const sport of ['Rugby league','League tag','Touch football','Netball','AFL']){
  team.team.sport=sport;
  const r=review(roster(team,m()));
  assert.equal(r.total,5,sport);
  assert.equal(r.canAutoResolve,false,sport);
  assert.equal(r.eligibleToPlay,null,sport);
 }
});
test('P11H rejects malformed snapshots and does not duplicate repeated group snapshots',()=>{
 assert.equal(review(null).state,'unavailable');
 assert.equal(review({state:'view-only',groups:null}).state,'unavailable');
 const input={state:'view-only',groups:[{players:[{name:'A',number:'1',reply:'no',status:'available',arrived:true},
  {name:'A',number:'1',reply:'no',status:'available',arrived:true}]}]};
 assert.equal(review(input).total,1);
});
