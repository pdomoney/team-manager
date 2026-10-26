import test from 'node:test';
import assert from 'node:assert/strict';
import {matchRosterReadiness as roster} from '../site/matchday-roster-readiness.js';
const data=()=>({
 id:'team-one',team:{sport:'Rugby league'},
 seasons:[
  {id:'old',name:'2025',status:'archived',squad:[{playerId:'oldp',number:'14',positions:['Centre'],status:'available'}]},
  {id:'now',name:'2026',status:'active',squad:[
   {playerId:'p1',number:'1',positions:['Fullback'],status:'available'},
   {playerId:'p2',number:'2',positions:['Wing'],status:'injured'},
   {playerId:'p3',number:'3',positions:['Centre'],status:'available'},
   {playerId:'p4',number:'4',positions:['Halfback'],status:'available'},
   {playerId:'p5',number:'5',positions:['Centre'],status:'unavailable'}
  ]}
 ],
 players:[
  {id:'oldp',name:'Old season only',positions:['Centre'],status:'available'},
  {id:'p1',name:'Alex',number:'1',status:'available',positions:['Fullback']},
  {id:'p2',name:'Bree',number:'2',status:'injured',positions:['Wing']},
  {id:'p3',name:'Casey',number:'3',status:'available',positions:['Centre']},
  {id:'p4',name:'Drew',number:'4',status:'available',positions:['Halfback']},
  {id:'p5',name:'Eli',number:'5',status:'unavailable',positions:['Centre']}
 ]
});
const match=()=>({id:'fixture',seasonId:'now',rsvp:{
 p1:{v:'yes'},p2:{v:'yes'},p3:{v:'maybe'},p5:{v:'no'}},
 arrived:{p1:true,p2:true}});
test('P11G explicit 2026 match roster includes only matching season members and replies',()=>{
 const d=data(),m=match(),before=structuredClone({d,m});
 const p=roster(d,m);
 assert.equal(p.state,'view-only');
 assert.equal(p.sport,'Rugby league');
 assert.equal(p.season,'2026');
 assert.equal(p.total,5);
 assert.deepEqual(p.groups.map(g=>[g.id,g.count]),[
  ['attending',1],['needs-review',2],['no-reply',1],['declined',1]
 ]);
 assert.deepEqual(p.groups[0].players[0].preferred,['Fullback']);
 assert.equal(p.groups[0].players[0].arrived,true);
 assert.equal(p.groups[1].players.find(x=>x.name==='Bree').status,'injured');
 assert.equal(p.groups.some(g=>g.players.some(x=>x.name==='Old season only')),false);
 assert.equal(p.readyForLineup,false);
 assert.equal(p.eligiblePlayersVerified,false);
 assert.equal(p.approvedOnFieldCount,null);
 assert.ok(Object.isFrozen(p)&&Object.isFrozen(p.groups)&&Object.isFrozen(p.groups[0].players));
 assert.deepEqual({d,m},before);
});
test('P11G unknown, missing and old seasons must not substitute the active roster',()=>{
 const d=data();
 for(const sid of ['','missing']){
  const p=roster(d,{...match(),seasonId:sid});
  assert.equal(p.state,'unavailable');
  assert.equal(p.total,0);
  assert.equal(p.groups.every(g=>g.count===0),true);
 }
 const old=roster(d,{id:'m-old',seasonId:'old',rsvp:{}});
 assert.equal(old.season,'2025');
 assert.deepEqual(old.groups.flatMap(g=>g.players.map(x=>x.name)),['Old season only']);
});
test('P11G no eligibility decisions inferred from RSVP, reported injury or preferred positions',()=>{
 const d=data();
 for(const sport of ['League tag','Touch football','Netball','Rugby union','AFL']){
  d.team.sport=sport;
  const p=roster(d,match());
  assert.equal(p.sport,sport);
  assert.equal(p.canEdit,false);
  assert.equal(p.readyForLineup,false);
  assert.equal(p.eligiblePlayersVerified,false);
  assert.equal(p.approvedOnFieldCount,null);
 }
});
test('P11G duplicate player records do not inflate counts or add unknown IDs',()=>{
 const d=data();d.players.push(structuredClone(d.players[1]));
 const p=roster(d,match());
 assert.equal(p.total,5);
 assert.equal(p.groups.reduce((n,g)=>n+g.count,0),5);
});
test('P11G malformed input fails closed with no private data copied or mutation',()=>{
 assert.equal(roster(null,match()).state,'unavailable');
 assert.equal(roster(data(),{}).state,'unavailable');
 assert.equal(roster(data(),null).state,'unavailable');
 const d=data(),m=match();m.rsvp.p1={v:'BAD'};
 const p=roster(d,m);
 assert.equal(p.groups.find(g=>g.id==='no-reply').players.some(x=>x.name==='Alex'),true);
 assert.equal(p.matchDataChanged,false);
});
