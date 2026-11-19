import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handleStage3Onboarding} from '../worker/stage3-onboarding-api.js';
import {createCloudOnboardingClient} from '../site/cloud-onboarding.js';
import {createCloudIdentityClient} from '../site/cloud-identity.js';
import worker from '../worker/index.js';

const account='11111111-1111-4111-8111-111111111111';
const team='comets-onboarding';
const host='https://synthetic-onboarding.supabase.co';
const email='coach@fictional.test';
const secret='fictional.jwt.service_only';
const env={SUPABASE_URL:host+'/',
  SUPABASE_PUBLISHABLE_KEY:'sb_publishable_stage3aFakePublic123',
  SUPABASE_SERVICE_ROLE_KEY:secret,
  ONBOARDING_REDIRECT_URL:'https://team-manager.example.test/cloud-access.html'};
const target='invite-12345678123412341234123456781234';
const headers={'Content-Type':'application/json',
  Authorization:'Bearer test-signed-staging-bearer-token-xyz'};
const request=(input,extra={})=>new Request('https://team-manager.example.test/api/stage3/v1/onboarding',{
  method:'POST',headers:{...headers,...extra},body:JSON.stringify(input)});
const body=(action='list.team',options={})=>({
  action,teamId:team,role:'team_coach',...options
});
const ok=(data,status=200)=>({ok:true,status,json:async()=>data});
const authUser={id:account,email,email_confirmed_at:'2026-11-19T00:00:00Z'};
function fakeServer({auth=authUser,sql=null,inviteStatus=200,inviteError='user_already_exists'}={}){
  const calls=[];
  const fetchImpl=async(url,init)=>{
    const parsed=new URL(url),path=parsed.pathname;
    const payload=init.body?JSON.parse(init.body):null;
    calls.push({path,parsed,payload,init});
    if(path==='/auth/v1/user')return ok(auth);
    if(path==='/rest/v1/rpc/tm_stage3_onboarding')return ok(
      sql||{ok:true,code:'permitted',data:[]});
    if(path==='/rest/v1/rpc/tm_stage3_delivery_result')return ok({ok:true});
    if(path==='/auth/v1/invite')return {ok:inviteStatus<400,status:inviteStatus,
      json:async()=>inviteStatus>=400?{code:inviteError}:{id:'never-expose-provider-user'}};
    return {ok:false,status:404,json:async()=>({private:'no'})};
  };
  return {calls,fetchImpl};
}
test('Stage 3A Worker does not expose unknown API routes or unverified users',async()=>{
  let touched=false;
  const fallback=await worker.fetch(new Request('https://team-manager.example.test/api/stage3/admin'),{
    ASSETS:{fetch:async()=>{touched=true;return new Response('unsafe');}}
  });
  assert.equal(fallback.status,404);
  assert.equal(touched,false);
  const fake=fakeServer();
  for(const invalid of [
    request(body(),{Origin:'https://foreign.example.test'}),
    request(body(),{Authorization:'not a bearer'}),
    request({...body(),p_actor:account}),
    request({...body(),role:'platform_owner'}),
    request({...body('propose',{email:'invalid',targetRole:'team_player'})})
  ]){
    const result=await handleStage3Onboarding(invalid,env,fake.fetchImpl);
    assert.equal(result.ok,false);
  }
  assert.equal(fake.calls.length,0,'invalid request cannot contact Auth or SQL');
  const unconfirmed=fakeServer({auth:{id:account,email}});
  const denied=await handleStage3Onboarding(request(body()),env,unconfirmed.fetchImpl);
  assert.equal(denied.status,401);
  assert.equal(unconfirmed.calls.filter(c=>c.path.includes('tm_stage3')).length,0);
});
test('Stage 3A SQL uses verified identity and never sends email for proposal',async()=>{
  const fake=fakeServer({sql:{ok:true,code:'proposed',invitationId:target}});
  const response=await handleStage3Onboarding(request(body('propose',{
    email:'member@fictional.test',targetRole:'team_player'})),env,fake.fetchImpl);
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{ok:true,code:'proposed',invitationId:target});
  const rpc=fake.calls.find(c=>c.path==='/rest/v1/rpc/tm_stage3_onboarding');
  assert.equal(rpc.payload.p_actor,account);
  assert.equal(rpc.payload.p_actor_email,email);
  assert.equal(rpc.payload.p_team,team);
  assert.equal(rpc.payload.p_target_role,'team_player');
  assert.equal(rpc.payload.p_email,'member@fictional.test');
  assert(!fake.calls.some(c=>c.path==='/auth/v1/invite'),
    'unapproved proposal must not send an invitation');
  assert(!fake.calls.some(c=>JSON.stringify(c.payload||{}).includes('service-role-admin-pass')));
});
test('Stage 3A independent approval sends server-side provider invite, redacts email',async()=>{
  const fake=fakeServer({sql:{ok:true,code:'approved',invitationId:target,
    internalEmail:'member@fictional.test'}});
  const response=await handleStage3Onboarding(request(body('approve',{
    invitationId:target})),env,fake.fetchImpl);
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{ok:true,code:'approved',
    invitationId:target,delivery:'sent'});
  const delivered=fake.calls.find(c=>c.path==='/auth/v1/invite');
  assert(delivered);
  assert.equal(delivered.payload.email,'member@fictional.test');
  assert.equal(delivered.init.headers.apikey,secret);
  assert.equal(delivered.parsed.searchParams.get('redirect_to'),
    env.ONBOARDING_REDIRECT_URL);
  const recorded=fake.calls.find(c=>c.path.includes('tm_stage3_delivery_result'));
  assert.equal(recorded.payload.p_result,'sent');
  const already=fakeServer({sql:{ok:true,code:'approved',invitationId:target,
    internalEmail:'member@fictional.test'},inviteStatus:422});
  const again=await handleStage3Onboarding(request(body('deliver',{
    invitationId:target})),env,already.fetchImpl);
  assert.equal((await again.json()).delivery,'existing-account');
  const invalidEmail=fakeServer({sql:{ok:true,code:'approved',
    invitationId:target,internalEmail:'member@fictional.test'},
    inviteStatus:422,inviteError:'email_address_invalid'});
  const invalid=await handleStage3Onboarding(request(body('deliver',{
    invitationId:target})),env,invalidEmail.fetchImpl);
  assert.equal((await invalid.json()).delivery,'failed');
  const missing={...env,ONBOARDING_REDIRECT_URL:undefined};
  const unconfigured=fakeServer({sql:{ok:true,code:'approved',invitationId:target,
    internalEmail:'member@fictional.test'}});
  const noMail=await handleStage3Onboarding(request(body('approve',{
    invitationId:target})),missing,unconfigured.fetchImpl);
  assert.equal((await noMail.json()).delivery,'failed');
  assert(!unconfigured.calls.some(c=>c.path==='/auth/v1/invite'));
});
test('Stage 3A Worker propagates only narrow denial and list results',async()=>{
  const denied=fakeServer({sql:{ok:false,code:'self-approval-denied',
    internalEmail:'private@fictional.test'}});
  const res=await handleStage3Onboarding(request(body('approve',{
    invitationId:target})),env,denied.fetchImpl);
  assert.equal(res.status,403);
  assert.deepEqual(await res.json(),{ok:false,code:'self-approval-denied'});
  const bad=fakeServer({sql:{ok:true,code:'permitted',
    data:[{invitationId:target,internalEmail:'private@fictional.test'}]}});
  const badResponse=await handleStage3Onboarding(request(body()),env,bad.fetchImpl);
  assert.equal(badResponse.status,503);
  const mine=fakeServer({sql:{ok:true,code:'permitted',data:[{
    invitationId:target,teamId:team,teamRole:'team_player',
    status:'approved',expiresAt:'2026-11-26T00:00:00Z'}]}});
  const accepted=await handleStage3Onboarding(request({
    action:'list.mine'}),env,mine.fetchImpl);
  assert.equal((await accepted.json()).data[0].teamId,team);
});
test('Stage 3A client sends one team role, but never account or Person IDs',async()=>{
  const calls=[];
  const fake=async(url,init)=>{
    calls.push({url,body:JSON.parse(init.body),init});
    return ok({ok:true,code:'proposed',invitationId:target});
  };
  const identity={verifiedBearer:async()=>'fake-signed-bearer-token'};
  const client=createCloudOnboardingClient({
    identity,fetchImpl:fake,origin:'https://team-manager.example.test'});
  const result=await client.propose({teamId:team,role:'team_coach'},
    'adult@fictional.test','team_player');
  assert.equal(result.code,'proposed');
  assert.deepEqual(calls[0].body,{action:'propose',teamId:team,role:'team_coach',
    email:'adult@fictional.test',targetRole:'team_player'});
  assert.equal(calls[0].init.credentials,'omit');
  assert.equal(calls[0].init.mode,'same-origin');
  await assert.rejects(client.propose({teamId:team,role:'platform_owner'},
    'adult@fictional.test','team_player'),{code:'scope-denied'});
  assert.equal(calls.length,1,'owner context cannot make a team invitation');
  await assert.rejects(client.claim('invalid'),{code:'invalid-request'});
});
test('Stage 3A invitation/recovery links never persist passwords or provider claims',async()=>{
  const calls=[],store=new Map();
  const fetchImpl=async(url,init)=>{
    const p=new URL(url);
    calls.push({path:p.pathname,query:p.searchParams,body:init.body?JSON.parse(init.body):null,
      bearer:init.headers.Authorization});
    if(p.pathname==='/auth/v1/user'&&init.method==='PUT')
      return ok({id:account});
    if(p.pathname==='/auth/v1/user')return ok({id:account,email});
    if(p.pathname==='/auth/v1/recover')return ok({});
    return {ok:false,status:404};
  };
  const client=createCloudIdentityClient({
    url:host,publishableKey:env.SUPABASE_PUBLISHABLE_KEY,fetchImpl,
    storage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),
      removeItem:k=>store.delete(k)},now:()=>Date.UTC(2026,10,19,0)
  });
  assert.equal(await client.requestPasswordRecovery('ADULT@FICTIONAL.TEST',
    'https://team-manager.example.test/cloud-access.html'),true);
  assert.equal(calls[0].body.email,'adult@fictional.test');
  await assert.rejects(client.acceptAuthLink('#type=invite&access_token=short'),
    {code:'invalid-auth-link'});
  const fragment='#type=invite&access_token=synthetic-access-token-abcdef1234'+
    '&refresh_token=synthetic-refresh-token-abcdef1234&expires_in=3600';
  assert.equal(await client.acceptAuthLink(fragment),'invite');
  assert.equal(await client.setPassword('valid-strong-password-2026'),true);
  assert(![...store.values()].some(x=>x.includes('valid-strong-password-2026')));
  assert.equal(calls.filter(x=>x.path==='/auth/v1/user'&&x.body?.password).length,1);
  await assert.rejects(client.setPassword('short'),{code:'invalid-input'});
});
test('Stage 3A private onboarding SQL keeps grants and evidence separated',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/20261119040000_stage3a_onboarding.sql',
    import.meta.url),'utf8');
  assert.match(sql,/team_invitations force row level security/);
  assert.match(sql,/proposed_by<>p_actor/);
  assert.match(sql,/g\.team_id=p_team/);
  assert.match(sql,/g\.policy_version=1/);
  assert.match(sql,/status='claimed'/);
  assert.match(sql,/status='active',approved_by=p_actor/);
  assert.match(sql,/grant execute on function public\.tm_stage3_onboarding\([\s\S]*to service_role;/);
  assert.doesNotMatch(sql,/grant (select|insert|update|delete) on tm_private\.team_invitations to authenticated/i);
});
