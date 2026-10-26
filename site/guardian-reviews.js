// P04D — coach-only *reported* guardian/carer relationship review history.
// Never legal authority, verified parentage, individual account, role grant,
// child access or cross-tenant permission. One encrypted coach workspace only.
//
// Source records are not changed. An immutable revision chain captures corrections
// and a final reversal so multi-device edits are surfaced by existing merge3().
const str=x=>typeof x==='string'?x.trim():'';
const arr=x=>Array.isArray(x)?x:[];
const canon=(...x)=>JSON.stringify(x);
const iso=x=>typeof x==='string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(x) && Number.isFinite(Date.parse(x));
export const REPORTED_RELATIONSHIPS=Object.freeze({
  'parent-reported':'Parent (reported, not verified)',
  'relative-reported':'Relative (reported, not verified)',
  'carer-reported':'Other carer (reported, not verified)',
  unspecified:'Relationship not confirmed'
});
const relation=x=>Object.prototype.hasOwnProperty.call(REPORTED_RELATIONSHIPS,x);
const isRef=(value,namespace,kind)=>{
  if(typeof value!=='string'||value.length>4096)return false;
  try{
    const v=JSON.parse(value);
    return arr(v).length===4 && v[0]===namespace && v[1]===kind &&
      str(v[2]) && str(v[3]) && v[2].length<=100 && v[3].length<=256;
  }catch{return false;}
};
const idFor=(ns,helperRef,childRef)=>canon('local-guardian-review',ns,helperRef,childRef);
// Recheck the *live* encrypted workspace, not just the adviser index passed by
// a form. Another edit may remove an ID or change an explicit player personId
// between display and saving. All source IDs remain scoped to one team.
const livePersonKey=(ws,ref,namespace)=>{
  try{
    const [ns,kind,teamId,rowId]=JSON.parse(ref);
    if(ns!==namespace||!['helper','player'].includes(kind))return null;
    const teams=[ws,...arr(ws.teams)].filter(t=>t?.id===teamId);
    if(teams.length!==1)return null;
    const people=arr(teams[0][kind==='helper'?'helpers':'players']).filter(x=>x?.id===rowId);
    if(people.length!==1)return null;
    const person=people[0];
    return kind==='player'&&str(person.personId)
      ? canon(namespace,'existing-explicit-player-personId',person.personId)
      : canon(namespace,'provisional-person',kind,teamId,rowId);
  }catch{return null;}
};

const validEvent=(e,i,total,previous)=>{
  if(!e||typeof e!=='object'||Array.isArray(e)||!['record','correct','reverse'].includes(e.action)||
     !str(e.by)||e.by.length>120||!iso(e.at))return false;
  if(i===0 && e.action!=='record')return false;
  if(i>0 && e.action==='record')return false;
  if(i>0 && Date.parse(e.at)<=Date.parse(previous.at))return false;
  if(e.action==='reverse')
    return i===total-1 && e.relationship===undefined;
  return relation(e.relationship);
};
const sanitizeRecord=x=>{
  if(!x||typeof x!=='object'||Array.isArray(x))return null;
  const namespace=str(x.namespace),helperRef=x.helperRef,childPlayerRef=x.childPlayerRef;
  if(!namespace||namespace.length>160||
     !isRef(helperRef,namespace,'helper')||!isRef(childPlayerRef,namespace,'player')||
     x.id!==idFor(namespace,helperRef,childPlayerRef)||
     !Array.isArray(x.priorPersonKeys)||x.priorPersonKeys.length!==2||
     x.priorPersonKeys.some(k=>!str(k)||k.length>4096)||
     !Array.isArray(x.events)||!x.events.length||x.events.length>200)return null;
  for(let i=0;i<x.events.length;i++)
    if(!validEvent(x.events[i],i,x.events.length,x.events[i-1]))return null;
  const events=x.events.map(e=>({
    action:e.action,by:str(e.by),at:e.at,
    ...(e.action!=='reverse'?{relationship:e.relationship}:{})
  }));
  return {id:x.id,namespace,helperRef,childPlayerRef,
    priorPersonKeys:x.priorPersonKeys.slice(),events};
};
export function normalizeGuardianReviews(input){
  const output=[],seen=new Set();
  for(const row of arr(input)){
    const r=sanitizeRecord(row);
    if(!r||seen.has(r.id))continue;
    seen.add(r.id);output.push(r);
  }
  return output.sort((a,b)=>a.id.localeCompare(b.id));
}
const last=r=>r.events[r.events.length-1];
const viewStatus=(r,index)=>{
  const helper=index.references.find(x=>x.sourceRef===r.helperRef);
  const child=index.references.find(x=>x.sourceRef===r.childPlayerRef);
  if(!helper||!child)return 'missing-source';
  if(helper.personKey!==r.priorPersonKeys[0]||child.personKey!==r.priorPersonKeys[1])
    return 'changed-source';
  return last(r).action==='reverse'?'reversed':'recorded';
};
const copy=(ws,list)=>({...ws,guardianReviews:normalizeGuardianReviews(list)});
export function guardianReviewView(workspace,index){
  if(!index?.namespace||!workspace)return {error:'Unlocked coach workspace and current source index required'};
  const namespace=index.namespace;
  const reviews=normalizeGuardianReviews(workspace.guardianReviews)
    .filter(r=>r.namespace===namespace).map(r=>{
      const helper=index.references.find(x=>x.sourceRef===r.helperRef);
      const child=index.references.find(x=>x.sourceRef===r.childPlayerRef);
      const current=last(r);
      return {
        id:r.id,helperRef:r.helperRef,childPlayerRef:r.childPlayerRef,
        helperName:helper?.displayName||'Source unavailable',
        childName:child?.displayName||'Source unavailable',
        helperTeamId:JSON.parse(r.helperRef)[2],childTeamId:JSON.parse(r.childPlayerRef)[2],
        status:viewStatus(r,index),relationship:
          current.action==='reverse'?r.events.slice().reverse().find(x=>x.action!=='reverse')?.relationship:current.relationship,
        history:r.events.map(e=>({action:e.action,by:e.by,at:e.at,
          ...(e.relationship?{relationship:e.relationship}:{})})),
        canCorrect:viewStatus(r,index)==='recorded',
        canReverse:last(r).action!=='reverse'
      };
    });
  return {reviews,recorded:reviews.filter(r=>r.status==='recorded').length,
    safety:{authorityVerified:false,accountsGranted:false,guardianPermissions:[],
      legalParentageProven:false,coachOnly:true}};
}
export function recordGuardianReview(workspace,index,{helperRef,childPlayerRef,relationship,by,at}={}){
  if(!index?.namespace||!relation(relationship)||!str(by)||!iso(at))
    return {error:'Relationship selection, coach reviewer and timestamp required'};
  if(!isRef(helperRef,index.namespace,'helper')||!isRef(childPlayerRef,index.namespace,'player'))
    return {error:'Choose a stable helper and child player record in this workspace'};
  const g=index.references.find(x=>x.sourceRef===helperRef),
        c=index.references.find(x=>x.sourceRef===childPlayerRef);
  if(!g||g.kind!=='helper'||!c||c.kind!=='player'||
     livePersonKey(workspace,helperRef,index.namespace)!==g.personKey||
     livePersonKey(workspace,childPlayerRef,index.namespace)!==c.personKey)
    return {error:'Live helper or child record changed since review; reload and confirm'};
  const ledger=normalizeGuardianReviews(workspace?.guardianReviews);
  const id=idFor(index.namespace,helperRef,childPlayerRef);
  if(ledger.some(x=>x.id===id))return {error:'This relationship has existing review history; correct or reverse it instead'};
  const entry=sanitizeRecord({id,namespace:index.namespace,helperRef,childPlayerRef,
    priorPersonKeys:[g.personKey,c.personKey],
    events:[{action:'record',relationship,by,at}]});
  if(!entry)return {error:'Invalid local relationship review'};
  return {workspace:copy(workspace,[...ledger,entry]),record:entry,
    grantsAccess:false,verifiedAuthority:false,changedSourceRecords:false};
}
export function amendGuardianReview(workspace,index,{recordId,relationship,by,at,action}={}){
  if(!index?.namespace||!str(by)||!iso(at)||!['correct','reverse'].includes(action))
    return {error:'A recorded review, action, coach reviewer and time are required'};
  const ledger=normalizeGuardianReviews(workspace?.guardianReviews);
  const original=ledger.find(x=>x.id===recordId && x.namespace===index.namespace);
  if(!original)return {error:'Relationship review not found in this workspace'};
  if(last(original).action==='reverse')return {error:'Reversed relationship history cannot be silently reactivated'};
  if(action==='correct'){
    if(!relation(relationship))return {error:'Choose a supported reported relationship category'};
    if(viewStatus(original,index)!=='recorded'||
       livePersonKey(workspace,original.helperRef,index.namespace)!==original.priorPersonKeys[0]||
       livePersonKey(workspace,original.childPlayerRef,index.namespace)!==original.priorPersonKeys[1])
      return {error:'Relationship sources have changed; do not correct a stale link'};
    if(last(original).relationship===relationship)return {error:'No relationship correction needed'};
  }
  const next=sanitizeRecord({...original,events:[...original.events,
    {action,by,at,...(action==='correct'?{relationship}:{})}]});
  if(!next)return {error:'Invalid review timeline; use a later timestamp'};
  return {workspace:copy(workspace,ledger.map(x=>x.id===recordId?next:x)),record:next,
    grantsAccess:false,verifiedAuthority:false,changedSourceRecords:false};
}
