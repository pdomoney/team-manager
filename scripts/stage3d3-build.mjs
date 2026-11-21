// Stage 3D.3: actual first-team management app asset candidate, NOT a deployer.
// Reuses the proven isolated Stage 3C asset closure, never the GitHub Pages demo.
// All live provider/client/account actions require separate external approval.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildStage3C,stage3cInputs} from './stage3c-build.mjs';

const SHA=/^[a-f0-9]{40}$/;
const SEASON=/^20[0-9]{2}$/;
const SOURCE_TEAM=Object.freeze({
  club:'St George Oztag',team:'Mixed 20',teamId:'stgeorge-mixed20',sport:'oztag'
});
const FROM='Controlled staging for four approved adults using fictional team records. Not the live member application.';
const REPLACEMENT='Restricted first-team adult setup for St George Oztag · Mixed 20. Real players and volunteers are not onboarded until separate privacy and safeguarding approval.';
const CONFIG_OFF='export const CLOUD_STAGE3D2_AUTH_ENABLED=false;';
const CONFIG_ON='export const CLOUD_STAGE3D2_AUTH_ENABLED=true;';
const POLICY_OFF='export const CLOUD_STAGE3D3_POLICY_REQUIRED=false;';
const POLICY_ON='export const CLOUD_STAGE3D3_POLICY_REQUIRED=true;';

function exactOnce(content,needle,label){
  if(content.split(needle).length!==2)throw new Error('stage3d3-source-drift-'+label);
  return content;
}
export function stage3d3Inputs(env){
  const sourceSha=env.STAGE3D3_SOURCE_SHA;
  // Season belongs to an approved team activation, not the cloud build.
  const season=env.STAGE3D3_SEASON_REF || null;
  const scope=env.STAGE3D3_SCOPE;
  const methods=env.STAGE3D3_PROVIDER_METHODS;
  // A flag isn't proof of approval. It selects only the generated source's
  // visible controls; external provider/privacy/installation gates still HOLD.
  if(!SHA.test(sourceSha||'') || (season!==null && !SEASON.test(season)) ||
     scope!=='individually-authorised-adults-only' ||
     !['off','on'].includes(methods) ||
     (methods==='on'&&env.STAGE3D3_PROVIDER_SETUP_REVIEWED!=='yes'))
    throw new Error('stage3d3-configuration-not-ready');
  const args=stage3cInputs({
    STAGE3C_SOURCE_SHA:sourceSha,
    STAGE3C_SUPABASE_URL:env.STAGE3D3_SUPABASE_URL,
    STAGE3C_SUPABASE_PUBLISHABLE_KEY:env.STAGE3D3_SUPABASE_PUBLISHABLE_KEY,
    STAGE3C_ORIGIN:env.STAGE3D3_ORIGIN
  },{approvedExistingProject:true});
  if(new URL(args.origin).pathname!=='/' ||
     new URL(args.origin).username || new URL(args.origin).password ||
     new URL(args.origin).search || new URL(args.origin).hash ||
     new URL(args.supabaseUrl).pathname!=='/')
    throw new Error('stage3d3-origin-must-be-a-dedicated-https-origin');
  return {...args,season,scope,methods};
}
export function buildStage3D3({root=process.cwd(),env=process.env,
  output=path.join(root,'dist-stage3d3')}={}){
  const args=stage3d3Inputs(env);
  const out=path.resolve(output);
  if(out===path.resolve(root,'dist-stage3c') ||
     out===path.resolve(root,'dist-stage3d3-public') ||
     out.startsWith(path.resolve(root,'dist-stage3c')+path.sep))
    throw new Error('stage3d3-output-collides-with-existing-build');
  const built=buildStage3C({root,
    env:{
      STAGE3C_SOURCE_SHA:args.sha,
      STAGE3C_SUPABASE_URL:args.supabaseUrl,
      STAGE3C_SUPABASE_PUBLISHABLE_KEY:args.publicKey,
      STAGE3C_ORIGIN:args.origin
    },output:out,approvedExistingProject:true});
  const configFile=path.join(out,'cloud-public-config.js');
  const config=fs.readFileSync(configFile,'utf8');
  exactOnce(config,CONFIG_OFF,'auth-toggle');
  exactOnce(config,POLICY_OFF,'policy-flag');
  fs.writeFileSync(configFile,config.replace(CONFIG_OFF,
    args.methods==='on'?CONFIG_ON:CONFIG_OFF).replace(POLICY_OFF,POLICY_ON));
  // Deliberately include this page only in the connected first-team build.
  for(const name of ['cloud-registration.html','cloud-registration.js',
    'cloud-owner.html','cloud-owner.js','cloud-owner.css'])
    fs.copyFileSync(path.join(root,'site',name),path.join(out,name));
  if(!args.season){
    const registrationPath=path.join(out,'cloud-registration.html');
    const registration=fs.readFileSync(registrationPath,'utf8');
    const firstTeamEyebrow='<p class="access-eyebrow">St George Oztag · Mixed 20</p>';
    exactOnce(registration,firstTeamEyebrow,'registration-team-label');
    fs.writeFileSync(registrationPath,registration.replace(firstTeamEyebrow,
      '<p class="access-eyebrow">Team Manager · Account registration</p>'));
  }
  const accessFile=path.join(out,'cloud-access.html');
  let html=fs.readFileSync(accessFile,'utf8');
  exactOnce(html,FROM,'login-copy');
  const accountOnly='Restricted adult-account setup for Team Manager. No club, team or competition season is configured by this deployment. Real players and volunteers remain unavailable until separate privacy and safeguarding approval.';
  html=html.replace(FROM,args.season ? REPLACEMENT : accountOnly)
    .replace('Stage 3C connected management trial',
      'First team · restricted setup')
    .replace('What this preview verifies','How team access works');
  fs.writeFileSync(accessFile,html);
  const oldManifest=path.join(out,'stage3c-manifest.json');
  if(!fs.existsSync(oldManifest))throw new Error('stage3d3-staging-manifest-missing');
  fs.rmSync(oldManifest);
  fs.writeFileSync(path.join(out,'stage3d3-manifest.json'),
    JSON.stringify({
      kind:'team-manager-stage3d3-first-team',
      sourceSha:args.sha,origin:args.origin,supabaseUrl:args.supabaseUrl,
      team:args.season ? SOURCE_TEAM : null,seasonRef:args.season,
      providerControlsEnabled:args.methods==='on',
      scope:'individually-authorised-adults-only',
      releaseStatus:'NOT_PRODUCTION_AUTHORISED'
    },null,2)+'\n');
  // Legacy encrypted data, index.html, live participant fixtures, secrets,
  // tactics routes and fictional Stage 3C marker must all remain absent.
  for(const forbidden of ['index.html','stage3c-manifest.json','coach.enc.json',
    'team.enc.json','test-library.html','cloud-play-board.js']){
    if(fs.existsSync(path.join(out,forbidden)))
      throw new Error('stage3d3-unexpected-public-asset');
  }
  return Object.freeze({...built,out,team:args.season ? SOURCE_TEAM : null,
    sourceSha:args.sha,providerControlsEnabled:args.methods==='on'});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const result=buildStage3D3();
    process.stdout.write('Stage 3D.3 first-team assets built for source '+
      result.sourceSha+'. NOT deployed; NOT release authorised.\n');
  }catch(e){
    console.error('Stage 3D.3 source build refused: '+e.message);
    process.exitCode=1;
  }
}
