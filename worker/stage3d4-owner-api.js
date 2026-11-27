// Stage 3D.4: restricted initial Platform Owner administration.
// Trusted GoTrue identity + private service-only RPC. This never grants roles
// from client input, and can operate only on the existing approved Worker.
import {adminHeaders,isApprovedProjectConfig} from './supabase-admin-key.js';
import {delivery} from './stage3-onboarding-api.js';
import {validConnectedLogo,validConnectedStyle,validClubBranding} from '../site/connected-branding.js';
import {validConnectedE5Play} from '../site/cloud-e5-payload.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INVITE=/^invite-[0-9a-f]{32}$/;
const ID=/^[a-z][a-z0-9-]{2,63}$/;
const SPORT=/^[a-z][a-z0-9-]{1,30}$/;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EVIDENCE=/^evidence-ref\/[A-Za-z0-9._/-]{12,100}$/;
const ROLES=new Set(['team_coach','team_manager','team_assistant',
  'team_player','team_volunteer']);
const ACTIONS=new Set(['status','team.create','coach.assign',
  'invite.issue','invite.approve','invite.review-adult',
  'invite.activate','invite.cancel','invite.revoke','branding.status','branding.authorise','branding.revoke','branding.catalogue','branding.history','branding.moderation.save','branding.moderation.remove','branding.moderation.lock','branding.moderation.unlock','branding.moderation.revoke','template.list','template.get','template.add','template.withdraw']);
const own=o=>o&&typeof o==='object'&&!Array.isArray(o)&&
  Object.getPrototypeOf(o)===Object.prototype;
const output=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{
  'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff'}});
const deny=(code,status=403)=>output({ok:false,code},status);
const allowed=new Set(['action','teamId','clubRef','sportRef','seasonRef',
  'email','role','invitationId','evidenceRef','style','logo','resetOverrides','expectedVersion','reason','templateId','play','rightsConfirmed','privacyReviewed']);
export function validateOwnerAction(value){
  if(!own(value)||!ACTIONS.has(value.action)||
     Object.keys(value).some(k=>!allowed.has(k)))return null;
  const keys=Object.keys(value).sort().join(',');
  const expect={
    'template.list':'action','template.get':'action,templateId','template.add':'action,play,privacyReviewed,rightsConfirmed','template.withdraw':'action,templateId',
    status:'action','branding.status':'action','branding.authorise':'action','branding.revoke':'action',
    'branding.catalogue':'action','branding.history':'action,clubRef',
    'branding.moderation.save':'action,clubRef,expectedVersion,logo,reason,resetOverrides,style',
    'branding.moderation.remove':'action,clubRef,expectedVersion,reason',
    'branding.moderation.lock':'action,clubRef,expectedVersion,reason',
    'branding.moderation.unlock':'action,clubRef,expectedVersion,reason',
    'branding.moderation.revoke':'action,clubRef,expectedVersion,reason',
    'team.create':'action,clubRef,seasonRef,sportRef,teamId',
    'coach.assign':'action',
    'invite.issue':'action,email,role',
    'invite.approve':'action,invitationId',
    'invite.review-adult':'action,evidenceRef,invitationId',
    'invite.activate':'action,invitationId',
    'invite.cancel':'action,invitationId',
    'invite.revoke':'action,invitationId'
  }[value.action];
  if(keys!==expect)return null;
  if(['template.get','template.withdraw'].includes(value.action)&&!/^tpl-[a-f0-9]{32}$/.test(value.templateId||''))return null;
  if(value.action==='template.add'&&(!validConnectedE5Play(value.play)||value.rightsConfirmed!==true||value.privacyReviewed!==true))return null;
  if(value.action==='branding.history'||value.action.startsWith('branding.moderation.')){
    if(typeof value.clubRef!=='string'||value.clubRef.length<1||value.clubRef.length>120||value.clubRef.trim()!==value.clubRef||/[\u0000-\u001f\u007f]/.test(value.clubRef))return null;
    if(value.action.startsWith('branding.moderation.')&&(!Number.isSafeInteger(value.expectedVersion)||value.expectedVersion<0||value.expectedVersion>999999999||!['inappropriate-image','incorrect-branding','policy-review','owner-correction','resolved'].includes(value.reason)))return null;
    if(value.action==='branding.moderation.save'&&(!validConnectedStyle(value.style)||!validConnectedLogo(value.logo)||typeof value.resetOverrides!=='boolean'))return null;
  }
  if(value.action==='team.create'&&(!ID.test(value.teamId||'')||
     typeof value.clubRef!=='string'||value.clubRef.trim()!==value.clubRef||
     value.clubRef.length<3||value.clubRef.length>100||
     /[\u0000-\u001f\u007f]/.test(value.clubRef)||
     !SPORT.test(value.sportRef||'')||!/^20\d{2}$/.test(value.seasonRef||'')))
    return null;
  if(value.action==='invite.issue'&&(!ROLES.has(value.role)||
     typeof value.email!=='string'||value.email.length>254||
     !EMAIL.test(value.email.trim())))return null;
  if(value.action.startsWith('invite.')&&value.action!=='invite.issue'&&
     !INVITE.test(value.invitationId||''))return null;
  if(value.action==='invite.review-adult'&&!EVIDENCE.test(value.evidenceRef||''))
    return null;
  return Object.freeze({...value,
    ...(value.email?{email:value.email.trim().toLowerCase()}:{})});
}
async function remote(fetchImpl,url,init){
  let res;
  try{res=await fetchImpl(url,{...init,cache:'no-store',redirect:'manual'});}
  catch{return null;}
  if(!res?.ok)return null;
  try{return await res.json();}catch{return null;}
}
const priv=env=>({'Content-Type':'application/json',...adminHeaders(env)});
async function rpc(fetchImpl,env,endpoint,args){
  return remote(fetchImpl,env.SUPABASE_URL+'/rest/v1/rpc/'+endpoint,{
    method:'POST',headers:priv(env),body:JSON.stringify(args)});
}
const codes=new Set(['ready','team-created','coach-assigned','approved',
  'adult-reviewed','activated','revoked','scope-denied','invalid-request',
  'team-preflight-denied','coach-preflight-denied','registration-required',
  'invite-preflight-denied','invite-unavailable','review-required',
  'verified-identity-required','review-revoked','activation-preflight-denied',
  'person-not-verified','grant-unavailable','stale-version']);
export async function handleStage3D4Owner(request,env,fetchImpl=fetch){
  try{
    const url=new URL(request.url);
    if(url.pathname!=='/api/stage3d4/v1/owner'||request.method!=='POST'||
      url.search||url.hash)return deny('not-found',404);
    if(env?.STAGE3D4_OWNER_ADMIN_MODE!=='enabled'||
      env?.STAGE3D3_REGISTRATION_MODE!=='required'||
      env?.STAGE3D3_EXISTING_SHARED_WORKER_MODE!=='preserve-legacy-pages'||
      !isApprovedProjectConfig(env))return deny('service-unavailable',503);
    const origin=request.headers.get('Origin');
    if(origin&&origin!==url.origin)return deny('origin-denied');
    if(request.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json')
      return deny('invalid-request',400);
    const bearer=request.headers.get('Authorization')||'';
    if(!/^Bearer [A-Za-z0-9._~-]{12,8192}$/.test(bearer))
      return deny('unauthenticated',401);
    const raw=await request.text();
    if(raw.length>65536)return deny('invalid-request',400);
    let input;try{input=validateOwnerAction(JSON.parse(raw));}
    catch{return deny('invalid-request',400);}
    if(!input||raw.length>2048&&!['branding.moderation.save','template.add'].includes(input.action))return deny('invalid-request',400);
    const user=await remote(fetchImpl,env.SUPABASE_URL+'/auth/v1/user',{
      method:'GET',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,
        Authorization:bearer}});
    if(!user||!UUID.test(user.id||'')||typeof user.email!=='string'||
      !EMAIL.test(user.email)||!(user.email_confirmed_at||user.confirmed_at))
      return deny('unauthenticated',401);
    const payload={...input};delete payload.action;
    const template=input.action.startsWith('template.');
    if(template&&env.STAGE4_TACTICS_MODE!=='enabled')return deny('service-unavailable',503);
    if(template&&input.action==='template.add')payload.templateId='tpl-'+crypto.randomUUID().replaceAll('-','');
    const branding=input.action.startsWith('branding.');
    const moderation=input.action==='branding.catalogue'||input.action==='branding.history'||input.action.startsWith('branding.moderation.');
    const data=await rpc(fetchImpl,env,template?'tm_stage4_owner_templates':moderation?'tm_stage3d5_branding_moderation':branding?'tm_stage3d5_branding_owner':'tm_stage3d4_owner',{
      p_actor:user.id,p_action:input.action,p_input:payload});
    if(!own(data)||typeof data.ok!=='boolean'||!codes.has(data.code))
      return deny('service-unavailable',503);
    if(!data.ok)return deny(data.code,
      data.code==='registration-required'?403:
        (/preflight/.test(data.code)||data.code==='stale-version')?409:403);
    if(template){
      if(data.code!=='ready')return deny('service-unavailable',503);
      const templateId=x=>typeof x==='string'&&/^tpl-[a-f0-9]{32}$/.test(x);
      if(input.action==='template.list'){
        if(!Array.isArray(data.templates)||data.templates.length>200||data.templates.some(x=>!own(x)||!templateId(x.templateId)||typeof x.name!=='string'||x.name.length>120||!['active','withdrawn'].includes(x.state)||x.source!=='owner-authorised-upload'))return deny('service-unavailable',503);
        return output({ok:true,code:'ready',templates:data.templates.map(({templateId,name,state,source})=>({templateId,name,state,source})),collectionEnabled:false});
      }
      if(input.action==='template.get'){
        if(data.templateId!==input.templateId||!validConnectedE5Play(data.play))return deny('service-unavailable',503);
        return output({ok:true,code:'ready',templateId:data.templateId,play:data.play});
      }
      if(!templateId(data.templateId)||data.templateId!==(payload.templateId))return deny('service-unavailable',503);
      return output({ok:true,code:'ready',templateId:data.templateId});
    }
    if(moderation){
      if(data.code!=='ready')return deny('service-unavailable',503);
      if(input.action==='branding.catalogue'){
        if(!Array.isArray(data.clubs)||data.clubs.length>100||!data.clubs.every(validClubBranding))return deny('service-unavailable',503);
        return output({ok:true,code:'ready',clubs:data.clubs.map(({clubRef,style,logo,version,locked})=>({clubRef,style,logo,version,locked}))});
      }
      if(input.action==='branding.history'){
        if(!Array.isArray(data.events)||data.events.length>100||data.events.some(x=>!own(x)||typeof x.at!=='string'||typeof x.action!=='string'||typeof x.reason!=='string'||!(x.actor===null||UUID.test(x.actor))))return deny('service-unavailable',503);
        return output({ok:true,code:'ready',events:data.events.map(({at,action,reason,actor})=>({at,action,reason,actor}))});
      }
      return output({ok:true,code:'ready'});
    }
    if(branding){
      if(data.code!=='ready'||typeof data.brandingAuthorised!=='boolean'||typeof data.clubRef!=='string'||data.clubRef.length>120)return deny('service-unavailable',503);
      return output({ok:true,code:'ready',clubRef:data.clubRef,brandingAuthorised:data.brandingAuthorised});
    }
    if(input.action==='status'){
      if(data.code!=='ready'||typeof data.coachAssigned!=='boolean'||
        typeof data.policyReady!=='boolean'||!Array.isArray(data.invitations)||
        data.invitations.length>100||
        data.invitations.some(x=>!own(x)||Object.keys(x).some(k=>
          !['invitationId','email','role','status','delivery','expiresAt'].includes(k))))
        return deny('service-unavailable',503);
      return output({ok:true,code:'ready',team:data.team||null,
        coachAssigned:data.coachAssigned,policyReady:data.policyReady,
        invitations:data.invitations});
    }
    if(['invite.issue','invite.approve'].includes(input.action)){
      if(data.code!=='approved'||!INVITE.test(data.invitationId||'')||
         typeof data.internalEmail!=='string'||!EMAIL.test(data.internalEmail))
        return deny('service-unavailable',503);
      const state=await delivery(fetchImpl,env.SUPABASE_URL,env,
        data.invitationId,data.internalEmail);
      await rpc(fetchImpl,env,'tm_stage3_delivery_result',{
        p_invitation:data.invitationId,p_result:state});
      return output({ok:true,code:'approved',invitationId:data.invitationId,
        delivery:state});
    }
    return output({ok:true,code:data.code});
  }catch{
    return deny('service-unavailable',503);
  }
}
export default {fetch:handleStage3D4Owner};
