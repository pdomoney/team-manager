import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {handleStage3D4Owner,validateOwnerAction} from '../worker/stage3d4-owner-api.js';
import worker from '../worker/index.js';

const ENDPOINT='https://team-manager.example.test/api/stage3d4/v1/owner';
const USER='55555555-5555-4555-8555-555555555555';
const ACCOUNT='founder@fictional.test';
const TOKEN='Bearer synthetic-verified-adult-token-12345678';
const env=Object.freeze({
  STAGE3D4_OWNER_ADMIN_MODE:'enabled',
  STAGE3D3_REGISTRATION_MODE:'required',
  STAGE3D3_EXISTING_SHARED_WORKER_MODE:'preserve-legacy-pages',
  SUPABASE_URL:'https://first-team-test.supabase.co',
  SUPABASE_PUBLISHABLE_KEY:'sb_publishable_syntheticpublictestkey1234',
  SUPABASE_SECRET_KEY:'sb_secret_testonlynonproductionkey012345',
  ONBOARDING_REDIRECT_URL:'https://team-manager.example.test/cloud-access.html'
});
const response=(data,status=200)=>({ok:status<400,status,
  json:async()=>data});
const req=(payload,headers={})=>new Request(ENDPOINT,{
  method:'POST',headers:{'Content-Type':'application/json',
    Authorization:TOKEN,...headers},body:JSON.stringify(payload)
});
function fake({user={id:USER,email:ACCOUNT,email_confirmed_at:'2026-11-21T04:00:00Z'},
  owner={ok:true,code:'ready',team:null,coachAssigned:false,
    policyReady:false,invitations:[]},delivery=200}={}){
  const calls=[];
  async function fetchImpl(url,opts){
    const u=new URL(url),body=opts.body?JSON.parse(opts.body):null;
    calls.push({path:u.pathname,body,opts});
    if(u.pathname==='/auth/v1/user')return response(user);
    if(u.pathname==='/rest/v1/rpc/tm_stage3d4_owner')return response(
      typeof owner==='function'?owner(body):owner);
    if(u.pathname==='/auth/v1/invite')return response({},delivery);
    if(u.pathname==='/rest/v1/rpc/tm_stage3_delivery_result')
      return response({ok:true});
    throw Error('Unexpected upstream path '+u.pathname);
  }
  return {calls,fetchImpl};
}
test('Owner API refuses unconfigured Worker, wrong origin, anonymous and malformed inputs',async()=>{
  const f=fake();
  const noMode=await handleStage3D4Owner(req({action:'status'}),
    {...env,STAGE3D4_OWNER_ADMIN_MODE:'disabled'},f.fetchImpl);
  assert.equal(noMode.status,503);
  assert.equal(f.calls.length,0);
  const badOrigin=await handleStage3D4Owner(req({action:'status'},
    {Origin:'https://malicious.example.test'}),env,f.fetchImpl);
  assert.equal(badOrigin.status,403);
  const noBearer=await handleStage3D4Owner(req({action:'status'},
    {Authorization:''}),env,f.fetchImpl);
  assert.equal(noBearer.status,401);
  const invalid=await handleStage3D4Owner(req({action:'coach.assign',
    accountId:USER}),env,f.fetchImpl);
  assert.equal(invalid.status,400);
  assert.equal(f.calls.length,0);
});
test('Only exact owner actions and scoped fields are accepted',()=>{
  assert.deepEqual(validateOwnerAction({action:'status'}),{action:'status'});
  assert.equal(validateOwnerAction({action:'status',role:'platform_owner'}),null);
  assert.equal(validateOwnerAction({action:'team.create',teamId:'bad space',
    clubRef:'St George Oztag',sportRef:'oztag',seasonRef:'2026'}),null);
  assert.equal(validateOwnerAction({action:'invite.issue',
    role:'platform_owner',email:'adult@fictional.test'}),null);
  assert.equal(validateOwnerAction({action:'invite.review-adult',
    invitationId:'invite-'+ 'a'.repeat(32),evidenceRef:'not-evidence'}),null);
  assert.equal(validateOwnerAction({action:'invite.issue',role:'team_manager',
    email:'ADULT@FICTIONAL.TEST'}).email,'adult@fictional.test');
});
test('Provider-derived actor identity only and restricted setup status',async()=>{
  const f=fake();
  const r=await handleStage3D4Owner(req({action:'status'}),env,f.fetchImpl);
  assert.equal(r.status,200);
  assert.deepEqual(await r.json(),{ok:true,code:'ready',team:null,
    coachAssigned:false,policyReady:false,invitations:[]});
  const rpc=f.calls.find(x=>x.path==='/rest/v1/rpc/tm_stage3d4_owner');
  assert.equal(rpc.body.p_actor,USER);
  assert.equal(rpc.body.p_action,'status');
  assert.deepEqual(rpc.body.p_input,{});
  assert.equal(rpc.opts.headers.apikey,env.SUPABASE_SECRET_KEY);
  assert(!('Authorization' in rpc.opts.headers),
    'sb_secret_ keys are never sent as JWT');
});
test('Unconfirmed provider user and SQL permission denial never grant owner',async()=>{
  const u=fake({user:{id:USER,email:ACCOUNT,email_confirmed_at:null}});
  const r=await handleStage3D4Owner(req({action:'status'}),env,u.fetchImpl);
  assert.equal(r.status,401);
  assert.equal(u.calls.filter(x=>x.path.includes('tm_stage3d4')).length,0);
  const f=fake({owner:{ok:false,code:'scope-denied'}});
  const denied=await handleStage3D4Owner(req({action:'team.create',
    teamId:'stgeorge-mixed20',clubRef:'St George Oztag',
    sportRef:'oztag',seasonRef:'2026'}),env,f.fetchImpl);
  assert.equal(denied.status,403);
});
test('Admin invite is sent only after service-approved SQL action, never exposes email or secret',async()=>{
  const iid='invite-'+ 'a'.repeat(32);
  const f=fake({owner:body=>body.p_action==='invite.issue'
    ?{ok:true,code:'approved',invitationId:iid,
      internalEmail:'adult@fictional.test'}
    :{ok:false,code:'scope-denied'}});
  const result=await handleStage3D4Owner(req({action:'invite.issue',
    email:'adult@fictional.test',role:'team_manager'}),env,f.fetchImpl);
  assert.equal(result.status,200);
  const data=await result.json();
  assert.deepEqual(data,{ok:true,code:'approved',invitationId:iid,
    delivery:'sent'});
  assert(!JSON.stringify(data).includes('adult@fictional.test'));
  assert(!JSON.stringify(data).includes('sb_secret_'));
  const sent=f.calls.find(x=>x.path==='/auth/v1/invite');
  assert.equal(sent.body.email,'adult@fictional.test');
  assert.equal(sent.opts.headers.apikey,env.SUPABASE_SECRET_KEY);
  assert.equal(f.calls.filter(x=>x.path==='/rest/v1/rpc/tm_stage3_delivery_result').length,1);
  const no=fake({owner:{ok:false,code:'registration-required'}});
  const blocked=await handleStage3D4Owner(req({action:'invite.issue',
    email:'adult@fictional.test',role:'team_manager'}),env,no.fetchImpl);
  assert.equal(blocked.status,403);
  assert(!no.calls.some(x=>x.path==='/auth/v1/invite'));
});
test('Worker mounts new endpoint without altering legacy or unknown API denial',async()=>{
  const f=fake();
  // The Worker uses its default upstream fetch, so without auth it denies
  // locally before any provider call; no live network access.
  const r=await worker.fetch(new Request(ENDPOINT,{method:'POST',
    headers:{'Content-Type':'application/json'},
    body:'{"action":"status"}'}),env);
  assert.equal(r.status,401);
  assert.equal((await r.json()).code,'unauthenticated');
  const wrong=await worker.fetch(new Request('https://team-manager.example.test/api/stage3d4/other'),env);
  assert.equal(wrong.status,404);
});
test('Source preserves owner bootstrap restriction, policy gate, revocation and asset isolation',()=>{
  const sql=fs.readFileSync('supabase/migrations/20261121010000_stage3d4_founder_admin.sql','utf8');
  const bootstrap=fs.readFileSync('supabase/stage3d4/bootstrap_first_owner_SQL_EDITOR.sql','utf8');
  const build=fs.readFileSync('scripts/stage3d3-build.mjs','utf8');
  const legacy=fs.readFileSync('scripts/stage3d3-existing-worker-build.mjs','utf8');
  assert.match(sql,/id smallint primary key default 1 check \(id=1\)/);
  assert.match(sql,/stage3d4_founder_owner/);
  assert.match(sql,/stage3d4_founder_coach/);
  assert.match(sql,/stage3d4_owner_policy_ready\(p_actor\)/);
  assert.match(sql,/administrator_approved/);
  assert.match(sql,/approved_by=p_actor/);
  assert.match(sql,/registration_adult_reviews/);
  assert.match(sql,/onboarding\.administrator\.activate/);
  assert.match(sql,/onboarding\.administrator\.revoke/);
  assert.doesNotMatch(sql,/insert into auth\.users/i);
  assert.match(bootstrap,/I_AUTHORISE_ONE_TIME_FIRST_PLATFORM_OWNER/);
  assert.match(bootstrap,/pg_advisory_xact_lock/);
  assert.match(bootstrap,/select count\(\*\) from auth\.users/);
  assert.match(build,/cloud-owner\.html/);
  assert.match(build,/cloud-owner\.js/);
  assert.match(legacy,/existing-worker-protected-asset-changed/);
});
