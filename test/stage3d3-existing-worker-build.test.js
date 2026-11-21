import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {build} from '../src/build.js';
import {stage3cInputs} from '../scripts/stage3c-build.mjs';
import {buildExistingWorkerCandidate} from '../scripts/stage3d3-existing-worker-build.mjs';
import worker from '../worker/index.js';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const config={
  STAGE3D3_SOURCE_SHA:sha,
  STAGE3D3_SUPABASE_URL:'https://uyjxvaobshaahzipzzds.supabase.co',
  STAGE3D3_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_syntheticKeyNotASecret123456',
  STAGE3D3_ORIGIN:'https://team-manager.paul-domoney.workers.dev',
  STAGE3D3_SCOPE:'individually-authorised-adults-only',
  STAGE3D3_PROVIDER_METHODS:'off'
};
function fixture(){
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'tm-shared-worker-test-'));
  const sourceData=path.join(tmp,'private-test-data');
  const old=path.join(tmp,'old-site');
  fs.mkdirSync(sourceData);
  const encrypted=JSON.stringify({format:'team-manager',version:1,role:'team',
    kdf:'PBKDF2-SHA256',salt:Buffer.alloc(16,1).toString('base64'),
    iv:Buffer.alloc(12,2).toString('base64'),
    data:Buffer.alloc(32,3).toString('base64')});
  fs.writeFileSync(path.join(sourceData,'team.enc.json'),encrypted);
  build({dataDir:sourceData,outDir:old,siteDir:path.join(root,'site'),
    watchDir:path.join(tmp,'empty-rules'),version:sha.slice(0,7),log:()=>{}});
  return {tmp,old,encrypted,out:path.join(tmp,'connected')};
}
test('Existing Worker build preserves real legacy root, plays and encrypted data byte-for-byte',()=>{
  const x=fixture();
  try{
    const oldIndex=fs.readFileSync(path.join(x.old,'index.html'));
    const oldApp=fs.readFileSync(path.join(x.old,'app.js'));
    const oldPlay=fs.readFileSync(path.join(x.old,'cloud-play-board.js'));
    const result=buildExistingWorkerCandidate({
      root,legacyDir:x.old,output:x.out,env:config});
    assert.equal(result.worker,'team-manager');
    assert.equal(result.sourceSha,sha);
    assert.equal(result.encryptedDataFilesPreserved,1);
    assert.equal(result.releaseStatus,'NOT_INSTALLED_NOT_ACCEPTED');
    assert.deepEqual(fs.readFileSync(path.join(x.out,'index.html')),oldIndex);
    assert.deepEqual(fs.readFileSync(path.join(x.out,'app.js')),oldApp);
    assert.deepEqual(fs.readFileSync(path.join(x.out,'cloud-play-board.js')),oldPlay);
    assert.equal(fs.readFileSync(path.join(x.out,'data/team.enc.json'),'utf8'),x.encrypted);
    const m=JSON.parse(fs.readFileSync(path.join(x.out,'data/manifest.json'),'utf8'));
    assert.deepEqual(m.files,['team.enc.json']);
    const c=fs.readFileSync(path.join(x.out,'cloud-public-config.js'),'utf8');
    assert(c.includes(config.STAGE3D3_SUPABASE_URL));
    assert.match(c,/CLOUD_STAGE3D3_POLICY_REQUIRED=true/);
    assert.match(c,/CLOUD_STAGE3D2_AUTH_ENABLED=false/);
    const d=JSON.parse(fs.readFileSync(path.join(x.out,'stage3d3-existing-worker-manifest.json'),'utf8'));
    assert.equal(d.releaseStatus,'NOT_INSTALLED_NOT_ACCEPTED');
    assert.equal(d.legacyVersion,sha.slice(0,7));
    const connectedManifest=JSON.parse(fs.readFileSync(path.join(x.out,'stage3d3-manifest.json'),'utf8'));
    assert.equal(connectedManifest.team,null);
    assert.equal(connectedManifest.seasonRef,null);
    assert(!fs.existsSync(path.join(x.out,'stage3c-manifest.json')));
    assert(fs.existsSync(path.join(x.out,'cloud-registration.html')));
    assert(fs.existsSync(path.join(x.out,'cloud-team.html')));
  }finally{fs.rmSync(x.tmp,{recursive:true,force:true});}
});
test('Existing Worker candidate refuses stale baseline, missing protected data, wrong host or target',()=>{
  const x=fixture();
  try{
    assert.throws(()=>buildExistingWorkerCandidate({
      root,legacyDir:x.old,output:x.out,env:{...config,STAGE3D3_ORIGIN:'https://another.example.test'}}),
      /approved-project-origin-required/);
    assert.throws(()=>buildExistingWorkerCandidate({
      root,legacyDir:x.old,output:x.out,env:{...config,STAGE3D3_SUPABASE_URL:'https://foreign.supabase.co'}}),
      /approved-project-origin-required/);
    assert.throws(()=>buildExistingWorkerCandidate({
      root,legacyDir:x.old,output:x.old,env:config}),/output-must-be-new/);
    assert.throws(()=>buildExistingWorkerCandidate({
      root,legacyDir:x.old,output:path.join(x.old,'nested'),env:config}),/output-must-be-new/);
    const manifest=path.join(x.old,'data/manifest.json');
    const original=fs.readFileSync(manifest,'utf8');
    fs.writeFileSync(manifest,original.replace(sha.slice(0,7),'stale'));
    assert.throws(()=>buildExistingWorkerCandidate({
      root,legacyDir:x.old,output:x.out,env:config}),/baseline-source-or-manifest-mismatch/);
    fs.writeFileSync(manifest,original);
    fs.rmSync(path.join(x.old,'data/team.enc.json'));
    assert.throws(()=>buildExistingWorkerCandidate({
      root,legacyDir:x.old,output:x.out,env:config}),/encrypted-source-not-preserved/);
    assert(!fs.existsSync(x.out));
  }finally{fs.rmSync(x.tmp,{recursive:true,force:true});}
});
test('Stage 3C historical builder still explicitly rejects owner reused Supabase',()=>{
  assert.throws(()=>stage3cInputs({
    STAGE3C_SOURCE_SHA:sha,
    STAGE3C_SUPABASE_URL:config.STAGE3D3_SUPABASE_URL,
    STAGE3C_SUPABASE_PUBLISHABLE_KEY:config.STAGE3D3_SUPABASE_PUBLISHABLE_KEY,
    STAGE3C_ORIGIN:config.STAGE3D3_ORIGIN
  }),/configuration-unapproved-or-not-isolated/);
});
test('Shared Worker must preserve legacy root and fail closed on registered API without server secrets',async()=>{
  const env={
    STAGE3D3_REGISTRATION_MODE:'required',
    STAGE3D3_EXISTING_SHARED_WORKER_MODE:'preserve-legacy-pages',
    ASSETS:{fetch:async()=>new Response('legacy-preserved')}
  };
  const base=config.STAGE3D3_ORIGIN;
  assert.equal((await worker.fetch(new Request(base+'/'),env)).status,200);
  assert.equal((await worker.fetch(new Request(base+'/index.html'),env)).status,200);
  assert.equal((await worker.fetch(new Request(base+'/data/team.enc.json'),env)).status,200);
  assert.equal((await worker.fetch(new Request(base+'/api/stage2/v1/play',{
    method:'POST'}),env)).status,404);
  assert.equal((await worker.fetch(new Request(base+'/api/stage1/v1/operation',{
    method:'POST'}),env)).status,503);
  assert.equal((await worker.fetch(new Request(base+'/api/stage3d3/v1/registration'),
    env)).status,503);
});
