// Read-only Stage 3C real-service acceptance. Never provision users, mutate data,
// log tokens/identities, or convert synthetic CI results into release evidence.
// Tokens must be supplied through a private ephemeral environment after approval.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

const SHA=/^[0-9a-f]{40}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUB=/^sb_publishable_[A-Za-z0-9_-]{10,160}$/;
const ACTORS=Object.freeze([
  {label:'Coach',role:'team_coach',env:'STAGE3C_COACH_TOKEN',read:'schedule.read'},
  {label:'Manager',role:'team_manager',env:'STAGE3C_MANAGER_TOKEN',read:'schedule.read'},
  {label:'Player',role:'team_player',env:'STAGE3C_PLAYER_TOKEN',read:'schedule.read'},
  {label:'Volunteer',role:'team_volunteer',env:'STAGE3C_VOLUNTEER_TOKEN',read:'duty.read'}
]);
const rejected=code=>Object.assign(new Error(code),{code});
const originOnly=(value)=>{
  let u;
  try{u=new URL(value);}catch{throw rejected('invalid-staging-origin');}
  if(u.protocol!=='https:'||u.username||u.password||u.port||
    u.pathname!=='/'||u.search||u.hash||u.hostname.endsWith('.github.io'))
    throw rejected('invalid-staging-origin');
  return u.origin;
};
function config(env){
  if(env.STAGE3C_ALLOW_CONNECTED_READ!=='yes')
    throw rejected('connected-read-requires-explicit-operator-confirmation');
  const origin=originOnly(env.STAGE3C_ORIGIN);
  const project=originOnly(env.STAGE3C_SUPABASE_URL);
  if(!project.endsWith('.supabase.co')||
    !PUB.test(env.STAGE3C_SUPABASE_PUBLISHABLE_KEY||'')||
    !SHA.test(env.STAGE3C_SOURCE_SHA||'')||
    !ID.test(env.STAGE3C_TEAM_ID||'')||
    !ID.test(env.STAGE3C_FOREIGN_TEAM_ID||'')||
    env.STAGE3C_TEAM_ID===env.STAGE3C_FOREIGN_TEAM_ID)
    throw rejected('invalid-stage3c-trial-configuration');
  const actors=ACTORS.map(item=>{
    const token=env[item.env];
    if(typeof token!=='string'||!/^\S{12,8192}$/.test(token))
      throw rejected('missing-test-account-session');
    return {...item,token};
  });
  if(new Set(actors.map(x=>x.token)).size!==4)
    throw rejected('duplicate-actor-session');
  return {origin,project,sourceSha:env.STAGE3C_SOURCE_SHA,
    pub:env.STAGE3C_SUPABASE_PUBLISHABLE_KEY,
    team:env.STAGE3C_TEAM_ID,foreign:env.STAGE3C_FOREIGN_TEAM_ID,actors};
}
async function exchange(fetchImpl,url,options={}){
  let res;
  try{res=await fetchImpl(url,{redirect:'manual',cache:'no-store',...options});}
  catch{throw rejected('connection-failed');}
  if(!res||![200,401,403,404].includes(res.status))
    throw rejected('unexpected-service-response');
  let data=null;
  try{data=await res.json();}catch{ /* 404 and redirect may have no JSON */ }
  return {status:res.status,data,headers:res.headers};
}
function actionBody(team,role,action){
  return {activeTeamId:team,activeRole:role,action,resourceId:team,payload:{}};
}
function noPrivateInfo(value){
  return value&&typeof value==='object'&&!Array.isArray(value);
}
export async function verifyStage3C({env=process.env,fetchImpl=fetch}={}){
  const c=config(env);
  const report={kind:'stage3c-connected-read-verification',
    sourceSha:c.sourceSha,overall:'FAIL',checks:[],liveExternalServiceContacted:false};
  const check=(label,ok)=>{report.checks.push({name:label,status:ok?'PASS':'FAIL'});};
  const manifest=await exchange(fetchImpl,c.origin+'/stage3c-manifest.json');
  check('exact-staging-source',manifest.status===200&&
    manifest.data?.kind==='team-manager-stage3c'&&
    manifest.data.sourceSha===c.sourceSha&&
    manifest.data.stagingOrigin===c.origin&&
    manifest.data.supabaseUrl===c.project);
  const forbidden=await exchange(fetchImpl,c.origin+'/index.html');
  check('legacy-demo-unavailable',forbidden.status===404);
  const protectedPlay=await exchange(fetchImpl,c.origin+'/api/stage2/v1/play',{
    method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  check('stage4-play-api-disabled',protectedPlay.status===404);
  const unauth=await exchange(fetchImpl,c.origin+'/api/stage1/v1/operation',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(
      actionBody(c.team,'team_coach','schedule.read'))});
  check('unauthenticated-denied',unauth.status===401);

  const seen=[];
  for(const item of c.actors){
    const userHeaders={apikey:c.pub,Authorization:'Bearer '+item.token,
      'Content-Type':'application/json'};
    const who=await exchange(fetchImpl,c.project+'/auth/v1/user',{
      method:'GET',headers:userHeaders});
    const id=who.data?.id;
    const verified=who.status===200&&UUID.test(id||'')&&
      (who.data?.email_confirmed_at||who.data?.confirmed_at);
    seen.push(verified?id:null);
    check(item.label+'-real-verified-account',!!verified);
    if(!verified)continue;
    const contexts=await exchange(fetchImpl,c.project+
      '/rest/v1/rpc/tm_my_team_context',{
      method:'POST',headers:userHeaders,body:'{}'});
    const roleGranted=contexts.status===200&&
      Array.isArray(contexts.data)&&
      contexts.data.some(g=>g.team_id===c.team&&g.team_role===item.role);
    check(item.label+'-approved-exact-team-role',roleGranted);
    const call=async(team,role,action)=>{
      const isManagement=['notices.read','report.summary'].includes(action);
      return exchange(fetchImpl,c.origin+(isManagement?'/api/stage3b/v1/operation':
        '/api/stage1/v1/operation'),{
        method:'POST',headers:{'Authorization':'Bearer '+item.token,
          'Content-Type':'application/json'},
        body:JSON.stringify(actionBody(team,role,action))
      });
    };
    const permitted=await call(c.team,item.role,item.read);
    check(item.label+'-real-management-read',
      permitted.status===200&&permitted.data?.ok===true&&
      permitted.data?.code==='permitted'&&Array.isArray(permitted.data?.data));
    const notices=await call(c.team,item.role,'notices.read');
    check(item.label+'-shared-notices-read',
      notices.status===200&&notices.data?.ok===true&&Array.isArray(notices.data?.data));
    const foreign=await call(c.foreign,item.role,item.read);
    check(item.label+'-foreign-team-denied',
      foreign.status===403&&foreign.data?.ok===false);
    if(item.role==='team_volunteer'){
      const elevated=await call(c.team,'team_manager','schedule.read');
      check('volunteer-cannot-assume-manager',
        elevated.status===403&&elevated.data?.ok===false);
    }
  }
  check('four-independent-identities',seen.length===4&&
    seen.every(Boolean)&&new Set(seen).size===4);
  report.liveExternalServiceContacted=true;
  report.overall=report.checks.every(q=>q.status==='PASS')?'PASS':'FAIL';
  return report; // No emails, UUIDs, access tokens, SQL rows or private error text.
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const result=await verifyStage3C();
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    if(result.overall!=='PASS')process.exitCode=1;
  }catch(error){
    process.stderr.write('Stage 3C connected read blocked: '+
      (error?.code||'unexpected-error')+'\n');
    process.exitCode=1;
  }
}
