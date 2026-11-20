import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {buildStage3D3,stage3d3Inputs} from '../scripts/stage3d3-build.mjs';
import worker from '../worker/index.js';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const cfg={
  STAGE3D3_SOURCE_SHA:sha,
  STAGE3D3_SUPABASE_URL:'https://stage3d3-example.supabase.co',
  STAGE3D3_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fictionalStage3d3Only123',
  STAGE3D3_ORIGIN:'https://first-team-stage3d3.example.test',
  STAGE3D3_SCOPE:'individually-authorised-adults-only',
  STAGE3D3_SEASON_REF:'2026',
  STAGE3D3_PROVIDER_METHODS:'off'
};
function tempBuild(env){
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'team-manager-stage3d3-'));
  const out=path.join(tmp,'isolated');
  try{
    const result=buildStage3D3({root,env,output:out});
    return {result,out,tmp};
  }catch(e){fs.rmSync(tmp,{recursive:true,force:true});throw e;}
}
test('Stage 3D.3 builds an isolated first-team connected management candidate',()=>{
  const {result,out,tmp}=tempBuild(cfg);
  try{
    assert.equal(result.sourceSha,sha);
    const names=new Set(fs.readdirSync(out));
    for(const n of ['cloud-access.html','cloud-team.html','cloud-public-config.js',
      'cloud-auth-flows.js','cloud-registration.html','cloud-registration.js',
      'stage3d3-manifest.json','stage3c-no-tactics.js'])
      assert(names.has(n),n+' needed');
    for(const n of ['index.html','data','test-library.html','coach.enc.json',
      'team.enc.json','stage3c-manifest.json','cloud-play-board.js'])
      assert(!names.has(n),n+' not allowed');
    const manifest=JSON.parse(fs.readFileSync(path.join(out,'stage3d3-manifest.json'),'utf8'));
    assert.deepEqual(manifest.team,{
      club:'St George Oztag',team:'Mixed 20',teamId:'stgeorge-mixed20',sport:'oztag'
    });
    assert.equal(manifest.sourceSha,sha);
    assert.equal(manifest.origin,cfg.STAGE3D3_ORIGIN);
    assert.equal(manifest.supabaseUrl,cfg.STAGE3D3_SUPABASE_URL);
    assert.equal(manifest.seasonRef,'2026');
    assert.equal(manifest.releaseStatus,'NOT_PRODUCTION_AUTHORISED');
    assert.equal(manifest.providerControlsEnabled,false);
    const conf=fs.readFileSync(path.join(out,'cloud-public-config.js'),'utf8');
    assert.match(conf,/CLOUD_STAGE3C_MODE=true/);
    assert.match(conf,/CLOUD_STAGE3D2_AUTH_ENABLED=false/);
    assert.match(conf,/CLOUD_STAGE3D3_POLICY_REQUIRED=true/);
    assert(!conf.includes('sb_secret_'));
    const html=fs.readFileSync(path.join(out,'cloud-access.html'),'utf8');
    assert(html.includes('St George Oztag · Mixed 20'));
    assert(html.includes('cloud-registration.html'));
    assert(fs.readFileSync(path.join(out,'cloud-registration.html'),'utf8')
      .includes('Registration and privacy'));
    assert(!html.includes('four approved adults using fictional team records'));
    assert(!html.includes('For invited test accounts only.'));
    assert(!fs.readdirSync(out).some(n=>n.endsWith('.enc.json')));
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('Provider buttons are only compiled into an explicitly selected candidate',()=>{
  assert.throws(()=>stage3d3Inputs({...cfg,STAGE3D3_PROVIDER_METHODS:'on'}),
    /stage3d3-configuration-not-ready/);
  const {out,tmp}=tempBuild({...cfg,STAGE3D3_PROVIDER_METHODS:'on',
    STAGE3D3_PROVIDER_SETUP_REVIEWED:'yes'});
  try{
    const m=JSON.parse(fs.readFileSync(path.join(out,'stage3d3-manifest.json'),'utf8'));
    const conf=fs.readFileSync(path.join(out,'cloud-public-config.js'),'utf8');
    assert.equal(m.providerControlsEnabled,true);
    assert.match(conf,/CLOUD_STAGE3D2_AUTH_ENABLED=true/);
    assert.equal(m.releaseStatus,'NOT_PRODUCTION_AUTHORISED');
    assert(!fs.existsSync(path.join(out,'index.html')));
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('Stage 3D.3 blocks stale source, old Supabase project, wrong scope and unsafe output',()=>{
  for(const bad of [
    {STAGE3D3_SOURCE_SHA:'not-a-sha'},
    {STAGE3D3_SEASON_REF:''},
    {STAGE3D3_SEASON_REF:'2026 summer'},
    {STAGE3D3_SCOPE:'open-signup'},
    {STAGE3D3_PROVIDER_METHODS:'always'},
    {STAGE3D3_ORIGIN:'https://pdomoney.github.io'},
    {STAGE3D3_ORIGIN:'http://example.com'},
    {STAGE3D3_SUPABASE_PUBLISHABLE_KEY:'sb_secret_private'}
  ])assert.throws(()=>stage3d3Inputs({...cfg,...bad}));
  assert.throws(()=>buildStage3D3({root,env:{...cfg,STAGE3D3_SOURCE_SHA:
    '0'.repeat(40)},output:path.join(os.tmpdir(),'safe-not-written')}),
    /exact-source-sha-mismatch/);
  assert.throws(()=>buildStage3D3({root,env:cfg,output:path.join(root,'dist')}),
    /output-is-not-isolated/);
  assert.throws(()=>buildStage3D3({root,env:cfg,output:path.join(root,'dist-stage3c')}),
    /output-collides/);
});
test('First-team staging Worker denies demo and Stage 4 play endpoints',async()=>{
  const env={STAGE3C_MODE:'management-only',
    ASSETS:{fetch:async()=>new Response('safe isolated asset')}};
  const origin=cfg.STAGE3D3_ORIGIN;
  const rootReply=await worker.fetch(new Request(origin+'/'),env);
  assert.equal(rootReply.status,302);
  assert.equal(rootReply.headers.get('Location'),'/cloud-access.html');
  assert.equal((await worker.fetch(new Request(origin+'/index.html'),env)).status,404);
  assert.equal((await worker.fetch(new Request(origin+'/data/team.enc.json'),env)).status,404);
  assert.equal((await worker.fetch(new Request(origin+'/api/stage2/v1/play',{method:'POST'}),env)).status,404);
  assert.equal((await worker.fetch(new Request(origin+'/cloud-access.html'),env)).status,200);
});

test('Stage 3D.3 can build against owner-approved existing Supabase while Stage 3C stays isolated',()=>{
  const env={...cfg,STAGE3D3_SUPABASE_URL:
    'https://uyjxvaobshaahzipzzds.supabase.co'};
  const {out,tmp}=tempBuild(env);
  try{
    const data=JSON.parse(fs.readFileSync(path.join(out,'stage3d3-manifest.json'),'utf8'));
    assert.equal(data.supabaseUrl,env.STAGE3D3_SUPABASE_URL);
    assert.equal(data.releaseStatus,'NOT_PRODUCTION_AUTHORISED');
    assert(!fs.existsSync(path.join(out,'index.html')));
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
