import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {FIRST_TEAM_GATES,FIRST_TEAM_JOURNEYS,evaluateFirstTeamCloudRelease}
  from '../src/first-team-cloud-release.js';

const get=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const plan=get('config/privacy-launch-readiness-plan.json');
const register=get('config/privacy-decision-register.json');
const ledger=get('config/first-team-cloud-release-evidence.json');

test('18 owner decisions map to 18 distinct evidence-gated controls, not approvals',()=>{
  assert.equal(plan.kind,'team-manager-privacy-launch-review-plan');
  assert.equal(plan.schemaVersion,1);
  assert.equal(plan.classification,'public-policy-metadata-only');
  assert.equal(plan.status,'proposed-review-plan-not-approved');
  assert.equal(plan.noPersonalData,true);
  assert.equal(plan.productionDataProcessingAuthorised,false);
  assert.equal(plan.backendProvisioningAuthorised,false);
  assert.equal(plan.productionReleaseAuthorised,false);
  assert.equal(register.decisions.length,18);
  assert.equal(register.decisions.filter(q=>q.status==='answered-pending-review').length,18);
  assert.equal(register.decisions.filter(q=>q.reviewState==='approved').length,0);
  assert.deepEqual(plan.controls.map(q=>q.decisionId),register.decisions.map(q=>q.id));
  for(const row of plan.controls){
    assert.ok(row.control.length>=15,row.decisionId);
    assert.ok(row.proposedEvidenceCoordinator.length>3,row.decisionId);
    assert.ok(row.requiredEvidence.length>=20,row.decisionId);
    assert.ok(row.acceptanceCriterion.length>=25,row.decisionId);
    assert.ok(row.negativeCase.length>=25,row.decisionId);
    assert.equal(row.reviewStatus,'requires-independent-evidence',row.decisionId);
    assert.equal(row.reviewEvidenceRef,null,row.decisionId);
    assert.equal(row.independentlyReviewed,false,row.decisionId);
    assert.equal(row.productionAuthorised,false,row.decisionId);
    assert.ok(row.gateRefs.length>=1,row.decisionId);
    for(const gate of row.gateRefs) assert.ok(FIRST_TEAM_GATES.includes(gate),row.decisionId+':'+gate);
    for(const journey of row.launchJourneyRefs)
      assert.ok(FIRST_TEAM_JOURNEYS.includes(journey),row.decisionId+':'+journey);
  }
});
test('release gate source remains all HOLD independently of questionnaire progress',()=>{
  assert.deepEqual(Object.keys(ledger.gates),FIRST_TEAM_GATES);
  assert.deepEqual(Object.keys(ledger.launchJourneys),FIRST_TEAM_JOURNEYS);
  assert.ok(Object.values(ledger.gates).every(x=>x.status==='pending'));
  assert.ok(Object.values(ledger.launchJourneys).every(x=>x.status==='pending'));
  const evaluation=evaluateFirstTeamCloudRelease(ledger);
  assert.equal(evaluation.ready,false);
  assert.equal(evaluation.completed,0);
  assert.equal(evaluation.journeysCompleted,0);
  assert.equal(ledger.ownerDecision.status,'pending');
  assert.equal(ledger.ownerDecision.dataScope,'synthetic-only');
});
test('registration, guardian, WWCC, archive and operator signoff designs remain non-live',()=>{
  const ids=['ACCOUNT_ACCEPTANCE','GUARDIAN_ACTIVATION','VOLUNTEER_WWCC',
    'MEMBERSHIP_ARCHIVE','PLATFORM_RELEASE_SIGNOFF'];
  assert.deepEqual(plan.designJourneys.map(x=>x.id),ids);
  for(const journey of plan.designJourneys){
    assert.ok(journey.user.length>10);
    assert.ok(journey.stages.length>=4);
    assert.ok(journey.negativeCases.length>=3);
    assert.equal(journey.designApproved,false,journey.id);
    assert.equal(journey.productionEnabled,false,journey.id);
  }
  const find=id=>plan.designJourneys.find(x=>x.id===id);
  assert.match(find('ACCOUNT_ACCEPTANCE').negativeCases.join(' '),/marketing/);
  assert.match(find('GUARDIAN_ACTIVATION').negativeCases.join(' '),/self-verify/);
  assert.match(find('VOLUNTEER_WWCC').negativeCases.join(' '),/does not assert valid credential/);
  assert.match(find('MEMBERSHIP_ARCHIVE').negativeCases.join(' '),/cannot delete/);
  assert.match(find('PLATFORM_RELEASE_SIGNOFF').negativeCases.join(' '),/Merge, green synthetic CI/);
  const guardian=register.decisions.find(x=>x.id==='TM-PR-005');
  const wwcc=register.decisions.find(x=>x.id==='TM-PR-017');
  const incident=register.decisions.find(x=>x.id==='TM-PR-016');
  const access=register.decisions.find(x=>x.id==='TM-PR-018');
  assert.equal(guardian.proposedGuardianAccountActivation?.productionAuthorised ?? false,false);
  assert.equal(wwcc.proposedJuniorAcceptance.realJuniorAccountProcessingAuthorised,false);
  assert.equal(wwcc.supplementalSafeguardingRequirement.collectionAndStorageApproved,false);
  assert.equal(wwcc.supplementalSafeguardingRequirement.verificationStatus,'not-implied-by-number-entry');
  assert.equal(incident.proposedIncidentOperations.inAppIncidentReportingRequiredInitialRelease,false);
  assert.equal(access.proposedLaunchApproval.productionReleaseAuthorised,false);
  assert.equal(access.proposedLaunchApproval.operatorReleaseSignoffState,'not-granted');
});
test('changing a review plan in isolation cannot elevate approvals',()=>{
  const synthetic=structuredClone(plan);
  synthetic.controls[0].reviewStatus='approved';
  synthetic.controls[0].independentlyReviewed=true;
  synthetic.productionReleaseAuthorised=true;
  assert.equal(register.decisions[0].reviewState,'not-reviewed');
  assert.equal(ledger.ownerDecision.status,'pending');
  assert.equal(evaluateFirstTeamCloudRelease(ledger).ready,false);
});
