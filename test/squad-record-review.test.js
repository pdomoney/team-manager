import test from 'node:test';
import assert from 'node:assert/strict';
import {squadRecordReview} from '../site/squad-record-review.js';
import {teamView} from '../site/vault.js';

const team=()=>({id:'qarangers16',team:{name:'Example Rangers U16',sport:'Oztag'},
 players:[
  {id:'p1',name:'Fictional One',number:'8',positions:['Dummy half']},
  {id:'p2',name:'Fictional Two',number:'',positions:['Link']},
  {id:'p3',name:'Fictional Three',number:'11',positions:[]},
  {id:'p4',name:'Fictional Four',number:'',positions:[]}
 ],helpers:[],guardianReviews:[],sessions:[],matches:[],tasks:[],lineups:[],notices:[]});
const childRef=(id,t='qarangers16')=>JSON.stringify(['local-test','player',t,id]);
const relation=(id,status)=>({childPlayerRef:childRef(id),status});

test('M2.2 optional detail review is exact-team, unique and read-only',()=>{
 const t=team(),before=structuredClone(t);
 const result=squadRecordReview(t,[...t.players,t.players[1],{
   id:'some-other-team-player',name:'Foreign player',positions:[]
 }],[]);
 assert.equal(result.teamId,'qarangers16');
 assert.equal(result.total,4);
 assert.equal(result.reviewCount,3);
 assert.deepEqual(result.items.map(x=>[x.id,[...x.suggestions]]),[
  ['p2',['No jersey number']],['p3',['No preferred positions']],
  ['p4',['No jersey number','No preferred positions']]
 ]);
 assert.deepEqual(result.relationships,{recorded:0,needsSourceReview:0,reversed:0});
 assert.equal(result.legalGuardianVerified,false);
 assert.equal(result.grantsAccess,false);
 assert.equal(result.registrationVerified,false);
 assert.equal(result.competitionEligible,null);
 assert.deepEqual(t,before);
});
test('M2.2 reported relationship counts distinguish active/reversed/stale without inferring guardian rights',()=>{
 const t=team();
 const result=squadRecordReview(t,t.players,[
  relation('p1','recorded'),
  relation('p2','reversed'),
  relation('p3','changed-source'),
  relation('missing-child','missing-source'),
  {childPlayerRef:childRef('p1','qacometsmixed'),status:'recorded'},
  {childPlayerRef:'invalid-json',status:'recorded'},
  {childPlayerRef:childRef('p1'),status:'verified'},
  {childPlayerRef:JSON.stringify(['local-test','helper','qarangers16','p1']),status:'recorded'}
 ]);
 assert.deepEqual(result.relationships,{recorded:1,needsSourceReview:2,reversed:1});
 assert.equal(result.legalGuardianVerified,false);
 assert.equal(result.grantsAccess,false);
});
test('M2.2 does not infer absence of guardian records as unverified parental relationship',()=>{
 const t=team();
 const r=squadRecordReview(t,t.players,null);
 assert.equal(r.relationships,null,'unknown source context is not zero recorded relationships');
 assert.equal(r.items.length,3,'reported relationships do not change roster detail suggestions');
 assert.equal(squadRecordReview(null,t.players),null);
 assert.equal(squadRecordReview(t,{}),null);
});
test('M2.2 no new personal/child data is published by player export',()=>{
 const t=team();
 t.guardianReviews=[{childPlayerRef:childRef('p1'),status:'recorded',note:'PRIVATE'}];
 const report=squadRecordReview(t,t.players,t.guardianReviews);
 assert.equal(report.grantsAccess,false);
 const exportText=JSON.stringify(teamView(t));
 assert.equal(exportText.includes('guardianReviews'),false);
 assert.equal(exportText.includes('PRIVATE'),false);
 assert.equal(exportText.includes('reviewCount'),false);
});
