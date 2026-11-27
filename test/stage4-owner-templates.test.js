import test from 'node:test';
import assert from 'node:assert/strict';
import {validateOwnerAction,handleStage3D4Owner} from '../worker/stage3d4-owner-api.js';
const p={id:'step',name:'Step',players:{LM:[24,46]},moves:[]};
test('template create requires explicit owner authorship and strict payload; never accepts source team or tier',()=>{
 const v={action:'template.create',templateId:'template-'+'a'.repeat(32),ownerAuthored:true,play:p};
 assert.ok(validateOwnerAction(v));assert.equal(validateOwnerAction({...v,ownerAuthored:false}),null);
 assert.equal(validateOwnerAction({...v,teamId:'other'}),null);
 assert.equal(validateOwnerAction({...v,accountTier:'free'}),null);
 assert.equal(validateOwnerAction({...v,play:{...p,phone:'private'}}),null);
});
test('template API is disabled without Stage 4 activation, before provider calls',async()=>{
 const req=new Request('https://team-manager.example.test/api/stage3d4/v1/owner',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer synthetic-verified-adult-token-12345678'},body:JSON.stringify({action:'template.list'})});
 let calls=0;
 const r=await handleStage3D4Owner(req,{STAGE3D4_OWNER_ADMIN_MODE:'enabled',STAGE3D3_REGISTRATION_MODE:'required',STAGE3D3_EXISTING_SHARED_WORKER_MODE:'preserve-legacy-pages',SUPABASE_URL:'https://first-team-test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_syntheticpublictestkey1234',SUPABASE_SECRET_KEY:'sb_secret_testonlynonproductionkey012345'},async()=>{calls++;throw Error('unexpected')});
 assert.equal(r.status,503);assert.equal(calls,0);
});
