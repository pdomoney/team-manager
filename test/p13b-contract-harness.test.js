// Tests the contract manifest and evaluator implementation only.
// Every scenario is UNTESTED against real backend/database authorization.
// Mocks below exist to check that the harness fails on bad evidence; NEVER
// report a mock PASS as proof of actual cross-club / child privacy enforcement.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {
  validateP13Manifest,validateP13Evidence,runP13Contract
} from './support/p13b-contract-harness.js';
const here=dirname(fileURLToPath(import.meta.url));
const manifest=JSON.parse(readFileSync(resolve(here,'fixtures/p13b-security-vectors.json'),'utf8'));
const doc=readFileSync(resolve(here,'../docs/architecture/p13b-provider-neutral-security-test-contract-20261101.md'),'utf8');
const vectors=manifest.vectors;
const caseById=id=>vectors.find(v=>v.id===id);
const mockEvidence=v=>{
  const basic={decision:v.expectedOutcome};
  switch(v.expectedOutcome){
    case 'DENY':return {...basic,privateRecordsReturned:0,sensitiveFieldsReturned:0,
      unapprovedMutations:0,grantsCreated:0,existenceLeaked:false,
      denialAuditRecorded:true};
    case 'ALLOW-LIMITED':return {...basic,foreignRecordsReturned:0,
      unpermittedFieldsReturned:0,unauthorizedMutations:0,
      exactScopeVerified:true,projectionVerified:true};
    case 'REVIEW':return {...basic,grantsCreated:0,unapprovedMutations:0,
      productionRoleActivated:false,matchEligibilityCertified:false,
      reviewStatus:'pending',activationRequiresServerCommit:true};
    case 'ATOMIC-ONE':return {...basic,validTransitions:1,duplicateGrants:0,
      atomicityVerified:true};
    case 'ONE-TIME':return {...basic,validRedemptions:1,replayRedemptions:0,
      singleUseServerEnforced:true};
    case 'MANUAL-RISK':return {...basic,retrospectiveRevocationClaimed:false,
      historicalRiskAcknowledged:true,migrationRiskDecisionRef:'manual-review-placeholder'};
    default:throw new Error('Unsupported mock vector '+v.id);
  }
};
const mockAdapter=(overrides={})=>({
  environment:{kind:'mock',provider:'none',project:'fictional'},
  async prepare(){},
  async execute(vector){return {...mockEvidence(vector),...(overrides[vector.id]||{})};},
  async cleanup(){}
});

test('P13C: 60 immutable expected outcomes exactly match the accepted P13B source document',()=>{
  assert.deepEqual(validateP13Manifest(manifest),{ok:true,errors:[]});
  const lines=doc.split('\n').filter(l=>/^\| ID-\d{3} \|/.test(l));
  assert.equal(lines.length,60);
  for(let i=0;i<lines.length;i++){
    const [_,id,attempt,expected]=lines[i].split('|').map(x=>x.trim());
    assert.equal(vectors[i].id,id);
    assert.equal(vectors[i].attempt,attempt);
    assert.equal(vectors[i].expected,expected);
    assert.equal(vectors[i].state,'UNTESTED');
  }
});

test('P13C: manifest rejects missing, duplicate, re-ordered or falsely marked completed cases',()=>{
  for(const mutate of [
    m=>m.vectors.pop(),
    m=>m.vectors[1].id=m.vectors[0].id,
    m=>m.vectors.reverse(),
    m=>m.vectors[0].state='PASSED',
    m=>m.vectors[28].requiresAudit=false,
    m=>m.vectors[35].expectedOutcome='DENY',
    m=>m.environment='PRODUCTION'
  ]){
    const modified=structuredClone(manifest);mutate(modified);
    assert.equal(validateP13Manifest(modified).ok,false);
  }
});

test('P13C: source expectation coverage includes denial, limited access, proposal, concurrency and manual risk',()=>{
  const counts=vectors.reduce((m,v)=>(m[v.expectedOutcome]=(m[v.expectedOutcome]||0)+1,m),{});
  assert.deepEqual(counts,{
    DENY:47,'ALLOW-LIMITED':8,REVIEW:2,'ATOMIC-ONE':1,'ONE-TIME':1,'MANUAL-RISK':1
  });
  assert.equal(vectors.filter(v=>v.requiresAudit).length,2);
  assert.equal(vectors.filter(v=>v.requiresServerEvidence).length,59);
  assert.equal(caseById('ID-060').requiresServerEvidence,false);
});

test('P13C: denial with missing evidence, private field, leaked existence or write fails',()=>{
  const v=caseById('ID-004');
  assert.equal(validateP13Evidence(v,null).ok,false);
  const baseline=mockEvidence(v);
  assert.equal(validateP13Evidence(v,baseline).ok,true);
  for(const property of ['privateRecordsReturned','sensitiveFieldsReturned',
    'unapprovedMutations','grantsCreated']){
    assert.equal(validateP13Evidence(v,{...baseline,[property]:1}).ok,false,property);
    const missing={...baseline};delete missing[property];
    assert.equal(validateP13Evidence(v,missing).ok,false,property);
  }
  assert.equal(validateP13Evidence(v,{...baseline,existenceLeaked:true}).ok,false);
  assert.equal(validateP13Evidence(v,{...baseline,decision:'ALLOW-LIMITED'}).ok,false);
});

test('P13C: self approval and cross-club approval denied outcomes require audit evidence',()=>{
  for(const id of ['ID-029','ID-030']){
    const v=caseById(id),b=mockEvidence(v);
    assert.equal(validateP13Evidence(v,b).ok,true);
    assert.equal(validateP13Evidence(v,{...b,denialAuditRecorded:false}).ok,false);
    assert.equal(validateP13Evidence(v,{...b,denialAuditRecorded:undefined}).ok,false);
  }
});

test('P13C: allowed outcomes require exact scope and field projection checks',()=>{
  for(const id of ['ID-003','ID-007','ID-019','ID-022','ID-055','ID-056']){
    const v=caseById(id),b=mockEvidence(v);
    assert.equal(validateP13Evidence(v,b).ok,true,id);
    assert.equal(validateP13Evidence(v,{...b,foreignRecordsReturned:1}).ok,false,id);
    assert.equal(validateP13Evidence(v,{...b,projectionVerified:false}).ok,false,id);
    assert.equal(validateP13Evidence(v,{...b,unauthorizedMutations:1}).ok,false,id);
  }
});

test('P13C: approvals and match roles are only pending review, not permanent access or accreditation',()=>{
  for(const id of ['ID-031','ID-039']){
    const v=caseById(id),b=mockEvidence(v);
    assert.equal(validateP13Evidence(v,b).ok,true,id);
    for(const overrides of [
      {reviewStatus:'approved'},{grantsCreated:1},
      {productionRoleActivated:true},{matchEligibilityCertified:true}
    ])assert.equal(validateP13Evidence(v,{...b,...overrides}).ok,false,id);
  }
  const v=caseById('ID-031'),b=mockEvidence(v);
  assert.equal(validateP13Evidence(v,{...b,activationRequiresServerCommit:false}).ok,false);
});

test('P13C: racing approval and replayed invite require atomic and single-use backend evidence',()=>{
  const race=caseById('ID-034'),invite=caseById('ID-036');
  assert.equal(validateP13Evidence(race,mockEvidence(race)).ok,true);
  assert.equal(validateP13Evidence(invite,mockEvidence(invite)).ok,true);
  assert.equal(validateP13Evidence(race,{...mockEvidence(race),duplicateGrants:1}).ok,false);
  assert.equal(validateP13Evidence(race,{...mockEvidence(race),atomicityVerified:false}).ok,false);
  assert.equal(validateP13Evidence(invite,{...mockEvidence(invite),replayRedemptions:1}).ok,false);
  assert.equal(validateP13Evidence(invite,{...mockEvidence(invite),singleUseServerEnforced:false}).ok,false);
});

test('P13C: historic encrypted Git blob case cannot claim retrospective revocation',()=>{
  const v=caseById('ID-060'),b=mockEvidence(v);
  assert.equal(validateP13Evidence(v,b).ok,true);
  assert.equal(validateP13Evidence(v,{...b,retrospectiveRevocationClaimed:true}).ok,false);
  assert.equal(validateP13Evidence(v,{...b,migrationRiskDecisionRef:''}).ok,false);
});

test('P13C: no backend configured means no execution or false server acceptance',async()=>{
  await assert.rejects(runP13Contract(null,manifest),/No configured test adapter/);
  await assert.rejects(runP13Contract(mockAdapter(),manifest),/Mock results cannot qualify real server permissions/);
  const bad=structuredClone(manifest);bad.vectors[0].state='PASSED';
  await assert.rejects(runP13Contract(mockAdapter(),bad,{requireServer:false}),/Invalid P13 contract/);
});

test('P13C: mock harness self-test does not count as real server security, even with 59 matching dummy outcomes',async()=>{
  const result=await runP13Contract(mockAdapter(),manifest,{requireServer:false});
  assert.equal(result.pass,59);
  assert.equal(result.fail,0);
  assert.equal(result.unrun,0);
  assert.equal(result.results[59].status,'REQUIRES-MANUAL-REVIEW');
  assert.equal(result.environment,'mock');
  assert.equal(result.serverEvidenceQualified,false);
  assert.equal(result.securityAccepted,false);
  assert.equal(result.productionApproval,false);
});

test('P13C: malicious or incomplete mock evidence fails the contract and is recorded by scenario ID',async()=>{
  const broken=mockAdapter({
    'ID-004':{privateRecordsReturned:1},
    'ID-022':{foreignRecordsReturned:1},
    'ID-029':{denialAuditRecorded:false},
    'ID-031':{productionRoleActivated:true},
    'ID-034':{validTransitions:2},
    'ID-036':{replayRedemptions:1}
  });
  const result=await runP13Contract(broken,manifest,{requireServer:false});
  assert.equal(result.fail,6);
  assert.equal(result.pass,53);
  assert.equal(result.serverEvidenceQualified,false);
  for(const id of ['ID-004','ID-022','ID-029','ID-031','ID-034','ID-036'])
    assert.equal(result.results.find(x=>x.id===id).status,'FAIL',id);
});

test('P13C: cleanup or backend exception is never silently counted as pass',async()=>{
  const adapter=mockAdapter();
  const original=adapter.cleanup;
  adapter.cleanup=async v=>{if(v.id==='ID-002')throw new Error('Cleanup failed on fake DB');await original(v);};
  const result=await runP13Contract(adapter,manifest,{requireServer:false});
  assert.equal(result.fail,1);
  assert.ok(result.results.find(x=>x.id==='ID-002').errors.some(x=>x.includes('Cleanup failed')));
  assert.equal(result.securityAccepted,false);
});

test('P13C: a claimed isolated-server adapter must supply verified project provenance',async()=>{
  const adapter=mockAdapter();adapter.environment={kind:'isolated-server'};
  await assert.rejects(runP13Contract(adapter,manifest),/Missing isolated server provenance/);
});
