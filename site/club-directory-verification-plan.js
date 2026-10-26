// Post-P10 D3A: read-only club-identity/coverage review plans.
// Never writes to research catalogue, coach clubs, accounts, or published GitHub data.
// A source link, evidence reference or "approved" field is NOT proof of registration or consent.
const STATES=Object.freeze(['ACT','NSW','NT','QLD','SA','TAS','VIC','WA']);
const allowed=Object.freeze(new Set([
  'name','region','association','suburb','postcode','ground',
  'website','email','phone','registration','founded'
]));
const forbidden=/^(id|directoryId|sport|state|status|registration_status|verified|permissions|roles|players|teams|seasons|officials|logo|style|colours|sourceClass|sourceUrl|notes|clubId)$/i;
const clean=x=>typeof x==='string'?x.trim():'';
const key=x=>clean(x).toLocaleLowerCase('en-AU').replace(/\s+/g,' ');
const validDate=x=>/^20\d\d-\d\d-\d\d$/.test(clean(x))&&!Number.isNaN(Date.parse(x+'T00:00:00Z'));
const validUrl=x=>{try{const u=new URL(clean(x));return (u.protocol==='https:'||u.protocol==='http:')&&!!u.hostname;}catch{return false;}};
const hasEvidence=x=>clean(x).length>=7;
const byCount=(items,keyFn)=>Object.fromEntries([...items.reduce((m,v)=>m.set(keyFn(v),(m.get(keyFn(v))||0)+1),new Map())].sort(([a],[b])=>a.localeCompare(b)));
const possibleSources=Object.freeze(['governing_body_registration','governing_body_club_directory','club_controlled_official']);
const sensitiveText=/\b(?:password|token|medical|wwcc|guardian|dateOfBirth|privateNotes)\b/i;
export function makeClubVerificationPlan(records,proposals=[],{asOf='2026-10-26',maxReviewAgeDays=180}={}){
  if(!Array.isArray(records)||!Array.isArray(proposals)||!validDate(asOf)||!Number.isInteger(maxReviewAgeDays)||maxReviewAgeDays<1)
    throw new Error('Invalid research records, proposals or as-of settings');
  if(proposals.length>records.length+100)throw new Error('Unexpected volume of review proposals');
  const ids=new Map(),idDuplicates=new Set(),nameGroups=new Map();
  for(const [i,r] of records.entries()){
    const id=clean(r?.id);
    if(ids.has(id))idDuplicates.add(id);else ids.set(id,{record:r,index:i});
    const nameKey=[key(r?.sport),key(r?.state),key(r?.name)].join('|');
    if(!nameGroups.has(nameKey))nameGroups.set(nameKey,[]);
    nameGroups.get(nameKey).push(id);
  }
  const touched=new Set();
  const reviews=proposals.map((raw,idx)=>{
    const p=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
    const id=clean(p.directoryId),match=ids.get(id);
    const issues=[];
    if(!id||!match)issues.push('unknown_exact_directory_id');
    if(touched.has(id))issues.push('multiple_reviews_for_same_directory_id');
    touched.add(id);
    if(idDuplicates.has(id))issues.push('duplicate_existing_directory_id');
    if(!match)return {index:idx,directoryId:id||null,state:'blocked',issues,requiresHumanApproval:true};
    const r=match.record;
    if(r.status!=='research_candidate')issues.push('source_record_not_research_candidate');
    if(clean(p.sport)!==clean(r.sport)||clean(p.state)!==clean(r.state))
      issues.push('source_identity_scope_mismatch');
    if(!STATES.includes(clean(r.state)))issues.push('unknown_jurisdiction');
    if(!possibleSources.includes(p.sourceKind)||!validUrl(p.evidenceUrl))
      issues.push('authoritative_source_type_or_url_not_evidenced');
    if(!hasEvidence(p.evidenceRef)||!hasEvidence(p.reviewer)||!validDate(p.reviewedAt)||
      (validDate(p.reviewedAt)&&p.reviewedAt>asOf))
      issues.push('missing_or_future_human_review_evidence');
    if(validDate(p.reviewedAt)){
      const days=(Date.parse(asOf+'T00:00:00Z')-Date.parse(p.reviewedAt+'T00:00:00Z'))/86400000;
      if(days>maxReviewAgeDays)issues.push('stale_review_evidence');
    }
    if(!hasEvidence(p.rightsDecisionRef))issues.push('source_rights_decision_not_cited');
    if(!hasEvidence(p.officialClubId)&&!hasEvidence(p.officialRegistrationRef))
      issues.push('no_official_club_identity_or_registration_evidence');
    const changes=p.proposedFields===undefined?{}:p.proposedFields;
    if(!changes||typeof changes!=='object'||Array.isArray(changes))issues.push('invalid_proposed_field_object');
    const cols=changes&&typeof changes==='object'&&!Array.isArray(changes)?Object.keys(changes):[];
    if(cols.length>12)issues.push('too_many_proposed_fields');
    for(const col of cols){
      if(forbidden.test(col)||!allowed.has(col))issues.push('field_outside_public_club_allowlist');
      if(typeof changes[col]!=='string'||changes[col].length>500||sensitiveText.test(changes[col]))
        issues.push('invalid_or_sensitive_public_field');
    }
    const proposedName=clean(changes?.name)||clean(r.name);
    const otherMatches=(nameGroups.get([key(r.sport),key(r.state),key(proposedName)].join('|'))||[]).filter(x=>x!==id);
    if(otherMatches.length)issues.push('same_sport_state_name_collision_requires_manual_reconciliation');
    if(p.requestedStatus&&p.requestedStatus!=='research_candidate')
      issues.push('direct_registration_promotion_forbidden');
    if(p.apply===true||p.publish===true||p.assignRole===true)
      issues.push('automatic_publish_or_privilege_request_forbidden');
    const unique=[...new Set(issues)];
    return {
      index:idx,directoryId:id,sport:r.sport,state:r.state,
      stateOfReview:unique.length?'blocked':'awaiting_independent_owner_decision',
      issues:unique,proposedFieldNames:cols.sort(),
      requiresHumanApproval:true,mayChangeDirectory:false,mayGrantPermissions:false
    };
  });
  const coverage=STATES.map(state=>({
    state,
    rugbyLeagueCandidates:records.filter(x=>x.sport==='Rugby league'&&x.state===state).length,
    oztagCandidates:records.filter(x=>x.sport==='Oztag'&&x.state===state).length,
    label:'Research candidates only; not verified registration totals'
  }));
  return {
    schemaVersion:1,asOf,recordCount:records.length,
    bySport:byCount(records,x=>clean(x.sport)||'UNKNOWN'),
    coverage,
    proposalsReceived:reviews.length,
    blockedCount:reviews.filter(x=>x.stateOfReview==='blocked'||x.state==='blocked').length,
    awaitingDecisionCount:reviews.filter(x=>x.stateOfReview==='awaiting_independent_owner_decision').length,
    reviews,
    status:'DRY_RUN_ONLY_NO_REGISTRATIONS_VERIFIED',
    catalogueChanged:false,verifiedRegistrationCountFromThisPlan:0,
    rightsClearanceGranted:false,rolesGranted:false
  };
}
