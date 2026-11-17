import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {evaluatePrivacyL0Evidence,PRIVACY_L0_IDS,PRIVACY_PLAYER_FIELD_KEYS}
  from '../src/privacy-l0-evidence.js';
const read=name=>JSON.parse(readFileSync(new URL('../config/'+name,import.meta.url),'utf8'));
const input=[
  read('privacy-decision-register.json'),
  read('privacy-player-field-inventory.json'),
  read('privacy-launch-readiness-plan.json'),
  read('first-team-cloud-release-evidence.json')
];
const copy=()=>structuredClone(input);
const evaluate=values=>evaluatePrivacyL0Evidence(...values);

test('current source has all 18 answers, 11 requested fields but zero independent approvals',()=>{
  const r=evaluate(input);
  assert.equal(r.kind,'privacy-l0-source-reconciliation');
  assert.equal(r.version,1);
  assert.equal(r.structurallySound,true);
  assert.deepEqual(r.structuralBlockers,[]);
  assert.equal(r.ownerResponsesRecorded,18);
  assert.equal(r.ownerResponseTotal,18);
  assert.equal(r.independentlyReviewedDecisions,0);
  assert.equal(r.independentDecisionTotal,18);
  assert.equal(r.independentlyApprovedFields,0);
  assert.equal(r.requestedFieldTotal,11);
  assert.deepEqual(r.decisionRows.map(x=>x.id),PRIVACY_L0_IDS);
  assert.deepEqual(r.fieldRows.map(x=>x.id),PRIVACY_PLAYER_FIELD_KEYS);
  assert.deepEqual(r.decisionIdsPending,PRIVACY_L0_IDS);
  assert.deepEqual(r.fieldKeysPending,PRIVACY_PLAYER_FIELD_KEYS);
  assert.equal(r.releaseGatesPassed,0);
  assert.equal(r.releaseGatesTotal,7);
  assert.equal(r.liveJourneysPassed,0);
  assert.equal(r.liveJourneysTotal,8);
  assert.equal(r.independentlyReviewedL0Candidate,false);
  assert.equal(r.separateLiveReleaseReady,false);
  assert.equal(r.actualEvidenceVerified,false);
  assert.equal(r.personalDataAccessGranted,false);
  assert.equal(r.productionProcessingAuthorised,false);
  assert.equal(r.productionReleaseAuthorised,false);
  assert.ok(r.ownerEvidenceBlockers.includes('separate-owner-release-approval-missing'));
});

test('the same 18 decisions cannot become policy approvals without reviewer and matching control evidence',()=>{
  const a=copy();
  a[0].decisions[0].status='approved';
  a[0].decisions[0].reviewState='approved';
  let r=evaluate(a);
  assert.equal(r.independentlyReviewedDecisions,0);
  assert.ok(r.decisionRows[0].reasonCodes.includes('independent-policy-review-not-evidenced'));
  a[0].decisions[0].reviewerRole='privacy-reviewer';
  a[0].decisions[0].reviewedOn='2026-11-17';
  a[0].decisions[0].reviewEvidenceRef='evidence-ref:synthetic-policy-only';
  r=evaluate(a);
  assert.equal(r.independentlyReviewedDecisions,0);
  assert.ok(r.decisionRows[0].reasonCodes.includes('control-evidence-not-independently-reviewed'));
  a[2].controls[0].reviewStatus='approved';
  a[2].controls[0].independentlyReviewed=true;
  a[2].controls[0].reviewEvidenceRef='evidence-ref:synthetic-control-only';
  r=evaluate(a);
  assert.equal(r.independentlyReviewedDecisions,1);
  assert.equal(r.decisionRows[0].complete,true);
  assert.equal(r.separateLiveReleaseReady,false);
  assert.equal(r.productionProcessingAuthorised,false);
  // Fabricated evidence cannot be authenticated by this local function.
  assert.equal(r.actualEvidenceVerified,false);
  a[2].controls[0].productionAuthorised=true;
  r=evaluate(a);
  assert.equal(r.independentlyReviewedDecisions,0);
  assert.ok(r.decisionRows[0].reasonCodes.includes('control-unverified-production-claim'));
});

test('an approved-looking field needs separate evidence; marketing/public access cannot piggyback',()=>{
  const a=copy(),f=a[1].fields[0];
  f.policyStatus='approved';f.approvedForCollection=true;
  let r=evaluate(a);
  assert.equal(r.independentlyApprovedFields,0);
  f.reviewState='approved';f.reviewEvidenceRef='evidence-ref:synthetic-field-only';
  r=evaluate(a);
  assert.equal(r.independentlyApprovedFields,1);
  assert.equal(r.productionProcessingAuthorised,false);
  f.approvedForMarketingUse=true;
  r=evaluate(a);
  assert.equal(r.independentlyApprovedFields,0);
  assert.ok(r.fieldRows[0].reasonCodes.includes('marketing-authorization-outside-field-review'));
  f.approvedForMarketingUse=false;f.visibility='public';
  r=evaluate(a);
  assert.equal(r.independentlyApprovedFields,0);
  assert.ok(r.fieldRows[0].reasonCodes.includes('unreviewed-public-or-cross-club-visibility'));
});

test('missing, duplicate, reordered or additional decisions and fields cannot hide omissions',()=>{
  const a=copy();
  a[0].decisions.splice(0,1);
  let r=evaluate(a);
  assert.equal(r.structurallySound,false);
  assert.ok(r.structuralBlockers.includes('decision-id-coverage-mismatch'));
  const b=copy();
  b[2].controls[0].decisionId='TM-PR-018';
  r=evaluate(b);
  assert.ok(r.structuralBlockers.includes('review-control-coverage-mismatch'));
  const c=copy();
  c[1].fields[0].key='unapprovedNewField';
  r=evaluate(c);
  assert.ok(r.structuralBlockers.includes('player-field-coverage-mismatch'));
  const d=copy();
  d[1].fields.push(structuredClone(d[1].fields[0]));
  r=evaluate(d);
  assert.ok(r.structuralBlockers.includes('player-field-coverage-mismatch'));
  const e=copy();
  e[2].productionReleaseAuthorised=true;
  r=evaluate(e);
  assert.ok(r.structuralBlockers.includes('unverified-release-claim-in-plan'));
});

test('source-only L0 reconciliation refuses malformed or missing inputs without throwing',()=>{
  for(const i of [0,1,2,3]){
    const a=copy();a[i]=null;
    const r=evaluate(a);
    assert.equal(r.structurallySound,false);
    assert.equal(r.productionReleaseAuthorised,false);
  }
  const a=copy();a[3].gates={};
  const r=evaluate(a);
  assert.ok(r.structuralBlockers.includes('release-gate-coverage-mismatch'));
  assert.equal(r.productionReleaseAuthorised,false);
  const b=copy();b[3].launchJourneys={};
  const q=evaluate(b);
  assert.ok(q.structuralBlockers.includes('release-journey-coverage-mismatch'));
});

test('owner claimed approved without supplier and child privacy evidence is insufficient',()=>{
  const a=copy();a[3].ownerDecision.status='approved';
  let r=evaluate(a);
  assert.ok(r.ownerEvidenceBlockers.includes('approved-provider-missing'));
  assert.ok(r.ownerEvidenceBlockers.includes('minor-and-guardian-privacy-evidence-missing'));
  assert.equal(r.independentlyReviewedL0Candidate,false);
  assert.equal(r.productionProcessingAuthorised,false);
});

test('reason-coded report never echoes arbitrary personal values from untrusted extra fields',()=>{
  const a=copy();
  a[0].decisions[0].rawName='Example Junior Name';
  a[1].fields[0].actualPhone='0400000000';
  a[2].controls[0].privateNotes='Example Junior Name';
  const r=evaluate(a);
  const text=JSON.stringify(r);
  assert.ok(!text.includes('Example Junior Name'));
  assert.ok(!text.includes('0400000000'));
});

test('source-only CLI succeeds only when explicitly asserting the HOLD baseline',()=>{
  const cli=new URL('../scripts/check-privacy-l0-evidence.mjs',import.meta.url);
  const invoke=args=>spawnSync(process.execPath,[cli.pathname,...args],{encoding:'utf8'});
  const hold=invoke(['--assert-source-blocked']);
  assert.equal(hold.status,0,hold.stderr+'\n'+hold.stdout.slice(0,600));
  const report=JSON.parse(hold.stdout);
  assert.equal(report.independentlyReviewedDecisions,0);
  assert.equal(report.separateLiveReleaseReady,false);
  const normal=invoke([]);
  assert.equal(normal.status,1);
  assert.equal(invoke(['--stdin']).status,2);
  assert.equal(invoke(['../private-backup.json']).status,2);
});
