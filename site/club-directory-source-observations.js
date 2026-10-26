// D3D: deterministic read-only examination of official public source observations.
// No website crawling, source-rights clearance, current registration certification,
// club identity merge, workspace access, or catalogue publication.
const clean=x=>typeof x==='string'?x.trim():'';
const validDate=x=>{
  if(!/^\d{4}-\d\d-\d\d$/.test(clean(x)))return false;
  const d=new Date(x+'T00:00:00Z');
  return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===x;
};
const validOfficialSource=x=>{
  try{
    const u=new URL(clean(x));
    return u.protocol==='https:' && !u.username && !u.password &&
      u.hostname==='www.playrugbyleague.com' &&
      u.pathname.startsWith('/Competitions/Club/') &&
      !u.hash && !u.search;
  }catch{return false;}
};
const exactId=x=>/^[a-z0-9][a-z0-9_-]{1,79}$/i.test(clean(x));
const ALLOWED=new Set(['directoryId','candidateSport','candidateState','sourceKind',
  'observedName','sourceUrl','observedAt','identityScopeHint','reviewStatus']);
const HINTS=new Set(['seniors_named_separately_from_juniors','scope_requires_manual_resolution']);
export function auditDirectorySourceObservations(records,ledger,{
  directoryId='',asOf='2026-10-26'
}={}){
  if(!Array.isArray(records)||!ledger||ledger.schemaVersion!==1||
     !Array.isArray(ledger.observations)||!validDate(asOf)||
     (directoryId!==''&&!exactId(directoryId)))
    throw Error('Invalid public catalogue, observations or exact ID');
  const recordMap=new Map();
  for(const r of records){
    if(!exactId(r?.id)||recordMap.has(r.id))throw Error('Unsafe or duplicate existing directory ID');
    recordMap.set(r.id,r);
  }
  const seen=new Set(),items=[];
  for(const o of ledger.observations){
    if(!o||typeof o!=='object'||Array.isArray(o)||
       Object.keys(o).some(k=>!ALLOWED.has(k))||
       !exactId(o.directoryId)||seen.has(o.directoryId))
      throw Error('Malformed, duplicate or unexpected observation');
    seen.add(o.directoryId);
    const r=recordMap.get(o.directoryId);
    if(!r||r.status!=='research_candidate'||
       clean(r.sport)!==o.candidateSport||clean(r.state)!==o.candidateState||
       o.sourceKind!=='governing_body_club_directory'||
       !validOfficialSource(o.sourceUrl)||!clean(o.observedName)||
       clean(o.observedName).length>160||
       !validDate(o.observedAt)||o.observedAt>asOf||
       !HINTS.has(o.identityScopeHint)||
       o.reviewStatus!=='unreviewed_observation')
      throw Error('Unverified, conflicting or unsafe observation metadata');
    // Source name can differ from a research name: variant, NOT a rename instruction.
    const nameVariant=clean(r.name).toLocaleLowerCase('en-AU')!==
      clean(o.observedName).toLocaleLowerCase('en-AU');
    if(!directoryId||directoryId===o.directoryId){
      items.push({
        directoryId:o.directoryId,candidateName:r.name,
        candidateSport:r.sport,candidateState:r.state,
        observedName:o.observedName,observedAt:o.observedAt,
        officialSourceUrl:o.sourceUrl,sourceKind:o.sourceKind,
        identityScopeHint:o.identityScopeHint,
        nameAssessment:nameVariant?'source_name_variant_manual_reconciliation':
          'name_matches_but_identity_still_unverified',
        requiresIndependentIdentityReview:true,
        requiresSourceRightsReview:true,
        sourceReuse:'not_approved_by_observation',
        registration:'not_independently_verified',
        mayUpdateCatalogue:false,mayGrantClubAccess:false,
        reviewState:'observation_only_not_verified'
      });
    }
  }
  if(directoryId && items.length!==1)throw Error('Exact public candidate has no recorded observation');
  return {
    schemaVersion:1,asOf,observationCount:ledger.observations.length,
    returnedCount:items.length,items,scope:'offline_public_source_observations',
    sourceRightsApproved:0,registrationsVerified:0,
    catalogueChanged:false,coachWorkspaceChanged:false,
    mayPublish:false,mayGrantRoles:false,
    status:'EVIDENCE_LEADS_ONLY_REQUIRES_HUMAN_REVIEW'
  };
}
