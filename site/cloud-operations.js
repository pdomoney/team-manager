// Stage 2: the browser is a client only; it never supplies account/person IDs,
 // approval claims, service credentials or inferred grants.
const ROLES=new Set(['team_coach','team_assistant','team_manager',
  'team_player','team_volunteer','team_play_viewer']);
const OPERATIONS=new Set(['schedule.read','schedule.edit','roster.read','roster.edit',
  'availability.reply','duty.read','duty.reply','duty.assign',
  'play.published.read','play.draft.read','play.draft.edit','play.publish']);
const MANAGEMENT=new Set(['attendance.read','availability.board','duty.board','notices.read','report.summary','roster.approve','event.create','event.change','attendance.record','availability.transcribe','duty.label','duty.withdraw','notice.create','notice.publish','notice.archive']);
for(const action of MANAGEMENT)OPERATIONS.add(action);
const ID=/^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$/;
const PLAYS=new Set(['play.published.read','play.draft.read','play.draft.edit','play.publish']);
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x);
function safeError(code){return Object.assign(new Error(code),{code});}
export function createCloudOperationsClient({identity,fetchImpl=fetch,origin}={}){
  if(!identity||typeof identity.myTeamContexts!=='function'||
    typeof identity.verifiedBearer!=='function'||typeof fetchImpl!=='function')
    throw new TypeError('missing-auth-boundary');
  let base;
  try{base=new URL(origin);}catch{throw new TypeError('invalid-origin');}
  const loopback=['localhost','127.0.0.1','[::1]'].includes(base.hostname);
  if((base.protocol!=='https:'&&!(base.protocol==='http:'&&loopback))||
    base.username||base.password||base.search||base.hash||
    base.pathname!=='/'||(base.port&&!loopback))
    throw new TypeError('invalid-origin');
  async function operation(ctx,action,resourceId,payload={}){
    if(!obj(ctx)||!ID.test(ctx.teamId||'')||!ROLES.has(ctx.role)||
      !OPERATIONS.has(action)||!ID.test(resourceId||'')||!obj(payload))
      throw safeError('invalid-request');
    // Re-read exact active grants. Changing a role/team never pools old grants.
    const grants=await identity.myTeamContexts();
    if(!grants.some(g=>g.teamId===ctx.teamId&&g.role===ctx.role))
      throw safeError('access-revoked');
    const bearer=await identity.verifiedBearer();
    const path=PLAYS.has(action)?'/api/stage2/v1/play':MANAGEMENT.has(action)?
      '/api/stage3b/v1/operation':'/api/stage1/v1/operation';
    let res;
    try{
      res=await fetchImpl(new URL(path,base).href,{
        method:'POST',mode:'same-origin',credentials:'omit',cache:'no-store',
        redirect:'error',headers:{
          'Content-Type':'application/json','Authorization':'Bearer '+bearer
        },body:JSON.stringify({activeTeamId:ctx.teamId,activeRole:ctx.role,
          action,resourceId,payload})
      });
    }catch{throw safeError('network-unavailable');}
    let result;
    try{result=await res.json();}catch{throw safeError('invalid-server-response');}
    if(!res.ok||!obj(result)||result.ok!==true){
      // Reason codes are deliberately bounded; never surface provider details.
      const allowed=new Set(['role-denied','scope-denied','account-inactive',
        'person-not-verified','participation-not-verified','volunteer-not-verified',
        'stale-or-protected-session','stale-availability','stale-roster',
        'stale-or-invalid-duty','stale-play','revision-not-draft',
        'mutation-id-reused','service-unavailable','session-unavailable',
        'stale-attendance','stale-notice','stale-event','stale-or-external-event']);
      throw safeError(allowed.has(result?.code)?result.code:res.status===401?
        'unauthenticated':'request-denied');
    }
    if(result.code==='permitted'&&Array.isArray(result.data))return result.data;
    if(result.code==='committed'&&ID.test(result.resourceId||'')
      &&Number.isSafeInteger(result.version))return result;
    throw safeError('invalid-server-response');
  }
  return Object.freeze({operation});
}
export const newMutationId=()=>crypto.randomUUID();
