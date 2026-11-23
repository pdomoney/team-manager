import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import {prePolicyInvitationAction} from '../worker/stage3d4b-invitation-gate.js';

const origin='https://team-manager.example.test';
const auth='Bearer verified-adult-invitee-token-123456789';
const invite='invite-'+'a'.repeat(32);
const user='11111111-1111-4111-8111-111111111111';
const env=Object.freeze({
  STAGE3D3_REGISTRATION_MODE:'required',
  STAGE3D4_OWNER_ADMIN_MODE:'enabled',
  STAGE3D3_EXISTING_SHARED_WORKER_MODE:'preserve-legacy-pages',
  SUPABASE_URL:'https://approved-first-team.supabase.co',
  SUPABASE_PUBLISHABLE_KEY:'sb_publishable_firstTeamSyntheticOnly123456',
  SUPABASE_SECRET_KEY:'sb_secret_syntheticServerOnlyNotARealCredential123456'
});
function req(value,headers={},path='/api/stage3/v1/onboarding'){
  return new Request(origin+path,{
    method:'POST',headers:{Authorization:auth,'Content-Type':'application/json',...headers},
    body:JSON.stringify(value)
  });
}
const reply=(body,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{'Content-Type':'application/json'}
});
async function withStub(call){
  const previous=globalThis.fetch;
  const upstream=[];
  globalThis.fetch=async(url,init)=>{
    const u=new URL(url);
    const payload=init.body?JSON.parse(init.body):null;
    upstream.push({path:u.pathname,action:payload?.p_action,
      actor:payload?.p_actor});
    if(u.pathname==='/auth/v1/user')
      return reply({id:user,email:'invited@example.test',
        email_confirmed_at:'2026-11-23T00:00:00Z'});
    if(u.pathname==='/rest/v1/rpc/tm_stage3d3_registration')
      return reply({ok:false,code:'policy-unavailable',canProceed:false});
    if(u.pathname==='/rest/v1/rpc/tm_stage3_onboarding'){
      assert.equal(payload.p_actor,user);
      assert.equal(payload.p_actor_email,'invited@example.test');
      if(payload.p_action==='list.mine')
        return reply({ok:true,code:'permitted',data:[{
          invitationId:invite,teamId:'stgeorge-mixed20',
          teamRole:'team_manager',status:'approved',
          expiresAt:'2026-11-30T00:00:00Z'}]});
      if(payload.p_action==='claim')
        return reply({ok:true,code:'claimed',invitationId:invite});
      throw Error('Unexpected privileged operation past policy gate');
    }
    throw Error('Unexpected route '+u.pathname);
  };
  try{return await call(upstream);}
  finally{globalThis.fetch=previous;}
}
test('routing exemption contains exactly self-invitation list and claim',async()=>{
  const listed=req({action:'list.mine'});
  const claimed=req({action:'claim',invitationId:invite});
  assert.equal(await prePolicyInvitationAction(listed,env),true);
  assert.equal(await prePolicyInvitationAction(claimed,env),true);
  for(const input of [
    {action:'invite.issue',email:'other@example.test'},
    {action:'propose',teamId:'stgeorge-mixed20',role:'team_coach',
      email:'other@example.test',targetRole:'team_player'},
    {action:'claim',invitationId:invite,role:'platform_owner'},
    {action:'claim',invitationId:'invite-invalid'},
    {action:'list.mine',teamId:'stgeorge-mixed20'},
    {action:'activate',invitationId:invite},
    {action:'list.team',teamId:'stgeorge-mixed20',role:'team_coach'}
  ])assert.equal(await prePolicyInvitationAction(req(input),env),false,
    JSON.stringify(input));
  assert.equal(await prePolicyInvitationAction(listed,{...env,
    STAGE3D4_OWNER_ADMIN_MODE:'disabled'}),false);
  assert.equal(await prePolicyInvitationAction(new Request(origin+'/api/stage3/v1/onboarding',
    {method:'GET'}),env),false);
  assert.equal(await prePolicyInvitationAction(req({action:'list.mine'},
    {},'/api/stage1/v1/operation'),env),false);
});
test('new invitee can list only email-scoped invitations before policy, without team operations',async()=>{
  await withStub(async calls=>{
    const r=await worker.fetch(req({action:'list.mine'}),env);
    assert.equal(r.status,200);
    const data=await r.json();
    assert.equal(data.code,'permitted');
    assert.equal(data.data.length,1);
    assert.deepEqual(calls.map(c=>c.path),[
      '/auth/v1/user','/rest/v1/rpc/tm_stage3_onboarding'
    ]);
    assert.equal(calls[1].action,'list.mine');
  });
});
test('new invitee may claim exact invitation before policy but cannot activate it',async()=>{
  await withStub(async calls=>{
    const r=await worker.fetch(req({action:'claim',invitationId:invite}),env);
    assert.equal(r.status,200);
    const data=await r.json();
    assert.equal(data.code,'claimed');
    assert.equal(data.invitationId,invite);
    assert.equal(calls[1].action,'claim');
  });
  await withStub(async calls=>{
    const r=await worker.fetch(req({action:'activate',teamId:'stgeorge-mixed20',
      role:'team_coach',invitationId:invite}),env);
    assert.equal(r.status,503);
    assert.equal((await r.json()).code,'policy-unavailable');
    assert(!calls.some(c=>c.path==='/rest/v1/rpc/tm_stage3_onboarding'));
  });
});
test('pre-policy claim never bypasses authenticating user, origin or route',async()=>{
  await withStub(async calls=>{
    let r=await worker.fetch(req({action:'list.mine'},
      {Authorization:''}),env);
    assert.equal(r.status,401);
    assert.equal(calls.length,0);
    r=await worker.fetch(req({action:'claim',invitationId:invite},
      {Origin:'https://untrusted.example.test'}),env);
    assert.equal(r.status,403);
    assert.equal(calls.length,0);
  });
});
test('legacy shared demo and Stage 3C do not receive pre-policy exceptions',async()=>{
  assert.equal(await prePolicyInvitationAction(req({action:'list.mine'}),
    {...env,STAGE3D3_REGISTRATION_MODE:undefined}),false);
  assert.equal(await prePolicyInvitationAction(req({action:'list.mine'}),
    {...env,STAGE3D3_EXISTING_SHARED_WORKER_MODE:undefined}),false);
});
