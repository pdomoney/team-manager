import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handleStage3D3Registration} from '../worker/stage3d3-registration.js';
import {handleStage3D4Owner} from '../worker/stage3d4-owner-api.js';

// Cloudflare Workers rejects redirect: 'error' before sending the request.
// 'manual' is supported, and the caller must refuse 3xx responses so that
// Authorization and privileged API headers are never forwarded on redirects.
const env=Object.freeze({
  STAGE3D3_REGISTRATION_MODE:'required',
  STAGE3D3_EXISTING_SHARED_WORKER_MODE:'preserve-legacy-pages',
  STAGE3D4_OWNER_ADMIN_MODE:'enabled',
  SUPABASE_URL:'https://approved-first-team.supabase.co',
  SUPABASE_PUBLISHABLE_KEY:'sb_publishable_firstTeamSyntheticOnly123456',
  SUPABASE_SECRET_KEY:'sb_secret_syntheticServerOnlyNotARealCredential123456'
});
const bearer='Bearer synthetic-approved-user-token-123456789';
const actor='11111111-1111-4111-8111-111111111111';
const json=(value,status=200)=>({ok:status>=200&&status<300,status,
  json:async()=>value});
const user={id:actor,email:'owner@fictional.test',
  email_confirmed_at:'2026-11-23T00:00:00Z'};
const policy={ok:true,code:'acceptance-required',canProceed:false,
  policyId:'mixed20-policy-v1',termsVersion:'terms-v1',
  termsSha256:'a'.repeat(64),termsUrl:'https://policies.example.test/terms-v1',
  privacyVersion:'privacy-v1',privacySha256:'b'.repeat(64),
  privacyUrl:'https://policies.example.test/privacy-v1'};
const owner={ok:true,code:'ready',team:null,coachAssigned:false,
  policyReady:false,invitations:[]};
const regRequest=()=>new Request(
  'https://team-manager.example.test/api/stage3d3/v1/registration',
  {headers:{Authorization:bearer}});
const ownerRequest=()=>new Request(
  'https://team-manager.example.test/api/stage3d4/v1/owner',
  {method:'POST',headers:{Authorization:bearer,
    'Content-Type':'application/json'},
   body:JSON.stringify({action:'status'})});

function cloudflareStrictUpstream({redirect=false}={}){
  const calls=[];
  async function fetchImpl(rawUrl,init){
    if(init.redirect!=='manual')
      throw new TypeError('Cloudflare Workers does not support redirect: error');
    assert.equal(init.cache,'no-store');
    const url=new URL(rawUrl);
    assert.equal(url.origin,env.SUPABASE_URL);
    calls.push(url.pathname);
    // Do not follow redirects, particularly when Authorization is present.
    if(redirect)return json({},302);
    switch(url.pathname){
      case '/auth/v1/user':return json(user);
      case '/rest/v1/rpc/tm_stage3d3_registration':return json(policy);
      case '/rest/v1/rpc/tm_stage3d4_owner':return json(owner);
      default:throw Error('Unexpected upstream request');
    }
  }
  return {calls,fetchImpl};
}
test('real Worker registration and Owner status accept Cloudflare-compatible subrequests',async()=>{
  const registration=cloudflareStrictUpstream();
  const status=await handleStage3D3Registration(regRequest(),env,registration.fetchImpl);
  assert.equal(status.status,200);
  assert.equal((await status.json()).code,'acceptance-required');
  assert.deepEqual(registration.calls,['/auth/v1/user',
    '/rest/v1/rpc/tm_stage3d3_registration']);

  const setup=cloudflareStrictUpstream();
  const result=await handleStage3D4Owner(ownerRequest(),env,setup.fetchImpl);
  assert.equal(result.status,200);
  assert.equal((await result.json()).code,'ready');
  assert.deepEqual(setup.calls,['/auth/v1/user',
    '/rest/v1/rpc/tm_stage3d4_owner']);
});
test('Supabase redirect is denied rather than following credentials to another origin',async()=>{
  const registration=cloudflareStrictUpstream({redirect:true});
  const denied=await handleStage3D3Registration(regRequest(),env,
    registration.fetchImpl);
  assert.equal(denied.status,401);
  assert.deepEqual(registration.calls,['/auth/v1/user']);
  const setup=cloudflareStrictUpstream({redirect:true});
  const deniedOwner=await handleStage3D4Owner(ownerRequest(),env,
    setup.fetchImpl);
  assert.equal(deniedOwner.status,401);
  assert.deepEqual(setup.calls,['/auth/v1/user']);
});
test('all protected Worker subrequests use supported redirect mode',()=>{
  for(const file of [
    'worker/stage3d3-registration.js',
    'worker/stage3d4-owner-api.js',
    'worker/stage3-onboarding-api.js',
    'worker/stage1-api.js',
    'worker/stage2-play-api.js'
  ]){
    const source=readFileSync(new URL('../'+file,import.meta.url),'utf8');
    assert.doesNotMatch(source,/redirect\s*:\s*['"]error['"]/,
      file+' must not throw in the Cloudflare runtime');
  }
});
