import test from 'node:test';
import assert from 'node:assert/strict';
import {matchArrivalGate as gate} from '../site/matchday-arrival-gate.js';
const data=()=>({
 team:{sport:'Netball'},players:[
  {id:'a',name:'Alex',positions:[],status:'available'},
  {id:'b',name:'Bree',positions:[],status:'unavailable'},
  {id:'c',name:'Chris',positions:[],status:'available'}
 ],
 seasons:[
  {id:'old',name:'2025',status:'archived',squad:[{playerId:'a',positions:[],status:'available'}]},
  {id:'active',name:'2026',status:'active',squad:[{playerId:'b',positions:[],status:'unavailable'}]}]
});
const fixture=(over={})=>({id:'match1',seasonId:'active',date:'2026-10-26',
 status:'scheduled',arrived:{},...over});
test('P11K same-day active fixture requires deliberate coach action and correct season',()=>{
 const d=data(),m=fixture(),before=structuredClone({d,m});
 const p=gate(d,m,null,'2026-10-26');
 assert.equal(p.mode,'editable');assert.equal(p.mayRecord,true);
 assert.deepEqual(p.playerIds,['b','c']);
 assert.equal(p.mayApproveEligibility,false);
 assert.ok(Object.isFrozen(p)&&Object.isFrozen(p.playerIds));
 assert.deepEqual({d,m},before);
});
test('P11K historical, off-date and completed matches are read only',()=>{
 for(const [change,today] of [
  [{seasonId:'old'},'2026-10-26'],
  [{date:'2026-10-27'},'2026-10-26'],
  [{status:'played'},'2026-10-26'],
  [{status:'cancelled'},'2026-10-26']]){
  const p=gate(data(),fixture(change),null,today);
  assert.equal(p.mode,'read-only');assert.equal(p.mayRecord,false);
  assert.equal(p.mayApproveEligibility,false);
 }
});
test('P11K missing match/season/date fails closed and no active-season borrowing',()=>{
 for(const input of [null,{},fixture({seasonId:'missing'}),fixture({seasonId:''})]){
  assert.equal(gate(data(),input,null,'2026-10-26').mode,'blocked');
 }
 assert.equal(gate(data(),fixture(),null,'').mayRecord,false);
});
test('P11K sports independent of field/bench sizes; Oztag untouched',()=>{
 const d=data();
 for(const sport of ['Rugby league','League tag','Touch football','Rugby union','Netball','AFL']){
  d.team.sport=sport;
  assert.equal(gate(d,fixture(),null,'2026-10-26').mayRecord,true,sport);
 }
 d.team.sport='Oztag';
 assert.equal(gate(d,fixture(),null,'2026-10-26').mode,'blocked');
});
