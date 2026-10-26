// D3E: bounded offline batch preparation, never verification, licence clearance or publication.
// One malformed/duplicated exact ID fails the entire batch, without partial acceptance.
import {prepareDirectoryReviewPacket} from './club-directory-review-packet.js';
const validId=id=>typeof id==='string'&&/^[a-z0-9][a-z0-9_-]{1,79}$/i.test(id);
const validDate=date=>typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&
  !Number.isNaN(Date.parse(date+'T00:00:00Z'))&&
  new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date;
const freeze=Object.freeze;
export function prepareDirectoryBatchReview(records,ledger,{ids,asOf='2026-10-26'}={}){
  if(!Array.isArray(records)||!Array.isArray(ids)||ids.length<1||ids.length>30||
      !validDate(asOf)||ids.some(id=>!validId(id))||new Set(ids).size!==ids.length)
    throw Error('Supply one to thirty unique exact public research IDs and a real review date');
  const sourceRecords=records.map(x=>x);
  const packets=ids.map(directoryId=>prepareDirectoryReviewPacket(
    sourceRecords,ledger,{directoryId,asOf}));
  const groups=new Map();
  for(const p of packets){
    const key=p.candidate.state+' / '+p.candidate.sport;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(p.candidate.directoryId);
  }
  const decisionTemplate=packets.map(p=>freeze({
    directoryId:p.candidate.directoryId,
    sourceRightsReviewer:'',sourceTermsUrl:'',termsCheckedAt:'',reuseDecisionRef:'',
    permittedFields:freeze([]),attribution:'',withdrawalProcess:'',
    identityReviewer:'',officialRegistrationRef:'',identityScopeDecision:'',
    ownerApprovalRef:'',decision:'pending_independent_review'
  }));
  return freeze({
    schemaVersion:1,asOf,requested:ids.length,returned:packets.length,
    packets:freeze(packets),groups:freeze([...groups].map(([label,recordIds])=>
      freeze({label,recordIds:freeze([...recordIds])}))),
    decisionTemplate:freeze(decisionTemplate),
    sourceRightsApproved:0,verifiedRegistrations:0,publicationEligible:false,
    canUpdateCatalogue:false,canGrantRoles:false,changedCatalogue:false,
    changedCoachWorkspace:false,stage:'human_evidence_collection_only',
    status:'BLOCKED_PENDING_INDEPENDENT_DECISIONS'
  });
}
// Human decision inputs are analysed, never treated as a permission to publish.
// This review report cannot mutate catalogue files or return publishEligible=true.
export function inspectDirectoryBatchDecisions(batch,submitted=[]){
  if(!batch||batch.schemaVersion!==1||!Array.isArray(batch.packets)||
      !Array.isArray(submitted))throw Error('Invalid review batch');
  const known=new Set(batch.packets.map(p=>p.candidate.directoryId));
  const seen=new Set();
  for(const item of submitted){
    if(!item||typeof item!=='object'||Array.isArray(item)||!known.has(item.directoryId)||
       seen.has(item.directoryId))throw Error('Unrelated or duplicate review evidence');
    seen.add(item.directoryId);
  }
  const rows=batch.decisionTemplate.map(template=>{
    const actual=submitted.find(s=>s.directoryId===template.directoryId)||{};
    const fields=['sourceRightsReviewer','sourceTermsUrl','termsCheckedAt',
      'reuseDecisionRef','attribution','withdrawalProcess','identityReviewer',
      'officialRegistrationRef','identityScopeDecision','ownerApprovalRef'];
    const missing=fields.filter(key=>typeof actual[key]!=='string'||!actual[key].trim());
    if(!Array.isArray(actual.permittedFields)||!actual.permittedFields.length)
      missing.push('permittedFields');
    const unsafe=Object.keys(actual).filter(k=>!Object.keys(template).includes(k));
    return freeze({directoryId:template.directoryId,missing:freeze(missing),
      unexpectedFields:freeze(unsafe),humanReviewNeeded:true,
      decision: 'manual_verification_required',
      canPublish:false,canGrantRoles:false});
  });
  return freeze({rows:freeze(rows),reviewed:0,verified:0,canPublish:false,
    changedCatalogue:false,changedCoachWorkspace:false,
    status:'REVIEW_ONLY_NOT_AN_APPROVAL'});
}
