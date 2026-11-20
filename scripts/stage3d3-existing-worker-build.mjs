// Package the approved Stage 3D.3 connected app into the EXISTING Team Manager
// Worker without replacing the site's index, play editor or encrypted files.
// This builder DOES NOT deploy, apply SQL or configure any provider.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isEncryptedFile,roleOf} from '../src/build.js';
import {buildStage3D3,stage3d3Inputs} from './stage3d3-build.mjs';

const EXISTING_ORIGIN='https://team-manager.paul-domoney.workers.dev';
const EXISTING_SUPABASE='https://uyjxvaobshaahzipzzds.supabase.co';
const RETAIN=new Set(['index.html','app.js','cloud-play-board.js']);
const PUBLIC_CLOUD=/^cloud-[a-z0-9-]+\.(?:js|html|css)$/;
const extraAllowed=new Set(['stage3c-no-tactics.js','stage3d3-manifest.json']);

function filesUnder(root){
  const entries=[];
  function walk(dir,prefix=''){
    for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
      if(ent.isSymbolicLink()||(!ent.isFile()&&!ent.isDirectory()))
        throw new Error('existing-worker-snapshot-unsafe-file-type');
      const name=prefix+ent.name;
      if(ent.isDirectory())walk(path.join(dir,ent.name),name+'/');
      else entries.push(name);
    }
  }
  walk(root);
  return entries.sort();
}
const sameFile=(a,b)=>fs.readFileSync(a).equals(fs.readFileSync(b));
function sameSourceDifferentCacheStamp(a,b){
  if(!a.endsWith('.js')||!b.endsWith('.js'))return false;
  const normalise=file=>fs.readFileSync(file,'utf8')
    .replace(/\?v=[a-f0-9]{7,12}\b/g,'?v=SOURCE-STAMP');
  return normalise(a)===normalise(b);
}

export function buildExistingWorkerCandidate({
  root=process.cwd(), env=process.env,
  legacyDir=path.join(root,'dist'),
  output=path.join(root,'dist-stage3d3-existing')
}={}){
  // Owner-selected reuse is explicit and exact, not an arbitrary project/host.
  const conf=stage3d3Inputs(env);
  if(conf.origin!==EXISTING_ORIGIN||conf.supabaseUrl!==EXISTING_SUPABASE)
    throw new Error('existing-worker-approved-project-origin-required');

  const legacy=path.resolve(legacyDir),out=path.resolve(output);
  const source=path.resolve(root);
  if(legacy===out || out===source || out===path.join(source,'dist') ||
     out===path.join(source,'site') || out.startsWith(source+path.sep+'.git'+path.sep) ||
     out.startsWith(legacy+path.sep) || legacy.startsWith(out+path.sep) ||
     fs.existsSync(out))
    throw new Error('existing-worker-output-must-be-new-isolated-directory');

  // This must be an exact-source legacy build, with its data branch included.
  // Refuse a stale, missing or synthetic preview, instead of silently
  // publishing an empty data/ and erasing previously available encrypted files.
  if(!['index.html','app.js','data/manifest.json'].every(file=>
    fs.statSync(path.join(legacy,file),{throwIfNoEntry:false})?.isFile()))
    throw new Error('existing-worker-baseline-or-data-manifest-missing');
  const old=JSON.parse(fs.readFileSync(path.join(legacy,'data/manifest.json'),'utf8'));
  if(old?.version!==conf.sha.slice(0,7)||!Array.isArray(old.files)||
     !old.files.every(n=>typeof n==='string'&&roleOf(n))||
     new Set(old.files).size!==old.files.length)
    throw new Error('existing-worker-baseline-source-or-manifest-mismatch');
  for(const n of old.files){
    const file=path.join(legacy,'data',n);
    if(!fs.statSync(file,{throwIfNoEntry:false})?.isFile()||
       !isEncryptedFile(fs.readFileSync(file,'utf8'),roleOf(n)))
      throw new Error('existing-worker-encrypted-source-not-preserved');
  }

  const before=filesUnder(legacy);
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'tm-existing-worker-'));
  try{
    const stage=path.join(tmp,'stage3d3');
    buildStage3D3({root,env,output:stage});
    const changes=filesUnder(stage);
    for(const name of changes){
      const sourceFile=path.join(stage,name);
      const existingFile=path.join(legacy,name);
      if(name.includes('/')||(!PUBLIC_CLOUD.test(name)&&!extraAllowed.has(name)&&
         !fs.existsSync(existingFile)) ||
         (RETAIN.has(name)) ||
         (fs.existsSync(existingFile)&&!PUBLIC_CLOUD.test(name)&&
           !sameFile(sourceFile,existingFile)&&
           !sameSourceDifferentCacheStamp(sourceFile,existingFile)))
        throw new Error('existing-worker-unexpected-asset-collision:'+name);
    }
    fs.cpSync(legacy,out,{recursive:true,errorOnExist:true,force:false});
    for(const name of changes){
      // Keep existing non-cloud scripts and their cache stamps unchanged.
      // Only the isolated cloud entrypoints and new manifest are replaced.
      if(PUBLIC_CLOUD.test(name)||extraAllowed.has(name))
        fs.copyFileSync(path.join(stage,name),path.join(out,name));
    }
    for(const name of before){
      // Every non-cloud legacy asset, including encrypted data and all plays,
      // remains identical. This also proves the original site was not erased.
      if(!PUBLIC_CLOUD.test(name) &&
          !sameFile(path.join(legacy,name),path.join(out,name)))
        throw new Error('existing-worker-protected-asset-changed:'+name);
    }
    const result={
      kind:'team-manager-stage3d3-existing-worker-candidate',
      sourceSha:conf.sha,worker:'team-manager',origin:conf.origin,
      supabaseUrl:conf.supabaseUrl,legacyVersion:old.version,
      legacyAssetsPreserved:before.length,encryptedDataFilesPreserved:old.files.length,
      stage3d3ProviderControlsEnabled:conf.methods==='on',
      releaseStatus:'NOT_INSTALLED_NOT_ACCEPTED'
    };
    fs.writeFileSync(path.join(out,'stage3d3-existing-worker-manifest.json'),
      JSON.stringify(result,null,2)+'\n');
    return Object.freeze({output:out,...result});
  }catch(e){
    // The new directory is disposable; the source legacy build is untouched.
    if(fs.existsSync(out))fs.rmSync(out,{recursive:true,force:true});
    throw e;
  }finally{
    fs.rmSync(tmp,{recursive:true,force:true});
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const result=buildExistingWorkerCandidate();
    console.log('Existing Worker candidate built from '+result.sourceSha+
      '. Encrypted data preserved: '+result.encryptedDataFilesPreserved+
      '. NOT DEPLOYED.');
  }catch(e){
    console.error('Existing Worker build refused: '+e.message);
    process.exitCode=1;
  }
}
