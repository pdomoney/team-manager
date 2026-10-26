import test from 'node:test';
import assert from 'node:assert/strict';
import {matchPreparationSummary as prep} from '../site/matchday-preparation.js';
const data=()=>({id:'team1',team:{sport:'Netball'},players:[
 {id:'p1',name:'Alex',positions:[],status:'available'},
 {id:'p2',name:'Bree',positions:[],status:'injured'}
],seasons:[{id:'s1',name:'2026',status:'active',
 squad:['p1','p2'].map(playerId=>({playerId,positions:[],number:'',status:'available'}))}]});
const fixture=()=>({id:'m1',seasonId:'s1',status:'scheduled',date:'2026-10-26',
 rsvp:{p1:{v:'yes'},p2:{v:'no'}},arrived:{p1:true,p2:true}});
const rules={questions:[{id:'score'},{id:'lineup'}],blockers:['Check age category']};
test('P11L combines season RSVP, arrival, human conflicts and rules without writing',()=>{
 const d=data(),m=fixture(),original=structuredClone({d,m});
 const a=prep(d,m,null,'2026-10-26',rules);
 assert.equal(a.state,'review-only');assert.equal(a.total,2);
 assert.equal(a.arrivalCount,2);assert.equal(a.conflictingRecords,1);
 assert.equal(a.requiredRulesQuestions,2);assert.equal(a.scopeRuleBlockers,1);
 assert.equal(a.canOpenRoster,true);assert.equal(a.canOpenVenue,true);
 assert.equal(a.mayScore,false);assert.equal(a.rulesReady,false);
 assert.equal(a.verifiedEligibility,false);assert.equal(a.approvedLineup,false);
 assert.equal(a.noWrites,true);assert.ok(Object.isFrozen(a));
 assert.deepEqual({d,m},original);
});
test('P11L missing season, future/closed game and Oztag boundaries stay safe',()=>{
 const d=data(),m=fixture();
 const orphan=prep(d,{...m,seasonId:'unknown'},null,'2026-10-26',rules);
 assert.equal(orphan.state,'unavailable');assert.equal(orphan.canOpenRoster,false);
 assert.equal(orphan.canOpenVenue,false);assert.equal(orphan.mayScore,false);
 const later=prep(d,m,null,'2026-10-27',rules);
 assert.equal(later.arrivalMode,'read-only');assert.equal(later.canOpenVenue,true);
 const complete=prep(d,{...m,status:'played'},null,'2026-10-26',rules);
 assert.equal(complete.arrivalMode,'read-only');
 d.team.sport='Oztag';
 assert.equal(prep(d,m,null,'2026-10-26',rules).state,'legacy-oztag');
});
test('P11L applies unchanged review-only boundary across unrelated sports',()=>{
 const d=data(),m=fixture();
 for(const sport of ['Rugby league','League tag','Touch football','Netball','AFL']){
  d.team.sport=sport;
  const s=prep(d,m,null,'2026-10-26');
  assert.equal(s.total,2,sport);assert.equal(s.mayScore,false,sport);
  assert.equal(s.verifiedEligibility,false,sport);
 }
});
