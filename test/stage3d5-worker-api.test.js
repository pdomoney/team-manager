import test from 'node:test';
import assert from 'node:assert/strict';
import {handleStage3D5Team} from '../worker/stage3d5-management-api.js';
import worker from '../worker/index.js';
const URI='https://team-manager.example.test/api/stage3d5/v1/team';
const USER='55555555-5555-4555-8555-555555555555';
const TOKEN='Bearer synthetic-verified-adult-token-1234567890';
const env=Object.freeze({
 STAGE3D3_REGISTRATION_MODE:'required',
 STAGE3D3_EXISTING_SHARED_WORKER_MODE:'preserve-legacy-pages',
 STAGE3D4_OWNER_ADMIN_MODE:'enabled',
 SUPABASE_URL:'https://team-manager-test.supabase.co',
 SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fictionalsafevaluetests12345',
 SUPABASE_SECRET_KEY:'sb_secret_fictionalsafeserverkey12345',
 ONBOARDING_REDIRECT_URL:'https://team-manager.example.test/cloud-access.html'
});
const req=(action,input={},extra={})=>new Request(URI,{
 method:'POST',headers:{'Content-Type':'application/json',Authorization:TOKEN,...extra},
 body:JSON.stringify({teamId:'stgeorge-mixed20',role:'team_coach',action,input})
});
const reply=(value,status=200)=>({ok:status<400,status,json:async()=>value});
function provider({rpc=()=>({ok:true,code:'permitted',data:[]}),user={
 id:USER,email:'coach@fictional.test',email_confirmed_at:'2026-11-23T02:00:00Z'
},emailStatus=200}={}){
 const calls=[];
 const fetchImpl=async(url,opts)=>{
  const u=new URL(url),body=opts.body?JSON.parse(opts.body):null;
  calls.push({path:u.pathname,body,headers:opts.headers});
  if(u.pathname==='/auth/v1/user')return reply(user);
  if(u.pathname==='/rest/v1/rpc/tm_stage3d5_team')return reply(rpc(body));
  if(u.pathname==='/auth/v1/invite')return reply({},emailStatus);
  if(u.pathname==='/rest/v1/rpc/tm_stage3_delivery_result')return reply({ok:true});
  throw Error('Unknown upstream route '+u.pathname);
 };
 return {calls,fetchImpl};
}
test('Stage 3D.5 API rejects anonymous, cross-site and forged elevated role before provider',async()=>{
 const f=provider();
 assert.equal((await handleStage3D5Team(req('settings.read',{},{
  Authorization:''}),env,f.fetchImpl)).status,401);
 assert.equal((await handleStage3D5Team(req('settings.read',{},{
  Origin:'https://attacker.example.test'}),env,f.fetchImpl)).status,403);
 assert.equal((await handleStage3D5Team(req('settings.read'),{
  ...env,STAGE3D3_REGISTRATION_MODE:'off'
 },f.fetchImpl)).status,503);
 const forged=new Request(URI,{method:'POST',headers:{
  'Content-Type':'application/json',Authorization:TOKEN},
  body:JSON.stringify({teamId:'stgeorge-mixed20',role:'platform_owner',
   action:'settings.read',input:{}})});
 assert.equal((await handleStage3D5Team(forged,env,f.fetchImpl)).status,400);
 assert.equal(f.calls.length,0);
});
test('Trusted actor is taken from verified Supabase identity, never browser payload',async()=>{
 const f=provider({rpc:()=>({ok:true,code:'permitted',data:{canAdmin:true,
  role:'team_coach'}})});
 const res=await handleStage3D5Team(req('admin.status'),env,f.fetchImpl);
 assert.equal(res.status,200);
 assert.deepEqual(await res.json(),{ok:true,code:'permitted',
  data:{canAdmin:true,role:'team_coach'}});
 const rpc=f.calls.find(x=>x.path==='/rest/v1/rpc/tm_stage3d5_team');
 assert.equal(rpc.body.p_actor,USER);
 assert.equal(rpc.body.p_team,'stgeorge-mixed20');
 assert.equal(rpc.body.p_role,'team_coach');
 assert.equal(rpc.headers.apikey,env.SUPABASE_SECRET_KEY);
 assert(!('Authorization' in rpc.headers));
});
test('Private SQL denial is never converted to permission, and foreign objects are not leaked',async()=>{
 const denied=provider({rpc:()=>({ok:false,code:'scope-denied'})});
 const r=await handleStage3D5Team(req('team.members'),env,denied.fetchImpl);
 assert.equal(r.status,403);
 assert.equal((await r.json()).code,'scope-denied');
 const malformed=provider({rpc:()=>({ok:true,code:'permitted',
  data:[] ,internalEmail:'private@fictional.test'})});
 const bad=await handleStage3D5Team(req('admin.status'),env,malformed.fetchImpl);
 // Provider extra fields must not become browser-visible even on successful reads.
 assert(!JSON.stringify(await bad.json()).includes('private@fictional.test'));
});
test('Team-level Player invitation only sends after SQL approval, never returns email or secrets',async()=>{
 const id='invite-'+'a'.repeat(32);
 const f=provider({rpc:()=>({ok:true,code:'committed',
  data:{invitationId:id,internalEmail:'player@fictional.test'}})});
 const r=await handleStage3D5Team(req('invite.issue',{
  email:'player@fictional.test',role:'team_player'}),env,f.fetchImpl);
 assert.equal(r.status,200);
 assert.deepEqual(await r.json(),{ok:true,code:'committed',
  data:{invitationId:id,delivery:'sent'}});
 assert(f.calls.some(x=>x.path==='/auth/v1/invite'));
 assert(f.calls.some(x=>x.path==='/rest/v1/rpc/tm_stage3_delivery_result'));
 assert(!JSON.stringify(await r.json()).includes('player@fictional.test'));
 const no=provider({rpc:()=>({ok:false,code:'role-denied'})});
 const blocked=await handleStage3D5Team(req('invite.issue',{
  email:'player@fictional.test',role:'team_player'}),env,no.fetchImpl);
 assert.equal(blocked.status,403);
 assert(!no.calls.some(x=>x.path==='/auth/v1/invite'));
});
test('New route rejects unauthenticated request while preserving existing policy gate',async()=>{
 const r=await worker.fetch(new Request(URI,{method:'POST',headers:{
  'Content-Type':'application/json'},body:'{}'}),env);
 assert.equal(r.status,401);
});
