// Isolated, non-deploying Stage 3C management staging asset builder.
// Generates a distinct Worker assets directory without the legacy demo vault,
// encrypted data files, synthetic Test Library or any provider admin secret.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {stampVersion} from '../src/build.js';

const SHA=/^[0-9a-f]{40}$/;
const PUB=/^sb_publishable_[A-Za-z0-9_-]{10,160}$/;
const REF=/^https:\/\/[a-z0-9-]+\.supabase\.co$/;
const HTTP=/^https:\/\/[a-z0-9.-]+$/;
const START=['cloud-access.html','cloud-team.html','cloud-access.css',
  'cloud-team.css','styles.css','favicon.svg','cloud-access.js','cloud-team.js'];
export function stage3cInputs(env,{approvedExistingProject=false}={}){
  const sha=env.STAGE3C_SOURCE_SHA;
  const supabaseUrl=(env.STAGE3C_SUPABASE_URL||'').replace(/\/$/,'');
  const origin=(env.STAGE3C_ORIGIN||'').replace(/\/$/,'');
  const publicKey=env.STAGE3C_SUPABASE_PUBLISHABLE_KEY;
  if(!SHA.test(sha||'')||!REF.test(supabaseUrl)||
     !PUB.test(publicKey||'')||!HTTP.test(origin)||
     /\.github\.io$/.test(new URL(origin||'https://invalid.example').hostname)||
     new URL(supabaseUrl||'https://invalid.supabase.co').hostname===
       'uyjxvaobshaahzipzzds.supabase.co' && !approvedExistingProject)
    throw new Error('stage3c-configuration-unapproved-or-not-isolated');
  return {sha,supabaseUrl,origin,publicKey};
}
export function buildStage3C({root=process.cwd(),env=process.env,
  output=path.join(root,'dist-stage3c'),approvedExistingProject=false}={}){
  const args=stage3cInputs(env,{approvedExistingProject});
  const current=execFileSync('git',['-c','safe.directory='+root,'rev-parse','HEAD'],{
    cwd:root,encoding:'utf8'}).trim();
  if(current!==args.sha)throw new Error('stage3c-exact-source-sha-mismatch');
  const source=path.join(root,'site');
  const out=path.resolve(output);
  if(out===path.resolve(root,'dist')||out===source||
     out===path.resolve(root)||out.startsWith(path.resolve(root,'.git')+path.sep))
    throw new Error('stage3c-output-is-not-isolated');
  const originalCloudTeam=fs.readFileSync(path.join(source,'cloud-team.js'),'utf8');
  const cloudTeam=originalCloudTeam
    .replace("import {previewCloudPlay} from './cloud-play-board.js';",
      "import {previewCloudPlay} from './stage3c-no-tactics.js';")
    .replace("import {loadPlayEventDraft} from './play-event-persistence.js';",
      "import {loadPlayEventDraft} from './stage3c-no-tactics.js';");
  if(cloudTeam===originalCloudTeam||
     cloudTeam.includes("from './cloud-play-board.js'")||
     cloudTeam.includes("from './play-event-persistence.js'"))
    throw new Error('stage3c-tactics-import-source-drift');
  const noTactics="export function previewCloudPlay(){throw new Error('stage4-deferred');}\n"+
    "export function loadPlayEventDraft(){throw new Error('stage4-deferred');}\n";
    const overrides=new Map([
    ['cloud-team.js',cloudTeam],
    ['stage3c-no-tactics.js',noTactics]
  ]);
  const needed=new Set(START);
  const queue=['cloud-access.js','cloud-team.js'];
  const JS_IMPORT=/\b(?:from\s*|import\s*)['"]\.\/([a-z0-9-]+\.js)['"]/g;
  while(queue.length){
    const name=queue.shift();
    const content=overrides.get(name)??fs.readFileSync(path.join(source,name),'utf8');
    for(const match of content.matchAll(JS_IMPORT)){
      const child=match[1];
      if(!needed.has(child)){needed.add(child);queue.push(child);}
    }
  }
  // Only the explicit cloud entrypoints and their static module graph are
  // included. No legacy index.html, data/, client files or backup exports.
  fs.rmSync(out,{recursive:true,force:true});
  fs.mkdirSync(out,{recursive:true});
  for(const name of needed){
    const generated=overrides.get(name);
    if(generated!==undefined)fs.writeFileSync(path.join(out,name),generated);
    else fs.copyFileSync(path.join(source,name),path.join(out,name));
  }
  fs.writeFileSync(path.join(out,'cloud-public-config.js'),
    `// Stage 3C generated public information only. No privileged keys.\n`+
    `export const CLOUD_SUPABASE=Object.freeze(${JSON.stringify({
      url:args.supabaseUrl,publishableKey:args.publicKey})});\n`+
    'export const CLOUD_STAGE3C_MODE=true;\n'+
    'export const CLOUD_STAGE3D2_AUTH_ENABLED=false;\n'+
    'export const CLOUD_STAGE3D3_POLICY_REQUIRED=false;\n');
  let html=fs.readFileSync(path.join(out,'cloud-access.html'),'utf8');
  const original='For invited test accounts only. This is an identity and team-permission preview, not the live member application.';
  if(!html.includes(original))throw new Error('stage3c-login-source-drift');
  html=html.replace(original,
    'Controlled staging for four approved adults using fictional team records. Not the live member application.');
  html=html.replace('Cloud identity qualification','Stage 3C connected management trial');
  html=html.replace('Back to demo','Account').replace('href="./">Account</a>','href="cloud-access.html">Account</a>');
  fs.writeFileSync(path.join(out,'cloud-access.html'),html);
  stampVersion(out,args.sha.slice(0,12));
  fs.writeFileSync(path.join(out,'stage3c-manifest.json'),
    JSON.stringify({kind:'team-manager-stage3c',sourceSha:args.sha,
      stagingOrigin:args.origin,supabaseUrl:args.supabaseUrl,
      scope:'four-adults-fictional-team-management-only'},null,2)+'\n');
  return Object.freeze({files:[...needed].sort(),sourceSha:args.sha,
    out,stagingOrigin:args.origin});
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const result=buildStage3C();
    process.stdout.write('Stage 3C isolated assets built from '+result.sourceSha+
      '; '+result.files.length+' public assets. Not deployed.\n');
  }catch(error){
    console.error('Stage 3C build refused: '+error.message);
    process.exitCode=1;
  }
}
