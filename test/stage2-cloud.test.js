import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCloudIdentityClient} from '../site/cloud-identity.js';
import {createCloudOperationsClient} from '../site/cloud-operations.js';
import {handleStage2PlayRequest} from '../worker/stage2-play-api.js';
import worker from '../worker/index.js';
import {build} from '../src/build.js';
const actor='11111111-1111-4111-8111-111111111111';
const team='comets-qa-u16';
const pub='sb_publishable_FictionalPublicKey';
const authURL='https://fictional-stage2.supabase.co';
const env={SUPABASE_URL:authURL+'/',SUPABASE_PUBLISHABLE_KEY:pub,
  SUPABASE_SERVICE_ROLE_KEY:'fictional.jwt.service_only'};
const opURL='https://team-manager.example.test/api/stage2/v1/play';
const headers={'Content-Type':'application/json',
  Authorization:'Bearer synthetic.jwt.signed_session_token'};
const body=(action='play.published.read',role='team_coach',payload={})=>({
  activeTeamId:team,activeRole:role,action,resourceId:team,payload
});
const request=(b=body(),init={})=>new Request(opURL,{
  method:'POST',headers:{...headers,...init.headers},body:JSON.stringify(b)
});
const ok=b=>({ok:true,status:200,json:async()=>b});
function apiServer({user={id:actor},result={ok:true,code:'permitted',data:[]},
  rejectAuth=false}={}){
  const calls=[];
  return {calls,fetchImpl:async(url,init)=>{
    calls.push({path:new URL(url).pathname,init});
    return new URL(url).pathname==='/auth/v1/user'?
      (rejectAuth?{ok:false,status:401}:ok(user)):ok(result);
  }};
}
test('Unknown API routes do not fall through to the static site',async()=>{
  let touched=false;
  const response=await worker.fetch(new Request('https://team-manager.example.test/api/admin/private'),{
    ASSETS:{fetch:async()=>{touched=true;return new Response('static');}}
  });
  assert.equal(response.status,404);
  assert.equal(touched,false);
});
test('Malformed E5 authored timeline cannot reach a trusted write RPC',async()=>{
  const bad=body('play.draft.edit','team_coach',{
    mutationId:'stage2-timeline-negative-01',expectedVersion:0,
    command:{op:'create',play:{name:'Fictional play',
      players:{LM:[24,46]},moves:[],eventTimeline:{version:1,
        actors:[],events:[{eventId:'bad',atMs:-1}]}}}
  });
  const fake=apiServer();
  const response=await handleStage2PlayRequest(request(bad),env,fake.fetchImpl);
  assert.equal(response.status,400);
  assert.equal(fake.calls.length,1,'never call private RPC after invalid timeline');
});
test('Stage 2 Worker delegates API routes and retains existing static shell',async()=>{
  const assets=[];
  const res=await worker.fetch(new Request('https://team-manager.example.test/'),{
    ASSETS:{fetch:async req=>{assets.push(req.url);return new Response('site',{status:200});}}
  });
  assert.equal(res.status,200);
  assert.equal(assets.length,1);
  const failed=await worker.fetch(new Request('https://team-manager.example.test/'),{});
  assert.equal(failed.status,503);
  const noConfig=await worker.fetch(request(),{ASSETS:{fetch:async()=>new Response('unsafe')}});
  assert.equal(noConfig.status,503);
  assert.equal(await noConfig.json().then(x=>x.code),'service-unavailable');
});
test('Stage 2 play request resolves verified actor and exact role via privileged RPC',async()=>{
  const fake=apiServer();
  const response=await handleStage2PlayRequest(request(),env,fake.fetchImpl);
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{ok:true,code:'permitted',data:[]});
  assert.deepEqual(fake.calls.map(x=>x.path),[
    '/auth/v1/user','/rest/v1/rpc/tm_stage2_play_operation']);
  const p=JSON.parse(fake.calls[1].init.body);
  assert.equal(p.p_account,actor);
  assert.equal(p.p_team,team);
  assert.equal(p.p_role,'team_coach');
  assert.equal(p.p_digest,null);
  assert.equal(fake.calls[1].init.headers.Authorization,'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY);
});
test('Stage 2 play mutation preserves E5 authored payload, digest and revision',async()=>{
  const play={name:'Step Out',players:{LM:[24.6,49.6]},moves:[],
    phases:[{players:{LM:[28,42]},moves:[]}],eventTimeline:{version:1,actors:[],events:[]}};
  const input={...body('play.draft.edit'),payload:{
    mutationId:'stage2-node-mutation-0001',expectedVersion:0,
    command:{op:'create',play}}};
  const fake=apiServer({result:{ok:true,code:'committed',
    resourceId:'play-123456',version:0,revisionId:'rev-111111'}});
  const res=await handleStage2PlayRequest(request(input),env,fake.fetchImpl);
  assert.equal(res.status,200);
  assert.deepEqual(await res.json(),{ok:true,code:'committed',
    resourceId:'play-123456',version:0,revisionId:'rev-111111'});
  const arg=JSON.parse(fake.calls[1].init.body);
  assert.deepEqual(arg.p_payload.command.play,play);
  assert.match(arg.p_digest,/^[0-9a-f]{64}$/);
  assert.equal(arg.p_account,actor);
});
test('No bearer, forged role/account, foreign Origin, unknown action or failed Auth is denied',async()=>{
  const fake=apiServer();
  const items=[
    [{...body(),activeRole:'platform_owner'},400],
    [{...body(),personId:'forged'},400],
    [{...body(),action:'admin.all'},400],
    [{...body(),activeTeamId:'../other'},400]
  ];
  for(const [op,code] of items){
    const res=await handleStage2PlayRequest(request(op),env,fake.fetchImpl);
    assert.equal(res.status,code);
  }
  assert.equal(fake.calls.length,0);
  assert.equal((await handleStage2PlayRequest(request(body(),{headers:{
    Origin:'https://foreign.example.test'}}),env,fake.fetchImpl)).status,403);
  assert.equal((await handleStage2PlayRequest(request(body(),{headers:{
    Authorization:'not-a-bearer'}}),env,fake.fetchImpl)).status,401);
  const noUser=apiServer({rejectAuth:true});
  assert.equal((await handleStage2PlayRequest(request(),env,noUser.fetchImpl)).status,401);
  assert.equal(noUser.calls.length,1);
});
test('Play publication distinguishes assistant from Head Coach and redacts provider responses',async()=>{
  const play={name:'Step Out',players:{LM:[24,46]},moves:[]};
  const fake=apiServer({result:{ok:true,code:'permitted',data:[{
    playId:'play-1',revisionId:'rev-1',version:2,play,
    secret:'do-not-expose',revisionStatus:'published'}]}});
  const res=await handleStage2PlayRequest(request(body('play.published.read','team_player')),env,fake.fetchImpl);
  assert.deepEqual(await res.json(),{ok:true,code:'permitted',
    data:[{playId:'play-1',revisionId:'rev-1',version:2,play}]});
  const denied=apiServer({result:{ok:false,code:'role-denied'}});
  const assistant=await handleStage2PlayRequest(request({
    ...body('play.publish','team_assistant'),
    resourceId:'play-1',payload:{mutationId:'stage2-publish-00000001',
      expectedVersion:2,revisionId:'rev-1'}}),env,denied.fetchImpl);
  assert.equal(assistant.status,403);
  assert.equal((await assistant.json()).code,'role-denied');
});
const makeStorage=()=>{const map=new Map();return{
  getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),
  removeItem:k=>map.delete(k)
}};
test('One verified identity holds independent Platform Owner and Coach access',async()=>{
  const seen=[];
  const fetchImpl=async(url,init)=>{
    const path=new URL(url).pathname;seen.push(path);
    if(path==='/auth/v1/token')return ok({access_token:'token'.padEnd(32,'X'),
      refresh_token:'refresh'.padEnd(32,'X'),expires_in:3600});
    if(path==='/auth/v1/user')return ok({id:actor,email:'coach@fictional.test'});
    if(path==='/rest/v1/rpc/tm_my_team_context')return ok([{
      team_id:team,club_ref:'Fictional Comets',sport_ref:'oztag',
      season_ref:'2026',team_role:'team_coach'}]);
    if(path==='/rest/v1/rpc/tm_my_operator_context')return ok({isOwner:true});
    throw new Error('unapproved url '+path);
  };
  const client=createCloudIdentityClient({url:authURL,publishableKey:pub,
    fetchImpl,storage:makeStorage(),now:()=>Date.UTC(2026,10,19,1)});
  await client.signInWithPassword('coach@fictional.test','password');
  assert.deepEqual(await client.myTeamContexts(),[{
    teamId:team,club:'Fictional Comets',sport:'oztag',season:'2026',role:'team_coach'}]);
  assert.equal(await client.myOperatorAccess(),true);
  assert.match(await client.verifiedBearer(),/^token/);
  assert(seen.includes('/rest/v1/rpc/tm_my_operator_context'));
});
test('Client rechecks one exact active team grant, never permits Owner mode as a team role',async()=>{
  let active=true;const calls=[];
  const identity={
    myTeamContexts:async()=>active?[{teamId:team,role:'team_coach'}]:[],
    verifiedBearer:async()=>'test-valid-bearer'
  };
  const client=createCloudOperationsClient({identity,origin:'https://team-manager.example.test',
    fetchImpl:async(url,options)=>{calls.push({url,options});return ok({
      ok:true,code:'permitted',data:[{sessionId:'training-1'}]});}});
  assert.deepEqual(await client.operation({teamId:team,role:'team_coach'},
    'schedule.read',team),[{sessionId:'training-1'}]);
  assert.equal(calls.length,1);
  assert.equal(calls[0].options.headers.Authorization,'Bearer test-valid-bearer');
  assert(!JSON.stringify(calls[0]).includes('service_only'));
  await assert.rejects(client.operation({teamId:team,role:'platform_owner'},
    'schedule.read',team),{code:'invalid-request'});
  active=false;
  await assert.rejects(client.operation({teamId:team,role:'team_coach'},
    'schedule.read',team),{code:'access-revoked'});
  assert.equal(calls.length,1,'revoked grant cannot contact operation service');
});
test('Build stamps new cloud workspace and retains the established demo',()=>{
  const root=mkdtempSync(join(tmpdir(),'tm-stage2-'));
  const dir=join(root,'site');
  build({outDir:dir,dataDir:join(root,'empty'),version:'stage2-check'});
  for(const asset of ['index.html','cloud-access.html','cloud-team.html',
    'cloud-team.js','cloud-operations.js','cloud-play-board.js'])
    assert(existsSync(join(dir,asset)),asset+' should build');
  const old=readFileSync(join(dir,'index.html'),'utf8');
  const cloud=readFileSync(join(dir,'cloud-team.html'),'utf8');
  assert.match(old,/<nav class="tabs"/);
  assert.match(cloud,/cloud-team.js\?v=stage2-check/);
  assert.match(cloud,/Home|Schedule/);
  const wr=readFileSync('wrangler.jsonc','utf8');
  assert.match(wr,/"main": "worker\/index.js"/);
  assert.match(wr,/"binding": "ASSETS"/);
  assert(!wr.includes('SERVICE_ROLE_KEY'));
});
test('Published and draft paths do not weaken old encrypted app or active demo',()=>{
  const html=readFileSync('site/index.html','utf8');
  assert(!html.includes('cloud-team.js'));
  const api=readFileSync('worker/stage2-play-api.js','utf8');
  assert(!api.includes('SUPABASE_SERVICE_ROLE_KEY:'));
  const sql=readFileSync('supabase/migrations/20261119010000_stage2_operator_context.sql','utf8');
  assert.match(sql,/approved_by<>user_id|approved_by<>g.user_id/);
  assert.match(sql,/force row level security/i);
});
