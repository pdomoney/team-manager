import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {build} from '../src/build.js';
import {handleStage1Request} from '../worker/stage1-api.js';

const env={
  SUPABASE_URL:'https://fictional-stage1.supabase.co/',
  SUPABASE_PUBLISHABLE_KEY:'sb_publishable_syntheticPublicKey',
  SUPABASE_SERVICE_ROLE_KEY:'fictional.jwt.service_only'
};
const actor='11111111-1111-4111-8111-111111111111';
const endpoint='https://team-manager.example.test/api/stage1/v1/operation';
const body=(action='schedule.read',payload={})=>({
  activeTeamId:'fictional-u16',activeRole:'team_coach',
  action,resourceId:'fictional-u16',payload
});
const headers={'Content-Type':'application/json',
  Authorization:'Bearer fictional.jwt.signed_session_token'};
const req=(input=body(),options={})=>new Request(endpoint,{
  method:'POST',headers:{...headers,...options.headers},
  body:JSON.stringify(input)
});
function server({user={id:actor},result={ok:true,code:'permitted',data:[]},
  authStatus=200,rpcStatus=200}={}){
  const calls=[];
  return {calls,fetchImpl:async(url,opts)=>{
    const path=new URL(url).pathname;
    calls.push({path,opts});
    const status=path==='/auth/v1/user'?authStatus:rpcStatus;
    return {ok:status===200,status,
      json:async()=>path==='/auth/v1/user'?user:result};
  }};
}
async function run(input=body(),serverOptions={},requestOptions={}){
  const fake=server(serverOptions);
  const response=await handleStage1Request(req(input,requestOptions),env,fake.fetchImpl);
  return {response,result:await response.json(),calls:fake.calls};
}
test('verified existing auth account reaches one trusted RPC with exact team and role',async()=>{
  const {response,result,calls}=await run();
  assert.equal(response.status,200);
  assert.deepEqual(result,{ok:true,code:'permitted',data:[]});
  assert.deepEqual(calls.map(x=>x.path),['/auth/v1/user','/rest/v1/rpc/tm_stage1_operation']);
  const login=calls[0].opts;
  assert.match(login.headers.Authorization,/fictional.jwt.signed_session_token/);
  assert.equal(login.headers.apikey,env.SUPABASE_PUBLISHABLE_KEY);
  const rpc=calls[1].opts;
  assert.equal(rpc.headers.apikey,env.SUPABASE_SERVICE_ROLE_KEY);
  assert.equal(rpc.headers.Authorization,'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY);
  const arg=JSON.parse(rpc.body);
  assert.deepEqual(arg,{
    p_account:actor,p_team:'fictional-u16',p_role:'team_coach',
    p_action:'schedule.read',p_resource:'fictional-u16',
    p_payload:{},p_digest:null
  });
  assert.equal(response.headers.get('Cache-Control'),'no-store');
});
test('mutation normalisation, digest and success response never expose account or private keys',async()=>{
  const input=body('schedule.edit',{
    mutationId:'synthetic-mutation-000002',expectedVersion:0,
    command:{op:'create',kind:'training',title:'Fictional practice',
      startsAt:'2026-11-20T07:00:00Z'}
  });
  const {response,result,calls}=await run(input,{
    result:{ok:true,code:'committed',resourceId:'training_12',version:0}
  });
  assert.equal(response.status,200);
  assert.deepEqual(result,{ok:true,code:'committed',resourceId:'training_12',version:0});
  const args=JSON.parse(calls[1].opts.body);
  assert.match(args.p_digest,/^[a-f0-9]{64}$/);
  assert.equal(args.p_account,actor);
  assert.equal(Object.hasOwn(result,'p_account'),false);
  assert.equal(Object.hasOwn(result,'p_digest'),false);
});
test('invalid role, foreign identity fields, mutation and origin never reach provider',async()=>{
  const forged=[
    {...body(),accountId:actor},
    {...body(),activeRole:'platform_owner'},
    {...body(),activeTeamId:'../../other'},
    {...body(),action:'medical.read'},
    body('schedule.edit',{mutationId:'bad',expectedVersion:0,
      command:{op:'create'}}),
    body('roster.read',{personId:'someone-else'}),
    body('availability.reply',{mutationId:'synthetic-mutation-000003',
      expectedVersion:0,response:'approved',personId:'another'}),
  ];
  for(const item of forged){
    const {response,calls}=await run(item);
    assert.equal(response.status,400,JSON.stringify(item));
    assert.equal(calls.length,0);
  }
  const x=await run(body(),{},{headers:{Origin:'https://attacker.example.test'}});
  assert.equal(x.response.status,403);
  assert.equal(x.calls.length,0);
});
test('expired/forged/disabled identity, missing backend and SQL fault fail closed',async()=>{
  for(const variant of [
    {user:{id:'not-a-uuid'}},
    {authStatus:401},
    {rpcStatus:500},
    {result:{ok:true,code:'permitted',data:[],privateError:'do not leak'}},
    {result:{ok:true,code:'permitted',data:'raw database rows'}},
  ]){
    const x=await run(body(),variant);
    assert([401,503].includes(x.response.status));
    assert.equal(JSON.stringify(x.result).includes('do not leak'),false);
    assert.equal(x.response.headers.get('Cache-Control'),'no-store');
  }
  const x=await run(body('availability.reply',{
    mutationId:'synthetic-mutation-000004',expectedVersion:0,response:'yes'
  }),{result:{ok:false,code:'stale-availability'}});
  assert.equal(x.response.status,409);
  assert.deepEqual(x.result,{ok:false,code:'stale-availability'});
});
test('incorrect server config and unsupported requests do not open trusted service',async()=>{
  const fake=server();
  const res=await handleStage1Request(req(),{...env,SUPABASE_SERVICE_ROLE_KEY:'sb_publishable_not_private'},fake.fetchImpl);
  assert.equal(res.status,503);
  const bad=new Request('https://team-manager.example.test/private?token=bad');
  const no=await handleStage1Request(bad,env,fake.fetchImpl);
  assert.equal(no.status,404);
  assert.equal(fake.calls.length,0);
});
test('Stage 1 demo stays isolated from the Stage 2 signed-in workspace',()=>{
  const tmp=mkdtempSync(join(tmpdir(),'stage1-build-'));
  const out=join(tmp,'dist');
  build({outDir:out,dataDir:join(tmp,'none'),log:()=>{},version:'stage1-fixture'});
  assert(existsSync(join(out,'index.html')));
  assert(existsSync(join(out,'cloud-access.html')));
  assert(existsSync(join(out,'cloud-team.html')));
  assert(existsSync(join(out,'cloud-operations.js')));
  // The cloud route is an entirely separate page. Stage 1 never gave the
  // original demo direct API access or upgraded its local QA personas.
  const demo=readFileSync(join(out,'index.html'),'utf8');
  assert.match(demo,/app.js\?v=stage1-fixture/);
  assert(!demo.includes('cloud-operations'));
  assert(!demo.includes('cloud-team.js'));
  assert(!readFileSync(join(out,'app.js'),'utf8').includes('stage2-play-api'));
});
test('private SQL remains service-role-only, new schema fields and training fixture explicit',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/20261118030000_stage1_team_operations.sql',import.meta.url),'utf8');
  const worker=readFileSync(new URL('../worker/stage1-api.js',import.meta.url),'utf8');
  const legacyConfig=readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8');
  assert.match(sql,/security definer set search_path = ''/);
  assert.match(sql,/grant execute on function public\.tm_stage1_operation\([\s\S]*?\) to service_role;/);
  assert.match(sql,/revoke all on function public\.tm_stage1_operation\([\s\S]*?\) from public, anon, authenticated;/);
  assert.match(sql,/for update;/i);
  assert.match(sql,/mutation_receipts/);
  assert.match(sql,/audit_events/);
  assert.match(sql,/resource_version=resource_version\+1/);
  assert.match(worker,/\/auth\/v1\/user/);
  assert.match(worker,/SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(legacyConfig,/"main"\\s*:\\s*"worker\\/index\\.js"/);
  assert.match(legacyConfig,/"binding"\\s*:\\s*"ASSETS"/);
  assert.doesNotMatch(legacyConfig,/SUPABASE_SERVICE_ROLE_KEY|sb_secret_/);
  const entry=readFileSync(new URL('../worker/index.js',import.meta.url),'utf8');
  assert.match(entry,/path\\.startsWith\\('\/api\/stage1\/'\\)/);
  assert.match(entry,/env\\.ASSETS\\.fetch\\(request\\)/);
  assert.doesNotMatch(readFileSync(new URL('../site/cloud-access.js',import.meta.url),'utf8'),/service_role|sb_secret_|SUPABASE_SERVICE_ROLE_KEY/i);
});
