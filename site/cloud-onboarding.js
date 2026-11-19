// Stage 3A signed-in onboarding, one exact active team role per reviewer.
// The server checks all authority; the browser never supplies target account IDs,
// approval evidence, service keys or an inferred organisational permission.
const IDENT=/^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$/;
const INVITE=/^invite-[0-9a-f]{32}$/;
const ROLES=new Set(['team_coach','team_manager']);
const TARGET=new Set([...ROLES,'team_assistant','team_player','team_volunteer']);
const ACTIONS=new Set(['list.mine','list.team','propose','approve','deliver',
  'claim','activate','revoke','cancel']);
const fail=code=>Object.assign(new Error(code),{code});
export function createCloudOnboardingClient({identity,fetchImpl=fetch,origin}={}){
  if(!identity||typeof identity.verifiedBearer!=='function'||
     typeof fetchImpl!=='function')throw new TypeError('missing-auth-boundary');
  let base;
  try{base=new URL(origin);}catch{throw new TypeError('invalid-origin');}
  const local=['localhost','127.0.0.1','[::1]'].includes(base.hostname);
  if(base.username||base.password||base.search||base.hash||base.pathname!=='/'||
    (base.protocol!=='https:'&&!(base.protocol==='http:'&&local)))
    throw new TypeError('invalid-origin');
  async function call({action,teamId,role,invitationId,email,targetRole}){
    if(!ACTIONS.has(action))throw fail('invalid-request');
    if(action==='list.mine'||action==='claim'){
      if(teamId||role||email||targetRole||
        (action==='claim'&&!INVITE.test(invitationId||''))||
        (action==='list.mine'&&invitationId))throw fail('invalid-request');
    }else if(!IDENT.test(teamId||'')||!ROLES.has(role)||
      (action==='propose'&&(!TARGET.has(targetRole)||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email||'')))||
      (!['list.team','propose'].includes(action)&&!INVITE.test(invitationId||'')))
      throw fail('invalid-request');
    const bearer=await identity.verifiedBearer();
    const body={action,...(teamId?{teamId,role}:{}),
      ...(invitationId?{invitationId}:{}),
      ...(email?{email:email.trim().toLowerCase()}:{}),
      ...(targetRole?{targetRole}:{})};
    let response;
    try{response=await fetchImpl(new URL('/api/stage3/v1/onboarding',base).href,{
      method:'POST',mode:'same-origin',credentials:'omit',cache:'no-store',
      redirect:'error',headers:{'Content-Type':'application/json',
        Authorization:'Bearer '+bearer},body:JSON.stringify(body)
    });}catch{throw fail('network-unavailable');}
    let result;
    try{result=await response.json();}catch{throw fail('invalid-server-response');}
    if(!response.ok||result?.ok!==true){
      const code=result?.code;
      const allowed=new Set(['scope-denied','self-approval-denied',
        'invitation-unavailable','already-pending','already-active',
        'account-inactive','person-not-verified','unauthenticated',
        'service-unavailable','origin-denied']);
      throw fail(allowed.has(code)?code:'request-denied');
    }
    if(result.code==='permitted'){
      if(!Array.isArray(result.data)||result.data.length>100)
        throw fail('invalid-server-response');
      return result.data;
    }
    if(!INVITE.test(result.invitationId||''))
      throw fail('invalid-server-response');
    const allowedDelivery=[undefined,'sent','failed','existing-account'];
    if(!allowedDelivery.includes(result.delivery))
      throw fail('invalid-server-response');
    return {code:result.code,invitationId:result.invitationId,
      delivery:result.delivery||null};
  }
  const admin=(ctx,action,other={})=>{
    if(!ctx||!IDENT.test(ctx.teamId||'')||!ROLES.has(ctx.role))
      return Promise.reject(fail('scope-denied'));
    return call({action,teamId:ctx.teamId,role:ctx.role,...other});
  };
  return Object.freeze({
    listMine:()=>call({action:'list.mine'}),
    claim:invitationId=>call({action:'claim',invitationId}),
    listTeam:ctx=>admin(ctx,'list.team'),
    propose:(ctx,email,targetRole)=>admin(ctx,'propose',{email,targetRole}),
    approve:(ctx,invitationId)=>admin(ctx,'approve',{invitationId}),
    resend:(ctx,invitationId)=>admin(ctx,'deliver',{invitationId}),
    activate:(ctx,invitationId)=>admin(ctx,'activate',{invitationId}),
    cancel:(ctx,invitationId)=>admin(ctx,'cancel',{invitationId}),
    revoke:(ctx,invitationId)=>admin(ctx,'revoke',{invitationId})
  });
}
