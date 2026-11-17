import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const policy = JSON.parse(fs.readFileSync(new URL('../config/privacy-player-field-inventory.json',import.meta.url),'utf8'));
const register = JSON.parse(fs.readFileSync(new URL('../config/privacy-decision-register.json',import.meta.url),'utf8'));
const mandatory=['fullName','dateOfBirth','phoneNumber','residentialAddress','profilePhoto'];
const optional=['socialMediaAccounts','otherClubs','otherSports','profession','educationLevel','educationInstitution'];

test('player collection inventory preserves precisely five requested mandatory and six optional categories',()=>{
  assert.equal(policy.schemaVersion,1);
  assert.equal(policy.kind,'team-manager-player-field-policy-inventory');
  assert.equal(policy.classification,'public-policy-metadata-only');
  assert.equal(policy.decisionId,'TM-PR-004');
  assert.equal(policy.productionCollectionAuthorised,false);
  assert.equal(policy.status,'owner-requirements-captured-pending-privacy-review');
  assert.deepEqual(policy.fields.filter(x=>x.ownerRequirement==='proposed-mandatory').map(x=>x.key),mandatory);
  assert.deepEqual(policy.fields.filter(x=>x.ownerRequirement==='proposed-optional').map(x=>x.key),optional);
  assert.equal(new Set(policy.fields.map(x=>x.key)).size,11);
});
test('mandatory request cannot silently authorise child, address, photo, or optional marketing collection',()=>{
  assert.equal(register.decisions.find(x=>x.id==='TM-PR-004').status,'answered-pending-review');
  for(const field of policy.fields){
    assert.equal(field.policyStatus,'review-required',field.key);
    assert.equal(field.approvedForCollection,false,field.key);
    assert.equal(field.approvedForMarketingUse,false,field.key);
    assert.equal(field.minorHandling,'pending-age-specific-decision',field.key);
    assert.equal(field.visibility,'pending-role-by-field-review',field.key);
    assert.equal(field.retention,'undecided',field.key);
    assert.ok(field.reviewFlags.length>=1,field.key);
  }
  const childReview=register.decisions.find(x=>x.id==='TM-PR-017');
  assert.equal(childReview.status,'unanswered');
  assert.equal(childReview.supplementalSafeguardingRequirement.scope,'volunteers-with-junior-interaction');
  assert.equal(childReview.supplementalSafeguardingRequirement.proposedProfileField,
    'workingWithChildrenCheckNumber');
  assert.equal(childReview.supplementalSafeguardingRequirement.verificationStatus,
    'not-implied-by-number-entry');
  assert.equal(childReview.supplementalSafeguardingRequirement.collectionAndStorageApproved,false);
  const incident=register.decisions.find(x=>x.id==='TM-PR-016');
  assert.equal(incident.status,'answered-pending-review');
  assert.equal(incident.reviewState,'not-reviewed');
  assert.equal(incident.proposedIncidentOperations.inAppIncidentReportingRequiredInitialRelease,false);
  assert.equal(incident.proposedIncidentOperations.alternativeReportingChannel,'undecided-must-be-defined-before-live-use');
  assert.equal(incident.proposedIncidentOperations.platformBreachAssessmentAndNotificationLead,true);
  assert.equal(incident.proposedIncidentOperations.productionIncidentProcessApproved,false);
  const recovery=register.decisions.find(x=>x.id==='TM-PR-015');
  assert.equal(recovery.status,'answered-pending-review');
  assert.equal(recovery.reviewState,'not-reviewed');
  assert.equal(recovery.proposedRecoveryPolicy.restoreAndRecoveryOwner,'team-manager-platform-operator');
  assert.deepEqual(recovery.proposedRecoveryPolicy.prohibitedDatabaseRestoreRoles,
    ['club-admin','appointed-team-manager']);
  assert.equal(recovery.proposedRecoveryPolicy.productionBackupOrRestoreAuthorised,false);
  const rights=register.decisions.find(x=>x.id==='TM-PR-014');
  assert.equal(rights.status,'answered-pending-review');
  assert.equal(rights.reviewState,'not-reviewed');
  assert.deepEqual(rights.proposedRightsWorkflow.playerSelfEditableFields,
    ['contact-email','mobile-phone','residential-address']);
  assert.equal(rights.proposedRightsWorkflow.teamOrClubRecordRequestsOwner,'team-manager-platform-operator');
  assert.equal(rights.proposedRightsWorkflow.accountEmailChangeRequiresVerification,true);
  assert.equal(rights.proposedRightsWorkflow.deletionRequestProcess,'pending-detailed-policy');
  assert.equal(rights.proposedRightsWorkflow.productionRightsWorkflowAuthorised,false);
  const lifecycle=register.decisions.find(x=>x.id==='TM-PR-013');
  assert.equal(lifecycle.status,'answered-pending-review');
  assert.equal(lifecycle.proposedLifecycle.membershipEnds,'mark-inactive');
  assert.equal(lifecycle.proposedLifecycle.inactivePeriodMonths,12);
  assert.equal(lifecycle.proposedLifecycle.afterInactivePeriod,'archive');
  assert.equal(lifecycle.proposedLifecycle.automaticRecordDeletion,false);
  assert.equal(lifecycle.proposedLifecycle.productionLifecycleAuthorised,false);
  assert.equal(lifecycle.reviewState,'not-reviewed');
  const sharing=register.decisions.find(x=>x.id==='TM-PR-012');
  assert.equal(sharing.status,'answered-pending-review');
  assert.equal(sharing.reviewState,'not-reviewed');
  assert.equal(sharing.proposedSharingPolicy.auditDisclosureRequired,true);
  assert.equal(sharing.proposedSharingPolicy.unrestrictedExportsPermitted,false);
  assert.equal(sharing.proposedSharingPolicy.thirdPartyMarketingPermitted,false);
  assert.equal(sharing.proposedSharingPolicy.unrelatedClubsPermitted,false);
  assert.equal(sharing.proposedSharingPolicy.productionSharingAuthorised,false);
  assert.deepEqual(sharing.proposedSharingPolicy.individualFieldsApproved,[]);
  const international=register.decisions.find(x=>x.id==='TM-PR-011');
  assert.equal(international.residencyPolicy.australiaPreferred,true);
  assert.equal(international.residencyPolicy.australiaMandatory,false);
  assert.equal(international.residencyPolicy.regulatoryExemptionAssumed,false);
  assert.equal(international.residencyPolicy.productionCrossBorderTransferAuthorised,false);
  assert.equal(international.reviewState,'not-reviewed');
  const provider=register.decisions.find(x=>x.id==='TM-PR-010');
  assert.equal(provider.status,'answered-pending-review');
  assert.equal(provider.providerDecision.selectionStatus,'deferred-pending-evaluation');
  assert.equal(provider.providerDecision.selectedProvider,null);
  assert.equal(provider.providerDecision.productionProcessingAuthorised,false);
  assert.equal(register.decisions.find(x=>x.id==='TM-PR-011').status,'answered-pending-review');
  const marketing=register.decisions.find(x=>x.id==='TM-PR-009');
  assert.equal(marketing.status,'answered-pending-review');
  assert.equal(marketing.proposedConsentExperience.marketingDefault,false);
  assert.equal(marketing.proposedConsentExperience.marketingRequiredForParticipation,false);
  assert.equal(marketing.proposedConsentExperience.withdrawalSupported,true);
  assert.equal(marketing.proposedConsentExperience.productionUseAuthorised,false);
  assert.equal(marketing.reviewState,'not-reviewed');
  const readAccess=register.decisions.find(x=>x.id==='TM-PR-008');
  assert.equal(readAccess.status,'answered-pending-review');
  assert.equal(readAccess.productionAccessAuthorised,false);
  assert.equal(readAccess.reviewState,'not-reviewed');
  assert.deepEqual(readAccess.proposedReadAccess.map(x=>x.role),
    ['appointed-team-manager','club-admin']);
  const safety=register.decisions.find(x=>x.id==='TM-PR-007');
  assert.equal(safety.status,'answered-pending-review');
  assert.equal(safety.collectionApproved,false);
  assert.deepEqual(safety.proposedInitialScope,['emergency-contact-details']);
  assert.ok(safety.excludedFromInitialScope.includes('medical-conditions'));
  assert.ok(safety.excludedFromInitialScope.includes('concussion-history'));
  const guardian=register.decisions.find(x=>x.id==='TM-PR-006');
  assert.equal(guardian.status,'answered-pending-review');
  assert.equal(guardian.reviewState,'not-reviewed');
  assert.equal(guardian.responseCode,'requires-detailed-policy');
  assert.equal(guardian.verifyingActor,'appointed-team-manager');
  assert.equal(guardian.clarificationNeeded,undefined);
  assert.equal(guardian.revisionHistory?.length,1);
  assert.equal(guardian.reviewEvidenceRef,null);
  const junior=register.decisions.find(x=>x.id==='TM-PR-005');
  assert.equal(junior.status,'answered-pending-review');
  assert.equal(junior.reviewState,'not-reviewed');
  assert.equal(junior.responseCode,'junior-own-login-guardian-contact-candidate');
  for(const id of ['TM-PR-017','TM-PR-018']){
    assert.equal(register.decisions.find(x=>x.id===id).status,'unanswered',id);
  }
});
