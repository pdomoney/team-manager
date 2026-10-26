// D3C: exact-ID offline handoff from the D3B priority queue to D3A's dry-run validator.
// Nothing here verifies registration, grants rights, updates club data, or assigns permissions.
import {buildClubReviewQueue} from './club-directory-review-queue.js';
import {makeClubVerificationPlan} from './club-directory-verification-plan.js';

const validId=x=>typeof x==='string'&&/^[a-z0-9][a-z0-9_-]{1,79}$/i.test(x);
export function prepareDirectoryReviewPacket(records,ledger,{directoryId,asOf='2026-10-26'}={}){
  if(!Array.isArray(records)||!validId(directoryId))
    throw Error('An exact public research directory ID is required');
  const matching=records.filter(r=>r?.id===directoryId);
  if(matching.length!==1)throw Error('Directory ID missing or ambiguous');
  const record=matching[0];
  if(record.status!=='research_candidate')throw Error('Only unverified candidates may be reviewed');
  const {items}=buildClubReviewQueue([record],ledger,{asOf,limit:1});
  const candidate=items[0];
  if(candidate.tier==='integrity_review'||
     !['Rugby league','Oztag'].includes(candidate.sport)||
     !['ACT','NSW','NT','QLD','SA','TAS','VIC','WA'].includes(candidate.state))
    throw Error('Candidate needs a separate integrity review');

  // All evidence and reviewer fields stay blank: a generated proposal MUST be blocked.
  const proposalTemplate={
    directoryId:candidate.directoryId,sport:candidate.sport,state:candidate.state,
    sourceKind:'',evidenceUrl:'',evidenceRef:'',rightsDecisionRef:'',
    reviewer:'',reviewedAt:'',officialClubId:'',officialRegistrationRef:'',
    proposedFields:{}
  };
  const preflight=makeClubVerificationPlan(records,[proposalTemplate],{asOf});
  if(preflight.blockedCount!==1)throw Error('Evidence safety invariant failed');
  const gates=[
    ['source_terms','Independently review reuse, attribution and withdrawal terms for this source and intended fields'],
    ['current_identity','Verify current club or venue identity from official or club-controlled records'],
    ['identity_conflicts','Resolve same-name, cross-state and club-versus-venue conflicts'],
    ['data_minimisation','Exclude private persons, guardians and unsupported branding from proposed fields'],
    ['owner_signoff','Document independent source-rights decision and owner approval before any change PR']
  ].map(([code,instruction])=>({code,instruction,status:'not_reviewed',requiresHumanReview:true}));
  return {
    schemaVersion:1,asOf,recordScope:'one_exact_public_research_candidate',
    candidate:{directoryId:candidate.directoryId,name:candidate.name,sport:candidate.sport,
      state:candidate.state,sourceHost:candidate.sourceHost,sourceClass:candidate.sourceClass,
      reviewPriority:candidate.tier,reviewState:'candidate_unverified'},
    reviewGates:gates,proposalTemplate,
    proposalPreflight:{state:'blocked_until_real_evidence_submitted',issueCodes:preflight.reviews[0].issues},
    sourceRights:'unresolved_until_independent_decision',
    registration:'not_independently_verified',ownerApproval:'not_given',
    publicationEligible:false,canGrantRoles:false,catalogueChanged:false,
    coachWorkspaceChanged:false,verifiedByThisPacket:0,
    status:'REVIEW_HANDOFF_ONLY_NO_DATA_CHANGE'
  };
}