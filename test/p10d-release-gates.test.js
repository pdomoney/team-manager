import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evaluateP10Release, SAFARI_IDS, HARD_GATES, UNWAIVABLE_CASES } from '../src/p10d-release-gates.js';

const ledger=JSON.parse(readFileSync(new URL('../config/p10d-release-evidence.json', import.meta.url),'utf8'));
const clone=()=>structuredClone(ledger);
const HEAD='a'.repeat(40), MAIN='b'.repeat(40);
function syntheticQualified() {
  const x=clone();
  x.candidate={prNumber:93,headSha:HEAD,mergeSha:MAIN};
  for (const id of SAFARI_IDS) x.safariCases[id]={
    status:'passed',testedCommit:MAIN,deviceModel:'Test iPhone or Mac',osVersion:'Test OS version',
    safariVersion:'Test Safari version',observedAt:'2026-10-25',evidenceRef:'evidence-ref:synthetic-test-only'
  };
  for (const id of HARD_GATES) x.releaseGates[id]={
    status:'passed',testedCommit:id.startsWith('PR_HEAD_')?HEAD:MAIN,
    observedAt:'2026-10-25',evidenceRef:'evidence-ref:synthetic-test-only'
  };
  return x;
}
test('P10D ledger accepts owner functional UAT but never asserts physical Safari results',()=>{
  assert.equal(ledger.ownerUserAcceptance.status,'accepted');
  assert.equal(ledger.ownerUserAcceptance.baselineSha,'3a46fcffad7805afa1e0b4c209ab17dbb03b029d');
  assert.equal(Object.keys(ledger.safariCases).length,36);
  assert.deepEqual(Object.keys(ledger.safariCases),SAFARI_IDS);
  assert.ok(Object.values(ledger.safariCases).every(x=>x.status==='pending'));
  assert.ok(Object.values(ledger.releaseGates).every(x=>x.status==='pending'));
});
test('P10D owner UAT alone cannot make a release ready',()=>{
  const d=evaluateP10Release(clone());
  assert.equal(d.ready,false);
  assert.equal(d.completed,0);
  assert.equal(d.total,SAFARI_IDS.length+HARD_GATES.length);
  assert.equal(d.ownerUserAcceptance,'accepted');
  assert.ok(d.blockers.some(s=>s.includes('FINAL_RELEASE_APPROVAL')));
  assert.ok(d.blockers.some(s=>s.includes('P06-V1')));
});
test('P10D evaluator can approve only a fully documented synthetic fixture, not repository ledger',()=>{
  const good=syntheticQualified();
  assert.equal(evaluateP10Release(good).ready,true);
  assert.equal(evaluateP10Release(good).completed,SAFARI_IDS.length+HARD_GATES.length);
  good.releaseGates.FINAL_RELEASE_APPROVAL.status='pending';
  assert.equal(evaluateP10Release(good).ready,false);
});
test('P10D protects missing, out-of-date and incorrect SHA evidence',()=>{
  const d=syntheticQualified();
  d.candidate.mergeSha='c'.repeat(40);
  const outcome=evaluateP10Release(d);
  assert.equal(outcome.ready,false);
  assert.ok(outcome.blockers.some(s=>s.startsWith('MAIN_NODE_BROWSER')));
  assert.ok(outcome.blockers.some(s=>s.startsWith('P06-V1')));
});
test('P10D Safari waivers require a per-case owner, rationale and explicit risk decision',()=>{
  const d=syntheticQualified();
  d.safariCases['P06-V1']={status:'waived'};
  assert.equal(evaluateP10Release(d).ready,false);
  d.safariCases['P06-V1']={status:'waived',owner:'Product owner',
    reason:'Specific browser interaction deferred for current platform',
    riskDecision:'Known UI risk accepted for this case only',decidedAt:'2026-10-25'};
  assert.equal(evaluateP10Release(d).ready,true);
});
test('P10D safeguarding/privacy cases and hard release gates cannot be waived',()=>{
  for (const id of UNWAIVABLE_CASES) {
    const d=syntheticQualified();
    d.safariCases[id]={status:'waived',owner:'Product owner',reason:'Accept the risk of this test',
      riskDecision:'Risk acknowledged',decidedAt:'2026-10-25'};
    assert.equal(evaluateP10Release(d).ready,false,id);
  }
  const e=syntheticQualified();
  e.releaseGates.PRIVACY_BOUNDARY.status='waived';
  assert.equal(evaluateP10Release(e).ready,false);
});
test('P10D CLI emits machine-readable blocked output and rejects backup path arguments',()=>{
  const cli=fileURLToPath(new URL('../scripts/check-p10d-release.mjs', import.meta.url));
  const run=spawnSync(process.execPath,[cli],{encoding:'utf8'});
  assert.equal(run.status,1,run.stderr);
  assert.equal(JSON.parse(run.stdout).ready,false);
  const refused=spawnSync(process.execPath,[cli,'/private/coach.enc.json'],{encoding:'utf8'});
  assert.equal(refused.status,2);
  assert.equal(refused.stdout,'');
  assert.match(refused.stderr,/accepts no file path arguments/);
  // Do not commit CI/main SHAs into the same branch: that changes the tested SHA.
  // Qualify the final immutable commit using sanitised evidence piped from outside Git.
  const verified=spawnSync(process.execPath,[cli,'--stdin'],{
    encoding:'utf8',input:JSON.stringify(syntheticQualified())
  });
  assert.equal(verified.status,0,verified.stderr);
  assert.equal(JSON.parse(verified.stdout).ready,true);
  const missing=spawnSync(process.execPath,[cli,'--stdin'],{
    encoding:'utf8',input:JSON.stringify(clone())
  });
  assert.equal(missing.status,1,missing.stderr);
});
