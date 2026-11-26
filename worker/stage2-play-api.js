// Stage 2 play API. Team membership, a selected role and publication authority
// are independently enforced by the database. A valid bearer alone is not a grant.
import {validateFirstTeamActionPayload} from '../src/first-team-action-contract.js';
import {adminHeaders,isApprovedProjectConfig} from './supabase-admin-key.js';
import {publishedPlayEventTimeline,loadPlayEventDraft} from '../site/play-event-persistence.js';
import {validConnectedE5Play} from '../site/cloud-e5-payload.js';
const ROLES=new Set(['team_coach','team_assistant','team_manager','team_player','team_play_viewer']);
const ACTIONS=new Set(['play.published.read','play.draft.read','play.draft.edit','play.publish']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID=/^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$/;
const PLAYER_PLAY_FIELDS=new Set(['id','name','sport','category','headline',
  'when','steps','side','builtin','rev','edited','players','defence',
  'moves','focus','ghost','view','tags','notes','labels','title',
  'phases','set','who','study','rules','eventTimeline']);
function publishedProjection(play){
  const out=Object.fromEntries(Object.entries(play).filter(([k])=>PLAYER_PLAY_FIELDS.has(k)));
  if(Object.hasOwn(out,'eventTimeline')){
    const timeline=publishedPlayEventTimeline(out);
    delete out.eventTimeline;
    if(timeline)out.eventTimeline=timeline;
  }
  return out;
}
const ERRORS=new Set(['invalid-command','invalid-mutation','invalid-read','forged-field',
  'scope-denied','account-inactive','role-denied','person-not-verified',
  'participation-not-verified','resource-out-of-scope','invalid-play',
  'stale-play','revision-not-draft','mutation-id-reused']);
const json=(body,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
});
const deny=(code,status=403)=>json({ok:false,code},status);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function config(env){
  return isApprovedProjectConfig(env)?new URL(env.SUPABASE_URL).origin:null;
}

async function provider(fetchImpl,url,options){
  const res=await fetchImpl(url,{...options,cache:'no-store',redirect:'manual'});
  if(!res?.ok)return null;
  try{return await res.json();}catch{return null;}
}
export async function handleStage2PlayRequest(request,env,fetchImpl=fetch){
  try{
    const url=new URL(request.url);
    if(url.pathname!=='/api/stage2/v1/play'||request.method!=='POST'
      ||url.search||url.hash)return deny('not-found',404);
    const origin=request.headers.get('Origin');
    if(origin&&origin!==url.origin)return deny('origin-denied');
    const base=config(env);
    if(!base)return deny('service-unavailable',503);
    const auth=request.headers.get('Authorization')||'';
    if(!/^Bearer [A-Za-z0-9._~-]{12,8192}$/.test(auth))return deny('unauthenticated',401);
    if(request.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json')
      return deny('invalid-request',400);
    const raw=await request.text();
    if(raw.length>131072)return deny('invalid-request',400);
    let op;
    try{op=JSON.parse(raw);}catch{return deny('invalid-request',400);}
    if(!object(op)||Object.keys(op).some(k=>!['activeTeamId','activeRole','action','resourceId','payload'].includes(k))
      ||!ID.test(op.activeTeamId||'')||!ID.test(op.resourceId||'')
      ||!ROLES.has(op.activeRole)||!ACTIONS.has(op.action))
      return deny('invalid-request',400);
    const payload=validateFirstTeamActionPayload(op.action,op.payload??{});
    if(!payload)return deny('invalid-request',400);
    const token=auth.slice(7);
    const user=await provider(fetchImpl,base+'/auth/v1/user',{
      method:'GET',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,
        Authorization:'Bearer '+token}
    });
    if(!user||!UUID.test(user.id||''))return deny('unauthenticated',401);
    const normalized=payload.payload;
    const strict=env?.STAGE4_TACTICS_MODE==='enabled';
    // Stage 2 must not import a stale or malformed authored E5 timeline
    // into a published workflow merely because the JSON envelope is valid.
    if(op.action==='play.draft.edit'){
      const candidate=normalized.command?.play;
      if((strict&&!validConnectedE5Play(candidate))||!candidate||typeof candidate!=='object'||Array.isArray(candidate)
        ||typeof candidate.name!=='string'||!candidate.name.trim()
        ||!candidate.players||typeof candidate.players!=='object'
        ||Array.isArray(candidate.players)||!Array.isArray(candidate.moves)
        ||(Object.hasOwn(candidate,'eventTimeline')
          &&loadPlayEventDraft(candidate).status!=='ready'))
        return deny('invalid-request',400);
    }
    const digest=Object.hasOwn(normalized,'mutationId')?
      Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
        new TextEncoder().encode(JSON.stringify([user.id,op.activeTeamId,op.activeRole,
          op.action,op.resourceId,normalized])))),
        b=>b.toString(16).padStart(2,'0')).join(''):null;
    // Validate the exact latest draft before publication, including nested
    // diagram data. The transactional RPC rechecks version and revision after
    // this read, so a concurrent edit cannot publish an unreviewed record.
    if(strict&&op.action==='play.publish'){
      const check=await provider(fetchImpl,base+'/rest/v1/rpc/tm_stage2_play_operation',{
        method:'POST',headers:{...adminHeaders(env),'Content-Type':'application/json'},
        body:JSON.stringify({p_account:user.id,p_team:op.activeTeamId,p_role:op.activeRole,
          p_action:'play.draft.read',p_resource:op.activeTeamId,p_payload:{},p_digest:null})
      });
      const row=check?.ok===true&&Array.isArray(check.data)?
        check.data.find(x=>x.playId===op.resourceId&&x.revisionId===normalized.revisionId&&
          x.version===normalized.expectedVersion&&x.revisionStatus==='draft'):null;
      if(!row)return deny('stale-play',409);
      if(!validConnectedE5Play(row.play))return deny('invalid-request',400);
    }
    const result=await provider(fetchImpl,base+'/rest/v1/rpc/tm_stage2_play_operation',{
      method:'POST',headers:{...adminHeaders(env),'Content-Type':'application/json'},
      body:JSON.stringify({p_account:user.id,p_team:op.activeTeamId,p_role:op.activeRole,
        p_action:op.action,p_resource:op.resourceId,p_payload:normalized,p_digest:digest})
    });
    if(!object(result)||typeof result.ok!=='boolean'||!['committed','permitted',...ERRORS].includes(result.code)
      ||Object.keys(result).some(k=>!['ok','code','data','resourceId','version','revisionId'].includes(k)))
      return deny('service-unavailable',503);
    if(!result.ok){
      if(!ERRORS.has(result.code))return deny('service-unavailable',503);
      return deny(result.code,result.code.startsWith('stale-')||result.code==='mutation-id-reused'?409:403);
    }
    if(result.code==='committed'){
      if(!ID.test(result.resourceId||'')||!ID.test(result.revisionId||'')
        ||!Number.isSafeInteger(result.version)||result.version<0)
        return deny('service-unavailable',503);
      return json({ok:true,code:'committed',resourceId:result.resourceId,
        revisionId:result.revisionId,version:result.version});
    }
    if(result.code!=='permitted'||!Array.isArray(result.data)||result.data.length>200
      ||result.data.some(x=>!object(x)||!ID.test(x.playId||'')
        ||!ID.test(x.revisionId||'')||!object(x.play)
        ||typeof x.play.name!=='string'||!Number.isSafeInteger(x.version)))
      return deny('service-unavailable',503);
    const safe=result.data.map(x=>{
      const published=op.action==='play.published.read';
      const projected=published?publishedProjection(x.play):x.play;
      // One unavailable placeholder per invalid published revision, rather
      // than dropping rows or exposing unsupported/private nested content.
      const unavailable=strict&&published&&(!validConnectedE5Play(x.play)||!validConnectedE5Play(projected));
      return {playId:x.playId,revisionId:x.revisionId,version:x.version,
        play:unavailable?{id:x.playId,name:'Published play requires review'}:projected,
        ...(unavailable?{unavailableReason:'unsupported-play-payload'}:{}),
        ...(!published?{revisionStatus:x.revisionStatus,publishedRevisionId:x.publishedRevisionId}:{})};
    });
    return json({ok:true,code:'permitted',data:safe});
  }catch{return deny('service-unavailable',503);}
}
