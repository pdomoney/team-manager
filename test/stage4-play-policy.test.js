import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import {handleStage2PlayRequest} from '../worker/stage2-play-api.js';
const env={STAGE4_TACTICS_MODE:'enabled',STAGE3D3_REGISTRATION_MODE:'required',STAGE3D3_EXISTING_SHARED_WORKER_MODE:'preserve-legacy-pages',
 SUPABASE_URL:'https://fictional-stage4.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_FictionalStage4Key',SUPABASE_SERVICE_ROLE_KEY:'fictional.jwt.service_only'};
const endpoint='https://example.test/api/stage2/v1/play';
const id='11111111-1111-4111-8111-111111111111';
const play={id:'step-out',name:'Step Out',players:{LM:[24,46],RM:[25,42]},moves:[]};
const draft={playId:'play-1',revisionId:'rev-1',version:2,revisionStatus:'draft',play};
const req=(action='play.published.read',role='team_coach',payload={},resource='team-a',auth=true)=>new Request(endpoint,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer synthetic.jwt.signed_token'}:{})},body:JSON.stringify({activeTeamId:'team-a',activeRole:role,action,resourceId:resource,payload})});
const ok=x=>({ok:true,json:async()=>x});
test('existing production route remains blocked without explicit Stage 4 flag or registration',async()=>{
 for(const e of [{...env,STAGE4_TACTICS_MODE:undefined},{...env,STAGE3D3_REGISTRATION_MODE:undefined},{...env,STAGE3D3_EXISTING_SHARED_WORKER_MODE:undefined},{...env,STAGE3C_MODE:'management-only'}])
  assert.equal((await worker.fetch(req(),e)).status,404);
 const res=await worker.fetch(req('play.published.read','team_player',{},'team-a',false),env);
 assert.equal(res.status,401);assert.equal((await res.json()).code,'unauthenticated');
});
test('strict connected publication validates exact draft and existing RPC remains revision authority',async()=>{
 const calls=[];
 const transport=async(url,options)=>{
  if(url.endsWith('/auth/v1/user'))return ok({id});
  const body=JSON.parse(options.body);calls.push(body);
  return body.p_action==='play.draft.read'?ok({ok:true,code:'permitted',data:[draft]}):ok({ok:true,code:'committed',resourceId:'play-1',revisionId:'rev-1',version:3});
 };
 const payload={mutationId:'synthetic-publish-001',expectedVersion:2,revisionId:'rev-1'};
 const result=await handleStage2PlayRequest(req('play.publish','team_coach',payload,'play-1'),env,transport);
 assert.equal(result.status,200);assert.equal(calls.length,2);assert.equal(calls[0].p_action,'play.draft.read');assert.equal(calls[1].p_action,'play.publish');
 calls.length=0;
 assert.equal((await handleStage2PlayRequest(req('play.publish','team_coach',{...payload,revisionId:'rev-other'},'play-1'),env,transport)).status,409);
 assert.equal(calls.length,1);
});
test('unsafe nested published content is replaced by one reason-coded placeholder, never exposed',async()=>{
 const unsafe={...draft,play:{...play,notes:{LM:{text:'hidden',privatePhone:'private'}}}};
 const transport=async url=>url.endsWith('/auth/v1/user')?ok({id}):ok({ok:true,code:'permitted',data:[unsafe]});
 const res=await handleStage2PlayRequest(req('play.published.read','team_player'),env,transport);
 assert.equal(res.status,200);
 const row=(await res.json()).data[0];
 assert.equal(row.unavailableReason,'unsupported-play-payload');
 assert.equal(row.play.name,'Published play requires review');
 assert(!JSON.stringify(row).includes('privatePhone'));
});
