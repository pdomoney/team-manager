// Source-governance D2. Offline, deterministic, no fetch, storage, account/data import or automatic licensing.
// A public source URL is NEVER a licence, club registration proof, or account permission.
const clean=x=>typeof x==='string'?x.trim():'';
const sourceHost=x=>{
  try {
    const u=new URL(clean(x));
    if(!['https:','http:'].includes(u.protocol))return null;
    return u.hostname.toLowerCase().replace(/^www\./,'');
  }catch{return null;}
};
const validDate=x=>/^20\d{2}-\d\d-\d\d$/.test(clean(x))&&!Number.isNaN(Date.parse(x+'T00:00:00Z'));
const safeWeb=x=>!!sourceHost(x);
const sort=s=>[...s].sort((a,b)=>a.localeCompare(b));
const canonicalFields = new Set([
 'id','name','sport','state','region','association','suburb','postcode','ground',
 'website','email','phone','registration','sourceUrl','sourceClass','status','colours',
 'brandSource','reviewed','founded','variants','venues','registrationLinks'
]);
const granted=(entry,classes,fields,asOf)=>{
  if(entry.permissionDecision!=='approved')return false;
  if(!clean(entry.reviewedBy)||!clean(entry.licenceOrConsentRef)||!validDate(entry.decisionDate))return false;
  if(entry.decisionDate>asOf||!safeWeb(entry.termsUrl))return false;
  if(entry.expiresAt && (!validDate(entry.expiresAt)||entry.expiresAt<asOf))return false;
  if(entry.intendedUse!=='public_read_only_directory')return false;
  if(!Array.isArray(entry.permittedSourceClasses)||!Array.isArray(entry.permittedFields))return false;
  return classes.every(s=>entry.permittedSourceClasses.includes(s)) &&
    fields.every(s=>entry.permittedFields.includes(s));
};
export function auditSourceRights(records,ledger,{asOf='2026-10-26',staleDays=180}={}) {
  if(!Array.isArray(records)||!ledger||ledger.schemaVersion!==1||!Array.isArray(ledger.sources)||!validDate(asOf))
    throw new Error('Invalid D2 catalogue, rights ledger or reference date');
  if(!Number.isInteger(staleDays)||staleDays<1)throw new Error('Invalid staleDays');
  const registry=new Map(),warnings=[];
  for(const s of ledger.sources){
    const host=clean(s.hostname).toLowerCase();
    if(!host||host.includes('/')||host.includes(':')||registry.has(host)){
      warnings.push({code:'invalid_or_duplicate_rights_host',hostname:host});
      continue;
    }
    registry.set(host,s);
  }
  const groups=new Map();
  let invalid=0,compound=0,stale=0,future=0,raw=0;
  const cutoff=Date.parse(asOf+'T00:00:00Z');
  for(const [index,r] of records.entries()){
    const u=clean(r?.sourceUrl),host=sourceHost(u);
    if(!host){invalid++;warnings.push({code:'invalid_source_url',index});continue;}
    const g=groups.get(host)||{hostname:host,recordCount:0,sourceClasses:new Set(),sports:new Set(),usedFields:new Set(),staleCount:0,compoundCount:0};
    g.recordCount++;
    if(clean(r.sourceClass))g.sourceClasses.add(r.sourceClass);
    if(clean(r.sport))g.sports.add(r.sport);
    for(const [field,val] of Object.entries(r)){
      if(val!==null&&val!==undefined&&val!==''&&(!Array.isArray(val)||val.length))g.usedFields.add(field);
    }
    if(/;\s*https?:\/\//i.test(u)){compound++;g.compoundCount++;warnings.push({code:'multiple_source_urls_in_one_field',index});}
    if(!validDate(r.reviewed)){warnings.push({code:'invalid_record_review_date',index});}
    else{
      const age=(cutoff-Date.parse(r.reviewed+'T00:00:00Z'))/86400000;
      if(age>staleDays){stale++;g.staleCount++;}
      if(age<0){future++;warnings.push({code:'future_record_review_date',index});}
    }
    raw++;
    groups.set(host,g);
  }
  const providers=sort(groups.keys()).map(host=>{
    const g=groups.get(host),entry=registry.get(host);
    const classes=sort(g.sourceClasses),fields=sort(g.usedFields),sports=sort(g.sports);
    const cleared=entry?granted(entry,classes,fields,asOf):false;
    const reason= !entry?'missing_terms_ledger_entry'
      :entry.permissionDecision==='approved'&&!cleared?'approval_claim_missing_scope_or_evidence'
      :entry.permissionDecision==='approved'?'approved_for_documented_scope'
      :'no_documented_public_reuse_approval';
    return {hostname:host,records:g.recordCount,sports,sourceClasses:classes,
      sourceFieldNames:fields,stale:g.staleCount,compoundSourceFields:g.compoundCount,
      termsLocated:!!entry?.termsUrl,status:entry?.status||'unreviewed',
      rights:'cleared_for_documented_scope'===('cleared_for_documented_scope')&&cleared?'cleared_for_documented_scope':'unresolved',
      reason,priority:!cleared&&(classes.some(c=>/third_party|inferred|historical|research_lead/.test(c))||g.compoundCount)?'high':'review',
      termsUrl:entry?.termsUrl||null};
  });
  const extraHosts=sort([...registry.keys()].filter(k=>!groups.has(k)));
  for(const h of extraHosts)warnings.push({code:'unused_rights_host',hostname:h});
  const unresolved=providers.filter(p=>p.rights!=='cleared_for_documented_scope');
  return {schemaVersion:1,asOf,totalPublicResearchRecords:records.length,
    sourceHostCount:providers.length,unresolvedHostCount:unresolved.length,
    unresolvedRecordCount:unresolved.reduce((n,p)=>n+p.records,0),
    compoundSourceFields:compound,invalidSourceUrls:invalid,
    staleReviewCount:stale,futureReviewCount:future,
    staticLedgerSourceCount:registry.size,
    sourceHosts:providers,
    warnings,
    releaseStatus:unresolved.length||warnings.some(w=>w.code==='invalid_or_duplicate_rights_host')
      ?'BLOCKED_RIGHTS_AND_VERIFICATION_REVIEW':'TECHNICAL_EVIDENCE_PRESENT_HUMAN_SIGNOFF_REQUIRED',
    note:'Technical status does not authorise publication, confirm registration, or grant owner/club permissions. No source data or coach records modified.'
  };
}
