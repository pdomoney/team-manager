// Read-only exact-source qualification for the existing Team Manager Worker.
// No network requests, privileged credentials, SQL, deployment or file mutation.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {CLOUD_SUPABASE} from '../site/cloud-public-config.js';
import {isEncryptedFile,roleOf} from '../src/build.js';

const SHA=/^[a-f0-9]{40}$/;
const ORIGIN='https://team-manager.paul-domoney.workers.dev';
const fail=code=>{throw new Error('stage3d3-release-check-'+code);};
const readJson=file=>{
  try{return JSON.parse(fs.readFileSync(file,'utf8'));}
  catch{fail('invalid-or-missing-json');}
};
const getFile=(root,file)=>path.join(root,file);
const same=(a,b)=>fs.readFileSync(a).equals(fs.readFileSync(b));

export function verifyExistingWorkerRelease({
  root=process.cwd(),
  sourceSha,
  candidateDir=path.join(root,'dist-stage3d3-existing'),
  sourceDataDir=path.join(root,'data'),
  configPath=path.join(root,'wrangler.stage3d3-existing.jsonc'),
  expectedEncryptedFiles=8
}={}){
  if(!SHA.test(sourceSha||''))fail('source-sha-required');
  let config;
  try{
    const jsonc=fs.readFileSync(configPath,'utf8')
      .replace(/^\s*\/\/.*$/gm,'');
    config=JSON.parse(jsonc);
  }catch{fail('invalid-deployment-config');}
  if(config.name!=='team-manager'||config.main!=='worker/index.js'||
     config.workers_dev!==true||config.preview_urls!==false||
     config.assets?.directory!=='./dist-stage3d3-existing'||
     config.assets?.binding!=='ASSETS'||config.assets?.run_worker_first!==true)
    fail('unexpected-worker-target');
  const vars=config.vars;
  if(!vars||vars.STAGE3D3_REGISTRATION_MODE!=='required'||
     vars.STAGE3D3_EXISTING_SHARED_WORKER_MODE!=='preserve-legacy-pages'||
     'STAGE3C_MODE' in vars)fail('unsafe-worker-mode');
  if(vars.SUPABASE_URL!==CLOUD_SUPABASE.url||
     vars.SUPABASE_PUBLISHABLE_KEY!==CLOUD_SUPABASE.publishableKey)
    fail('missing-or-mismatched-public-bindings');
  if(Object.keys(vars).some(n=>/secret|service.role|token|password/i.test(n))||
     Object.values(vars).some(v=>typeof v==='string'&&v.includes('sb_secret_')))
    fail('secret-placed-in-public-config');

  const packageManifest=readJson(getFile(candidateDir,'stage3d3-existing-worker-manifest.json'));
  const stage=readJson(getFile(candidateDir,'stage3d3-manifest.json'));
  const legacy=readJson(getFile(candidateDir,'data/manifest.json'));
  if(packageManifest.kind!=='team-manager-stage3d3-existing-worker-candidate'||
     packageManifest.sourceSha!==sourceSha||
     packageManifest.worker!=='team-manager'||
     packageManifest.origin!==ORIGIN||
     packageManifest.supabaseUrl!==CLOUD_SUPABASE.url||
     packageManifest.legacyVersion!==sourceSha.slice(0,7)||
     packageManifest.releaseStatus!=='NOT_INSTALLED_NOT_ACCEPTED'||
     packageManifest.stage3d3ProviderControlsEnabled!==false)
    fail('package-source-or-release-mismatch');
  if(stage.sourceSha!==sourceSha||stage.origin!==ORIGIN||
     stage.supabaseUrl!==CLOUD_SUPABASE.url||stage.team!==null||
     stage.seasonRef!==null||stage.providerControlsEnabled!==false||
     stage.releaseStatus!=='NOT_PRODUCTION_AUTHORISED')
    fail('unexpected-team-or-account-activation');
  if(legacy.version!==sourceSha.slice(0,7)||
     !Array.isArray(legacy.files)||
     legacy.files.length!==expectedEncryptedFiles||
     packageManifest.encryptedDataFilesPreserved!==expectedEncryptedFiles||
     new Set(legacy.files).size!==legacy.files.length)
    fail('stale-or-incomplete-encrypted-manifest');
  if(!['index.html','app.js','cloud-play-board.js','cloud-access.html',
        'cloud-team.html','cloud-registration.html'].every(n=>
          fs.statSync(getFile(candidateDir,n),{throwIfNoEntry:false})?.isFile()))
    fail('missing-preserved-or-connected-assets');
  for(const name of legacy.files){
    if(!roleOf(name)||!fs.statSync(getFile(sourceDataDir,name),
        {throwIfNoEntry:false})?.isFile()||
       !fs.statSync(getFile(candidateDir,'data/'+name),
        {throwIfNoEntry:false})?.isFile())
      fail('missing-encrypted-file');
    const source=getFile(sourceDataDir,name),dest=getFile(candidateDir,'data/'+name);
    if(!same(source,dest)||!isEncryptedFile(fs.readFileSync(dest,'utf8'),roleOf(name)))
      fail('encrypted-content-differs');
  }
  const publishedFiles=fs.readdirSync(getFile(candidateDir,'data'))
    .filter(n=>n.endsWith('.enc.json')).sort();
  if(JSON.stringify(publishedFiles)!==JSON.stringify([...legacy.files].sort()))
    fail('unmanifested-encrypted-file');
  const publicConfig=fs.readFileSync(getFile(candidateDir,'cloud-public-config.js'),'utf8');
  if(!publicConfig.includes(CLOUD_SUPABASE.publishableKey)||
     !publicConfig.includes(CLOUD_SUPABASE.url)||
     !publicConfig.includes('CLOUD_STAGE3D3_POLICY_REQUIRED=true')||
     !publicConfig.includes('CLOUD_STAGE3D2_AUTH_ENABLED=false')||
     /sb_secret_|SUPABASE_SERVICE_ROLE_KEY/.test(publicConfig))
    fail('unsafe-connected-client-config');
  const registration=fs.readFileSync(getFile(candidateDir,'cloud-registration.html'),'utf8');
  if(!registration.includes('Team Manager · Account registration')||
     registration.includes('St George Oztag · Mixed 20'))
    fail('first-team-is-not-optional');
  return Object.freeze({
    status:'LOCAL_CANDIDATE_QUALIFIED_NOT_DEPLOYED',sourceSha,
    worker:'team-manager',encryptedFilesVerified:legacy.files.length,
    publicBindingsVerified:true,providerControlsEnabled:false,
    liveWorkerVerified:false,rollbackVerified:false,secretConfigured:'UNKNOWN'
  });
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv.length!==2)fail('unexpected-cli-arguments');
    const root=process.cwd();
    const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
    const result=verifyExistingWorkerRelease({root,sourceSha:sha});
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }catch(e){
    console.error('HOLD: '+e.message);
    process.exitCode=1;
  }
}
