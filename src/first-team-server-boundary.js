// First-team backend boundary: provider-neutral SERVER-SIDE integration foundation.
// Not imported by site/, not a hosted API, not proof that an identity provider,
// database transaction, row policy, child consent or data controller has been approved.
// The future provider adapter must cryptographically verify every session and run
// all resource/grant reads, audit and action in one rollback-capable transaction.

const ACTIONS = Object.freeze({
  'schedule.read': Object.freeze({type:'team', roles:['team_coach','team_assistant','team_manager','team_player']}),
  'schedule.edit': Object.freeze({type:'team', roles:['team_coach','team_manager']}),
  'roster.edit': Object.freeze({type:'team', roles:['team_coach','team_manager']}),
  'play.published.read': Object.freeze({type:'play', roles:['team_coach','team_assistant','team_manager','team_player','team_play_viewer']}),
  'play.draft.read': Object.freeze({type:'play', roles:['team_coach','team_assistant']}),
  'play.draft.edit': Object.freeze({type:'play', roles:['team_coach','team_assistant']}),
  'play.publish': Object.freeze({type:'play', roles:['team_coach']}),
  'availability.reply': Object.freeze({type:'availability', roles:['team_player']}),
  'duty.read': Object.freeze({type:'duty', roles:['team_volunteer']}),
  'duty.reply': Object.freeze({type:'duty', roles:['team_volunteer']}),
  'duty.assign': Object.freeze({type:'team', roles:['team_manager']})
});
export const FIRST_TEAM_SERVER_ACTIONS=Object.freeze(Object.keys(ACTIONS));
export const FIRST_TEAM_SERVER_POLICY_VERSION=1;

const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const id=x=>typeof x==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,99}$/.test(x);
const instant=x=>{
  if(typeof x!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(x))return null;
  const at=Date.parse(x);
  return Number.isFinite(at)&&new Date(at).toISOString().slice(0,19)===x.slice(0,19)?at:null;
};
const bounded=(row,at)=>{
  const from=row.validFrom==null?null:instant(row.validFrom);
  const to=row.expiresAt==null?null:instant(row.expiresAt);
  return (row.validFrom==null||from!==null)&&(row.expiresAt==null||to!==null)&&
    (from===null||at>=from)&&(to===null||at<to);
};
const deny=code=>Object.freeze({allowed:false,code});
const validGrant=(g,identity,role,teamId,at)=>obj(g)&&
  g.accountId===identity.accountId&&g.role===role&&g.scopeType==='team'&&
  g.scopeId===teamId&&g.policyVersion===FIRST_TEAM_SERVER_POLICY_VERSION&&
  g.status==='active'&&id(g.approvedBy)&&g.approvedBy!==identity.accountId&&
  bounded(g,at);
const validLink=(l,identity,at)=>obj(l)&&l.accountId===identity.accountId&&
  id(l.personId)&&l.status==='verified'&&id(l.verifiedBy)&&
  l.verifiedBy!==identity.accountId&&bounded(l,at);
const validParticipation=(p,personId,teamId,at)=>obj(p)&&
  p.personId===personId&&p.teamId===teamId&&p.kind==='player'&&
  p.status==='active'&&id(p.verifiedBy)&&bounded(p,at);
const validDuty=(d,personId,resource,at)=>obj(d)&&
  d.personId===personId&&d.teamId===resource.teamId&&
  d.id===resource.id&&['assigned','confirmed'].includes(d.status)&&
  id(d.approvedBy)&&bounded(d,at);

// Requests supply ONLY a session credential, selected context, action, resource ID
// and operation body. Claims of account/person/team ownership, permissions,
// membership, approval or a fixture appointment MUST come from server records.
const validRequest=r=>obj(r)&&typeof r.token==='string'&&r.token.length>0&&
  r.token.length<=8192&&Object.hasOwn(ACTIONS,r.action)&&id(r.resourceId)&&
  id(r.activeTeamId)&&ACTIONS[r.action].roles.includes(r.activeRole)&&
  (!Object.hasOwn(r,'payload')||obj(r.payload))&&
  !['accountId','personId','roleGrant','permission','verified','teamId','isAdmin']
    .some(k=>Object.hasOwn(r,k));

// The caller's active role is a NARROWING CHOICE, never the authority source.
// This module must not be called directly from GitHub Pages/browser or as an
// unguarded 'check then write' API. No implicit club/admin hierarchy.
export function createFirstTeamServerBoundary({transaction,clock=()=>new Date().toISOString()}={}){
  if(typeof transaction!=='function'||typeof clock!=='function')
    throw new TypeError('A trusted transactional backend and server clock are required');
  return Object.freeze({
    async run(request){
      if(!validRequest(request))return deny('invalid-request');
      const at=instant(clock());
      if(at===null)return deny('invalid-server-clock');
      try{
        return await transaction(async tx=>{
          if(!obj(tx)||[
            'verifySession','loadResource','loadGrants','loadPersonLink',
            'loadParticipation','loadDuty','auditDecision','executeAuthorized'
          ].some(name=>typeof tx[name]!=='function'))return deny('missing-trusted-adapter');

          // verifySession must validate signature/issuer/audience/expiry AND fetch
          // current account status. Never trust a client role selector or JWT role.
          const identity=await tx.verifySession(request.token);
          if(!obj(identity)||!id(identity.accountId)||identity.status!=='active'||
             identity.verified!==true||instant(identity.expiresAt)===null||
             instant(identity.expiresAt)<=at)return deny('unauthenticated');

          const action=ACTIONS[request.action];
          const resource=await tx.loadResource(action.type,request.resourceId);
          if(!obj(resource)||resource.type!==action.type||resource.id!==request.resourceId||
             !id(resource.teamId)||resource.teamId!==request.activeTeamId||
             resource.status!=='active')return deny('missing-or-foreign-resource');

          // A minor/medical/guardianship/private-class payload needs a distinct
          // approved policy. The present one-team contract denies it outright.
          if(resource.classification!=='routine'||resource.minorData===true)
            return deny('protected-data-not-authorised');
          if(action.type==='team'&&resource.id!==resource.teamId)
            return deny('invalid-team-resource');
          if(request.action==='play.published.read'&&
             (resource.publicationState!=='published'||!id(resource.publishedRevisionId)))
            return deny('unpublished-play');
          if(request.action.startsWith('play.draft.')||request.action==='play.publish'){
            if(resource.publicationState!=='draft')return deny('not-a-draft');
          }

          const grants=await tx.loadGrants(identity.accountId);
          if(!Array.isArray(grants)||!grants.some(g=>validGrant(
            g,identity,request.activeRole,resource.teamId,at)))
            return deny('no-exact-active-grant');

          let personId=null;
          if(['team_player','team_volunteer'].includes(request.activeRole)){
            const link=await tx.loadPersonLink(identity.accountId);
            if(!validLink(link,identity,at))return deny('unverified-person-link');
            personId=link.personId;
          }
          if(request.activeRole==='team_player'){
            const participation=await tx.loadParticipation(personId,resource.teamId);
            if(!validParticipation(participation,personId,resource.teamId,at))
              return deny('no-verified-team-participation');
            if(request.action==='availability.reply'&&resource.personId!==personId)
              return deny('not-own-availability');
          }
          if(request.activeRole==='team_volunteer'){
            if(resource.personId!==personId)return deny('not-own-volunteer-duty');
            const duty=await tx.loadDuty(personId,resource.id);
            if(!validDuty(duty,personId,resource,at))
              return deny('duty-not-independently-assigned');
          }

          // All action implementation, schema validation, row filtering and
          // optimistic version checks remain obligations of the trusted adapter.
          // No implicit permission to export, browse raw rows or issue signed URLs.
          // Both the audit and operation must report an explicit acknowledgement
          // from inside the same rollback-capable transaction. Undefined, false,
          // or an error-shaped return is never evidence that a write/read succeeded.
          // Throw, rather than return DENY here, so a real transaction must roll
          // back all preceding audit and operation writes before answering the caller.
          const auditAccepted=await tx.auditDecision({
            accountId:identity.accountId,action:request.action,
            resourceType:action.type,resourceId:resource.id,
            teamId:resource.teamId,role:request.activeRole,
            decision:'ALLOW',at:new Date(at).toISOString()
          });
          if(auditAccepted!==true)throw new Error('audit-not-acknowledged');
          const result=await tx.executeAuthorized({
            accountId:identity.accountId,personId,
            action:request.action,resourceId:resource.id,
            teamId:resource.teamId,role:request.activeRole,
            payload:request.payload||{}
          });
          if(!obj(result)||result.success!==true)
            throw new Error('operation-not-acknowledged');
          return Object.freeze({allowed:true,code:'permitted',value:result});
        });
      }catch{
        // An unavailable or unsafe provider MUST NOT return success or leak a
        // token, record, error stack, SQL or exception to the public client.
        return deny('trusted-backend-failure');
      }
    }
  });
}
