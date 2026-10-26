import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureScorePreviewGate as gate} from '../site/score-preview-fixture-gate.js';
import {sourceScorePreviewPolicy as preview} from '../site/source-score-preview.js';
const policy=preview({sport:'Rugby league',rules:'league/men',ageGroup:'open',category:'men'});
const match=()=>({id:'m1',entryId:'entry1',seasonId:'season1',status:'scheduled'});
const link=()=>({kind:'competition',comp:{id:'c1',sport:'Rugby league'},entry:{
 id:'entry1',teamId:'team1',status:'entered',seasonId:'season1'}});
test('P11D exact team, season and competition binding allows a transient example only',()=>{
 const m=match(),l=link(),beforeM=structuredClone(m),beforeL=structuredClone(l);
 const r=gate(policy,m,l,'team1');
 assert.equal(r.allowed,true);
 assert.equal(r.status,'available');
 assert.equal(r.previewOnly,true);
 assert.equal(r.maySaveScore,false);
 assert.equal(r.competitionPolicyApproved,false);
 assert.equal(r.mayChangeWorkspace,false);
 assert.ok(Object.isFrozen(r));
 assert.deepEqual(m,beforeM);
 assert.deepEqual(l,beforeL);
});
test('P11D unlinked friendly fixture can still show an explicitly unapproved teaching example',()=>{
 const r=gate(policy,{id:'m1',entryId:'',friendly:true}, {kind:'friendly',comp:null,entry:null},'team1');
 assert.equal(r.allowed,true);
 assert.match(r.reason,/Unlinked fixture/);
 assert.equal(r.competitionPolicyApproved,false);
});
test('P11D orphan entries and forged team IDs fail closed',()=>{
 for(const x of [
  [null,'missing-entry'],
  [{kind:'none',comp:null,entry:null},'missing-entry'],
  [{...link(),entry:{...link().entry,id:'other'}},'missing-entry'],
  [{...link(),entry:{...link().entry,teamId:'team2'}},'team-mismatch'],
  [{...link(),entry:{...link().entry,status:'withdrawn'}},'not-entered'],
 ]){
  const r=gate(policy,match(),x[0],'team1');
  assert.equal(r.allowed,false);
  assert.equal(r.status,x[1]);
 }
});
test('P11D wrong/missing competition sport and season cannot borrow an adult league score preview',()=>{
 const variations=[
  [x=>{x.comp.sport='League tag';},'sport-mismatch'],
  [x=>{x.comp.sport='';},'unknown-competition-sport'],
  [x=>{x.entry.seasonId='other';},'season-mismatch'],
  [x=>{x.entry.seasonId='';},'season-not-resolved']
 ];
 for(const [mutate,status] of variations){
  const l=link();mutate(l);
  const r=gate(policy,match(),l,'team1');
  assert.equal(r.status,status);
  assert.equal(r.allowed,false);
 }
 assert.equal(gate(policy,{...match(),seasonId:''},link(),'team1').status,'season-not-resolved');
 assert.equal(gate(policy,{...match(),friendly:true},link(),'team1').status,'fixture-conflict');
});
test('P11D unsupported policy, exact fixture or team fails closed',()=>{
 const m=match(),l=link();
 assert.equal(gate(null,m,l,'team1').allowed,false);
 assert.equal(gate({...policy,persistable:true},m,l,'team1').allowed,false);
 assert.equal(gate(policy,{...m,id:''},l,'team1').allowed,false);
 assert.equal(gate(policy,m,l,'').allowed,false);
 assert.equal(gate(policy,null,l,'team1').allowed,false);
});
