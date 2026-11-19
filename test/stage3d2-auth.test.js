import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createCloudIdentityClient} from '../site/cloud-identity.js';
import {createPkceStore,safeAuthReturn,validOAuthDestination}
  from '../site/cloud-auth-flows.js';
import {readFileSync} from 'node:fs';

const url='https://trial3d2.supabase.co';
const publishableKey='sb_publishable_fictionalTrialOnly12345';
const userId='11111111-1111-4111-8111-111111111111';
const otherId='22222222-2222-4222-8222-222222222222';
const returnUrl='https://team-stage.example.test/cloud-access.html';
const fixed=Date.UTC(2026,10,19,4);
function storage(){
  const map=new Map();
  return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),
    removeItem:k=>map.delete(k),snapshot:()=>[...map]};
}
const ok=data=>({ok:true,status:200,json:async()=>data});
const token=(id=userId)=>({
  access_token:'synthetic-staging-access-token-'+id,
  refresh_token:'synthetic-staging-refresh-token-'+id,
  expires_in:3600
});
function make({id=userId,now=()=>fixed}={}){
  const calls=[];
  const st=storage();
  let actor=id;
  const fetchImpl=async(source,init)=>{
    const link=new URL(source);
    calls.push({path:link.pathname,query:link.searchParams,
      method:init.method,headers:init.headers,body:init.body?JSON.parse(init.body):null});
    if(link.pathname==='/auth/v1/token'&&link.searchParams.get('grant_type')==='password')
      return ok(token(actor));
    if(link.pathname==='/auth/v1/token'&&link.searchParams.get('grant_type')==='pkce')
      return ok(token(actor));
    if(link.pathname==='/auth/v1/user')
      return ok({id:actor,email:'approved@example.test'});
    if(link.pathname==='/auth/v1/otp')return ok({});
    if(link.pathname==='/auth/v1/verify')return ok(token(actor));
    if(link.pathname==='/auth/v1/user/identities/authorize')
      return ok({url:'https://accounts.google.com/o/oauth2/v2/auth?example=yes'});
    if(link.pathname==='/rest/v1/rpc/tm_my_team_context')return ok([]);
    return {ok:false,status:404,json:async()=>({})};
  };
  const client=createCloudIdentityClient({url,publishableKey,
    fetchImpl,storage:st,now,cryptoImpl:webcrypto});
  return {client,st,calls,setActor:next=>actor=next};
}
test('OAuth URL uses one-use S256 PKCE, not implicit tokens or elevated secrets',async()=>{
  const {client,st,calls}=make();
  const href=await client.beginOAuth({provider:'google',redirectTo:returnUrl});
  const oauth=new URL(href);
  assert.equal(oauth.pathname,'/auth/v1/authorize');
  assert.equal(oauth.searchParams.get('provider'),'google');
  assert.equal(oauth.searchParams.get('flow_type'),'pkce');
  assert.equal(oauth.searchParams.get('code_challenge_method'),'s256');
  assert.match(oauth.searchParams.get('code_challenge'),/^[A-Za-z0-9_-]{43}$/);
  assert.equal(oauth.searchParams.get('redirect_to'),returnUrl);
  assert(!href.includes('sb_secret_'));
  assert(!href.includes('access_token='));
  assert.equal(calls.length,0,'OAuth initiation must not create a GoTrue account');
  assert(st.snapshot().every(([k,v])=>!v.includes('sb_secret_')));
  await assert.rejects(client.beginOAuth({provider:'apple',redirectTo:returnUrl}),
    /oauth-already-in-progress/);
  const outcome=await client.completeOAuth(returnUrl+'?code=valid_once_code');
  assert.equal(outcome.user.id,userId);
  assert.equal(outcome.linked,false);
  const exchange=calls.find(c=>c.path==='/auth/v1/token');
  assert.equal(exchange.query.get('grant_type'),'pkce');
  assert.equal(exchange.body.auth_code,'valid_once_code');
  assert.match(exchange.body.code_verifier,/^[A-Za-z0-9_-]{43}$/);
  assert(!st.snapshot().some(([k])=>k.includes('pkce')));
  await assert.rejects(client.completeOAuth(returnUrl+'?code=valid_once_code'),
    {code:'missing-or-expired-oauth-request'});
});
test('Apple OAuth, callback origin, expired and unsupported provider all fail safely',async()=>{
  const clock={time:fixed};
  const fixture=make({now:()=>clock.time});
  const href=await fixture.client.beginOAuth({provider:'apple',redirectTo:returnUrl});
  assert.equal(new URL(href).searchParams.get('provider'),'apple');
  await assert.rejects(fixture.client.completeOAuth(
    'https://different.example.test/cloud-access.html?code=code_from_elsewhere'),
    {code:'missing-or-expired-oauth-request'});
  const second=make({now:()=>clock.time});
  await second.client.beginOAuth({provider:'apple',redirectTo:returnUrl});
  clock.time+=11*60*1000;
  await assert.rejects(second.client.completeOAuth(returnUrl+'?code=old_code'),
    {code:'missing-or-expired-oauth-request'});
  const third=make();
  await assert.rejects(third.client.beginOAuth({provider:'github',redirectTo:returnUrl}),
    /invalid-oauth-provider-or-mode/);
  await assert.rejects(third.client.beginOAuth({provider:'google',
    redirectTo:'https://evil.example.test/other.html'}),/invalid-auth-return/);
  assert.throws(()=>safeAuthReturn('http://insecure.example.test/cloud-access.html'),
    /invalid-auth-return/);
  assert.throws(()=>validOAuthDestination('https://fake-accounts.google.com/', 'google'),
    /untrusted-oauth-destination/);
  assert.throws(()=>validOAuthDestination('http://appleid.apple.com/','apple'),
    /untrusted-oauth-destination/);
});
test('manual link requires existing auth and rejects changed Account UUID',async()=>{
  const f=make();
  await assert.rejects(f.client.beginOAuth({provider:'google',link:true,
    redirectTo:returnUrl}),{code:'not-signed-in'});
  await f.client.signInWithPassword('approved@example.test','valid-password');
  const before=f.st.snapshot().find(([k])=>k.includes('identity'));
  assert(before,'existing session retained');
  const toGoogle=await f.client.beginOAuth({provider:'google',link:true,
    redirectTo:returnUrl});
  assert.match(toGoogle,/^https:\/\/accounts.google.com\//);
  const linked=await f.client.completeOAuth(returnUrl+'?code=linked_code');
  assert.equal(linked.linked,true);
  assert.equal(linked.user.id,userId);
  const second=make();
  await second.client.signInWithPassword('approved@example.test','password');
  await second.client.beginOAuth({provider:'google',link:true,redirectTo:returnUrl});
  second.setActor(otherId);
  await assert.rejects(second.client.completeOAuth(returnUrl+'?code=changed_uuid'),
    {code:'identity-link-mismatch'});
  assert.equal(await second.client.currentUser(),null,'reject switched identity');
});
test('one-time email code never creates a provider account or auto-grants role',async()=>{
  const f=make();
  await assert.rejects(f.client.requestEmailOtp('invalid'),{code:'invalid-input'});
  await assert.rejects(f.client.verifyEmailOtp('approved@example.test','bogus'),
    {code:'invalid-input'});
  await f.client.requestEmailOtp('APPROVED@EXAMPLE.TEST');
  const sent=f.calls.find(c=>c.path==='/auth/v1/otp');
  assert.equal(sent.method,'POST');
  assert.deepEqual(sent.body,{email:'approved@example.test',create_user:false});
  const user=await f.client.verifyEmailOtp('approved@example.test','123456');
  assert.equal(user.id,userId);
  assert(!f.calls.some(c=>/signup|admin|tm_private/.test(c.path)));
  assert.deepEqual(await f.client.myTeamContexts(),[]);
  assert(!f.st.snapshot().some(([k,v])=>v.includes('123456')||
    v.includes('approved@example.test')),'email and OTP are not persisted');
});
test('code stays out of URL after callback in login UI and no signup offered',()=>{
  const page=readFileSync(new URL('../site/cloud-access.html',import.meta.url),'utf8');
  const js=readFileSync(new URL('../site/cloud-access.js',import.meta.url),'utf8');
  assert(page.includes('Continue with Google')&&page.includes('Continue with Apple'));
  assert(page.includes('Use a one-time email code'));
  assert(page.includes('Link Google')&&page.includes('Link Apple'));
  assert.match(js,/history\.replaceState\(null,'',location\.pathname\)/);
  assert.match(js,/client\.completeOAuth\(callback\.href\)/);
  assert(!page.includes('Sign up for a new team'));
});
