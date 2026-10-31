// P12E: IN-MEMORY fictional role governance simulator. Not authentication.
// Approvals never modify p12QaView role fixtures, real people, contacts, coach
// workspaces, encrypted data, server grants, registrations or child records.
import {P12_ACCESS_ROLES,evaluateP12Access} from './p12-role-groups.js';

export const P12_GOVERNANCE_CLOCK='2026-10-31T00:00:00Z';
// Explicit, bounded administrative APPROVAL relationships only. These do not
// convey data access, club/team membership or resource permission inheritance.
const TEAM_CLUB=Object.freeze({
  'qa-rangers-16':'qa-rangers',
  'qa-stars-women':'qa-stars',
  'qa-comets-mixed':'qa-comets',
  'qa-comets-juniors':'qa-comets'
});
const FIXTURE_CLUB=Object.freeze({'qa-fixture-001':'qa-rangers'});
const GROUP_NAME=Object.freeze({
  'qa-rangers-16':'Example Rangers U16','qa-stars-women':'Example Stars Women',
  'qa-comets-mixed':'Example Comets Mixed','qa-comets-juniors':'Example Comets U14',
  'qa-rangers':'Example Rangers Club','qa-stars':'Example Stars Club',
  'qa-comets':'Example Comets Club','qa-east':'Sample Harbour Sporting Association',
  'qa-west':'Sample Valley Sporting Association','qa-fixture-001':'Example Fixture 001',
  'qa-platform':'Synthetic platform'
});
const request=(id,profileId,role,type,groupId,status='proposed',until=null)=>({
  id,profileId,accountId:'fictional-account-'+profileId,
  role,group:{type,id:groupId},groupLabel:GROUP_NAME[groupId],
  status,validFrom:null,expiresAt:until,approvedBy:status==='active'?'fictional-seed-admin':null,
  nominatedBy:'fictional-nominator',reason:'Synthetic review case '+id
});
const SEED=Object.freeze([
  request('gov-01','qa-07','team_assistant','team','qa-rangers-16'),
  request('gov-02','qa-18','team_coach','team','qa-rangers-16'),
  request('gov-03','qa-17','club_support','club','qa-comets'),
  request('gov-04','qa-20','team_manager','team','qa-comets-mixed'),
  request('gov-05','qa-06','club_admin','club','qa-stars'),
  request('gov-06','qa-12','fixture_staff_viewer','fixture','qa-fixture-001'),
  request('gov-07','qa-19','team_coach','team','qa-rangers-16','active','2026-10-20T00:00:00Z'),
  request('gov-08','qa-03','association_viewer','association','qa-west','revoked'),
  request('gov-09','qa-03','association_viewer','association','qa-east')
]);
const scopeEqual=(a,b)=>a?.type===b?.type&&a?.id===b?.id;
const reviewer=(view,requestItem)=>{
  if(view?.mode!=='SYNTHETIC_ONLY_NO_AUTHORIZATION'||
     view.mayGrantAccess!==false||!requestItem)return false;
  const current=view.selected;
  if(!current || current.kind!=='access'||current.status!=='active'||
     !current.group?.id||!current.role||!Array.isArray(current.capabilities))return false;
  // Never allow self-approval, including for an actor with a separate valid role.
  if(requestItem.accountId==='fictional-account-'+view.profileId)return false;
  const required=P12_ACCESS_ROLES[requestItem.role];
  if(!required||required.scope!==requestItem.group.type)return false;
  if(current.role==='personal_owner'&&
     scopeEqual(current.group,{type:'personal',id:'qa-platform'})&&
     current.capabilities.includes('personal:manage')) {
    return requestItem.group.type==='association' || requestItem.role==='club_admin';
  }
  if(current.role==='association_admin'&&
     current.capabilities.includes('association:manage')) {
    return requestItem.role==='association_viewer'&&
      scopeEqual(current.group,requestItem.group);
  }
  if(current.role!=='club_admin'||!current.capabilities.includes('club:manage')||
     current.group.type!=='club')return false;
  if(requestItem.role==='club_support')return scopeEqual(current.group,requestItem.group);
  if(requestItem.group.type==='team')
    return TEAM_CLUB[requestItem.group.id]===current.group.id;
  if(requestItem.group.type==='fixture')
    return FIXTURE_CLUB[requestItem.group.id]===current.group.id;
  return false;
};
const clone=x=>JSON.parse(JSON.stringify(x));
const grantFor=r=>({
  accountId:r.accountId,role:r.role,group:r.group,status:r.status,
  approvedBy:r.approvedBy,validFrom:r.validFrom,expiresAt:r.expiresAt
});
export function createP12GovernanceScenario(){
  return {mode:'DISPOSABLE_SYNTHETIC_GOVERNANCE',records:clone(SEED),
    audit:[],at:P12_GOVERNANCE_CLOCK,containsRealPeople:false,
    saved:false,published:false,productionGrantsCreated:false};
}
const validScenario=s=>s?.mode==='DISPOSABLE_SYNTHETIC_GOVERNANCE' &&
  s.containsRealPeople===false && s.saved===false && s.published===false &&
  s.productionGrantsCreated===false && Array.isArray(s.records) && Array.isArray(s.audit) &&
  s.at===P12_GOVERNANCE_CLOCK;
const outcome=(r,at)=>{
  if(!r)return 'unavailable';
  if(r.status!=='active')return r.status;
  const definition=P12_ACCESS_ROLES[r.role];
  if(!definition)return 'invalid';
  const capability=definition.capabilities[0];
  const d=evaluateP12Access({accountId:r.accountId,capability,
    resourceScope:r.group,grants:[grantFor(r)],at});
  return d.allowed?'active':'expired-or-invalid';
};

// Can inspect approvals without changing synthetic profile fixtures or granting
// actual app permissions. Mutations are confined to a new returned copy.
export function inspectP12Governance(s,actorView=null){
  if(!validScenario(s))return null;
  return {
    records:s.records.map(r=>({
      ...clone(r),effectiveStatus:outcome(r,s.at),
      canApprove:r.status==='proposed'&&reviewer(actorView,r),
      canReject:r.status==='proposed'&&reviewer(actorView,r),
      canRevoke:r.status==='active'&&reviewer(actorView,r)
    })),
    actorProfile:actorView?.profileId||'',
    actorContext:actorView?.selected?.group?.id||'',
    audit:clone(s.audit),auditCount:s.audit.length,
    pending:s.records.filter(r=>r.status==='proposed').length,
    active:s.records.filter(r=>outcome(r,s.at)==='active').length,
    expired:s.records.filter(r=>outcome(r,s.at)==='expired-or-invalid').length,
    containsRealPeople:false,actualPermissions:false,canPublish:false
  };
}
export function applyP12GovernanceAction(s,actorView,{id,decision}={}){
  if(!validScenario(s)||typeof id!=='string'||!['approve','reject','revoke'].includes(decision))
    return {error:'Invalid simulated governance action'};
  const matches=s.records.filter(r=>r.id===id);
  if(matches.length!==1)return {error:'Unknown or ambiguous synthetic request'};
  const original=matches[0];
  if(!reviewer(actorView,original))return {error:'Reviewer is not eligible for this exact request'};
  if(decision==='revoke'&&original.status!=='active')return {error:'Only active synthetic grants may be revoked'};
  if(decision!=='revoke'&&original.status!=='proposed')return {error:'Only proposed synthetic grants may be reviewed'};
  const changed={...clone(original),
    status:decision==='approve'?'active':decision==='reject'?'rejected':'revoked',
    approvedBy:decision==='approve'?'fictional-reviewer-'+actorView.profileId:
      (decision==='revoke'?original.approvedBy:null)};
  const copy={...s,records:s.records.map(r=>r.id===id?changed:clone(r)),
    audit:[...s.audit,{requestId:id,reviewerProfile:actorView.profileId,
      reviewerContext:actorView.selected.id,decision,from:original.status,
      to:changed.status,at:s.at,syntheticOnly:true}]};
  return copy;
}
