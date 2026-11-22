import {adminHeaders,isApprovedProjectConfig} from './supabase-admin-key.js';
// Stage 3A trusted onboarding boundary. Source only; deployment and provider
// email delivery need separate authorisation. No browser credential is privileged.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID=/^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$/;
const INVITE=/^invite-[0-9a-f]{32}$/;
const ROLES=new Set(['team_coach','team_manager']);
const TARGET_ROLES=new Set(['team_coach','team_manager','team_assistant',
  'team_player','team_volunteer']);
const ACTIONS=new Set(['list.mine','list.team','propose','approve','deliver',
  'claim','activate','revoke','cancel']);
const own=o=>o&&typeof o==='object'&&!Array.isArray(o)&&
  Object.getPrototypeOf(o)===Object.prototype;
const reply=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{
  'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff'}});
const deny=(code,status=403)=>reply({ok:false,code},status);
function config(env){
  return isApprovedProjectConfig(env)?new URL(env.SUPABASE_URL).origin:null;
}

function valid(input){
  if(!own(input)||Object.keys(input).some(k=>![
    'action','teamId','role','invitationId','email','targetRole'].includes(k))||
    !ACTIONS.has(input.action))return null;
  const {action,teamId,role,invitationId,email,targetRole}=input;
  if(action==='list.mine' || action==='claim'){
    if(teamId!==undefined||role!==undefined||email!==undefined||
       targetRole!==undefined||
       (action==='claim'&&!INVITE.test(invitationId||''))||
       (action==='list.mine'&&invitationId!==undefined))return null;
  }else{
    if(!ID.test(teamId||'')||!ROLES.has(role))return null;
    if(action==='propose'){
      if(invitationId!==undefined||!TARGET_ROLES.has(targetRole)||
        typeof email!=='string'||email.length>254||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))return null;
    }else if(action==='list.team'){
      if(invitationId!==undefined||email!==undefined||targetRole!==undefined)return null;
    }else if(!INVITE.test(invitationId||'')||email!==undefined||
      targetRole!==undefined)return null;
  }
  return {
    action,team:teamId||'',role:role||'',
    invitation:invitationId||null,
    email:action==='propose'?email.trim().toLowerCase():null,
    targetRole:targetRole||null
  };
}
async function provider(fetchImpl,url,init){
  const response=await fetchImpl(url,{...init,cache:'no-store',redirect:'manual'});
  if(!response?.ok)return {ok:false,status:response?.status||503};
  try{return {ok:true,data:await response.json()};}
  catch{return {ok:false,status:503};}
}
function privilegedHeaders(env){
  return {'Content-Type':'application/json',...adminHeaders(env)};
}
async function rpc(fetchImpl,host,env,endpoint,args){
  return provider(fetchImpl,host+'/rest/v1/rpc/'+endpoint,{
    method:'POST',headers:privilegedHeaders(env),body:JSON.stringify(args)});
}
export async function delivery(fetchImpl,host,env,invitationId,email){
  // Redirect origin and route are operator-configured, never accepted from
  // the invitee or from an untrusted browser request.
  let redirect;
  try{redirect=new URL(env?.ONBOARDING_REDIRECT_URL||'');}
  catch{return 'failed';}
  if(redirect.protocol!=='https:'||redirect.username||redirect.password||
    redirect.search||redirect.hash||!redirect.pathname.endsWith('/cloud-access.html'))
    return 'failed';
  const endpoint=host+'/auth/v1/invite?redirect_to='+encodeURIComponent(redirect.href);
  let response;
  try{response=await fetchImpl(endpoint,{method:'POST',cache:'no-store',
    redirect:'manual',headers:privilegedHeaders(env),
    body:JSON.stringify({email})});}
  catch{return 'failed';}
  if(response?.ok)return 'sent';
  // GoTrue does not send a second invite to an already registered user.
  // That user can sign in and claim an independently approved invitation.
  if(response?.status===422){
    try{
      const issue=await response.json();
      if(['email_exists','user_already_exists'].includes(issue?.code))
        return 'existing-account';
    }catch{/* no provider details reach the browser */}
  }
  return 'failed';
}
const safeCode=new Set(['permitted','proposed','approved','claimed','activated',
  'revoked','invalid-request','scope-denied','invitation-unavailable',
  'self-approval-denied','account-inactive','already-pending','already-active',
  'person-not-verified']);
export async function handleStage3Onboarding(request,env,fetchImpl=fetch){
  try{
    const url=new URL(request.url);
    if(request.method!=='POST'||url.pathname!=='/api/stage3/v1/onboarding'||
      url.search||url.hash)return deny('not-found',404);
    const origin=request.headers.get('Origin');
    if(origin&&origin!==url.origin)return deny('origin-denied');
    if(request.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json')
      return deny('invalid-request',400);
    const host=config(env);
    if(!host)return deny('service-unavailable',503);
    const authorization=request.headers.get('Authorization')||'';
    if(!/^Bearer [A-Za-z0-9._~-]{12,8192}$/.test(authorization))
      return deny('unauthenticated',401);
    const raw=await request.text();
    if(raw.length>2048)return deny('invalid-request',400);
    let input;
    try{input=JSON.parse(raw);}catch{return deny('invalid-request',400);}
    const op=valid(input);
    if(!op)return deny('invalid-request',400);
    // Stage 3D.4 replaces the two-coach approval path with a scoped
    // administrator review. Stage 3C/older installations remain unchanged.
    if(env?.STAGE3D4_OWNER_ADMIN_MODE==='enabled'&&
      ['approve','activate','deliver'].includes(op.action))
      return deny('administrator-required');

    const userResult=await provider(fetchImpl,host+'/auth/v1/user',{
      method:'GET',headers:{
        apikey:env.SUPABASE_PUBLISHABLE_KEY,Authorization:authorization}});
    const user=userResult.data;
    if(!userResult.ok||!user||!UUID.test(user.id||'')||
      typeof user.email!=='string'||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)||
      !(user.email_confirmed_at||user.confirmed_at))
      return deny('unauthenticated',401);
    const result=await rpc(fetchImpl,host,env,'tm_stage3_onboarding',{
      p_actor:user.id,p_actor_email:user.email,p_team:op.team,
      p_role:op.role,p_action:op.action,p_invitation:op.invitation,
      p_email:op.email,p_target_role:op.targetRole});
    const data=result.data;
    if(!result.ok||!own(data)||typeof data.ok!=='boolean'||
      !safeCode.has(data.code))return deny('service-unavailable',503);
    if(!data.ok)return deny(data.code,
      data.code==='already-pending'||data.code==='already-active'?409:403);
    if(op.action==='list.team'||op.action==='list.mine'){
      if(data.code!=='permitted'||!Array.isArray(data.data)||data.data.length>100)
        return deny('service-unavailable',503);
      const allowed=op.action==='list.team'?
        ['invitationId','email','teamRole','status','delivery','expiresAt',
          'proposedByMe','canReview']:
        ['invitationId','teamId','teamRole','status','expiresAt'];
      if(data.data.some(entry=>!own(entry)||Object.keys(entry).some(k=>
        !allowed.includes(k))))return deny('service-unavailable',503);
      return reply({ok:true,code:'permitted',data:data.data});
    }
    if(!INVITE.test(data.invitationId||''))
      return deny('service-unavailable',503);
    let deliveryState;
    if(['approve','deliver'].includes(op.action)){
      if(data.code!=='approved'||typeof data.internalEmail!=='string')
        return deny('service-unavailable',503);
      deliveryState=await delivery(fetchImpl,host,env,
        data.invitationId,data.internalEmail);
      await rpc(fetchImpl,host,env,'tm_stage3_delivery_result',{
        p_invitation:data.invitationId,p_result:deliveryState});
    }
    return reply({ok:true,code:data.code,invitationId:data.invitationId,
      ...(deliveryState?{delivery:deliveryState}:{})});
  }catch{
    return deny('service-unavailable',503);
  }
}
export default {fetch:handleStage3Onboarding};
