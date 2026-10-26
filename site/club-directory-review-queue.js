// D3B: deterministic *review queue* of already published public research candidates.
// A queue item is NOT a club verification, a reuse licence, or a permission grant.
// Never reads private workspaces, publishes records, fetches websites, or modifies data.
import { auditSourceRights } from './club-directory-source-rights.js';
import { makeClubVerificationPlan } from './club-directory-verification-plan.js';

const STATES = Object.freeze(['ACT','NSW','NT','QLD','SA','TAS','VIC','WA']);
const SPORTS = Object.freeze(['Rugby league','Oztag']);
const classPriority = Object.freeze(new Set([
  'third_party_listing_only','inferred_club_from_2026_competition',
  'historical_location','research_lead'
]));
const safe = value => typeof value==='string'?value.trim():'';
const host = value => {
  const match=safe(value).match(/^https?:\/\/([^/?#]+)/i);
  return match ? match[1].toLowerCase().replace(/^www\./,'') : null;
};

export function buildClubReviewQueue(records,sourceLedger,{state='',sport='',limit=20,asOf='2026-10-26'}={}){
  if(!Array.isArray(records) || !STATES.includes(state)&&state!=='' ||
     !SPORTS.includes(sport)&&sport!=='' || !Number.isInteger(limit) || limit<1 || limit>100)
    throw new Error('Invalid directory, state, sport or bounded result limit');
  const rights=auditSourceRights(records,sourceLedger,{asOf});
  const plan=makeClubVerificationPlan(records,[],{asOf});
  const rightsByHost=new Map(rights.sourceHosts.map(x=>[x.hostname,x]));
  const all=records.map((row,index)=>{
    const h=host(row.sourceUrl);
    const source=rightsByHost.get(h);
    const indirect=classPriority.has(row.sourceClass);
    const compound=/;\s*https?:\/\//i.test(safe(row.sourceUrl));
    const sourceReviewNeeded=!source||source.rights!=='cleared_for_documented_scope';
    const integrityFault=!safe(row.id)||!safe(row.name)||row.status!=='research_candidate'||!h;
    const tier=integrityFault?'integrity_review'
      :indirect||compound?'priority_source_review'
      :'standard_source_review';
    return {
      directoryId:safe(row.id),name:safe(row.name),sport:safe(row.sport),state:safe(row.state),
      sourceHost:h||'invalid',sourceClass:safe(row.sourceClass),
      tier,
      sourceReuse:'unresolved_until_independent_review',
      sourceEvidenceInLedger:source?.rights==='cleared_for_documented_scope'
        ?'syntactic_coverage_only_not_validated_permission'
        :'no_complete_scoped_approval',
      needsSourceTermsReview:sourceReviewNeeded,
      needsAuthoritativeClubProof:true,
      needsIndependentReviewerDecision:true,
      needsIdentityConflictReview:true,
      needsSafeChangePlan:true,
      reviewState:'candidate_unverified',
      mayPublish:false,mayGrantRoles:false,
      reasonCodes:[
        ...(integrityFault?['integrity_exception']:[]),
        ...(compound?['compound_source_url_requires_review']:[]),
        ...(indirect?['indirect_historical_or_inferred_source']:[]),
        'publication_rights_not_independently_cleared',
        'current_affiliation_not_evidenced'
      ],
      originalIndex:index
    };
  });
  const scoped=all.filter(x=>(!state||x.state===state)&&(!sport||x.sport===sport));
  const weight={integrity_review:0,priority_source_review:1,standard_source_review:2};
  scoped.sort((a,b)=>
    weight[a.tier]-weight[b.tier]||
    a.state.localeCompare(b.state)||
    a.sport.localeCompare(b.sport)||
    a.name.localeCompare(b.name)||
    a.directoryId.localeCompare(b.directoryId)||
    a.originalIndex-b.originalIndex
  );
  const items=scoped.slice(0,limit).map(({originalIndex,...row})=>row);
  const perState=plan.coverage.map(x=>({...x,scope:'research_coverage_not_club_count'}));
  return {
    schemaVersion:1,asOf,filters:{state:state||null,sport:sport||null,limit},
    publishedCandidateCount:records.length,matchingCandidates:scoped.length,
    displayedCandidates:items.length,sourceHostCount:rights.sourceHostCount,
    unresolvedSourceHosts:rights.unresolvedHostCount,
    unverifiedRegistrationCount:records.filter(x=>x.status==='research_candidate').length,
    coverage:perState,sourceHostRights:'REQUIRES_EXTERNAL_EVIDENCE',
    priorityCounts:Object.fromEntries(['integrity_review','priority_source_review','standard_source_review'].map(k=>[k,scoped.filter(x=>x.tier===k).length])),
    items,
    status:'HUMAN_VERIFICATION_QUEUE_ONLY_NO_DATA_CHANGES',
    verifiedByThisQueue:0,sourceRightsApprovedByThisQueue:0,
    catalogueMutated:false,canPublish:false,canGrantClubAccess:false,
    reviewerInstructions:[
      'Independently confirm the current legal reuse terms and approval scope for the source host and individual fields.',
      'Compare each research candidate with current official governing-body or club-controlled identity evidence; distinguish club from Oztag venue.',
      'Resolve same-name identity and sport/state collisions without overwriting managed clubs or team links.',
      'Create a separate sanitised, owner-reviewed D3A proposal; this queue cannot apply it or promote registration status.'
    ]
  };
}
