// Provider-neutral SOURCE-ONLY privacy onboarding preview contracts.
// Not imported by site/, not production authentication, not a lawful-consent
// determination, not a WWCC verification service and not a persistence adapter.
// No real personal information, credential number or guardian relationship
// evidence should be submitted to this pure module.
export const PRIVACY_ONBOARDING_DESIGN_VERSION = 1;
const obj = x => x!==null && typeof x==='object' && !Array.isArray(x);
const only = (x,keys) => obj(x) && Object.keys(x).every(k=>keys.includes(k));
const token = x => typeof x==='string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(x);
const version = x => typeof x==='string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(x);
const isoDay=x => {
  if(typeof x!=='string'||!/^20\d\d-\d\d-\d\d$/.test(x))return false;
  const t=Date.parse(x+'T00:00:00Z');
  return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===x;
};
const result=(reasons,draft=null)=>{
  const codes=Object.freeze([...new Set(reasons)]);
  return Object.freeze({
    designReviewable:codes.length===0,
    reasonCodes:codes,
    proposedRecord:codes.length===0 && draft!==null?Object.freeze(draft):null,
    accessGranted:false,
    accountActivated:false,
    dataWritten:false,
    productionProcessingAuthorised:false
  });
};

// The future identity provider must independently verify account identity,
// age/guardian authority and the acceptance event using a trusted server clock.
// This only validates a synthetic, metadata-only proposed acceptance payload.
export function previewRegistrationAcceptance(policy,intent){
  const errors=[];
  if(!only(policy,['termsVersion','privacyNoticeVersion'])||
      !version(policy.termsVersion)||!version(policy.privacyNoticeVersion))
    errors.push('invalid-versioned-notices');
  if(!only(intent,['ageGroup','termsAccepted','privacyAcknowledged','marketingOptIn','guardianCandidateRecorded'])){
    errors.push('invalid-or-extra-intent-fields');
  }else{
    if(!['adult','under-18'].includes(intent.ageGroup))errors.push('unverified-age-classification');
    if(intent.termsAccepted!==true)errors.push('terms-acceptance-required');
    if(intent.privacyAcknowledged!==true)errors.push('privacy-acknowledgement-required');
    if(intent.marketingOptIn!==undefined&&typeof intent.marketingOptIn!=='boolean')
      errors.push('invalid-marketing-choice');
    if(intent.ageGroup==='under-18'){
      if(intent.guardianCandidateRecorded!==true)errors.push('guardian-candidate-record-required');
      if(intent.marketingOptIn===true)errors.push('junior-marketing-not-approved');
    }else if(intent.guardianCandidateRecorded!==undefined&&intent.guardianCandidateRecorded!==false){
      errors.push('invalid-adult-guardian-candidate-marker');
    }
  }
  const ready=errors.length===0;
  return result(errors,ready?{
    termsVersion:policy.termsVersion,
    privacyNoticeVersion:policy.privacyNoticeVersion,
    termsAcknowledged:true,
    privacyAcknowledged:true,
    proposedMarketingOptIn:intent.ageGroup==='adult'&&intent.marketingOptIn===true,
    guardianCandidateState:intent.ageGroup==='under-18'?'unverified-unactivated-candidate':null,
    acceptanceEvidenceStatus:'not-recorded',
    ageVerificationStatus:'not-verified',
    identityVerificationStatus:'not-verified'
  }:null);
}

// Proposed review only. The actual appointed human team Manager must perform
// documented independent verification. This never activates a guardian account.
export function previewGuardianActivation(request,verifier){
  const errors=[];
  if(!only(request,['candidateRecorded','activationRequested','guardianAccountId','teamId','identityEvidenceReviewed','relationshipEvidenceReviewed'])||
     !only(verifier,['role','accountId','appointedTeamId','independenceConfirmed']))
    errors.push('invalid-or-extra-guardian-fields');
  else {
    if(request.candidateRecorded!==true)errors.push('guardian-candidate-missing');
    if(request.activationRequested!==true)errors.push('activation-request-missing');
    if(!token(request.guardianAccountId)||!token(verifier.accountId)||!token(request.teamId)||!token(verifier.appointedTeamId))
      errors.push('invalid-synthetic-identity');
    if(verifier.role!=='appointed-team-manager')errors.push('wrong-verification-role');
    if(request.teamId!==verifier.appointedTeamId)errors.push('foreign-team-verifier');
    if(request.guardianAccountId===verifier.accountId||verifier.independenceConfirmed!==true)
      errors.push('self-approval-or-conflict');
    if(request.identityEvidenceReviewed!==true)errors.push('guardian-identity-evidence-missing');
    if(request.relationshipEvidenceReviewed!==true)errors.push('guardian-relationship-evidence-missing');
  }
  return result(errors,errors.length===0?{
    proposedState:'awaiting-independent-guardian-policy-approval',
    activationPerformed:false,
    guardianAccessGranted:false,
    auditEvidenceStatus:'not-recorded'
  }:null);
}

// This checks only metadata about a proposed WWCC review. It does NOT check
// any Australian registry, validate a licence number or confer clearance.
export function previewVolunteerWWCC(check,reviewer,asOf){
  const errors=[];
  if(!only(check,['juniorFacing','numberRecorded','jurisdiction','verificationEvidenceReviewed','expiresOn'])||
     !only(reviewer,['role','independentReviewConfirmed']))
    errors.push('invalid-or-extra-credential-fields');
  else{
    if(check.juniorFacing!==true)errors.push('not-junior-facing-scope');
    if(check.numberRecorded!==true)errors.push('wwcc-number-not-recorded');
    if(typeof check.jurisdiction!=='string'||!/^[A-Z]{2,3}$/.test(check.jurisdiction))
      errors.push('invalid-jurisdiction');
    if(reviewer.role!=='designated-safeguarding-verifier'||reviewer.independentReviewConfirmed!==true)
      errors.push('independent-review-required');
    if(check.verificationEvidenceReviewed!==true)errors.push('wwcc-verification-evidence-missing');
    if(!isoDay(check.expiresOn)||!isoDay(asOf))
      errors.push('invalid-check-dates');
    else if(check.expiresOn<=asOf)errors.push('wwcc-expired-or-due');
  }
  return result(errors,errors.length===0?{
    proposedState:'awaiting-approved-jurisdiction-specific-verification',
    checkRegistryContacted:false,
    clearanceVerified:false,
    credentialNumberRetained:false,
    dutyEligibilityGranted:false
  }:null);
}

// The date is synthetic, not an authoritative membership event. This function
// does not write/archive/delete any record or assume indefinite field retention.
export function previewMembershipArchive(state,asOf){
  const errors=[];
  if(!only(state,['membershipStatus','departedOn']))errors.push('invalid-membership-shape');
  else{
    if(state.membershipStatus!=='inactive')errors.push('member-not-inactive');
    if(!isoDay(state.departedOn))errors.push('invalid-departure-date');
  }
  if(!isoDay(asOf))errors.push('invalid-review-date');
  if(errors.length)return result(errors);
  const start=new Date(state.departedOn+'T00:00:00Z');
  const due=new Date(Date.UTC(start.getUTCFullYear()+1,start.getUTCMonth(),
    Math.min(start.getUTCDate(),new Date(Date.UTC(start.getUTCFullYear()+1,start.getUTCMonth()+1,0)).getUTCDate())));
  const archiveReviewOn=due.toISOString().slice(0,10);
  if(asOf<state.departedOn)return result(['review-before-departure']);
  return result([],{
    proposedState:asOf>=archiveReviewOn?'eligible-for-archive-review':'inactive',
    archiveReviewOn,
    archivePerformed:false,
    recordAutomaticallyDeleted:false,
    fieldRetentionAndLegalHoldReview:'pending'
  });
}
