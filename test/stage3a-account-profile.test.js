import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCloudIdentityClient} from '../site/cloud-identity.js';

const accountId='11111111-1111-4111-8111-111111111111';
const authURL='https://stage3a-qa.supabase.co';
const key='sb_publishable_stage3aFictionalPublic';
function fixture({missing=false,malformed=false}={}){
  const calls=[],session=new Map();
  let current={accountStatus:'active',displayName:'',version:0,linkStatus:'pending'};
  const ok=value=>({ok:true,status:200,json:async()=>value});
  const fetchImpl=async (url,init)=>{
    const path=new URL(url).pathname;
    const payload=init.body?JSON.parse(init.body):null;
    calls.push({path,payload,headers:init.headers});
    if(path==='/auth/v1/token')return ok({
      access_token:'synthetic-stage3a-bearer-token-00001',
      refresh_token:'synthetic-stage3a-refresh-token-001',
      expires_in:3600
    });
    if(path==='/auth/v1/user')return ok({
      id:accountId,email:'profile@example.test',user_metadata:{secret:'hidden'}
    });
    if(path==='/rest/v1/rpc/tm_my_profile'){
      if(missing)return {ok:false,status:404};
      return ok(malformed?{accountStatus:'active',displayName:'Private',
        version:'bad',linkStatus:'verified'}:
        {...current,secretEvidence:'never expose',otherPerson:'foreign'});
    }
    if(path==='/rest/v1/rpc/tm_save_my_profile'){
      if(payload.p_expected_version!==current.version)
        return ok({ok:false,code:'stale-profile'});
      current={...current,displayName:payload.p_display_name,version:current.version+1};
      return ok({ok:true,displayName:current.displayName,version:current.version,
        extraPrivateDetails:'never expose'});
    }
    return {ok:false,status:404};
  };
  const storage={getItem:k=>session.get(k)||null,
    setItem:(k,v)=>session.set(k,v),removeItem:k=>session.delete(k)};
  const client=createCloudIdentityClient({
    url:authURL,publishableKey:key,fetchImpl,storage,
    now:()=>Date.UTC(2026,10,19,1)
  });
  return {client,calls,read:()=>current,externalUpdate:()=>{current.version++;}};
}
test('Stage 3A profile requires individual sign-in and reveals only self data',async()=>{
  const f=fixture();
  await assert.rejects(f.client.myProfile(),{code:'not-signed-in'});
  assert.equal(f.calls.length,0);
  await f.client.signInWithPassword('PROFILE@EXAMPLE.TEST','test-only');
  assert.deepEqual(await f.client.myProfile(),{
    accountStatus:'active',displayName:'',version:0,linkStatus:'pending'
  });
  assert(Object.isFrozen(await f.client.myProfile()));
  const requests=f.calls.filter(c=>c.path==='/rest/v1/rpc/tm_my_profile');
  assert.equal(requests.length,2);
  assert.deepEqual(requests[0].payload,{});
  assert.match(requests[0].headers.Authorization,/^Bearer synthetic-stage3a/);
  assert.equal(typeof f.client.approveRole,'undefined');
  assert.equal(typeof f.client.verifyPersonLink,'undefined');
});
test('Stage 3A self-edit validates fields and uses optimistic updates',async()=>{
  const f=fixture();
  await f.client.signInWithPassword('profile@example.test','test-only');
  for(const displayName of ['', '   ', 'bad\\nname', 'x'.repeat(81)]){
    await assert.rejects(f.client.saveMyProfile({displayName,expectedVersion:0}),
      {code:'invalid-profile'});
  }
  assert(!f.calls.some(c=>c.path==='/rest/v1/rpc/tm_save_my_profile'),
    'bad input must not contact provider');
  assert.deepEqual(await f.client.saveMyProfile({
    displayName:'   Fictional Coach  ',expectedVersion:0
  }),{displayName:'Fictional Coach',version:1});
  const sent=f.calls.find(c=>c.path==='/rest/v1/rpc/tm_save_my_profile');
  assert.deepEqual(sent.payload,{p_display_name:'Fictional Coach',p_expected_version:0});
  await assert.rejects(f.client.saveMyProfile({displayName:'Stale',expectedVersion:0}),
    {code:'stale-profile'});
  f.externalUpdate();
  await assert.rejects(f.client.saveMyProfile({displayName:'Stale retry',expectedVersion:1}),
    {code:'stale-profile'});
  assert.equal(f.read().displayName,'Fictional Coach');
  assert.equal(f.read().version,2);
});
test('Stage 3A missing migration and malformed provider profile fail closed',async()=>{
  for(const [f,error] of [[fixture({missing:true}),'server-not-ready'],
    [fixture({malformed:true}),'invalid-server-response']]){
    await f.client.signInWithPassword('profile@example.test','test-only');
    await assert.rejects(f.client.myProfile(),{code:error});
  }
});
test('Stage 3A SQL source has self-only RLS function and cannot self-approve',()=>{
  const m=readFileSync(new URL('../supabase/migrations/20261119030000_stage3a_minimal_account_profiles.sql',
    import.meta.url),'utf8');
  assert.match(m,/account_profiles enable row level security/);
  assert.match(m,/account_profiles force row level security/);
  assert.match(m,/where a.user_id=auth.uid\(\)/);
  assert.match(m,/actor uuid := auth.uid\(\)/);
  assert.match(m,/where tm_private.account_profiles.version=p_expected_version/);
  assert.match(m,/revoke all on tm_private.account_profiles from public,anon,authenticated/);
  assert.doesNotMatch(m,/insert into tm_private\.(role_grants|platform_operator_grants|account_person_links)/i);
  assert.doesNotMatch(m,/grant select on tm_private.account_profiles to authenticated/i);
});
