import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handleStage3D3Registration,stage3D3PolicyGate}
  from '../worker/stage3d3-registration.js';
const userId='11111111-1111-4111-8111-111111111111';
const env=Object.freeze({
  STAGE3D3_REGISTRATION_MODE:'required',
  SUPABASE_URL:'https://approved-first-team.supabase.co',
  SUPABASE_PUBLISHABLE_KEY:'sb_publishable_firstTeamSyntheticOnly123456',
  SUPABASE_SECRET_KEY:'sb_secret_syntheticServerOnlyNotARealCredential123456'
});
const base='https://mixed20-stage.example.test';
const token='Bearer synthetic-approved-user-token-123456789';
const json=(body,status=200)=>({ok:status===200,status,
  json:async()=>body});
function client(accepted=false,confirmed=true){
  const calls=[];
  const fetchImpl=async(url,init)=>{
    const u=new URL(url);
    let payload=null;
    try{payload=init.body?JSON.parse(init.body):null;}catch{}
    calls.push({url:u.pathname,headers:init.headers,body:payload});
    if(u.pathname==='/auth/v1/user')
      return json({id:userId,email_confirmed_at:confirmed?'2026-11-20T00:00:00Z':null});
    if(u.pathname==='/rest/v1/rpc/tm_stage3d3_registration'){
      if(payload.p_action==='status')return json(accepted
        ? {ok:true,code:'accepted',canProceed:true,
           policyId:'mixed20-policy-v1',termsVersion:'terms-v1',
           termsSha256:'a'.repeat(64),
           termsUrl:'https://policies.example.test/terms-v1',
           privacyVersion:'privacy-v1',privacySha256:'b'.repeat(64),
           privacyUrl:'https://policies.example.test/privacy-v1'}
        : {ok:true,code:'acceptance-required',canProceed:false,
           policyId:'mixed20-policy-v1',termsVersion:'terms-v1',
           termsSha256:'a'.repeat(64),
           termsUrl:'https://policies.example.test/terms-v1',
           privacyVersion:'privacy-v1',privacySha256:'b'.repeat(64),
           privacyUrl:'https://policies.example.test/privacy-v1'});
      if(payload.p_action==='accept')return json(
        {ok:true,code:'accepted',canProceed:true,policyId:'mixed20-policy-v1'});
    }
    return json({},404);
  };
  return {calls,fetchImpl};
}
const req=(method='GET',payload=null,headers={})=>
  new Request(base+'/api/stage3d3/v1/registration',{method,
    headers:{Authorization:token,...(payload!==null?{
      'Content-Type':'application/json'}:{}),...headers},
    ...(payload!==null?{body:JSON.stringify(payload)}:{})});
const validConsent=()=>({policyId:'mixed20-policy-v1',
  termsAccepted:true,privacyAcknowledged:true,marketingOptIn:false});
test('legacy staging is unaffected; real first team denies missing provider and bearer',async()=>{
  const f=client();
  assert.equal(await stage3D3PolicyGate(req(),{},f.fetchImpl),null);
  let r=await stage3D3PolicyGate(req(),{
    ...env,SUPABASE_SECRET_KEY:undefined},f.fetchImpl);
  assert.equal(r.status,503);
  r=await stage3D3PolicyGate(req('GET',null,{Authorization:''}),env,f.fetchImpl);
  assert.equal(r.status,401);
  assert.equal(f.calls.length,0);
});
test('unaccepted adult is denied every protected operation by the trusted Worker',async()=>{
  const f=client();
  const r=await stage3D3PolicyGate(req('POST',validConsent()),env,f.fetchImpl);
  assert.equal(r.status,403);
  assert.equal((await r.json()).code,'acceptance-required');
  const rpc=f.calls.find(c=>c.url.includes('/rpc/'));
  assert.equal(rpc.body.p_actor,userId,'actor must come from verified GoTrue');
  assert.equal(rpc.body.p_action,'status');
  assert(!JSON.stringify(f.calls).includes('sb_secret_')||
    f.calls.find(c=>c.url.includes('/rpc/')).headers.apikey.startsWith('sb_secret_'));
  const ok=client(true);
  assert.equal(await stage3D3PolicyGate(req('POST',validConsent()),env,ok.fetchImpl),
    null,'accepted adult may reach existing exact-role API, not receive new grant');
});
test('unconfirmed identity, foreign origin and unconfigured source fail closed',async()=>{
  const f=client(false,false);
  let r=await stage3D3PolicyGate(req(),env,f.fetchImpl);
  assert.equal(r.status,401);
  const f2=client(true);
  r=await stage3D3PolicyGate(req('GET',null,{Origin:'https://evil.example.test'}),env,
    f2.fetchImpl);
  assert.equal(r.status,403);
  assert.equal(f2.calls.length,0);
  r=await handleStage3D3Registration(req(),{},f2.fetchImpl);
  assert.equal(r.status,503);
});
test('status returns only reviewed adult policy metadata, no private record details',async()=>{
  const f=client();
  let response=await handleStage3D3Registration(req(),env,f.fetchImpl);
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.code,'acceptance-required');
  assert.equal(data.policy.privacyVersion,'privacy-v1');
  assert.equal(data.policy.termsUrl,'https://policies.example.test/terms-v1');
  assert.deepEqual(Object.keys(data.policy).sort(),[
    'policyId','privacySha256','privacyUrl','privacyVersion',
    'termsSha256','termsUrl','termsVersion'].sort());
  assert(!('email' in data)&&!('userId' in data));
});
test('acceptance requires both explicit acknowledgements; marketing stays optional',async()=>{
  const f=client();
  for(const changed of [
    {...validConsent(),termsAccepted:false},
    {...validConsent(),privacyAcknowledged:false},
    {...validConsent(),marketingOptIn:'yes'},
    {...validConsent(),ageGroup:'adult'},
    {...validConsent(),userId},
    {...validConsent(),approved:true},
    {...validConsent(),policyId:'bad'},
  ]){
    const res=await handleStage3D3Registration(req('POST',changed),env,f.fetchImpl);
    assert.equal(res.status,400,JSON.stringify(changed));
  }
  assert.equal(f.calls.length,7,
    'Rejected bodies must never call the privileged database RPC');
  const result=await handleStage3D3Registration(req('POST',validConsent()),env,
    f.fetchImpl);
  assert.equal(result.status,200);
  assert.deepEqual(await result.json(),{ok:true,code:'accepted',canProceed:true});
  const write=f.calls.filter(c=>c.body?.p_action==='accept');
  assert.equal(write.length,1);
  assert.equal(write[0].body.p_actor,userId);
  assert.equal(write[0].body.p_marketing_opt_in,false);
});
test('source requires policy only on distinct first-team Worker',()=>{
  const worker=readFileSync(new URL('../worker/index.js',import.meta.url),'utf8');
  const wrangler=readFileSync(new URL('../wrangler.stage3d3.jsonc',import.meta.url),'utf8');
  assert.match(worker,/stage3D3PolicyGate\(request,env\)/);
  assert.match(worker,/handleStage3D3Registration\(request,env\)/);
  assert.match(wrangler,/"STAGE3D3_REGISTRATION_MODE": "required"/);
  const cfg=readFileSync(new URL('../site/cloud-public-config.js',import.meta.url),'utf8');
  assert.match(cfg,/CLOUD_STAGE3D3_POLICY_REQUIRED = false/);
  const login=readFileSync(new URL('../site/cloud-access.js',import.meta.url),'utf8');
  assert.match(login,/CLOUD_STAGE3D3_POLICY_REQUIRED===true/);
  assert.match(login,/cloud-policy-link/);
  const page=readFileSync(new URL('../site/cloud-registration.html',import.meta.url),'utf8');
  assert.match(page,/type="checkbox" required/);
  assert.match(page,/Optional:/);
});
