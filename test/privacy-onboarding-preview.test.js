import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PRIVACY_ONBOARDING_DESIGN_VERSION,previewRegistrationAcceptance,
  previewGuardianActivation,previewVolunteerWWCC,previewMembershipArchive
} from '../src/privacy-onboarding-preview.js';
import {evaluateFirstTeamCloudRelease} from '../src/first-team-cloud-release.js';

const register=JSON.parse(fs.readFileSync(new URL('../config/privacy-decision-register.json',import.meta.url),'utf8'));
const ledger=JSON.parse(fs.readFileSync(new URL('../config/first-team-cloud-release-evidence.json',import.meta.url),'utf8'));
const releaseGuide=fs.readFileSync(new URL('../docs/operations/first-team-cloud-release.md',import.meta.url),'utf8');
const notices=()=>({termsVersion:'terms-v1',privacyNoticeVersion:'notice-v1'});
const intent=()=>({ageGroup:'adult',termsAccepted:true,privacyAcknowledged:true});
const guardian=()=>({candidateRecorded:true,activationRequested:true,guardianAccountId:'guardian-1',teamId:'team-a',identityEvidenceReviewed:true,relationshipEvidenceReviewed:true});
const manager=()=>({role:'appointed-team-manager',accountId:'manager-1',appointedTeamId:'team-a',independenceConfirmed:true});
const wwcc=()=>({juniorFacing:true,numberRecorded:true,jurisdiction:'NSW',verificationEvidenceReviewed:true,expiresOn:'2027-03-01'});
const reviewer=()=>({role:'designated-safeguarding-verifier',independentReviewConfirmed:true});
const deny=(r,code)=>{assert.equal(r.designReviewable,false);assert.ok(r.reasonCodes.includes(code),JSON.stringify(r.reasonCodes));assert.equal(r.proposedRecord,null);assert.equal(r.productionProcessingAuthorised,false);assert.equal(r.dataWritten,false);};

test('synthetic adult acceptance is versioned with marketing OFF by default, but not recorded or activated',()=>{
  assert.equal(PRIVACY_ONBOARDING_DESIGN_VERSION,1);
  const r=previewRegistrationAcceptance(notices(),intent());
  assert.equal(r.designReviewable,true);
  assert.deepEqual(r.reasonCodes,[]);
  assert.deepEqual(r.proposedRecord,{
    termsVersion:'terms-v1',privacyNoticeVersion:'notice-v1',
    termsAcknowledged:true,privacyAcknowledged:true,
    proposedMarketingOptIn:false,guardianCandidateState:null,
    acceptanceEvidenceStatus:'not-recorded',ageVerificationStatus:'not-verified',
    identityVerificationStatus:'not-verified'
  });
  assert.equal(r.accessGranted,false);
  assert.equal(r.accountActivated,false);
  assert.equal(r.productionProcessingAuthorised,false);
  const yes=previewRegistrationAcceptance(notices(),{...intent(),marketingOptIn:true});
  assert.equal(yes.designReviewable,true);
  assert.equal(yes.proposedRecord.proposedMarketingOptIn,true);
});

test('separate mandatory acceptance and policy versions cannot be bypassed',()=>{
  deny(previewRegistrationAcceptance(notices(),{...intent(),termsAccepted:false}),'terms-acceptance-required');
  deny(previewRegistrationAcceptance(notices(),{...intent(),privacyAcknowledged:false}),'privacy-acknowledgement-required');
  deny(previewRegistrationAcceptance({...notices(),termsVersion:''},intent()),'invalid-versioned-notices');
  deny(previewRegistrationAcceptance(notices(),{...intent(),marketingOptIn:'yes'}),'invalid-marketing-choice');
  deny(previewRegistrationAcceptance(notices(),{...intent(),email:'child@example.test'}),'invalid-or-extra-intent-fields');
  deny(previewRegistrationAcceptance({...notices(),legalComplianceApproved:true},intent()),'invalid-versioned-notices');
  deny(previewRegistrationAcceptance(notices(),null),'invalid-or-extra-intent-fields');
});

test('junior has own intake with UNACTIVATED guardian candidate; marketing and access remain denied',()=>{
  const junior={...intent(),ageGroup:'under-18',guardianCandidateRecorded:true};
  const r=previewRegistrationAcceptance(notices(),junior);
  assert.equal(r.designReviewable,true);
  assert.equal(r.proposedRecord.guardianCandidateState,'unverified-unactivated-candidate');
  assert.equal(r.proposedRecord.proposedMarketingOptIn,false);
  assert.equal(r.accountActivated,false);
  deny(previewRegistrationAcceptance(notices(),{...junior,guardianCandidateRecorded:false}),'guardian-candidate-record-required');
  deny(previewRegistrationAcceptance(notices(),{...junior,marketingOptIn:true}),'junior-marketing-not-approved');
  deny(previewRegistrationAcceptance(notices(),{...junior,guardianAccountActive:true}),'invalid-or-extra-intent-fields');
  deny(previewRegistrationAcceptance(notices(),{...junior,ageGroup:'unknown'}),'unverified-age-classification');
});

test('appointed human team Manager checks only a scoped guardian request and never grants it',()=>{
  const r=previewGuardianActivation(guardian(),manager());
  assert.equal(r.designReviewable,true);
  assert.equal(r.proposedRecord.activationPerformed,false);
  assert.equal(r.proposedRecord.guardianAccessGranted,false);
  assert.equal(r.proposedRecord.auditEvidenceStatus,'not-recorded');
  deny(previewGuardianActivation({...guardian(),candidateRecorded:false},manager()),'guardian-candidate-missing');
  deny(previewGuardianActivation({...guardian(),relationshipEvidenceReviewed:false},manager()),'guardian-relationship-evidence-missing');
  deny(previewGuardianActivation(guardian(),{...manager(),appointedTeamId:'team-b'}),'foreign-team-verifier');
  deny(previewGuardianActivation(guardian(),{...manager(),accountId:'guardian-1'}),'self-approval-or-conflict');
  deny(previewGuardianActivation(guardian(),{...manager(),role:'platform-operator'}),'wrong-verification-role');
  deny(previewGuardianActivation({...guardian(),automaticInvite:true},manager()),'invalid-or-extra-guardian-fields');
});

test('WWCC number entry is not verification, a club grant, or public credential collection',()=>{
  const r=previewVolunteerWWCC(wwcc(),reviewer(),'2026-11-17');
  assert.equal(r.designReviewable,true);
  assert.equal(r.proposedRecord.checkRegistryContacted,false);
  assert.equal(r.proposedRecord.clearanceVerified,false);
  assert.equal(r.proposedRecord.dutyEligibilityGranted,false);
  assert.equal(r.proposedRecord.credentialNumberRetained,false);
  deny(previewVolunteerWWCC({...wwcc(),numberRecorded:false},reviewer(),'2026-11-17'),'wwcc-number-not-recorded');
  deny(previewVolunteerWWCC({...wwcc(),verificationEvidenceReviewed:false},reviewer(),'2026-11-17'),'wwcc-verification-evidence-missing');
  deny(previewVolunteerWWCC({...wwcc(),expiresOn:'2026-11-17'},reviewer(),'2026-11-17'),'wwcc-expired-or-due');
  deny(previewVolunteerWWCC(wwcc(),{...reviewer(),role:'club-admin'},'2026-11-17'),'independent-review-required');
  deny(previewVolunteerWWCC({...wwcc(),number:'WWC123'},reviewer(),'2026-11-17'),'invalid-or-extra-credential-fields');
});

test('12-month inactive member becomes archive REVIEW candidate, never automatically deleted',()=>{
  const now=previewMembershipArchive({membershipStatus:'inactive',departedOn:'2026-11-17'},'2027-11-16');
  assert.equal(now.designReviewable,true);
  assert.equal(now.proposedRecord.proposedState,'inactive');
  assert.equal(now.proposedRecord.archiveReviewOn,'2027-11-17');
  const after=previewMembershipArchive({membershipStatus:'inactive',departedOn:'2026-11-17'},'2027-11-17');
  assert.equal(after.designReviewable,true);
  assert.equal(after.proposedRecord.proposedState,'eligible-for-archive-review');
  assert.equal(after.proposedRecord.archivePerformed,false);
  assert.equal(after.proposedRecord.recordAutomaticallyDeleted,false);
  const leap=previewMembershipArchive({membershipStatus:'inactive',departedOn:'2024-02-29'},'2025-02-28');
  assert.equal(leap.proposedRecord.archiveReviewOn,'2025-02-28');
  deny(previewMembershipArchive({membershipStatus:'active',departedOn:'2026-11-17'},'2027-11-17'),'member-not-inactive');
  deny(previewMembershipArchive({membershipStatus:'inactive',departedOn:'2026-11-17',autoDelete:true},'2027-11-17'),'invalid-membership-shape');
  deny(previewMembershipArchive({membershipStatus:'inactive',departedOn:'2026-11-17'},'2026-11-16'),'review-before-departure');
});

test('proposed previews cannot lift independently blocked privacy or first-team release gates',()=>{
  assert.equal(register.decisions.length,18);
  assert.ok(register.decisions.every(q=>q.status==='answered-pending-review'&&q.reviewState==='not-reviewed'));
  assert.equal(register.decisions.find(q=>q.id==='TM-PR-017').proposedJuniorAcceptance.activeGuardianAccountRequired,false);
  assert.equal(register.decisions.find(q=>q.id==='TM-PR-017').supplementalSafeguardingRequirement.collectionAndStorageApproved,false);
  assert.match(releaseGuide,/activated guardian account is optional/);
  assert.doesNotMatch(releaseGuide,/verified adult guardian-account linkage.*mandatory/);
  const release=evaluateFirstTeamCloudRelease(ledger);
  assert.equal(release.ready,false);
  assert.equal(release.completed,0);
  assert.equal(release.journeysCompleted,0);
  assert.equal(ledger.ownerDecision.status,'pending');
});
