// Post-P10 directory D1 — read-only inventory of already-published research candidates.
// No external fetch, user workspace, personal records, writes, or licence approvals.
const countBy=(items,key)=>Object.fromEntries([...items.reduce((m,x)=>m.set(key(x),(m.get(key(x))||0)+1),new Map())].sort(([a],[b])=>String(a).localeCompare(String(b))));
const clean=x=>String(x??'').trim();
const key=x=>clean(x).toLocaleLowerCase('en-AU').replace(/\s+/g,' ');
const STATES=['ACT','NSW','NT','QLD','SA','TAS','VIC','WA'];
const REQUIRED=['id','name','sport','state','sourceUrl','sourceClass','reviewed','status'];
const FIELDS=['region','association','suburb','postcode','website','email','phone','registration','colours'];
const isoDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(clean(s))&&!Number.isNaN(Date.parse(s+'T00:00:00Z'));
const webUrl=x=>{try{const u=new URL(clean(x));return ['http:','https:'].includes(u.protocol)&&!!u.hostname;}catch{return false;}};
export function auditClubDirectory(records,{referenceDate='2026-10-26',staleDays=180}={}) {
  if(!Array.isArray(records)||!isoDate(referenceDate)||!Number.isInteger(staleDays)||staleDays<1)
    throw new Error('Valid catalogue, referenceDate and staleDays are required');
  const items=records.map(x=>(x&&typeof x==='object'&&!Array.isArray(x))?x:{});
  const ids=new Map(),identities=new Map(),crossState=new Map();
  const warnings=[];
  const add=(code,recordIndex)=>warnings.push({code,index:recordIndex}); // never print names/contact details
  let badDates=0,stale=0,badUrls=0,nonCandidate=0,unknownRights=0;
  const cutoff=Date.parse(referenceDate+'T00:00:00Z');
  for(const [i,x] of items.entries()){
    for(const field of REQUIRED)if(!clean(x[field]))add('required_'+field+'_missing',i);
    const id=clean(x.id);
    if(id){if(ids.has(id))add('duplicate_directory_id',i);else ids.set(id,i);}
    const identity=[key(x.sport),key(x.state),key(x.name)].join('|');
    if(clean(x.name)&&clean(x.state)&&clean(x.sport)){
      if(identities.has(identity))add('potential_same_state_name_collision',i);
      else identities.set(identity,i);
      const across=[key(x.sport),key(x.name)].join('|');
      if(!crossState.has(across))crossState.set(across,new Set());
      crossState.get(across).add(clean(x.state));
    }
    if(!STATES.includes(clean(x.state)))add('invalid_state',i);
    if(!webUrl(x.sourceUrl)){badUrls++;add('invalid_source_url',i);}
    if(!isoDate(x.reviewed)){badDates++;add('invalid_review_date',i);}
    else{
      const d=Date.parse(x.reviewed+'T00:00:00Z');
      if(d>cutoff)add('future_review_date',i);
      if((cutoff-d)/86400000>staleDays)stale++;
    }
    if(x.status!=='research_candidate'){nonCandidate++;add('unreviewed_status_claim',i);}
    // The dataset has no complete legally-reviewed rights record. Never infer consent from a URL.
    if(x.reusePermission!=='approved'||!clean(x.permissionEvidenceRef)){
      unknownRights++;
    }
  }
  const bySport=countBy(items,x=>clean(x.sport)||'UNKNOWN');
  const byState=countBy(items,x=>clean(x.state)||'UNKNOWN');
  const bySportState=countBy(items,x=>[clean(x.sport)||'UNKNOWN',clean(x.state)||'UNKNOWN'].join(' | '));
  const bySourceClass=countBy(items,x=>clean(x.sourceClass)||'UNKNOWN');
  const byStatus=countBy(items,x=>clean(x.status)||'UNKNOWN');
  const missingFields=Object.fromEntries(FIELDS.map(f=>[f,items.filter(x=>!clean(x[f])).length]));
  const crossStateNameGroups=[...crossState.values()].filter(states=>states.size>1).length;
  const technicalIssues=warnings.length;
  return {
    schemaVersion:1,asOf:referenceDate,recordCount:items.length,
    bySport,byState,bySportState,bySourceClass,byStatus,
    missingFields,
    validation:{technicalIssues,badSourceUrls:badUrls,invalidReviewDates:badDates,
      staleReviewCount:stale,reviewStaleDays:staleDays,
      unreviewedStatusClaims:nonCandidate,crossStateNameGroups},
    rights:{recordCountWithoutExplicitApprovedEvidence:unknownRights,
      status:unknownRights?'NOT_CLEARED':'EVIDENCE_SUBMITTED_REQUIRES_HUMAN_REVIEW'},
    knownCoverageGaps:[
      {sport:'Rugby league',state:'TAS',type:'no_research_candidates_not_zero_real_clubs'},
      {sport:'Rugby league',state:'QLD',type:'limited_pilot_coverage_not_governing_body_total'}
    ],
    releaseGate:'BLOCKED_UNTIL_SOURCE_RIGHTS_AND_REGISTRATION_EVIDENCE_REVIEW',
    technicalInventory:technicalIssues===0?'PASS':'REVIEW_REQUIRED',
    warnings // intentionally index and code only; no contact info, user names, URLs or archive content
  };
}
