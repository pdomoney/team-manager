import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {adminHeaders,isApprovedProjectConfig} from '../worker/supabase-admin-key.js';
import {handleStage1Request} from '../worker/stage1-api.js';
import {buildStage3C,stage3cInputs} from '../scripts/stage3c-build.mjs';
import {verifyStage3C} from '../scripts/stage3c-live-verify.mjs';
import worker from '../worker/index.js';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const project='https://sandbox3c-example.supabase.co';
const origin='https://team-manager-stage3c.example.test';
const pub='sb_publishable_fictionalStage3cPublic123';
const secret='sb_secret_fictionalStage3cServerOnly123';
const tokenPrefix='synthetic-long-enough-stage3c-';
const fixed={
  STAGE3C_SOURCE_SHA:sha,STAGE3C_SUPABASE_URL:project,
  STAGE3C_ORIGIN:origin,STAGE3C_SUPABASE_PUBLISHABLE_KEY:pub
};
test('Stage 3C privileged secret is apikey-only, with legacy JWT compatibility',()=>{
  const env={SUPABASE_URL:project+'/',SUPABASE_PUBLISHABLE_KEY:pub,
    SUPABASE_SECRET_KEY:secret};
  assert.deepEqual(adminHeaders(env),{apikey:secret});
  assert.equal(isApprovedProjectConfig(env),true);
  assert.equal(adminHeaders({...env,SUPABASE_SECRET_KEY:'sb_secret_bad\nHeader'}),null);
  assert.equal(isApprovedProjectConfig({...env,SUPABASE_SECRET_KEY:'bad'}),false);
  const legacy='fictional.stage3c.serviceOnly';
  assert.deepEqual(adminHeaders({SUPABASE_SERVICE_ROLE_KEY:legacy}),{
    apikey:legacy,Authorization:'Bearer '+legacy});
  assert.equal(adminHeaders({}),null);
  assert.deepEqual(adminHeaders({...env,SUPABASE_SERVICE_ROLE_KEY:legacy}),{apikey:secret});
  assert.equal(isApprovedProjectConfig({...env,SUPABASE_URL:'http://bad.supabase.co/'}),false);
});
test('Stage 3C real Worker uses sb_secret without Authorization or browser disclosure',async()=>{
  const calls=[];
  const fetchImpl=async(url,init)=>{
    calls.push({url,init});
    const pathname=new URL(url).pathname;
    return {ok:true,status:200,json:async()=>pathname==='/auth/v1/user'?
      {id:'11111111-1111-4111-8111-111111111111'}:
      {ok:true,code:'permitted',data:[]}};
  };
  const env={SUPABASE_URL:project+'/',SUPABASE_PUBLISHABLE_KEY:pub,SUPABASE_SECRET_KEY:secret};
  const req=new Request(origin+'/api/stage3b/v1/operation',{
    method:'POST',headers:{'Content-Type':'application/json',
      Authorization:'Bearer '+tokenPrefix+'coach'},
    body:JSON.stringify({activeTeamId:'comets-3c',activeRole:'team_coach',
      action:'notices.read',resourceId:'comets-3c',payload:{}})
  });
  const res=await handleStage1Request(req,env,fetchImpl);
  assert.equal(res.status,200);
  const remote=calls.find(c=>c.url.includes('/rest/v1/rpc/'));
  assert.equal(remote.init.headers.apikey,secret);
  assert.equal(remote.init.headers.Authorization,undefined);
  assert(!JSON.stringify(await res.json()).includes(secret));
});
test('Stage 3C isolated build includes only cloud pages, current source and public config',()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'tm-stage3c-'));
  const dest=path.join(tmp,'stage3c-dist');
  try{
    const result=buildStage3C({root,env:fixed,output:dest});
    assert.equal(result.sourceSha,sha);
    assert.equal(fs.existsSync(path.join(dest,'index.html')),false);
    assert.equal(fs.existsSync(path.join(dest,'app.js')),false);
    assert.equal(fs.existsSync(path.join(dest,'test-library.html')),false);
    assert.equal(fs.existsSync(path.join(dest,'data')),false);
    assert.equal(fs.existsSync(path.join(dest,'cloud-team.html')),true);
    assert.equal(fs.existsSync(path.join(dest,'cloud-access.html')),true);
    assert.equal(fs.existsSync(path.join(dest,'cloud-onboarding.js')),true);
    assert.equal(fs.existsSync(path.join(dest,'cloud-operations.js')),true);
    const c=fs.readFileSync(path.join(dest,'cloud-public-config.js'),'utf8');
    assert.match(c,/CLOUD_STAGE3C_MODE=true/);
    assert(c.includes(project));
    assert(c.includes(pub));
    assert(!c.includes('sb_secret_'));
    assert(!c.includes('uyjxvaobshaahzipzzds'));
    const manifest=JSON.parse(fs.readFileSync(path.join(dest,'stage3c-manifest.json'),'utf8'));
    assert.equal(manifest.sourceSha,sha);
    assert.equal(manifest.stagingOrigin,origin);
    assert.match(fs.readFileSync(path.join(dest,'cloud-access.html'),'utf8'),
      /Controlled staging for four approved adults/);
    assert.match(fs.readFileSync(path.join(dest,'cloud-team.js'),'utf8'),
      /CLOUD_STAGE3C_MODE/);
    assert(!fs.readdirSync(dest).some(x=>x.endsWith('.enc.json')));
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('Stage 3C builder fails closed for wrong source, old project, or nonisolated output',()=>{
  assert.throws(()=>stage3cInputs({...fixed,STAGE3C_SOURCE_SHA:'x'.repeat(40)}));
  assert.throws(()=>stage3cInputs({...fixed,STAGE3C_SUPABASE_URL:
    'https://uyjxvaobshaahzipzzds.supabase.co'}));
  assert.throws(()=>stage3cInputs({...fixed,STAGE3C_ORIGIN:'https://app.github.io'}));
  assert.throws(()=>stage3cInputs({...fixed,STAGE3C_SUPABASE_PUBLISHABLE_KEY:secret}));
  assert.throws(()=>buildStage3C({root,env:{...fixed,STAGE3C_SOURCE_SHA:'0'.repeat(40)}}),
    /source-sha-mismatch/);
  assert.throws(()=>buildStage3C({root,env:fixed,output:path.join(root,'dist')}),
    /not-isolated/);
});
test('Stage 3C management Worker blocks legacy and play endpoints',async()=>{
  const env={STAGE3C_MODE:'management-only',ASSETS:{fetch:async()=>new Response('asset')}};
  const rootResponse=await worker.fetch(new Request(origin+'/'),env);
  assert.equal(rootResponse.status,302);
  assert.equal(rootResponse.headers.get('Location'),'/cloud-access.html');
  assert.equal((await worker.fetch(new Request(origin+'/index.html'),env)).status,404);
  assert.equal((await worker.fetch(new Request(origin+'/data/team.enc.json'),env)).status,404);
  assert.equal((await worker.fetch(new Request(origin+'/api/stage2/v1/play',{
    method:'POST'}),env)).status,404);
  assert.equal((await worker.fetch(new Request(origin+'/cloud-team.html'),env)).status,200);
});
const actors=[
 ['Coach','team_coach','schedule.read','11111111-1111-4111-8111-111111111111'],
 ['Manager','team_manager','schedule.read','22222222-2222-4222-8222-222222222222'],
 ['Player','team_player','schedule.read','33333333-3333-4333-8333-333333333333'],
 ['Volunteer','team_volunteer','duty.read','44444444-4444-4444-8444-444444444444']
];
test('Stage 3C connected verifier proves real-role read and foreign-team denial without writes',async()=>{
  const env={...fixed,STAGE3C_ALLOW_CONNECTED_READ:'yes',
    STAGE3C_TEAM_ID:'comets-3c',STAGE3C_FOREIGN_TEAM_ID:'rangers-3c'};
  for(const [label] of actors)env['STAGE3C_'+label.toUpperCase()+'_TOKEN']=tokenPrefix+label.toLowerCase();
  const calls=[];
  const fetchImpl=async(url,init={})=>{
    const path=new URL(url).pathname;
    const auth=init.headers?.Authorization||'';
    const identity=actors.find(a=>auth.includes(tokenPrefix+a[0].toLowerCase()));
    calls.push({path,method:init.method||'GET'});
    let status=200,body={};
    if(path==='/stage3c-manifest.json')body={
      kind:'team-manager-stage3c',sourceSha:sha,stagingOrigin:origin,supabaseUrl:project};
    else if(path==='/index.html'||path==='/api/stage2/v1/play')status=404;
    else if(path==='/auth/v1/user')body={
      id:identity?.[3],email:'fictional@example.test',
      email_confirmed_at:'2026-11-19T00:00:00Z'};
    else if(path==='/rest/v1/rpc/tm_my_team_context')body=[{
      team_id:'comets-3c',team_role:identity?.[1]}];
    else if(path.startsWith('/api/')){
      if(!identity){status=401;body={ok:false,code:'unauthenticated'};}
      else{
        const op=JSON.parse(init.body);
        if(op.activeTeamId!=='comets-3c'||op.activeRole!==identity[1]){
          status=403;body={ok:false,code:'scope-denied'};
        }else body={ok:true,code:'permitted',data:[]};
      }
    }
    return {status,headers:new Headers(),json:async()=>body};
  };
  const result=await verifyStage3C({env,fetchImpl});
  assert.equal(result.overall,'PASS');
  assert(result.checks.length>=20);
  assert(!calls.some(c=>!['POST','GET'].includes(c.method)));
  assert(!calls.some(c=>c.path.includes('insert')||c.path.includes('mutation')));
  assert(!JSON.stringify(result).includes('fictional@example.test'));
  assert(!JSON.stringify(result).includes(tokenPrefix));
  assert(!JSON.stringify(result).includes(actors[0][3]));
  await assert.rejects(verifyStage3C({env:{...env,STAGE3C_ALLOW_CONNECTED_READ:'no'},fetchImpl}),
    {code:'connected-read-requires-explicit-operator-confirmation'});
  await assert.rejects(verifyStage3C({env:{...env,STAGE3C_MANAGER_TOKEN:env.STAGE3C_COACH_TOKEN},fetchImpl}),
    {code:'duplicate-actor-session'});
});
