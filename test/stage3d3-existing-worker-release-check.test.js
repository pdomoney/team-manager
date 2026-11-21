import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {verifyExistingWorkerRelease} from '../scripts/stage3d3-existing-worker-release-check.mjs';
import {CLOUD_SUPABASE} from '../site/cloud-public-config.js';

const SHA='b'.repeat(40);
const NAMES=['team.enc.json','coach.enc.json',...['engadine','kestrels','league','penrith','titans','women'].map(n=>'team-test'+n+'.enc.json')];
function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'tm-release-check-'));
  const data=path.join(root,'data'),candidate=path.join(root,'dist-stage3d3-existing');
  fs.mkdirSync(data);fs.mkdirSync(path.join(candidate,'data'),{recursive:true});
  const config={name:'team-manager',main:'worker/index.js',workers_dev:true,
    preview_urls:false,assets:{directory:'./dist-stage3d3-existing',binding:'ASSETS',run_worker_first:true},
    vars:{STAGE3D3_REGISTRATION_MODE:'required',STAGE3D3_EXISTING_SHARED_WORKER_MODE:'preserve-legacy-pages',
      SUPABASE_URL:CLOUD_SUPABASE.url,SUPABASE_PUBLISHABLE_KEY:CLOUD_SUPABASE.publishableKey}};
  const configPath=path.join(root,'wrangler.stage3d3-existing.jsonc');
  fs.writeFileSync(configPath,JSON.stringify(config,null,2));
  for(const name of NAMES){
    const val=JSON.stringify({format:'team-manager',version:1,role:name==='coach.enc.json'?'coach':'team',kdf:'PBKDF2-SHA256',
      salt:Buffer.alloc(16,1).toString('base64'),iv:Buffer.alloc(12,2).toString('base64'),
      data:Buffer.alloc(32,3).toString('base64')});
    fs.writeFileSync(path.join(data,name),val);
    fs.writeFileSync(path.join(candidate,'data',name),val);
  }
  fs.writeFileSync(path.join(candidate,'data/manifest.json'),JSON.stringify({version:SHA.slice(0,7),files:NAMES}));
  const packageManifest={kind:'team-manager-stage3d3-existing-worker-candidate',sourceSha:SHA,
    worker:'team-manager',origin:'https://team-manager.paul-domoney.workers.dev',
    supabaseUrl:CLOUD_SUPABASE.url,legacyVersion:SHA.slice(0,7),
    releaseStatus:'NOT_INSTALLED_NOT_ACCEPTED',stage3d3ProviderControlsEnabled:false,
    encryptedDataFilesPreserved:NAMES.length};
  const stage={sourceSha:SHA,origin:packageManifest.origin,supabaseUrl:CLOUD_SUPABASE.url,
    team:null,seasonRef:null,providerControlsEnabled:false,releaseStatus:'NOT_PRODUCTION_AUTHORISED'};
  fs.writeFileSync(path.join(candidate,'stage3d3-existing-worker-manifest.json'),JSON.stringify(packageManifest));
  fs.writeFileSync(path.join(candidate,'stage3d3-manifest.json'),JSON.stringify(stage));
  for(const name of ['index.html','app.js','cloud-play-board.js','cloud-access.html',
    'cloud-team.html','cloud-registration.html'])
    fs.writeFileSync(path.join(candidate,name),name==='cloud-registration.html'?'Team Manager · Account registration':'ok');
  fs.writeFileSync(path.join(candidate,'cloud-public-config.js'),
    `${CLOUD_SUPABASE.url} ${CLOUD_SUPABASE.publishableKey} CLOUD_STAGE3D3_POLICY_REQUIRED=true CLOUD_STAGE3D2_AUTH_ENABLED=false`);
  const verify=()=>verifyExistingWorkerRelease({root,sourceSha:SHA});
  return {root,candidate,data,configPath,verify};
}
function mutateJson(file,fn){
  const json=JSON.parse(fs.readFileSync(file,'utf8'));
  fn(json);fs.writeFileSync(file,JSON.stringify(json));
}
test('exact existing Worker candidate checks public bindings and eight encrypted files without deployment',()=>{
  const x=fixture();
  try{
    const r=x.verify();
    assert.equal(r.status,'LOCAL_CANDIDATE_QUALIFIED_NOT_DEPLOYED');
    assert.equal(r.encryptedFilesVerified,8);
    assert.equal(r.liveWorkerVerified,false);
    assert.equal(r.secretConfigured,'UNKNOWN');
    assert.equal(r.rollbackVerified,false);
  }finally{fs.rmSync(x.root,{recursive:true,force:true});}
});
test('incorrect target, missing public binding or privileged secret in vars fail closed',()=>{
  for(const change of [
    c=>{c.name='another-worker';},
    c=>{delete c.vars.SUPABASE_URL;},
    c=>{c.vars.SUPABASE_PUBLISHABLE_KEY='sb_publishable_forged';},
    c=>{c.vars.SUPABASE_SECRET_KEY='sb_secret_should_never_be_committed';},
    c=>{c.vars.STAGE3C_MODE='management-only';},
    c=>{c.assets.run_worker_first=false;}
  ]){
    const x=fixture();
    try{mutateJson(x.configPath,change);assert.throws(x.verify,/stage3d3-release-check-/);}
    finally{fs.rmSync(x.root,{recursive:true,force:true});}
  }
});
test('stale source, missing ciphertext, wrong ciphertext or extra files refuse release',()=>{
  for(const change of [
    x=>mutateJson(path.join(x.candidate,'stage3d3-existing-worker-manifest.json'),m=>{m.sourceSha='a'.repeat(40);}),
    x=>fs.rmSync(path.join(x.candidate,'data/team.enc.json')),
    x=>fs.writeFileSync(path.join(x.candidate,'data/team.enc.json'),'untrusted plain text'),
    x=>fs.writeFileSync(path.join(x.candidate,'data/team-extra.enc.json'),'{}')
  ]){
    const x=fixture();
    try{change(x);assert.throws(x.verify,/stage3d3-release-check-/);}
    finally{fs.rmSync(x.root,{recursive:true,force:true});}
  }
});
test('team activation, season, enabled providers or source-confusing registration copy all refuse',()=>{
  for(const change of [
    x=>mutateJson(path.join(x.candidate,'stage3d3-manifest.json'),m=>{m.team={teamId:'stgeorge-mixed20'};}),
    x=>mutateJson(path.join(x.candidate,'stage3d3-manifest.json'),m=>{m.seasonRef='2026';}),
    x=>mutateJson(path.join(x.candidate,'stage3d3-manifest.json'),m=>{m.providerControlsEnabled=true;}),
    x=>fs.writeFileSync(path.join(x.candidate,'cloud-registration.html'),'St George Oztag · Mixed 20'),
    x=>fs.writeFileSync(path.join(x.candidate,'cloud-public-config.js'),'sb_secret_aaaaaaaaaaaaaaaa')
  ]){
    const x=fixture();
    try{change(x);assert.throws(x.verify,/stage3d3-release-check-/);}
    finally{fs.rmSync(x.root,{recursive:true,force:true});}
  }
});
