// Read-only, provider-neutral L0 evidence reconciliation.
// Consumes only PUBLIC-SAFE policy metadata. This tool does not verify external
// evidence, decide legal compliance, access private records, issue grants,
// provision services or approve release. Never pass personal data to it.
import {evaluateFirstTeamCloudRelease,FIRST_TEAM_GATES,FIRST_TEAM_JOURNEYS}
  from './first-team-cloud-release.js';

export const PRIVACY_L0_RECONCILIATION_VERSION=1;
export const PRIVACY_L0_IDS=Object.freeze(Array.from({length:18},
  (_,i)=>'TM-PR-'+String(i+1).padStart(3,'0')));
export const PRIVACY_PLAYER_FIELD_KEYS=Object.freeze([
  'fullName','dateOfBirth','phoneNumber','residentialAddress','profilePhoto',
  'socialMediaAccounts','otherClubs','otherSports','profession',
  'educationLevel','educationInstitution'
]);
const validRef=x=>typeof x==='string'&&x.length>10&&x.length<240&&
  /^(?:evidence-ref:[A-Za-z0-9._/-]+|docs\/[A-Za-z0-9._/-]+\.md)$/.test(x);
const isoDate=x=>typeof x==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(x)&&
  !Number.isNaN(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const rows=x=>Array.isArray(x)?x:[];
const countAll=(arr,pred)=>arr.filter(pred).length;
const reasoned=(id,reasonCodes)=>Object.freeze({
  id,
  complete:reasonCodes.length===0,
  reasonCodes:Object.freeze([...new Set(reasonCodes)])
});
const safeState=(x,expected)=>obj(x)&&x.kind===expected;

export function evaluatePrivacyL0Evidence(register,inventory,plan,release){
  const structural=[];
  if(!safeState(register,'team-manager-privacy-decision-register')||
     register.schemaVersion!==1||register.classification!=='public-policy-metadata-only')
    structural.push('invalid-decision-register');
  if(!safeState(inventory,'team-manager-player-field-policy-inventory')||
     inventory.schemaVersion!==1||inventory.classification!=='public-policy-metadata-only')
    structural.push('invalid-field-inventory');
  if(!safeState(plan,'team-manager-privacy-launch-review-plan')||
     plan.schemaVersion!==1||plan.classification!=='public-policy-metadata-only')
    structural.push('invalid-review-plan');
  if(!safeState(release,'first-team-cloud-live-release')||release.schemaVersion!==1)
    structural.push('invalid-release-ledger');

  const decisions=rows(register?.decisions),fields=rows(inventory?.fields),
    controls=rows(plan?.controls);
  const keys=fields.map(f=>f?.key),ids=decisions.map(d=>d?.id),
    controlIds=controls.map(c=>c?.decisionId);
  if(ids.length!==18||ids.some((x,i)=>x!==PRIVACY_L0_IDS[i]))
    structural.push('decision-id-coverage-mismatch');
  if(controlIds.length!==18||controlIds.some((x,i)=>x!==PRIVACY_L0_IDS[i]))
    structural.push('review-control-coverage-mismatch');
  if(keys.length!==11||new Set(keys).size!==11||
     !PRIVACY_PLAYER_FIELD_KEYS.every(x=>keys.includes(x)))
    structural.push('player-field-coverage-mismatch');
  if(inventory?.productionCollectionAuthorised!==false)
    structural.push('unverified-production-collection-claim');
  if(plan?.productionReleaseAuthorised!==false||
     plan?.backendProvisioningAuthorised!==false||
     plan?.productionDataProcessingAuthorised!==false)
    structural.push('unverified-release-claim-in-plan');

  const decisionsById=new Map(decisions.map(d=>[d?.id,d]));
  const controlsById=new Map(controls.map(c=>[c?.decisionId,c]));
  const fieldByKey=new Map(fields.map(f=>[f?.key,f]));
  const decisionRows=PRIVACY_L0_IDS.map(id=>{
    const q=decisionsById.get(id),c=controlsById.get(id),reasonCodes=[];
    if(!obj(q)||!['answered-pending-review','approved'].includes(q.status))
      reasonCodes.push('owner-decision-unanswered-or-invalid');
    if(!obj(q)||q.reviewState!=='approved'||q.status!=='approved'||
       !q.reviewerRole||!isoDate(q.reviewedOn)||!validRef(q.reviewEvidenceRef))
      reasonCodes.push('independent-policy-review-not-evidenced');
    if(!obj(c)||c.reviewStatus!=='approved'||c.independentlyReviewed!==true||
       !validRef(c.reviewEvidenceRef))
      reasonCodes.push('control-evidence-not-independently-reviewed');
    // Source plan's productionAuthorised=true must NEVER be inferred from a
    // reviewer approving a policy. Actual release is a separate authority.
    if(c?.productionAuthorised===true)
      reasonCodes.push('control-unverified-production-claim');
    return reasoned(id,reasonCodes);
  });
  const fieldRows=PRIVACY_PLAYER_FIELD_KEYS.map(key=>{
    const f=fieldByKey.get(key),reasons=[];
    if(!obj(f)||!['proposed-mandatory','proposed-optional'].includes(f.ownerRequirement))
      reasons.push('field-classification-missing');
    if(!obj(f)||f.policyStatus!=='approved'||f.approvedForCollection!==true||
       f.reviewState!=='approved'||!validRef(f.reviewEvidenceRef))
      reasons.push('field-collection-not-independently-approved');
    if(f?.approvedForMarketingUse===true)
      reasons.push('marketing-authorization-outside-field-review');
    if(f?.visibility==='public'||f?.visibility==='all-clubs')
      reasons.push('unreviewed-public-or-cross-club-visibility');
    return reasoned(key,reasons);
  });
  const remainingIds=decisionRows.filter(x=>!x.complete).map(x=>x.id);
  const remainingFields=fieldRows.filter(x=>!x.complete).map(x=>x.id);
  const releaseCheck=evaluateFirstTeamCloudRelease(release);
  if(Object.keys(release?.gates||{}).length!==FIRST_TEAM_GATES.length||
    FIRST_TEAM_GATES.some(id=>!Object.hasOwn(release?.gates||{},id)))
    structural.push('release-gate-coverage-mismatch');
  if(Object.keys(release?.launchJourneys||{}).length!==FIRST_TEAM_JOURNEYS.length||
    FIRST_TEAM_JOURNEYS.some(id=>!Object.hasOwn(release?.launchJourneys||{},id)))
    structural.push('release-journey-coverage-mismatch');
  const owner=release?.ownerDecision;
  const ownerCodes=[];
  if(owner?.status!=='approved')
    ownerCodes.push('separate-owner-release-approval-missing');
  for(const name of ['provider','plan','region','controller'])
    if(typeof owner?.[name]!=='string'||owner[name].trim().length<2)
      ownerCodes.push('approved-'+name+'-missing');
  if(owner?.minorDataPolicy!=='specifically-approved'||
     !validRef(owner?.minorDataDecisionRef)||
     !validRef(owner?.guardianAccessEvidenceRef))
    ownerCodes.push('minor-and-guardian-privacy-evidence-missing');
  if(owner?.dataScope!=='approved-limited-real')
    ownerCodes.push('data-processing-scope-not-approved');
  if(!validRef(owner?.privacyNoticeRef))
    ownerCodes.push('privacy-notice-approval-evidence-missing');

  const structurallySound=structural.length===0;
  const completeDecisions=countAll(decisionRows,x=>x.complete);
  const completeFields=countAll(fieldRows,x=>x.complete);
  const evidenceCandidate=structurallySound&&completeDecisions===18&&
    completeFields===11&&ownerCodes.length===0;
  // This boolean is a review QUEUE indicator, never a real-data pass.
  return Object.freeze({
    version:PRIVACY_L0_RECONCILIATION_VERSION,
    kind:'privacy-l0-source-reconciliation',
    structurallySound,
    structuralBlockers:Object.freeze([...new Set(structural)]),
    ownerResponsesRecorded:countAll(decisions,x=>
      x?.status==='answered-pending-review'||x?.status==='approved'),
    ownerResponseTotal:18,
    independentlyReviewedDecisions:completeDecisions,
    independentDecisionTotal:18,
    independentlyApprovedFields:completeFields,
    requestedFieldTotal:11,
    decisionRows:Object.freeze(decisionRows),
    fieldRows:Object.freeze(fieldRows),
    decisionIdsPending:Object.freeze(remainingIds),
    fieldKeysPending:Object.freeze(remainingFields),
    ownerEvidenceBlockers:Object.freeze(ownerCodes),
    releaseGatesPassed:releaseCheck.completed,
    releaseGatesTotal:releaseCheck.total,
    liveJourneysPassed:releaseCheck.journeysCompleted,
    liveJourneysTotal:releaseCheck.journeysTotal,
    independentlyReviewedL0Candidate:evidenceCandidate,
    separateLiveReleaseReady:releaseCheck.ready,
    sourceOnly:true,
    actualEvidenceVerified:false,
    personalDataAccessGranted:false,
    productionProcessingAuthorised:false,
    productionReleaseAuthorised:false
  });
}
