// Stage 3D.3 trusted Worker gate. A provider login never authorises real-team
// operations until the approved policy and independently reviewed adult
// acceptance exist in the private database. NO real identity data is logged.
import {adminHeaders,isApprovedProjectConfig} from './supabase-admin-key.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN=/^Bearer [A-Za-z0-9._~-]{12,8192}$/;
const CODES=new Set(['accepted','acceptance-required','policy-unavailable',
  'adult-review-required','account-unavailable','acceptance-invalid',
  'invalid-request']);
const reply=(value,status=200)=>new Response(JSON.stringify(value),{
  status,headers:{'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
});
const reject=(code,status)=>reply({ok:false,code,canProceed:false},status);
function enabled(env){return env?.STAGE3D3_REGISTRATION_MODE==='required';}
function validEnv(env){return enabled(env)&&isApprovedProjectConfig(env);}
function sameOrigin(request){
  const url=new URL(request.url),origin=request.headers.get('Origin');
  return !origin||origin===url.origin;
}
async function trustedActor(request,env,fetchImpl){
  const token=request.headers.get('Authorization')||'';
  if(!TOKEN.test(token))return null;
  let res,user;
  try{
    res=await fetchImpl(env.SUPABASE_URL+'/auth/v1/user',{
      method:'GET',cache:'no-store',redirect:'error',
      headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,Authorization:token}
    });
    if(!res?.ok)return null;
    user=await res.json();
  }catch{return null;}
  if(!UUID.test(user?.id||'')||
     !(user?.email_confirmed_at||user?.confirmed_at))return null;
  return user.id;
}
async function rpc(env,fetchImpl,actor,action,payload={}){
  const headers=adminHeaders(env);
  if(!headers)return null;
  let res,value;
  try{
    res=await fetchImpl(env.SUPABASE_URL+
      '/rest/v1/rpc/tm_stage3d3_registration',{
      method:'POST',cache:'no-store',redirect:'error',
      headers:{...headers,'Content-Type':'application/json'},
      body:JSON.stringify({
        p_actor:actor,p_action:action,
        p_policy_id:payload.policyId??null,
        p_terms_accepted:payload.termsAccepted??false,
        p_privacy_acknowledged:payload.privacyAcknowledged??false,
        p_marketing_opt_in:payload.marketingOptIn??false
      })
    });
    if(!res?.ok)return null;
    value=await res.json();
  }catch{return null;}
  if(!value||typeof value!=='object'||Array.isArray(value)||
     !CODES.has(value.code)||typeof value.ok!=='boolean'||
     typeof value.canProceed!=='boolean')return null;
  return value;
}
function statusCode(result){
  if(!result)return 503;
  if(result.code==='policy-unavailable')return 503;
  if(result.code==='account-unavailable')return 403;
  if(result.code==='adult-review-required')return 403;
  if(result.code==='acceptance-invalid'||result.code==='invalid-request')return 400;
  return 403;
}
function publicStatus(result){
  if(!result)return reject('registration-service-unavailable',503);
  if(!result.ok)return reject(result.code,statusCode(result));
  // For status queries, return only approved policy metadata. No personal
  // account, reviewer, age, marketing or acceptance evidence is exposed.
  if(result.code==='acceptance-required'||result.code==='accepted'){
    const fields=['policyId','termsVersion','termsSha256','termsUrl',
      'privacyVersion','privacySha256','privacyUrl'];
    if(fields.some(key=>typeof result[key]!=='string'||
       result[key].length>512))return reject('registration-service-unavailable',503);
    return reply({ok:true,code:result.code,canProceed:result.canProceed,
      policy:Object.fromEntries(fields.map(key=>[key,result[key]]))});
  }
  return reply({ok:true,code:result.code,canProceed:result.canProceed});
}
function validAcceptance(requestBody){
  if(!requestBody||typeof requestBody!=='object'||Array.isArray(requestBody)||
     Object.getPrototypeOf(requestBody)!==Object.prototype||
     Object.keys(requestBody).sort().join(',')!==
       'marketingOptIn,policyId,privacyAcknowledged,termsAccepted')
    return false;
  return typeof requestBody.policyId==='string'&&
    /^[a-z0-9][a-z0-9._-]{4,63}$/.test(requestBody.policyId)&&
    requestBody.termsAccepted===true&&
    requestBody.privacyAcknowledged===true&&
    typeof requestBody.marketingOptIn==='boolean';
}
export async function handleStage3D3Registration(request,env,fetchImpl=fetch){
  const url=new URL(request.url);
  if(!validEnv(env))return reject('registration-service-unavailable',503);
  if(url.pathname!=='/api/stage3d3/v1/registration'||url.search||url.hash||
      !['GET','POST'].includes(request.method))return reject('not-found',404);
  if(!sameOrigin(request))return reject('origin-denied',403);
  const actor=await trustedActor(request,env,fetchImpl);
  if(!actor)return reject('unauthenticated',401);
  let payload={};
  if(request.method==='POST'){
    if(request.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json')
      return reject('invalid-request',400);
    let raw;
    try{raw=await request.text();}catch{return reject('invalid-request',400);}
    if(raw.length>512)return reject('invalid-request',400);
    try{payload=JSON.parse(raw);}catch{return reject('invalid-request',400);}
    if(!validAcceptance(payload))return reject('invalid-request',400);
  }
  const result=await rpc(env,fetchImpl,actor,
    request.method==='POST'?'accept':'status',payload);
  if(request.method==='GET')return publicStatus(result);
  if(!result)return reject('registration-service-unavailable',503);
  if(result.ok&&result.code==='accepted'&&result.canProceed===true)
    return reply({ok:true,code:'accepted',canProceed:true});
  return reject(result.code,statusCode(result));
}

// This is called before EVERY Stage 1/3B/3 management API path by
// the STAGE3D3_REGISTRATION_MODE=required Worker only. Stage 3C synthetic
// fixtures and the historic demo never see this gate.
export async function stage3D3PolicyGate(request,env,fetchImpl=fetch){
  if(!enabled(env))return null;
  if(!validEnv(env))return reject('registration-service-unavailable',503);
  if(!sameOrigin(request))return reject('origin-denied',403);
  const actor=await trustedActor(request,env,fetchImpl);
  if(!actor)return reject('unauthenticated',401);
  const result=await rpc(env,fetchImpl,actor,'status');
  if(result?.ok===true&&result.code==='accepted'&&result.canProceed===true)
    return null;
  return reject(result?.code||'registration-service-unavailable',
    statusCode(result));
}
