// P11F draft-only rules evidence worksheet. Explicit clipboard output only;
// no approval, scorekeeping, competition writes or encrypted workspace changes.
const FIELDS=Object.freeze([
  Object.freeze({id:'sourceUrl',label:'Organiser or governing-body source URL',max:700}),
  Object.freeze({id:'edition',label:'Rulebook edition / issue',max:160}),
  Object.freeze({id:'effectiveDate',label:'Rule effective date (YYYY-MM-DD)',max:10}),
  Object.freeze({id:'scoring',label:'Competition scoring events and points',max:1400}),
  Object.freeze({id:'lineups',label:'On-field roles, bench and substitutions',max:1400}),
  Object.freeze({id:'periods',label:'Playing periods, clock and forfeits',max:1400}),
  Object.freeze({id:'bylaws',label:'Local competition exceptions and by-laws',max:1400}),
  Object.freeze({id:'organiserDecision',label:'Organiser response or decision reference',max:700})
]);
export const RULES_EVIDENCE_FIELDS=FIELDS;
const clean=(v,max)=>typeof v==='string'
  ?v.replace(/\u0000/g,'').replace(/[\u0001-\u001f\u007f]/g,' ').trim().slice(0,max)
  :'';
const line=(v,max)=>clean(v,max).replace(/\s+/g,' ');
const dateOK=v=> {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
  const d=new Date(v+'T12:00:00Z');
  return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v;
};
const publicUrlOK=v=>{
  if(!v)return true;
  try{
    const u=new URL(v);
    return u.protocol==='https:'&&!!u.hostname.includes('.')&&
      !u.username&&!u.password&&
      !/(^|\.)localhost$/.test(u.hostname)&&
      !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(u.hostname)&&
      !u.hostname.includes(':');
  }catch{return false;}
};
// Quote free-text answers so user-entered STATUS / APPROVED lines cannot be
// confused with the worksheet's fixed approval status.
export function draftMatchRulesEvidence(checklist,answers={}){
  if(!checklist||!checklist.scope||!Array.isArray(checklist.blockers)||
      checklist.ownerApproved!==false||checklist.readyForScorekeeping!==false)
    throw new TypeError('A draft-only scoped rules checklist is required');
  const input=answers&&typeof answers==='object'&&!Array.isArray(answers)?answers:{};
  const data=Object.freeze(Object.fromEntries(FIELDS.map(f=>[f.id,clean(input[f.id],f.max)])));
  const errors=[];
  if(data.sourceUrl&&!publicUrlOK(data.sourceUrl))
    errors.push('Source URL must be a public HTTPS website link with no embedded login.');
  if(data.effectiveDate&&!dateOK(data.effectiveDate))
    errors.push('Effective date must be a real date formatted YYYY-MM-DD.');
  const missing=FIELDS.filter(f=>!data[f.id]).map(f=>f.label);
  const lines=[
    'TEAM MANAGER — DRAFT COMPETITION RULES EVIDENCE (NOT APPROVED)',
    'STATE: Draft only. Human verification and product-owner sign-off outstanding.',
    '',
    'FIXTURE SCOPE (not an identity or membership certification):',
    ...['sport','competition','season','ageGroup','category','ruleSet','reference','fixtureAssociation']
      .map(k=>k+': '+line(checklist.scope[k],160)),
    'Bundled reference URL: '+line(checklist.scope.sourceUrl,700),
    '',
    'OPEN FIXTURE-SCOPE QUESTIONS:',
    ...(checklist.blockers.length?checklist.blockers.map((b,i)=>(i+1)+'. '+line(b,220)):
      ['No recorded scope conflicts; competition rules still not certified.']),
    '',
    'UNVERIFIED ANSWERS / EVIDENCE (copied text, not an official attestation):',
    ...FIELDS.flatMap(f=>[
      f.label+':',
      '  | '+(data[f.id]?line(data[f.id],f.max):'[NOT SUPPLIED]')
    ]),
    '',
    'REQUIRED INDEPENDENT REVIEW:',
    'Verify the official document and its effective date, the exact competition, season, age group and category.',
    'Confirm scoring, lineup, bench, interchange, timing and exceptions with the responsible organiser.',
    'Obtain and record owner acceptance as a separate explicit action before any persistent match-scoring design.',
    'No approvals or programme rules are updated by copying this draft.',
    'STATE: DRAFT ONLY — NOT APPROVED; NO SCOREKEEPING AUTHORISED.'
  ];
  return Object.freeze({
    status:'DRAFT_UNVERIFIED',valid:errors.length===0,
    errors:Object.freeze(errors),
    missing:Object.freeze(missing),
    fields:data,copyText:lines.join('\n'),
    saved:false,sent:false,ownerApproved:false,organiserVerified:false,
    mayEnableScoring:false,changedWorkspace:false
  });
}
