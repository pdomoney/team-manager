// P04B — coach-only People review screen adapter for the existing encrypted
// workspace. Not an identity provider, not a guardian verification service,
// and not a source of access control. The caller must enforce coach-only UI.
import { buildLocalPeopleIndex, proposeLocalPersonLink, reviewLocalPersonLink } from './people-index.js';
import { appendReviewedPersonLink, reverseReviewedPersonLink, normalizePersonReviews } from './people-ledger.js';
import { inspectStaffSourceIds, STAFF_SOURCE_ID } from './staff-source-ids.js';

const txt=x=>typeof x==='string'?x.trim():'';
const allow=new Set(['player','helper','match-official','club-official','team-staff','season-staff']);
// This namespace identifies the caller's trusted data location for record keys;
// it is NOT proof of account ownership or a secure tenant ID.
export const localPeopleNamespace=({owner,repo,trial=false}={})=>{
  const o=txt(owner).toLowerCase(),r=txt(repo).toLowerCase();
  if(!o||!r||!/^[-a-z0-9_.]{1,100}$/.test(o)||!/^[-a-z0-9_.]{1,100}$/.test(r))
    return '';
  return JSON.stringify(['team-manager-local',trial?'trial':'coach',o,r]);
};
const reviewStatus=(record,byRef)=>{
  const entries=record.sourceRefs.map(ref=>byRef.get(ref));
  if(entries.some(x=>!x)) return 'stale-record';
  if(entries.some((x,i)=>x.personKey!==record.priorPersonKeys[i])) return 'changed-identity';
  return record.status;
};
export function localPeopleReviewView(workspace,namespace){
  if(!txt(namespace)) return {error:'Trusted local source namespace required'};
  const index=buildLocalPeopleIndex(workspace,namespace);
  if(index.error) return {error:index.error};
  const byRef=new Map(index.references.map(x=>[x.sourceRef,x]));
  const reviews=normalizePersonReviews(workspace.peopleReviews).filter(x=>x.namespace===namespace)
    .map(x=>({
      id:x.id,status:reviewStatus(x,byRef),
      originalStatus:x.status,
      sources:x.sourceRefs.map(ref=>byRef.get(ref)?{
        sourceRef:ref,kind:byRef.get(ref).kind,displayName:byRef.get(ref).displayName,
        clubId:byRef.get(ref).clubId,role:byRef.get(ref).role
      }:{sourceRef:ref,kind:'missing',displayName:'Record unavailable',clubId:'',role:''}),
      reviewedBy:x.reviewedBy,reviewedAt:x.reviewedAt,
      reversedBy:x.reversedBy||'',reversedAt:x.reversedAt||'',
      canReverse:x.status==='reviewed'
    }));
  const guardianCandidates=index.guardianReviewQueue.filter(x=>x.type==='possible-guardian')
    .map(x=>({
      helper:byRef.get(x.helperRef)?.displayName||'Unknown helper',
      child:byRef.get(x.playerRef)?.displayName||'Unmatched player',
      teamId:x.sourceTeamId,missing:!x.playerRef,
      verified:false,grantsAccess:false
    }));
  const sources=index.references.map(x=>({
    sourceRef:x.sourceRef,kind:x.kind,displayName:x.displayName,
    role:x.role,clubId:x.clubId,
    durable:allow.has(x.kind) && (
      !['club-official','team-staff','season-staff'].includes(x.kind) ||
      STAFF_SOURCE_ID.test(JSON.parse(x.sourceRef).at(-1))),
    personKey:x.personKey
  }));
  return {
    namespace,index,sources,reviews,guardianCandidates,
    sourceCount:sources.length,reviewedCount:reviews.filter(x=>x.status==='reviewed').length,
    staffReadiness:inspectStaffSourceIds(workspace),
    safety:{coachOnly:true,noAccountLogin:true,hasLegalGuardianVerification:false,
      grantsPermissions:false,joinsNamesAutomatically:false}
  };
}
export function acceptLocalPeopleLink(workspace,namespace,{firstRef,secondRef,reviewedBy,reviewedAt}={}){
  if(!txt(reviewedBy)||!txt(reviewedAt)) return {error:'Reviewer and review time required'};
  const view=localPeopleReviewView(workspace,namespace);
  if(view.error)return {error:view.error};
  const a=view.sources.find(x=>x.sourceRef===firstRef),b=view.sources.find(x=>x.sourceRef===secondRef);
  if(!a||!b||!a.durable||!b.durable||a.sourceRef===b.sourceRef)
    return {error:'Choose two distinct person records with prepared stable IDs'};
  const proposal=proposeLocalPersonLink(view.index,{
    firstRef,secondRef,proposedBy:reviewedBy,
    reason:'Explicit coach review from the People page'
  });
  if(proposal.error)return proposal;
  const confirmed=reviewLocalPersonLink(view.index,proposal,{reviewedBy,confirmed:true});
  if(confirmed.error)return confirmed;
  const out=appendReviewedPersonLink(workspace,view.index,confirmed,{reviewedAt});
  return out.error?out:{...out,advisoryOnly:true};
}
export function undoLocalPeopleLink(workspace,namespace,{recordId,reversedBy,reversedAt}={}){
  const view=localPeopleReviewView(workspace,namespace);
  if(view.error)return {error:view.error};
  const record=normalizePersonReviews(workspace.peopleReviews).find(r=>r.id===recordId && r.namespace===namespace);
  if(!record)return {error:'Review does not belong to this coach workspace'};
  const result=reverseReviewedPersonLink(workspace,record.id,{reversedBy,reversedAt});
  return result.error?result:{...result,advisoryOnly:true};
}
