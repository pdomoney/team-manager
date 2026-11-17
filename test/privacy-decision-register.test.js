import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const file = JSON.parse(fs.readFileSync(new URL('../config/privacy-decision-register.json', import.meta.url), 'utf8'));
const isIsoDate = value => typeof value === 'string' &&
  /^20\d{2}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
const validAnswer = row => {
  if (row.status === 'unanswered') return row.responseCode === null &&
    row.responseSummary === null && row.respondedOn === null &&
    row.responseEvidenceRef === null && row.reviewState === 'not-reviewed' &&
    row.reviewedOn === null && row.reviewEvidenceRef === null;
  if (!['answered-pending-review', 'approved', 'rejected', 'superseded'].includes(row.status)) return false;
  if (!isIsoDate(row.respondedOn) || !row.responseEvidenceRef || typeof row.responseEvidenceRef !== 'string')
    return false;
  if (row.answerType === 'single') {
    if (!row.allowedValues.includes(row.responseCode)) return false;
  } else if (row.answerType === 'review') {
    if (!['requires-detailed-policy', 'no-decision'].includes(row.responseCode)) return false;
  } else return false;
  if (typeof row.responseSummary !== 'string' || row.responseSummary.length > 400) return false;
  if (/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(row.responseSummary) ||
      /\b(?:\+?61|0)4\d{8}\b/.test(row.responseSummary)) return false;
  if (row.status === 'approved') {
    return row.reviewState === 'approved' && typeof row.reviewerRole === 'string' &&
      row.reviewerRole.length > 0 && isIsoDate(row.reviewedOn) &&
      typeof row.reviewEvidenceRef === 'string' && row.reviewEvidenceRef.length > 0;
  }
  return row.reviewState !== 'approved';
};

test('privacy register is a public-safe policy questionnaire, not a release approval', () => {
  assert.equal(file.kind, 'team-manager-privacy-decision-register');
  assert.equal(file.schemaVersion, 1);
  assert.equal(file.classification, 'public-policy-metadata-only');
  assert.equal(file.registerState, 'open');
  assert.match(file.sourceBaseline, /^[a-f0-9]{40}$/);
  assert.equal(file.decisions.length, 18);
  assert.deepEqual(file.decisions.map(row => row.id), Array.from({length:18},
    (_, index) => 'TM-PR-' + String(index + 1).padStart(3, '0')));
  for (const row of file.decisions) {
    assert.match(row.id, /^TM-PR-\d{3}$/);
    assert.ok(typeof row.question === 'string' && row.question.length >= 15);
    assert.ok(['single', 'review'].includes(row.answerType));
    assert.ok(Array.isArray(row.allowedValues));
    if (row.answerType === 'single') assert.ok(row.allowedValues.length >= 2);
    else assert.equal(row.allowedValues.length, 0);
    assert.ok(['undetermined','yes','no','review-needed'].includes(row.applicable));
    assert.equal(row.implementationGate, 'L0');
    assert.equal(validAnswer(row), true, row.id + ' is either an unanswered question or an evidenced response');
  }
  assert.equal(file.decisions.filter(row => row.status === 'approved').length, 0);
  assert.equal(file.decisions.filter(row => row.status !== 'unanswered').length, 18);
  const collection = file.decisions.find(row => row.id === 'TM-PR-004');
  assert.equal(collection.status, 'answered-pending-review');
  assert.equal(collection.responseCode, 'requires-detailed-policy');
  assert.equal(collection.applicable, 'yes');
  assert.equal(collection.reviewState, 'not-reviewed');
  assert.equal(file.decisions.find(row => row.id === 'TM-PR-005').status, 'answered-pending-review');
  assert.equal(file.decisions.find(row => row.id === 'TM-PR-009').status, 'answered-pending-review',
    'owner now specified separate optional marketing choice; no production consent was obtained');
  const approval=file.decisions.find(row=>row.id==='TM-PR-018');
  assert.equal(file.registerState,'open','policy review remains open after questionnaire completion');
  assert.equal(file.decisions.filter(r=>r.status==='unanswered').length,0);
  assert.equal(file.decisions.filter(r=>r.status==='approved').length,0);
  assert.equal(approval.status,'answered-pending-review');
  assert.equal(approval.responseCode,'requires-detailed-policy');
  assert.equal(approval.reviewState,'not-reviewed');
  assert.equal(approval.reviewEvidenceRef,null);
  assert.equal(approval.proposedLaunchApproval.finalProductReleaseApprover,
    'team-manager-platform-operator');
  assert.equal(approval.proposedLaunchApproval.teamManagerOperationalAttestationRequired,true);
  assert.equal(approval.proposedLaunchApproval.clubAdminOperationalAttestationRequired,true);
  assert.equal(approval.proposedLaunchApproval.teamManagerReleaseApprovalRequired,false);
  assert.equal(approval.proposedLaunchApproval.clubAdminReleaseApprovalRequired,false);
  assert.equal(approval.proposedLaunchApproval.legalControllerAndReviewerAllocation,
    'to-be-verified-before-live-processing');
  assert.equal(approval.proposedLaunchApproval.independentReviewState,'not-completed');
  assert.equal(approval.proposedLaunchApproval.operatorReleaseSignoffState,'not-granted');
  assert.equal(approval.proposedLaunchApproval.operatorReleaseEvidenceRef,null);
  assert.equal(approval.proposedLaunchApproval.productionParticipantDataProcessingAuthorised,false);
  assert.equal(approval.proposedLaunchApproval.productionReleaseAuthorised,false);
  assert.equal(approval.proposedLaunchApproval.questionnaireCompletionIsReleaseApproval,false);
  assert.ok(approval.proposedLaunchApproval.evidenceRequiredBeforeFinalRelease.includes(
    'applicable-privacy-and-child-protection-compliance-checks'));
  const childLegalReview=file.decisions.find(row=>row.id==='TM-PR-017');
  assert.equal(childLegalReview.status,'answered-pending-review');
  assert.equal(childLegalReview.responseCode,'requires-detailed-policy');
  assert.equal(childLegalReview.responseEvidenceRef,'owner-conversation:2026-11-17:TM-PR-017');
  assert.equal(childLegalReview.reviewState,'not-reviewed');
  assert.equal(childLegalReview.reviewEvidenceRef,null);
  assert.equal(childLegalReview.proposedJuniorAcceptance.useApplicationRequiresAcceptance,true);
  assert.equal(childLegalReview.proposedJuniorAcceptance.acknowledgementAndApprovalPresentedDuringRegistration,true);
  assert.equal(childLegalReview.proposedJuniorAcceptance.consentNotBundledWithOptionalMarketing,true);
  assert.equal(childLegalReview.proposedJuniorAcceptance.activeGuardianAccountRequired,false);
  assert.equal(childLegalReview.proposedJuniorAcceptance.formalStandaloneLegalReviewAsOwnerProductPreference,
    'not-selected-in-favour-of-in-app-acceptance');
  assert.equal(childLegalReview.proposedJuniorAcceptance.mandatoryComplianceApplicabilityChecksRemainOpen,true);
  assert.equal(childLegalReview.proposedJuniorAcceptance.regulatoryRequirementsCannotBeWaivedByAcceptance,true);
  assert.equal(childLegalReview.proposedJuniorAcceptance.realJuniorAccountProcessingAuthorised,false);
  const wwcc=childLegalReview.supplementalSafeguardingRequirement;
  assert.equal(wwcc.scope,'volunteers-with-junior-interaction');
  assert.equal(wwcc.proposedProfileField,'workingWithChildrenCheckNumber');
  assert.equal(wwcc.fieldType,'private-credential-identifier');
  assert.equal(wwcc.verificationStatus,'not-implied-by-number-entry');
  assert.equal(wwcc.whetherEntryMandatoryForJuniorDuty,'pending-safeguarding-and-jurisdiction-review');
  for(const key of ['collectionAndStorageApproved','externalLookupOrVerificationAuthorised',
     'productionUIAuthorised','realCredentialNumbersInRepository'])
    assert.equal(wwcc[key],false,key);
  const incident=file.decisions.find(row=>row.id==='TM-PR-016');
  assert.equal(incident.status,'answered-pending-review');
  assert.equal(incident.responseCode,'requires-detailed-policy');
  assert.equal(incident.reviewState,'not-reviewed');
  assert.equal(incident.reviewEvidenceRef,null);
  assert.equal(incident.proposedIncidentOperations.inAppIncidentReportingRequiredInitialRelease,false);
  assert.equal(incident.proposedIncidentOperations.inAppIncidentReportingFeature,'deferred');
  assert.equal(incident.proposedIncidentOperations.alternativeReportingChannel,
    'undecided-must-be-defined-before-live-use');
  assert.equal(incident.proposedIncidentOperations.platformInvestigationOwner,'team-manager-platform-operator');
  assert.equal(incident.proposedIncidentOperations.platformBreachAssessmentAndNotificationLead,true);
  assert.equal(incident.proposedIncidentOperations.personalInformationAccessAudit,
    'required-design-pending-approval');
  assert.equal(incident.proposedIncidentOperations.productionIncidentProcessApproved,false);
  assert.equal(file.decisions.find(x=>x.id==='TM-PR-017').status,'answered-pending-review');
  const recovery=file.decisions.find(row=>row.id==='TM-PR-015');
  assert.equal(recovery.status,'answered-pending-review');
  assert.equal(recovery.responseCode,'requires-detailed-policy');
  assert.equal(recovery.reviewState,'not-reviewed');
  assert.equal(recovery.reviewEvidenceRef,null);
  assert.equal(recovery.proposedRecoveryPolicy.restoreAndRecoveryOwner,'team-manager-platform-operator');
  assert.deepEqual(recovery.proposedRecoveryPolicy.prohibitedDatabaseRestoreRoles,
    ['club-admin','appointed-team-manager']);
  assert.equal(recovery.proposedRecoveryPolicy.otherRoleRestoreAccess,'not-authorised');
  assert.equal(recovery.proposedRecoveryPolicy.participantDataInGitHub,'prohibited');
  assert.equal(recovery.proposedRecoveryPolicy.backupEncryption,'required-security-design-pending-verification');
  assert.equal(recovery.proposedRecoveryPolicy.backupRetentionDuration,'undecided-provider-and-privacy-review');
  assert.equal(recovery.proposedRecoveryPolicy.privacyErasureAndBackupExpiry,'pending-detailed-policy');
  assert.equal(recovery.proposedRecoveryPolicy.productionBackupOrRestoreAuthorised,false);
  assert.equal(file.decisions.find(x=>x.id==='TM-PR-016').status,'answered-pending-review');
  const rights=file.decisions.find(row=>row.id==='TM-PR-014');
  assert.equal(rights.status,'answered-pending-review');
  assert.equal(rights.responseCode,'requires-detailed-policy');
  assert.equal(rights.reviewState,'not-reviewed');
  assert.equal(rights.reviewEvidenceRef,null);
  assert.equal(rights.proposedRightsWorkflow.teamOrClubRecordRequestsOwner,'team-manager-platform-operator');
  assert.equal(rights.proposedRightsWorkflow.playerProfileContactCorrectionActor,'authenticated-player-self');
  assert.deepEqual(rights.proposedRightsWorkflow.playerSelfEditableFields,
    ['contact-email','mobile-phone','residential-address']);
  assert.equal(rights.proposedRightsWorkflow.accountEmailChangeRequiresVerification,true);
  assert.equal(rights.proposedRightsWorkflow.profileCorrectionShouldNotAlterTeamOrClubRecordsWithoutReview,true);
  assert.equal(rights.proposedRightsWorkflow.teamOrClubRequestsRequireIdentityAndScopeVerification,true);
  assert.equal(rights.proposedRightsWorkflow.guardianRequestsForMinors,'pending-policy');
  assert.equal(rights.proposedRightsWorkflow.accessAndCopyRequestProcess,'pending-detailed-policy');
  assert.equal(rights.proposedRightsWorkflow.portabilityAndExportProcess,'pending-detailed-policy');
  assert.equal(rights.proposedRightsWorkflow.deletionRequestProcess,'pending-detailed-policy');
  assert.equal(rights.proposedRightsWorkflow.productionRightsWorkflowAuthorised,false);
  assert.equal(file.decisions.find(x=>x.id==='TM-PR-015').status,'answered-pending-review');
  const lifecycle=file.decisions.find(row=>row.id==='TM-PR-013');
  assert.equal(lifecycle.status,'answered-pending-review');
  assert.equal(lifecycle.responseCode,'requires-detailed-policy');
  assert.equal(lifecycle.reviewState,'not-reviewed');
  assert.equal(lifecycle.reviewEvidenceRef,null);
  assert.equal(lifecycle.proposedLifecycle.membershipEnds,'mark-inactive');
  assert.equal(lifecycle.proposedLifecycle.inactivePeriodMonths,12);
  assert.equal(lifecycle.proposedLifecycle.afterInactivePeriod,'archive');
  assert.equal(lifecycle.proposedLifecycle.automaticRecordDeletion,false);
  assert.equal(lifecycle.proposedLifecycle.archivedRecordAccess,'restricted-subject-to-role-and-purpose-review');
  assert.equal(lifecycle.proposedLifecycle.personalDataRetentionAfterArchive,'undecided-subject-to-minimisation-and-law');
  assert.equal(lifecycle.proposedLifecycle.emergencyContactRetentionAfterDeparture,'undecided-separate-review');
  assert.equal(lifecycle.proposedLifecycle.individualDeletionRequestHandling,'pending-TM-PR-014');
  assert.equal(lifecycle.proposedLifecycle.backupAndSecureErasureHandling,'pending-TM-PR-015');
  assert.equal(lifecycle.proposedLifecycle.productionLifecycleAuthorised,false);
  assert.equal(file.decisions.find(x=>x.id==='TM-PR-014').status,'answered-pending-review');
  assert.equal(file.decisions.find(x=>x.id==='TM-PR-015').status,'answered-pending-review');
  const sharing=file.decisions.find(row=>row.id==='TM-PR-012');
  assert.equal(sharing.status,'answered-pending-review');
  assert.equal(sharing.responseCode,'requires-detailed-policy');
  assert.equal(sharing.reviewState,'not-reviewed');
  assert.equal(sharing.reviewEvidenceRef,null);
  assert.deepEqual(sharing.proposedSharingPolicy.recipients,['verified-sporting-association-administrators']);
  assert.deepEqual(sharing.proposedSharingPolicy.purposes,['competition-registration','team-eligibility','fixture-administration']);
  assert.equal(sharing.proposedSharingPolicy.requiresActiveRoleAndAssociationScope,true);
  assert.equal(sharing.proposedSharingPolicy.auditDisclosureRequired,true);
  for(const forbidden of ['unrestrictedExportsPermitted','thirdPartyMarketingPermitted',
     'unrelatedClubsPermitted','automaticExternalSyncPermitted','productionSharingAuthorised'])
    assert.equal(sharing.proposedSharingPolicy[forbidden],false,forbidden);
  assert.deepEqual(sharing.proposedSharingPolicy.individualFieldsApproved,[]);
  assert.deepEqual(sharing.proposedSharingPolicy.messagingChannelsApproved,[]);
  assert.equal(sharing.proposedSharingPolicy.separateLegalAndPrivacyReviewRequired,true);
  assert.equal(file.decisions.find(row=>row.id==='TM-PR-013').status,'answered-pending-review');
  const crossBorder=file.decisions.find(row=>row.id==='TM-PR-011');
  assert.equal(crossBorder.status,'answered-pending-review');
  assert.equal(crossBorder.responseCode,
    'international-permitted-australia-preferred-with-reviewed-processors');
  assert.equal(crossBorder.reviewState,'not-reviewed');
  assert.equal(crossBorder.reviewEvidenceRef,null);
  assert.equal(crossBorder.residencyPolicy.australiaPreferred,true);
  assert.equal(crossBorder.residencyPolicy.australiaMandatory,false);
  assert.equal(crossBorder.residencyPolicy.internationalHostingPermittedInPrinciple,true);
  assert.equal(crossBorder.residencyPolicy.internationalProcessingPermittedInPrinciple,true);
  assert.equal(crossBorder.residencyPolicy.selectedHostingCountry,null);
  assert.deepEqual(crossBorder.residencyPolicy.selectedProcessingCountries,[]);
  assert.equal(crossBorder.residencyPolicy.crossBorderPrivacyAndSecurityReviewRequired,true);
  assert.equal(crossBorder.residencyPolicy.providerAndSubprocessorsReviewRequired,true);
  assert.equal(crossBorder.residencyPolicy.childrenAndGuardianSafeguardsRequired,true);
  assert.equal(crossBorder.residencyPolicy.productionCrossBorderTransferAuthorised,false);
  assert.equal(crossBorder.residencyPolicy.productionPersonalDataProcessingAuthorised,false);
  assert.equal(crossBorder.residencyPolicy.regulatoryExemptionAssumed,false);
  const provider=file.decisions.find(row=>row.id==='TM-PR-010');
  assert.equal(provider.status,'answered-pending-review');
  assert.equal(provider.responseCode,'requires-detailed-policy');
  assert.equal(provider.reviewState,'not-reviewed');
  assert.equal(provider.reviewEvidenceRef,null);
  assert.equal(provider.providerDecision.selectionStatus,'deferred-pending-evaluation');
  for(const key of ['selectedProvider','selectedPlan','selectedPrimaryRegion','commercialOwner'])
    assert.equal(provider.providerDecision[key],null,key);
  for(const key of ['procurementAuthorised','provisioningAuthorised',
    'personalDataMigrationAuthorised','productionProcessingAuthorised'])
    assert.equal(provider.providerDecision[key],false,key);
  assert.deepEqual(provider.providerDecision.candidateProviders,
    ['supabase-postgresql','firebase','australian-hosted-postgresql-with-api']);
  assert.equal(file.decisions.find(row=>row.id==='TM-PR-011').status,'answered-pending-review');
  assert.equal(file.decisions.find(row=>row.id==='TM-PR-013').status,'answered-pending-review');
  const marketing=file.decisions.find(row=>row.id==='TM-PR-009');
  assert.equal(marketing.status,'answered-pending-review');
  assert.equal(marketing.responseCode,'requires-detailed-policy');
  assert.equal(marketing.reviewState,'not-reviewed');
  assert.equal(marketing.reviewEvidenceRef,null);
  assert.equal(marketing.proposedConsentExperience.privacyNoticeAcknowledgement,'required-at-account-acceptance');
  assert.equal(marketing.proposedConsentExperience.marketingConsent,'separate-explicit-opt-in-at-acceptance');
  assert.equal(marketing.proposedConsentExperience.marketingDefault,false);
  assert.equal(marketing.proposedConsentExperience.marketingRequiredForParticipation,false);
  assert.equal(marketing.proposedConsentExperience.manageMarketingConsent,'account-settings');
  assert.equal(marketing.proposedConsentExperience.withdrawalSupported,true);
  assert.equal(marketing.proposedConsentExperience.withdrawalShouldStopFutureMarketing,true);
  assert.equal(marketing.proposedConsentExperience.minorAndGuardianRules,'pending-age-appropriate-privacy-review');
  assert.equal(marketing.proposedConsentExperience.operationalNoticesSeparateFromMarketing,true);
  assert.equal(marketing.proposedConsentExperience.productionUseAuthorised,false);
  assert.equal(file.decisions.find(row=>row.id==='TM-PR-013').status,'answered-pending-review');
  const access=file.decisions.find(row=>row.id==='TM-PR-008');
  assert.equal(access.status,'answered-pending-review');
  assert.equal(access.responseCode,'requires-detailed-policy');
  assert.equal(access.reviewState,'not-reviewed');
  assert.equal(access.reviewEvidenceRef,null);
  assert.equal(access.productionAccessAuthorised,false);
  assert.equal(access.roleVerificationRequired,true);
  assert.deepEqual(access.proposedReadAccess,[
    {role:'appointed-team-manager',scope:'explicitly-assigned-team',
      dataCategories:['player-personal-details','emergency-contact-details']},
    {role:'club-admin',scope:'explicitly-administered-club',
      dataCategories:['player-personal-details','emergency-contact-details']}
  ]);
  for(const missing of ['record-editing','coach-trainer-emergency-access',
    'verified-guardian-access','platform-operator-support-access','download-and-export'])
    assert.ok(access.openPermissions.includes(missing),missing);
  const safetyScope=file.decisions.find(row=>row.id==='TM-PR-007');
  assert.equal(safetyScope.status,'answered-pending-review');
  assert.equal(safetyScope.responseCode,'emergency-contact-minimum-subject-to-separate-policy');
  assert.deepEqual(safetyScope.proposedInitialScope,['emergency-contact-details']);
  assert.equal(safetyScope.collectionApproved,false);
  for(const category of ['medical-conditions','allergies','injury-history','concussion-history','return-to-play-restrictions','clinical-records','safeguarding-case-records']){
    assert.ok(safetyScope.excludedFromInitialScope.includes(category),category);
  }
  assert.equal(safetyScope.reviewState,'not-reviewed');
  assert.deepEqual(file.decisions.filter(row=>row.status==='unanswered').map(row=>row.id),[]);
  const guardianVerifier=file.decisions.find(row => row.id === 'TM-PR-006');
  assert.equal(guardianVerifier.status,'answered-pending-review');
  assert.equal(guardianVerifier.responseCode,'requires-detailed-policy');
  assert.match(guardianVerifier.responseSummary,/appointed Manager/);
  assert.equal(guardianVerifier.verifyingActor,'appointed-team-manager');
  assert.equal(guardianVerifier.clarificationNeeded,undefined);
  assert.equal(guardianVerifier.clarificationResolvedOn,'2026-11-17');
  assert.equal(guardianVerifier.clarificationEvidenceRef,
    'owner-conversation:2026-11-17:TM-PR-006-appointed-manager');
  assert.equal(guardianVerifier.revisionHistory.length,1);
  assert.match(guardianVerifier.revisionHistory[0].clarificationNeeded,/appointed human Team Manager role or the platform operator/);
  assert.equal(guardianVerifier.revisionHistory[0].clarifiedBy,
    guardianVerifier.clarificationEvidenceRef);
  assert.equal(guardianVerifier.reviewState,'not-reviewed');
  assert.equal(guardianVerifier.reviewEvidenceRef,null);
  const junior = file.decisions.find(row => row.id === 'TM-PR-005');
  assert.equal(junior.responseCode,'junior-own-login-guardian-contact-candidate');
  assert.equal(junior.status,'answered-pending-review');
  assert.equal(junior.reviewState,'not-reviewed');
  assert.equal(junior.reviewEvidenceRef,null);
  assert.equal(junior.applicable,'yes');
  assert.equal(file.decisions.find(row => row.id === 'TM-PR-006').status,'answered-pending-review',
    'guardian verification and consent remain undecided');
  assert.equal(file.decisions.find(row => row.id === 'TM-PR-008').status,'answered-pending-review',
    'guardian access visibility is not conferred by candidate details');
  assert.equal(file.decisions.find(row => row.id === 'TM-PR-009').status,'answered-pending-review',
    'minor-specific notices and consent remain undecided');
  const initialScope = file.decisions.find(row => row.id === 'TM-PR-003');
  assert.equal(initialScope.status, 'answered-pending-review');
  assert.equal(initialScope.responseCode,
    'one-team-operations-with-registration-emergency-and-guardian-candidates');
  assert.equal(initialScope.reviewState,'not-reviewed');
  assert.equal(initialScope.reviewEvidenceRef,null);
  assert.equal(initialScope.clarifiedByDecisionId,'TM-PR-005');
  assert.equal(initialScope.revisionHistory?.length,1);
  assert.equal(initialScope.revisionHistory[0].responseCode,
    'one-team-operations-with-registration-emergency-and-linked-accounts');
  assert.equal(initialScope.revisionHistory[0].clarifiedBy,'TM-PR-005');
  assert.equal(initialScope.revisionHistory[0].responseEvidenceRef,
    'owner-conversation:2026-11-17:TM-PR-003');

  assert.equal(collection.status, 'answered-pending-review',
    'field preferences are recorded, but minimisation and field-level approval are still open');
  assert.equal(collection.reviewEvidenceRef, null,
    'collection is not approved by supplying the requested field list');
  assert.equal(file.decisions.find(row => row.id === 'TM-PR-005').status, 'answered-pending-review',
    'own junior login was explicitly chosen but not independently approved');
  assert.equal(file.decisions.find(row => row.id === 'TM-PR-006').status, 'answered-pending-review',
    'guardian verification, activation and child consent are still open');
  assert.equal(file.decisions.find(row => row.id === 'TM-PR-006').status, 'answered-pending-review',
    'verified guardian authority and adult linkage remain separate decisions');
  const platformResponsibility = file.decisions.find(row => row.id === 'TM-PR-002');
  assert.equal(platformResponsibility.status, 'answered-pending-review');
  assert.equal(platformResponsibility.responseCode, 'platform-operator');
  assert.equal(platformResponsibility.applicable, 'yes');
  assert.equal(platformResponsibility.reviewState, 'not-reviewed');
  assert.equal(platformResponsibility.reviewEvidenceRef, null);
  assert.equal(file.decisions.find(row => row.id === 'TM-PR-016').status, 'answered-pending-review',
    'the incident-response operating procedure remains a separate decision');
  const firstTeamAges = file.decisions.find(row => row.id === 'TM-PR-001');
  assert.equal(firstTeamAges.status, 'answered-pending-review');
  assert.equal(firstTeamAges.responseCode, 'includes-under-18s');
  assert.equal(firstTeamAges.applicable, 'yes');
  assert.equal(firstTeamAges.reviewState, 'not-reviewed');
  assert.equal(file.decisions.find(row => row.id === 'TM-PR-005').status, 'answered-pending-review');
  assert.equal(file.decisions.find(row => row.id === 'TM-PR-006').status, 'answered-pending-review');
});

test('owner answer alone never becomes reviewed or production-authorised', () => {
  const unanswered = structuredClone(file.decisions[0]);
  assert.equal(validAnswer(unanswered), true);
  const answered = {
    ...unanswered,
    status: 'answered-pending-review',
    responseCode: 'adults-only',
    responseSummary: 'First-team scope: adults only.',
    respondedOn: '2026-11-17',
    responseEvidenceRef: 'owner-conversation:2026-11-17:TM-PR-001'
  };
  assert.equal(validAnswer(answered), true);
  assert.equal(validAnswer({...answered, status:'approved'}), false);
  assert.equal(validAnswer({...answered, status:'approved', reviewState:'approved'}), false);
  assert.equal(validAnswer({
    ...answered,status:'approved',reviewState:'approved',
    reviewerRole:'responsible-controller',
    reviewedOn:'2026-11-17',
    reviewEvidenceRef:'privacy-approval:TM-PR-001'
  }), true);
});

test('unknown, unreviewed, sensitive or out-of-options answers cannot be silently accepted', () => {
  const base = structuredClone(file.decisions[0]);
  assert.equal(validAnswer({...base,status:'approved'}), false);
  const claimed = {
    ...base,status:'answered-pending-review',responseCode:'includes-under-18s',
    responseSummary:'Needs child safeguarding review.',
    respondedOn:'2026-11-17',responseEvidenceRef:'owner-conversation:2026-11-17:TM-PR-001'
  };
  assert.equal(validAnswer(claimed), true);
  assert.equal(validAnswer({...claimed,responseCode:'unreviewed-other-option'}), false);
  assert.equal(validAnswer({...claimed,responseSummary:'contact child@example.com'}), false);
  assert.equal(validAnswer({...claimed,responseSummary:'SMS 0412345678'}), false);
  assert.equal(validAnswer({...claimed,responseEvidenceRef:null}), false);
});
