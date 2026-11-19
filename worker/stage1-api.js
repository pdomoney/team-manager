// Stage 1 source candidate: standalone Cloudflare Worker API, NOT activated by
// the existing static wrangler.jsonc. No credential, private row or SQL error is
// returned to a browser. All data mutations take place inside ONE database RPC.
import {validateFirstTeamActionPayload} from '../src/first-team-action-contract.js';

const ROLES=new Set(['team_coach','team_assistant','team_manager','team_player','team_volunteer']);
const ACTIONS=new Set(['schedule.read','schedule.edit','roster.read','roster.edit',
  'availability.reply','duty.read','duty.reply','duty.assign']);
const MANAGEMENT_ACTIONS=new Set(['attendance.read','availability.board','duty.board','notices.read','report.summary','roster.approve','event.create','event.change','attendance.record','availability.transcribe','duty.label','duty.withdraw','notice.create','notice.publish','notice.archive']);
for(const action of MANAGEMENT_ACTIONS)ACTIONS.add(action);
const IDENT=/^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_CODES=new Set(['invalid-command','invalid-mutation','invalid-read',
  'forged-field','team-unavailable','account-inactive','scope-denied',
  'role-denied','person-not-verified','participation-not-verified',
  'resource-out-of-scope','invalid-training','stale-or-protected-session',
  'invalid-roster','stale-roster','invalid-response','session-unavailable',
  'stale-availability','invalid-duty','volunteer-not-verified',
  'stale-event','stale-or-external-event','stale-attendance','stale-notice',
  'invalid-event','invalid-attendance','invalid-availability','invalid-notice',
  'duty-not-assigned','stale-or-invalid-duty','mutation-id-reused',
  'committed','permitted']);
const deny=(code,status=403)=>reply({ok:false,code},status);
const reply=(data,status=200)=>new Response(JSON.stringify(data),{
  status,headers:{'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
});
const plainObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
  (Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const only=(o,names)=>Object.keys(o).every(k=>names.includes(k));
function config(env){
  if(!env||typeof env.SUPABASE_URL!=='string')return null;
  let url;
  try{url=new URL(env.SUPABASE_URL);}catch{return null;}
  if(url.protocol!=='https:'||!/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname)||
     url.pathname!=='/'||url.search||url.hash||url.username||url.password)return null;
  if(!/^sb_publishable_[A-Za-z0-9_-]{10,160}$/.test(env.SUPABASE_PUBLISHABLE_KEY||''))
    return null;
  // The service-role JWT is a server-side Worker SECRET, never a browser key.
  if(typeof env.SUPABASE_SERVICE_ROLE_KEY!=='string'||
     !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(env.SUPABASE_SERVICE_ROLE_KEY))
    return null;
  return url.origin;
}
function validOperation(input){
  if(!plainObject(input)||
     !only(input,['activeTeamId','activeRole','action','resourceId','payload'])||
     !IDENT.test(input.activeTeamId||'')||
     !IDENT.test(input.resourceId||'')||
     !ROLES.has(input.activeRole)||!ACTIONS.has(input.action))return null;
  const payload=input.payload??{};
  if(input.action==='roster.read'){
    if(!plainObject(payload)||Object.keys(payload).length!==0)return null;
    return {...input,payload:{}};
  }
  const parsed=validateFirstTeamActionPayload(input.action,payload);
  if(!parsed)return null;
  return {...input,payload:parsed.payload};
}
function toHex(bytes){
  return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
}
async function digest(accountId,op){
  const data=JSON.stringify([accountId,op.activeTeamId,op.activeRole,
    op.action,op.resourceId,op.payload]);
  return toHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data)));
}
async function provider(fetchImpl,url,init){
  const res=await fetchImpl(url,{...init,cache:'no-store',redirect:'error'});
  if(!res?.ok)return null;
  try{return await res.json();}catch{return null;}
}

export async function handleStage1Request(request,env,fetchImpl=fetch){
  try{
    const url=new URL(request.url);
    const management=url.pathname==='/api/stage3b/v1/operation';
    if(request.method!=='POST'||(url.pathname!=='/api/stage1/v1/operation'&&!management)||
       url.search||url.hash)return deny('not-found',404);
    const origin=request.headers.get('Origin');
    if(origin && origin!==url.origin)return deny('origin-denied');
    const host=config(env);
    if(!host)return deny('service-unavailable',503);
    const auth=request.headers.get('Authorization')||'';
    if(!/^Bearer [A-Za-z0-9._~-]{12,8192}$/.test(auth))
      return deny('unauthenticated',401);
    if(request.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json')
      return deny('invalid-request',400);
    const raw=await request.text();
    if(raw.length>16384)return deny('invalid-request',400);
    let input;
    try{input=JSON.parse(raw);}catch{return deny('invalid-request',400);}
    const op=validOperation(input);
    if(!op||MANAGEMENT_ACTIONS.has(op.action)!==management)return deny('invalid-request',400);
    const token=auth.slice(7);
    const user=await provider(fetchImpl,host+'/auth/v1/user',{
      method:'GET',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,
        Authorization:'Bearer '+token}
    });
    if(!user||!UUID.test(user.id||''))return deny('unauthenticated',401);
    // Supply account ID only from Supabase Auth verification; never from client.
    const checksum=Object.hasOwn(op.payload,'mutationId')?
      await digest(user.id,op):null;
    const endpoint=management?'tm_stage3b_operation':'tm_stage1_operation';
    const result=await provider(fetchImpl,host+'/rest/v1/rpc/'+endpoint,{
      method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type':'application/json'},
      body:JSON.stringify({p_account:user.id,p_team:op.activeTeamId,
        p_role:op.activeRole,p_action:op.action,p_resource:op.resourceId,
        p_payload:op.payload,p_digest:checksum})
    });
    if(!plainObject(result)||typeof result.ok!=='boolean'||
       !SAFE_CODES.has(result.code)||Object.keys(result).some(k=>
         !['ok','code','data','resourceId','version'].includes(k)))
      return deny('service-unavailable',503);
    if(result.ok===false){
      const status=result.code.startsWith('stale-')||result.code==='mutation-id-reused'?409:403;
      return deny(result.code,status);
    }
    if(!['permitted','committed'].includes(result.code))
      return deny('service-unavailable',503);
    if(result.code==='committed'){
      if(!IDENT.test(result.resourceId||'')||
         !Number.isSafeInteger(result.version)||result.version<0)
        return deny('service-unavailable',503);
      return reply({ok:true,code:'committed',resourceId:result.resourceId,version:result.version});
    }
    if(!Array.isArray(result.data)||result.data.length>500)
      return deny('service-unavailable',503);
    // Data shape is constrained by the audited SQL projection, never arbitrary
    // JSON submitted by the request. No response cache or error stack.
    return reply({ok:true,code:'permitted',data:result.data});
  }catch{
    return deny('service-unavailable',503);
  }
}
export default {fetch:handleStage1Request};
