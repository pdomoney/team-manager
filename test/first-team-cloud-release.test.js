import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {evaluateFirstTeamCloudRelease,FIRST_TEAM_GATES} from '../src/first-team-cloud-release.js';

const ledger=JSON.parse(readFileSync(new URL('../config/first-team-cloud-release-evidence.json',import.meta.url),'utf8'));
const clone=()=>structuredClone(ledger);
const SHA='b'.repeat(40),OTHER='c'.repeat(40);
const proof='evidence-ref:synthetic-contract-test';
function syntheticComplete(){
  // Deliberately invented evidence to TEST the evaluator, never real signoff.
  const e=clone();
  e.candidate={sourceSha:SHA,installedSha:SHA,runtime:'individually-authenticated-server'};
  e.ownerDecision={
    status:'approved',provider:'Fictional Provider',plan:'Synthetic Plan',
    region:'Test Australian Region',controller:'Fictional Club',
    launchMode:'coach-manager-private',dataScope:'approved-limited-real',
    minorDataPolicy:'excluded',ownerApprovalRef:proof,
    providerCostRef:proof,retentionDeletionRef:proof,
    privacyNoticeRef:proof,minorDataDecisionRef:proof
  };
  e.serverSecurity={
    environment:'real-isolated-server',automatedCasesPassed:59,automatedCasesFailed:0,
    manualHistoricalRiskAccepted:true,independentlyReviewed:true,
    reportRef:proof,independentReviewRef:proof,sourceSha:SHA
  };
  e.deviceEvidence={
    iphoneSafari:proof,macosSafari:proof,voiceOver:proof,twoDeviceRecovery:proof
  };
  for(const id of FIRST_TEAM_GATES)
    e.gates[id]={status:'passed',testedSha:SHA,observedOn:'2026-11-27',evidenceRef:proof};
  return e;
}
const evaluate=evaluateFirstTeamCloudRelease;
test('committed first-team ledger is explicitly blocked: no identity, provider, real data or release claim',()=>{
  assert.equal(ledger.kind,'first-team-cloud-live-release');
  assert.equal(ledger.candidate.runtime,'static-pages-only');
  assert.equal(ledger.ownerDecision.status,'pending');
  assert.equal(ledger.serverSecurity.environment,'NO_BACKEND');
  assert.deepEqual(Object.keys(ledger.gates),FIRST_TEAM_GATES);
  assert.ok(FIRST_TEAM_GATES.every(id=>ledger.gates[id].status==='pending'));
  assert.deepEqual({completed:evaluate(ledger).completed,total:evaluate(ledger).total}, {completed:0,total:7});
  assert.equal(evaluate(ledger).ready,false);
});
test('a structurally complete fabricated fixture tests evaluator logic but not external truth',()=>{
  const synthetic=syntheticComplete();
  assert.equal(evaluate(synthetic).ready,true);
  assert.equal(evaluate(synthetic).completed,7);
  assert.equal(evaluate(ledger).ready,false);
});
test('successful GitHub Pages alone cannot qualify even with seven claimed passing gates',()=>{
  const e=syntheticComplete();
  e.candidate.runtime='static-pages-only';
  assert.equal(evaluate(e).ready,false);
  assert.ok(evaluate(e).blockers.some(s=>s.includes('GitHub Pages')));
});
test('unauthorised supplier choice, payment, data scope and child policy always block release',()=>{
  for(const [key,value] of [
    ['status','pending'],['provider',null],['plan',null],['region',null],
    ['controller',null],['launchMode','public-self-service'],
    ['dataScope','synthetic-only'],['minorDataPolicy','undecided'],
    ['ownerApprovalRef',null],['providerCostRef','unsafe?token=value'],
    ['retentionDeletionRef',null],['privacyNoticeRef',null],
    ['minorDataDecisionRef',null]
  ]){
    const e=syntheticComplete();e.ownerDecision[key]=value;
    assert.equal(evaluate(e).ready,false,key);
  }
});
test('mock P13C results, missing real security review or historical exposure risk block release',()=>{
  for(const [key,value] of [
    ['environment','mock'],['automatedCasesPassed',0],['automatedCasesFailed',1],
    ['manualHistoricalRiskAccepted',false],['independentlyReviewed',false],
    ['reportRef',null],['independentReviewRef',null],['sourceSha',OTHER]
  ]){
    const e=syntheticComplete();e.serverSecurity[key]=value;
    assert.equal(evaluate(e).ready,false,key);
  }
});
test('physical-device and recovery evidence cannot be replaced by Playwright alone',()=>{
  for(const key of Object.keys(ledger.deviceEvidence)){
    const e=syntheticComplete();e.deviceEvidence[key]=null;
    assert.equal(evaluate(e).ready,false,key);
  }
});
test('missing/unknown/waived gates and out-of-sequence gates never qualify release',()=>{
  for(const id of FIRST_TEAM_GATES){
    for(const value of [undefined,{status:'waived'},{status:'pending'}]){
      const e=syntheticComplete();
      if(value===undefined)delete e.gates[id];else e.gates[id]=value;
      assert.equal(evaluate(e).ready,false,id);
    }
  }
  const e=syntheticComplete();e.gates.L9_UNKNOWN={status:'passed',testedSha:SHA,
    observedOn:'2026-11-27',evidenceRef:proof};
  assert.equal(evaluate(e).ready,false);
  assert.ok(evaluate(e).blockers.some(s=>s.includes('Unknown release gate')));
  const outOfOrder=syntheticComplete();outOfOrder.gates.L0_OWNER_AND_DATA_POLICY.status='pending';
  assert.equal(evaluate(outOfOrder).ready,false);
  assert.ok(evaluate(outOfOrder).blockers.some(s=>s.includes('L0 must be approved')));
});
test('stale source/deployed SHA and stale per-gate evidence block a formerly qualified record',()=>{
  for(const change of [
    e=>{e.candidate.installedSha=OTHER;},
    e=>{e.candidate.sourceSha=OTHER;},
    e=>{e.gates.L3_REAL_SERVER_SECURITY.testedSha=OTHER;},
    e=>{e.gates.L6_OWNER_LIVE_RELEASE_ACCEPTANCE.evidenceRef='https://untrusted.example.com';},
    e=>{e.gates.L5_PHYSICAL_SAFARI_AND_RECOVERY.observedOn='2026-02-31';}
  ]){
    const e=syntheticComplete();change(e);
    assert.equal(evaluate(e).ready,false);
  }
});
test('invalid input, malformed dates, unsafe evidence references and unknown schema fail closed',()=>{
  for(const e of [null,undefined,[],{},1,{kind:'first-team-cloud-live-release',schemaVersion:99}]){
    assert.equal(evaluate(e).ready,false);
  }
  for(const ref of ['https://example.com/private?token=abc','evidence-ref:x?secret=123',
    'docs/../../private.txt','https://github.com/pdomoney/team-manager/issues/55?token=abc']){
    const e=syntheticComplete();e.ownerDecision.ownerApprovalRef=ref;
    assert.equal(evaluate(e).ready,false,ref);
  }
});
test('CLI returns nonzero for unapproved source, supports sanitised external stdin, rejects file paths',()=>{
  const cli=fileURLToPath(new URL('../scripts/check-first-team-cloud-release.mjs',import.meta.url));
  const run=(args,input)=>spawnSync(process.execPath,[cli,...args],{input,encoding:'utf8'});
  const pending=run([]);assert.equal(pending.status,1,pending.stderr);
  assert.equal(JSON.parse(pending.stdout).ready,false);
  const safeCI=run(['--assert-source-blocked']);
  assert.equal(safeCI.status,0,safeCI.stderr);
  assert.equal(JSON.parse(safeCI.stdout).completed,0);
  const proofRun=run(['--stdin'],JSON.stringify(syntheticComplete()));
  assert.equal(proofRun.status,0,proofRun.stderr);
  assert.equal(JSON.parse(proofRun.stdout).ready,true);
  const bad=run(['--stdin'],JSON.stringify(clone()));
  assert.equal(bad.status,1,bad.stderr);
  for(const args of [['/tmp/private.json'],['--unsafe'],['--stdin','/tmp/real.json']]){
    const rejected=run(args);assert.equal(rejected.status,2,args.join(' '));
    assert.equal(rejected.stdout,'');
  }
  const malformed=run(['--stdin'],'{broken');
  assert.equal(malformed.status,2);
});
