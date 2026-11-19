import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handleStage1Request} from '../worker/stage1-api.js';
import {createCloudOperationsClient} from '../site/cloud-operations.js';
import {validateFirstTeamActionPayload} from '../src/first-team-action-contract.js';
import worker from '../worker/index.js';

const account='11111111-1111-4111-8111-111111111111';
const team='comets-3b';
const endpoint='https://team-manager.example.test/api/stage3b/v1/operation';
const env={SUPABASE_URL:'https://fixture3b.supabase.co/',
  SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fictionalManagementTeam',
  SUPABASE_SERVICE_ROLE_KEY:'fictional.jwt.service_only'};
const headers={'Content-Type':'application/json',
  Authorization:'Bearer fictional-stage3b-signed-token-1234'};
const body=(action='notices.read',payload={},resourceId=team,activeRole='team_coach')=>({
  activeTeamId:team,activeRole,action,resourceId,payload
});
const request=(input=body(),override={})=>new Request(endpoint,{
  method:'POST',headers:{...headers,...override},body:JSON.stringify(input)
});
const fake=({user={id:account},data={ok:true,code:'permitted',data:[]},
   authCode=200,sqlCode=200}={})=>{
  const calls=[];
  return {calls,fetchImpl:async(url,init)=>{
    const path=new URL(url).pathname;
    calls.push({path,init});
    const auth=path==='/auth/v1/user';
    const status=auth?authCode:sqlCode;
    return {ok:status===200,status,
      json:async()=>auth?user:data};
  }};
};
test('3B management reads require independently verified exact-team role and new RPC',async()=>{
  const provider=fake({data:{ok:true,code:'permitted',data:[{
    noticeId:'notice123',title:'Fictional notice',body:'Training',
    audience:'all',status:'published',version:1}]}});
  const res=await handleStage1Request(request(),env,provider.fetchImpl);
  assert.equal(res.status,200);
  assert.equal((await res.json()).data[0].title,'Fictional notice');
  assert.deepEqual(provider.calls.map(x=>x.path),[
    '/auth/v1/user','/rest/v1/rpc/tm_stage3b_operation']);
  const arg=JSON.parse(provider.calls[1].init.body);
  assert.deepEqual({account:arg.p_account,team:arg.p_team,
    role:arg.p_role,action:arg.p_action,resource:arg.p_resource},
    {account,team,role:'team_coach',action:'notices.read',resource:team});
  assert.equal(arg.p_digest,null);
  assert.equal(provider.calls[1].init.headers.apikey,env.SUPABASE_SERVICE_ROLE_KEY);
});
test('3B writes require safe envelopes, idempotency digest and explicit roles',async()=>{
  const provider=fake({data:{ok:true,code:'committed',
    resourceId:'notice-example',version:0}});
  const payload={mutationId:'fictional-stage3b-mutation-001',
    expectedVersion:0,command:{title:'Training update',
    body:'Next week',audience:'players'}};
  const res=await handleStage1Request(request(body('notice.create',payload)),
    env,provider.fetchImpl);
  assert.equal(res.status,200);
  const result=await res.json();
  assert.equal(result.code,'committed');
  assert.equal(result.resourceId,'notice-example');
  const args=JSON.parse(provider.calls[1].init.body);
  assert.match(args.p_digest,/^[0-9a-f]{64}$/);
  assert.equal(args.p_payload.command.audience,'players');
  assert(!JSON.stringify(result).includes(env.SUPABASE_SERVICE_ROLE_KEY));
  assert.equal(validateFirstTeamActionPayload('attendance.record',{
    ...payload,command:{personId:'player-1',status:'present'}})?.kind,'write');
  for(const invalid of [
    {...payload,teamId:'rangers-3b'},
    {...payload,accountId:account},
    {...payload,expectedVersion:'0'},
    {...payload,command:{id:'x'},approvedBy:account},
  ])assert.equal(validateFirstTeamActionPayload('notice.create',invalid),null);
});
test('3B route cannot execute Stage 1 actions, play writes or forged identity',async()=>{
  const invalid=[
    body('schedule.edit',{mutationId:'fictional-mut-1234567',
      expectedVersion:0,command:{title:'No'}}),
    body('play.publish',{mutationId:'fictional-mut-1234567',
      expectedVersion:0,revisionId:'draft-1'}),
    {...body(),accountId:account},
    body('notices.read',{userId:'someone'}),
    body('roster.approve',{mutationId:'bad',expectedVersion:0,
      command:{op:'approve'}},'player-1','platform_owner'),
  ];
  for(const payload of invalid){
    const provider=fake();
    const r=await handleStage1Request(request(payload),env,provider.fetchImpl);
    assert.equal(r.status,400,JSON.stringify(payload));
    assert.equal(provider.calls.length,0);
  }
  const stage1=new Request('https://team-manager.example.test/api/stage1/v1/operation',{
    method:'POST',headers,body:JSON.stringify(body('report.summary'))});
  const provider=fake();
  assert.equal((await handleStage1Request(stage1,env,provider.fetchImpl)).status,400);
  assert.equal(provider.calls.length,0);
});
test('3B denials, suspended accounts, provider faults and foreign origin fail closed',async()=>{
  const forbidden=fake({data:{ok:false,code:'scope-denied'}});
  const r=await handleStage1Request(request(),env,forbidden.fetchImpl);
  assert.deepEqual(await r.json(),{ok:false,code:'scope-denied'});
  const leaked=fake({data:{ok:false,code:'scope-denied',private:'sensitive'}});
  const blocked=await handleStage1Request(request(),env,leaked.fetchImpl);
  assert.equal(blocked.status,503);
  assert.deepEqual(await blocked.json(),{ok:false,code:'service-unavailable'});
  const foreign=fake();
  const x=await handleStage1Request(request(body(),{
    Origin:'https://other.example.test'}),env,foreign.fetchImpl);
  assert.equal(x.status,403);assert.equal(foreign.calls.length,0);
  for(const variant of [
    {authCode:401},{user:{id:'invalid'}},{sqlCode:500},
    {data:{ok:true,code:'permitted',data:'private raw rows'}},
    {data:{ok:true,code:'permitted',data:[],debug:'raw error'}}
  ]){
    const bad=fake(variant);
    const response=await handleStage1Request(request(),env,bad.fetchImpl);
    assert([401,503].includes(response.status));
    assert.equal(response.headers.get('Cache-Control'),'no-store');
  }
});
test('3B browser operations re-check active grants and never use a cross-origin endpoint',async()=>{
  const calls=[];
  let contexts=[{teamId:team,role:'team_manager'}];
  const identity={myTeamContexts:async()=>contexts,
    verifiedBearer:async()=>'fictional-stage3b-auth-token'};
  const fetchImpl=async(url,init)=>{
    calls.push({url,init,payload:JSON.parse(init.body)});
    return {ok:true,status:200,json:async()=>({
      ok:true,code:'permitted',data:[{sessionId:'training-3b',activeRoster:5}]})};
  };
  const client=createCloudOperationsClient({
    identity,fetchImpl,origin:'https://team-manager.example.test'});
  const ctx={teamId:team,role:'team_manager'};
  const summary=await client.operation(ctx,'report.summary',team);
  assert.equal(summary[0].activeRoster,5);
  assert.equal(new URL(calls[0].url).pathname,'/api/stage3b/v1/operation');
  assert.equal(calls[0].init.credentials,'omit');
  assert.equal(calls[0].payload.activeTeamId,team);
  contexts=[];
  await assert.rejects(client.operation(ctx,'notices.read',team),{code:'access-revoked'});
  assert.equal(calls.length,1,'revoked grants must fail before sending another request');
});
test('3B private attendance and notices and report suppression remain source-enforced',()=>{
  const m=readFileSync(new URL('../supabase/migrations/20261119050000_stage3b_management.sql',
    import.meta.url),'utf8');
  assert.match(m,/team_attendance force row level security/);
  assert.match(m,/team_notices force row level security/);
  assert(m.includes('as ' + String.fromCharCode(36,36,10) + 'begin'),
    'trigger body must use PostgreSQL dollar quoting');
  assert.match(m,/p_role not in \('team_coach','team_manager'\)/);
  assert.match(m,/management_origin in \('team-friendly','team-activity'\)/);
  assert.match(m,/between 1 and 4 then null/);
  assert.match(m,/where g.user_id=p_account and g.team_id=p_team/);
  assert.match(m,/grant execute on function public.tm_stage3b_operation\([\s\S]*to service_role;/);
  assert.doesNotMatch(m,/grant (select|update|insert|delete) on tm_private.team_(attendance|notices) to authenticated/i);
  assert.match(readFileSync(new URL('../worker/index.js',import.meta.url),'utf8'),
    /path.startsWith\('\/api\/stage3b\/'\)/);
  assert.equal(typeof worker.fetch,'function');
});
