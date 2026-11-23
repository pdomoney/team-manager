// Stage 3D.5 corrective connected management boundary.
// No browser-controlled account IDs, operator claims, credentials or raw provider
// errors. The SQL is the final authority and runs under the service-only key.
import {adminHeaders,isApprovedProjectConfig} from './supabase-admin-key.js';
import {delivery} from './stage3-onboarding-api.js';
import {validateStage3D5,isStage3D5Read} from '../src/stage3d5-management-contract.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE=new Set(['invalid-request','scope-denied','role-denied',
  'stale-version','already-assigned','invite-unavailable','verified-identity-required',
  'activation-preflight-denied','person-not-verified','volunteer-not-verified','grant-unavailable',
  'committed','permitted']);
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{
 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff'}});
const deny=(code,status=403)=>json({ok:false,code},status);
async function remote(fetchImpl,url,options){
 let response;
 try{response=await fetchImpl(url,{...options,cache:'no-store',redirect:'manual'});}
 catch{return null;}
 if(!response?.ok)return null;
 try{return await response.json();}catch{return null;}
}
export async function handleStage3D5Team(request,env,fetchImpl=fetch){
 try{
  const url=new URL(request.url);
  if(url.pathname!=='/api/stage3d5/v1/team'||request.method!=='POST'||
    url.search||url.hash)return deny('not-found',404);
  if(env?.STAGE3D3_REGISTRATION_MODE!=='required'||
    env?.STAGE3D3_EXISTING_SHARED_WORKER_MODE!=='preserve-legacy-pages'||
    !isApprovedProjectConfig(env))return deny('service-unavailable',503);
  const origin=request.headers.get('Origin');
  if(origin&&origin!==url.origin)return deny('origin-denied');
  if(request.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json')
    return deny('invalid-request',400);
  const auth=request.headers.get('Authorization')||'';
  if(!/^Bearer [A-Za-z0-9._~-]{12,8192}$/.test(auth))
    return deny('unauthenticated',401);
  const raw=await request.text();
  if(raw.length>6000)return deny('invalid-request',400);
  let op;
  try{op=validateStage3D5(JSON.parse(raw));}
  catch{return deny('invalid-request',400);}
  if(!op)return deny('invalid-request',400);
  const user=await remote(fetchImpl,env.SUPABASE_URL+'/auth/v1/user',{
    method:'GET',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,Authorization:auth}
  });
  if(!user||!UUID.test(user.id||'')||
    !(user.email_confirmed_at||user.confirmed_at))
    return deny('unauthenticated',401);
  const result=await remote(fetchImpl,env.SUPABASE_URL+'/rest/v1/rpc/tm_stage3d5_team',{
    method:'POST',headers:{...adminHeaders(env),'Content-Type':'application/json'},
    body:JSON.stringify({p_actor:user.id,p_team:op.teamId,p_role:op.role,
      p_action:op.action,p_input:op.input})
  });
  if(!obj(result)||typeof result.ok!=='boolean'||!SAFE.has(result.code))
    return deny('service-unavailable',503);
  if(!result.ok)return deny(result.code,result.code==='stale-version'||
     result.code==='already-assigned'?409:403);
  if(result.code!==(isStage3D5Read(op.action)?'permitted':'committed'))
    return deny('service-unavailable',503);
  if(op.action==='invite.issue'){
    // Supabase private RPC returns address only to this trusted Worker. Never
    // return internalEmail to the browser, even if the email provider fails.
    const invitation=result.data;
    if(!obj(invitation)||typeof invitation.internalEmail!=='string'||
      !/^invite-[0-9a-f]{32}$/.test(invitation.invitationId||''))
      return deny('service-unavailable',503);
    const sent=await delivery(fetchImpl,env.SUPABASE_URL,env,
      invitation.invitationId,invitation.internalEmail);
    await remote(fetchImpl,env.SUPABASE_URL+'/rest/v1/rpc/tm_stage3_delivery_result',{
      method:'POST',headers:{...adminHeaders(env),'Content-Type':'application/json'},
      body:JSON.stringify({p_invitation:invitation.invitationId,p_result:sent})
    });
    return json({ok:true,code:'committed',data:{
      invitationId:invitation.invitationId,delivery:sent}});
  }
  if(result.data===null||result.data===undefined||typeof result.data!=='object'||
    JSON.stringify(result.data).length>64000)return deny('service-unavailable',503);
  return json({ok:true,code:result.code,data:result.data});
 }catch{return deny('service-unavailable',503);}
}
