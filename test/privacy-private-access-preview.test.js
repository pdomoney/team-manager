import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PRIVACY_SCOPED_POLICY_VERSION,previewSelfContactCorrection,
  previewScopedOperationalRead,previewAssociationDisclosure,
  previewVolunteerSafeguardingReview,previewArchivedRightsReview
} from '../src/privacy-private-access-preview.js';
import {evaluateFirstTeamCloudRelease} from '../src/first-team-cloud-release.js';

const load=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const reg=load('config/privacy-decision-register.json');
const ledger=load('config/first-team-cloud-release-evidence.json');
const actor=()=>({role:'team_player',selectedRole:'team_player',verifiedPersonId:'player1',identityVerified:true});
const change=()=>({targetPersonId:'player1',fieldKeys:['mobile-phone']});
const manager=()=>({role:'appointed-team-manager',selectedRole:'appointed-team-manager',grantScope:'team',grantId:'team1',grantStatus:'active'});
const club=()=>({role:'club-admin',selectedRole:'club-admin',grantScope:'club',grantId:'club1',grantStatus:'active'});
const res=()=>({teamId:'team1',clubId:'club1',membershipStatus:'active',category:'emergency-contact'});
const association=()=>({role:'association-admin',selectedRole:'association-admin',associationId:'assn1',verifiedAdministrator:true});
const disclosure=()=>({associationId:'assn1',purpose:'competition-registration',membershipStatus:'active',recipientScope:'same-association'});
const reviewer=()=>({role:'designated-safeguarding-verifier',selectedRole:'designated-safeguarding-verifier'});
const check=()=>({juniorFacing:true,numberRecorded:true,verificationState:'pending-independent-verification'});
const platform=()=>({role:'platform-operator',selectedRole:'platform-operator'});
const rights=()=>({recordState:'archived',requestPurpose:'privacy-access-request',requestVerified:true});

const inactive=r=> {
  assert.equal(r.designReviewable,false);
  assert.equal(r.proposal,null);
  assert.equal(r.accessGranted,false);
  assert.equal(r.fieldValuesReturned,false);
  assert.equal(r.recordChanged,false);
  assert.equal(r.disclosurePerformed,false);
  assert.equal(r.productionProcessingAuthorised,false);
};
const denied=(r,code)=>{inactive(r);assert.ok(r.reasonCodes.includes(code),JSON.stringify(r.reasonCodes));};
const candidate=r=>{
  assert.equal(r.designReviewable,true);
  assert.deepEqual(r.reasonCodes,[]);
  assert.equal(r.accessGranted,false);
  assert.equal(r.fieldValuesReturned,false);
  assert.equal(r.disclosurePerformed,false);
  assert.equal(r.recordChanged,false);
  assert.equal(r.productionProcessingAuthorised,false);
  assert.ok(r.proposal!==null);
};

test('profile correction: player can propose only own scoped contact keys, never direct values',()=>{
  assert.equal(PRIVACY_SCOPED_POLICY_VERSION,1);
  const r=previewSelfContactCorrection(actor(),change());
  candidate(r);
  assert.deepEqual(r.proposal.fieldKeys,['mobile-phone']);
  assert.equal(r.proposal.emailChangeRequiresIndependentVerification,false);
  assert.equal(previewSelfContactCorrection(actor(),{...change(),fieldKeys:['contact-email']}).proposal.emailChangeRequiresIndependentVerification,true);
  denied(previewSelfContactCorrection(actor(),{...change(),targetPersonId:'player2'}),'not-own-profile');
  denied(previewSelfContactCorrection(actor(),{...change(),fieldKeys:['date-of-birth']}),'field-not-self-editable');
  denied(previewSelfContactCorrection(actor(),{...change(),fieldKeys:['mobile-phone','mobile-phone']}),'field-not-self-editable');
  denied(previewSelfContactCorrection({...actor(),identityVerified:false},change()),'independent-account-link-required');
  denied(previewSelfContactCorrection({...actor(),selectedRole:'team_manager'},change()),'not-player-selected-role');
  denied(previewSelfContactCorrection(actor(),{...change(),value:'0412345678'}),'invalid-change-metadata');
  denied(previewSelfContactCorrection(null,change()),'invalid-actor-metadata');
});

test('appointed Manager exact-team operational read is category-only; no private field data',()=>{
  const r=previewScopedOperationalRead(manager(),res());
  candidate(r);
  assert.equal(r.proposal.dataCategory,'emergency-contact');
  assert.equal(r.proposal.fieldLevelProjection,'pending-independent-review');
  candidate(previewScopedOperationalRead(manager(),{...res(),category:'player-contact'}));
  denied(previewScopedOperationalRead({...manager(),grantId:'team2'},res()),'foreign-team-or-grant');
  denied(previewScopedOperationalRead({...manager(),grantScope:'club'},res()),'foreign-team-or-grant');
  denied(previewScopedOperationalRead({...manager(),grantStatus:'revoked'},res()),'active-scoped-grant-required');
  denied(previewScopedOperationalRead({...manager(),role:'team_coach',selectedRole:'team_coach'},res()),'role-not-permitted');
  denied(previewScopedOperationalRead({...manager(),selectedRole:'club-admin'},res()),'role-not-permitted');
  denied(previewScopedOperationalRead(manager(),{...res(),membershipStatus:'archived'}),'inactive-or-archived-record');
  denied(previewScopedOperationalRead(manager(),{...res(),category:'guardian-candidate'}),'category-not-permitted');
  denied(previewScopedOperationalRead(manager(),{...res(),phone:'secret'}),'invalid-resource-metadata');
});

test('Club Admin read is exact club only, not all clubs or routine platform access',()=>{
  candidate(previewScopedOperationalRead(club(),res()));
  denied(previewScopedOperationalRead({...club(),grantId:'club2'},res()),'foreign-club-or-grant');
  denied(previewScopedOperationalRead({...club(),grantScope:'team'},res()),'foreign-club-or-grant');
  denied(previewScopedOperationalRead({...club(),role:'platform-operator',selectedRole:'platform-operator'},res()),'role-not-permitted');
  denied(previewScopedOperationalRead({...club(),role:'guardian',selectedRole:'guardian'},res()),'role-not-permitted');
  denied(previewScopedOperationalRead(club(),{...res(),membershipStatus:'inactive'}),'inactive-or-archived-record');
});

test('sporting association review has narrow purpose and always has ZERO approved fields',()=>{
  const r=previewAssociationDisclosure(association(),disclosure());
  candidate(r);
  assert.deepEqual(r.proposal.individualFieldKeys,[]);
  assert.equal(r.proposal.fieldApproval,'not-granted');
  assert.equal(r.proposal.sharingChannel,'unselected');
  candidate(previewAssociationDisclosure(association(),{...disclosure(),purpose:'fixture-administration'}));
  denied(previewAssociationDisclosure({...association(),verifiedAdministrator:false},disclosure()),'verified-association-admin-required');
  denied(previewAssociationDisclosure(association(),{...disclosure(),associationId:'assn2'}),'foreign-association');
  denied(previewAssociationDisclosure(association(),{...disclosure(),purpose:'marketing'}),'purpose-not-approved');
  denied(previewAssociationDisclosure(association(),{...disclosure(),recipientScope:'all-clubs'}),'recipient-scope-not-approved');
  denied(previewAssociationDisclosure(association(),{...disclosure(),membershipStatus:'archived'}),'inactive-or-archived-record');
  denied(previewAssociationDisclosure(association(),{...disclosure(),approvedFields:['phone']}),'invalid-disclosure-context');
});

test('WWCC review shows pending verification only, never a raw number or duty clearance',()=>{
  const r=previewVolunteerSafeguardingReview(reviewer(),check());
  candidate(r);
  assert.equal(r.proposal.credentialNumberVisible,false);
  assert.equal(r.proposal.dutyEligibilityGranted,false);
  assert.equal(r.proposal.authorisedVerifierPolicy,'unapproved');
  denied(previewVolunteerSafeguardingReview({...reviewer(),role:'club-admin',selectedRole:'club-admin'},check()),'safeguarding-reviewer-not-designated');
  denied(previewVolunteerSafeguardingReview(reviewer(),{...check(),verificationState:'verified'}),'external-verification-not-established');
  denied(previewVolunteerSafeguardingReview(reviewer(),{...check(),numberRecorded:false}),'wwcc-number-not-recorded');
  denied(previewVolunteerSafeguardingReview(reviewer(),{...check(),rawNumber:'WWC1234'}),'invalid-credential-metadata');
});

test('archived record is routed to platform rights owner without browsing or deleting it',()=>{
  const r=previewArchivedRightsReview(platform(),rights());
  candidate(r);
  assert.equal(r.proposal.recordsRead,false);
  assert.equal(r.proposal.deletionPerformed,false);
  assert.equal(r.proposal.noAutomaticDeletion,true);
  candidate(previewArchivedRightsReview(platform(),{...rights(),requestPurpose:'privacy-deletion-request'}));
  denied(previewArchivedRightsReview({...platform(),role:'club-admin',selectedRole:'club-admin'},rights()),'platform-rights-owner-required');
  denied(previewArchivedRightsReview(platform(),{...rights(),requestVerified:false}),'request-verification-required');
  denied(previewArchivedRightsReview(platform(),{...rights(),recordState:'active'}),'not-archived-record');
  denied(previewArchivedRightsReview(platform(),{...rights(),requestPurpose:'routine-roster-read'}),'invalid-rights-purpose');
  denied(previewArchivedRightsReview(platform(),{...rights(),deleteNow:true}),'invalid-rights-context');
});

test('all proposed review outcomes are immutable and cannot bypass original safety gates',()=>{
  const r=previewScopedOperationalRead(manager(),res());
  assert.equal(Object.isFrozen(r),true);
  assert.equal(Object.isFrozen(r.reasonCodes),true);
  assert.equal(Object.isFrozen(r.proposal),true);
  assert.equal(reg.decisions.length,18);
  assert.ok(reg.decisions.every(q=>q.status==='answered-pending-review'&&q.reviewState==='not-reviewed'));
  assert.equal(reg.decisions.find(q=>q.id==='TM-PR-012').proposedSharingPolicy.individualFieldsApproved.length,0);
  assert.equal(reg.decisions.find(q=>q.id==='TM-PR-018').proposedLaunchApproval.productionReleaseAuthorised,false);
  const e=evaluateFirstTeamCloudRelease(ledger);
  assert.equal(e.ready,false);
  assert.equal(e.completed,0);
  assert.equal(e.journeysCompleted,0);
  assert.ok(Object.values(ledger.gates).every(g=>g.status==='pending'));
});
