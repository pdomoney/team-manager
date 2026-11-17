// Source-only Team Manager private-information POLICY PREVIEW.
// These functions are not imported by site/, not an authorisation boundary and
// never accept or emit personal data, credential values, session tokens or grants.
// Only a future independently approved backend may vouch for actor metadata.
// All design matches remain explicitly non-authorising.
export const PRIVACY_SCOPED_POLICY_VERSION=1;
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  Object.getPrototypeOf(x)===Object.prototype;
const exact=(x,keys)=>record(x)&&Object.keys(x).every(k=>keys.includes(k));
const id=x=>typeof x==='string'&&/^[a-z0-9][a-z0-9:_-]{0,63}$/.test(x);
const outcome=(codes,proposal=null)=>{
  const reasonCodes=Object.freeze([...new Set(codes)]);
  return Object.freeze({
    designReviewable:reasonCodes.length===0,
    reasonCodes,
    proposal:reasonCodes.length===0&&proposal!==null?Object.freeze(proposal):null,
    fieldValuesReturned:false,
    accessGranted:false,
    disclosurePerformed:false,
    recordChanged:false,
    productionProcessingAuthorised:false
  });
};
const classify=(errors,input,allowed,code)=>{
  if(!exact(input,allowed)){errors.push(code);return false;}
  return true;
};

// The player controls only their own profile-contact fields, as specified
// by TM-PR-014. No values, account emails or browser-supplied identity proofs
// can be passed to this source-only preview.
const SELF_CONTACT_FIELDS=Object.freeze(['contact-email','mobile-phone','residential-address']);
export function previewSelfContactCorrection(actor,change){
  const reasons=[];
  const actorValid=classify(reasons,actor,['role','selectedRole','verifiedPersonId','identityVerified'],'invalid-actor-metadata');
  const changeValid=classify(reasons,change,['targetPersonId','fieldKeys'],'invalid-change-metadata');
  if(actorValid){
    if(actor.role!=='team_player'||actor.selectedRole!=='team_player')
      reasons.push('not-player-selected-role');
    if(!id(actor.verifiedPersonId)||actor.identityVerified!==true)
      reasons.push('independent-account-link-required');
  }
  if(changeValid){
    if(!id(change.targetPersonId))reasons.push('invalid-target');
    if(!Array.isArray(change.fieldKeys)||change.fieldKeys.length<1||
      new Set(change.fieldKeys).size!==change.fieldKeys.length||
      change.fieldKeys.some(k=>!SELF_CONTACT_FIELDS.includes(k)))
      reasons.push('field-not-self-editable');
  }
  if(actorValid&&changeValid&&id(actor.verifiedPersonId)&&id(change.targetPersonId)&&
    actor.verifiedPersonId!==change.targetPersonId) reasons.push('not-own-profile');
  return outcome(reasons,reasons.length===0?{
    proposedOperation:'self-service-contact-correction',
    fieldKeys:Object.freeze([...change.fieldKeys]),
    emailChangeRequiresIndependentVerification:change.fieldKeys.includes('contact-email'),
    trustedIdentityAndStorageRequired:true,
    decisionRefs:Object.freeze(['TM-PR-014'])
  }:null);
}

// Team Manager can review minimum operational categories for their exact team;
// Club Admin for their exact club. No automatic Coach, volunteer, guardian or
// platform-operator private-profile browse permission. TM-PR-008 still awaits
// field-level/privacy review, so no individual field values are projected.
const READ_CATEGORIES=Object.freeze(['player-contact','emergency-contact']);
export function previewScopedOperationalRead(actor,resource){
  const reasons=[];
  const av=classify(reasons,actor,['role','selectedRole','grantScope','grantId','grantStatus'],'invalid-actor-metadata');
  const rv=classify(reasons,resource,['teamId','clubId','membershipStatus','category'],'invalid-resource-metadata');
  if(av){
    if(!['appointed-team-manager','club-admin'].includes(actor.role)||
      actor.selectedRole!==actor.role) reasons.push('role-not-permitted');
    if(actor.grantStatus!=='active'||!id(actor.grantId))reasons.push('active-scoped-grant-required');
  }
  if(rv){
    if(!id(resource.teamId)||!id(resource.clubId))reasons.push('invalid-resource-scope');
    if(resource.membershipStatus!=='active')reasons.push('inactive-or-archived-record');
    if(!READ_CATEGORIES.includes(resource.category))reasons.push('category-not-permitted');
  }
  if(av&&rv){
    if(actor.role==='appointed-team-manager'&&
       (actor.grantScope!=='team'||actor.grantId!==resource.teamId))
      reasons.push('foreign-team-or-grant');
    if(actor.role==='club-admin'&&
       (actor.grantScope!=='club'||actor.grantId!==resource.clubId))
      reasons.push('foreign-club-or-grant');
  }
  return outcome(reasons,reasons.length===0?{
    proposedOperation:'purpose-limited-operational-read',
    dataCategory:resource.category,
    fieldLevelProjection:'pending-independent-review',
    auditRequired:true,
    trustedServerEnforcementRequired:true,
    decisionRefs:Object.freeze(['TM-PR-007','TM-PR-008'])
  }:null);
}

// A verified association may have a valid COMPETITION purpose, but the owner
// did not approve any individual fields or a live sharing channel. Always
// return no field keys and no disclosure, even for a matching synthetic scope.
const ASSOCIATION_PURPOSES=Object.freeze([
  'competition-registration','team-eligibility','fixture-administration'
]);
export function previewAssociationDisclosure(actor,context){
  const reasons=[];
  const av=classify(reasons,actor,['role','selectedRole','associationId','verifiedAdministrator'],'invalid-association-actor');
  const cv=classify(reasons,context,['associationId','purpose','membershipStatus','recipientScope'],'invalid-disclosure-context');
  if(av){
    if(actor.role!=='association-admin'||actor.selectedRole!=='association-admin'||
      actor.verifiedAdministrator!==true||!id(actor.associationId))
      reasons.push('verified-association-admin-required');
  }
  if(cv){
    if(!id(context.associationId)||context.recipientScope!=='same-association')
      reasons.push('recipient-scope-not-approved');
    if(!ASSOCIATION_PURPOSES.includes(context.purpose))reasons.push('purpose-not-approved');
    if(context.membershipStatus!=='active')reasons.push('inactive-or-archived-record');
  }
  if(av&&cv&&actor.associationId!==context.associationId)
    reasons.push('foreign-association');
  return outcome(reasons,reasons.length===0?{
    proposedOperation:'association-disclosure-review',
    purpose:context.purpose,
    individualFieldKeys:Object.freeze([]),
    sharingChannel:'unselected',
    fieldApproval:'not-granted',
    auditRequired:true,
    decisionRefs:Object.freeze(['TM-PR-012'])
  }:null);
}

// The WWCC identifier remains private. Even a designated safeguard reviewer
// must use an independently approved scheme and secure store in a later app.
// Only propose a review queue, never return a raw number or claim clearance.
export function previewVolunteerSafeguardingReview(actor,check){
  const reasons=[];
  const av=classify(reasons,actor,['role','selectedRole'],'invalid-credential-reviewer');
  const cv=classify(reasons,check,['juniorFacing','numberRecorded','verificationState'],'invalid-credential-metadata');
  if(av&&
    (actor.role!=='designated-safeguarding-verifier'||actor.selectedRole!==actor.role))
    reasons.push('safeguarding-reviewer-not-designated');
  if(cv){
    if(check.juniorFacing!==true)reasons.push('not-junior-facing-scope');
    if(check.numberRecorded!==true)reasons.push('wwcc-number-not-recorded');
    if(check.verificationState!=='pending-independent-verification')
      reasons.push('external-verification-not-established');
  }
  return outcome(reasons,reasons.length===0?{
    proposedOperation:'wwcc-verification-review',
    credentialNumberVisible:false,
    verificationStatus:'pending',
    dutyEligibilityGranted:false,
    authorisedVerifierPolicy:'unapproved',
    decisionRefs:Object.freeze(['TM-PR-017'])
  }:null);
}

// An archived record is NOT available for routine roster/private-data reads.
// A platform operator may own the rights-request process, but this preview
// routes a request; it does not retrieve/delete any private data or lift holds.
export function previewArchivedRightsReview(actor,request){
  const reasons=[];
  const av=classify(reasons,actor,['role','selectedRole'],'invalid-rights-actor');
  const rv=classify(reasons,request,['recordState','requestPurpose','requestVerified'],'invalid-rights-context');
  if(av&&
    (actor.role!=='platform-operator'||actor.selectedRole!=='platform-operator'))
    reasons.push('platform-rights-owner-required');
  if(rv){
    if(request.recordState!=='archived')reasons.push('not-archived-record');
    if(!['privacy-access-request','privacy-correction-request',
      'privacy-deletion-request','legal-retention-review'].includes(request.requestPurpose))
      reasons.push('invalid-rights-purpose');
    if(request.requestVerified!==true)reasons.push('request-verification-required');
  }
  return outcome(reasons,reasons.length===0?{
    proposedOperation:'route-archived-rights-review',
    recordsRead:false,
    deletionPerformed:false,
    legalHoldAndRetentionEvaluation:'pending',
    noAutomaticDeletion:true,
    decisionRefs:Object.freeze(['TM-PR-013','TM-PR-014'])
  }:null);
}
