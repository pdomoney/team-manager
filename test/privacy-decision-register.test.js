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
  assert.equal(file.decisions.filter(row => row.status !== 'unanswered').length, 9);
  const collection = file.decisions.find(row => row.id === 'TM-PR-004');
  assert.equal(collection.status, 'answered-pending-review');
  assert.equal(collection.responseCode, 'requires-detailed-policy');
  assert.equal(collection.applicable, 'yes');
  assert.equal(collection.reviewState, 'not-reviewed');
  assert.equal(file.decisions.find(row => row.id === 'TM-PR-005').status, 'answered-pending-review');
  assert.equal(file.decisions.find(row => row.id === 'TM-PR-009').status, 'answered-pending-review',
    'owner now specified separate optional marketing choice; no production consent was obtained');
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
  assert.equal(file.decisions.find(row=>row.id==='TM-PR-013').status,'unanswered');
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
  for(const id of ['TM-PR-013'])
    assert.equal(file.decisions.find(r=>r.id===id).status,'unanswered',id+' remains unapproved');
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
  assert.equal(file.decisions.find(row => row.id === 'TM-PR-016').status, 'unanswered',
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
