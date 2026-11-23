// Connected first-team management. The browser carries only the selected team
// and one matching Coach/Manager grant. Every request is rechecked by GoTrue,
// registration policy and private Supabase SQL. No service key in the browser.
const own=x=>x&&typeof x==='object'&&!Array.isArray(x);
const ERRORS=new Set(['invalid-request','scope-denied','role-denied','stale-version',
 'already-assigned','invite-unavailable','verified-identity-required',
 'activation-preflight-denied','person-not-verified','grant-unavailable',
 'unauthenticated','network-unavailable','service-unavailable']);
const fail=code=>Object.assign(new Error(code),{code});
export function createCloudManagementClient({identity,fetchImpl=fetch,origin}={}){
 if(!identity||typeof identity.verifiedBearer!=='function'||
  typeof identity.myTeamContexts!=='function'||typeof fetchImpl!=='function')
  throw new TypeError('missing-identity');
 const base=new URL(origin);
 const local=['localhost','127.0.0.1','[::1]'].includes(base.hostname);
 if((base.protocol!=='https:'&&!(local&&base.protocol==='http:'))||
   base.pathname!=='/'||base.search||base.hash||base.username||base.password)
  throw new TypeError('invalid-origin');
 async function call(ctx,action,input={}){
  if(!own(ctx)||!own(input)||typeof action!=='string'||
    !['team_coach','team_manager'].some(role=>ctx.roles?.includes(role)))
   throw fail('scope-denied');
  const grants=await identity.myTeamContexts();
  const role=['team_manager','team_coach'].find(role=>
    ctx.roles.includes(role)&&grants.some(g=>g.teamId===ctx.teamId&&g.role===role));
  if(!role)throw fail('access-revoked');
  const bearer=await identity.verifiedBearer();
  let response;
  try{response=await fetchImpl(new URL('/api/stage3d5/v1/team',base),{
    method:'POST',mode:'same-origin',credentials:'omit',cache:'no-store',
    redirect:'error',headers:{'Content-Type':'application/json',
      Authorization:'Bearer '+bearer},
    body:JSON.stringify({teamId:ctx.teamId,role,action,input})
  });}catch{throw fail('network-unavailable');}
  let value;try{value=await response.json();}catch{throw fail('service-unavailable');}
  if(!response.ok||!own(value)||value.ok!==true)
    throw fail(ERRORS.has(value?.code)?value.code:'service-unavailable');
  if(!['committed','permitted'].includes(value.code)||!own(value.data)&&
     !Array.isArray(value.data))throw fail('service-unavailable');
  return value.data;
 }
 return Object.freeze({call});
}
