import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCloudIdentityClient } from '../site/cloud-identity.js';
import { build } from '../src/build.js';

const url = 'https://synthetic.supabase.co';
const publishableKey = 'sb_publishable_syntheticTestKey';
const userId = '11111111-1111-4111-8111-111111111111';
const currentTime = Date.UTC(2026, 10, 18, 3);
const storage = () => {
  const map = new Map();
  return { getItem: key => map.get(key) ?? null,
    setItem: (key,value) => map.set(key,value),
    removeItem: key => map.delete(key),
    entries: () => [...map.entries()] };
};
const token = name => ({
  access_token: name.padEnd(32, 'X'),
  refresh_token: ('refresh-' + name).padEnd(32, 'Y'),
  expires_in: 3600
});
const ok = (body, status = 200) => ({
  ok: true, status, json: async () => body
});
function server({ teamRows = [{
  team_id:'qa-team-1', club_ref:'Fictional Comets', sport_ref:'oztag',
  season_ref:'2026', team_role:'team_coach', internal_secret:'DO_NOT_SEND'
}], reject = null } = {}) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (source, init) => {
      const u = new URL(source), path = u.pathname;
      calls.push({ path, url:source, method:init.method, headers:init.headers,
        payload:init.body ? JSON.parse(init.body) : null });
      if(reject && path === reject.path)
        return { ok:false, status:reject.status, json:async()=>({}) };
      if(path === '/auth/v1/token' && u.searchParams.get('grant_type') === 'password')
        return ok(token('access-initial'));
      if(path === '/auth/v1/token' && u.searchParams.get('grant_type') === 'refresh_token')
        return ok(token('access-renewed'));
      if(path === '/auth/v1/user') return ok({ id:userId, email:'coach@example.test', user_metadata:{ secret:'hidden' }});
      if(path === '/rest/v1/rpc/tm_my_team_context') return ok(teamRows);
      if(path === '/auth/v1/logout') return { ok:true, status:204 };
      return { ok:false, status:404, json:async()=>({}) };
    }
  };
}
const make = (mock, st = storage(), now = () => currentTime) => ({
  client:createCloudIdentityClient({
    url, publishableKey, storage:st, fetchImpl:mock.fetchImpl, now
  }), st
});

test('HTTPS Supabase host and publishable key are necessary', () => {
  const opts={publishableKey, fetchImpl:async()=>ok({}), storage:storage()};
  for(const endpoint of [
    'http://synthetic.supabase.co', 'https://synthetic.supabase.co.evil.example',
    'https://synthetic.supabase.co/private', 'https://user:pass@synthetic.supabase.co'
  ]) assert.throws(()=>createCloudIdentityClient({...opts,url:endpoint}),/invalid-project-url/);
  assert.throws(()=>createCloudIdentityClient({...opts,url,publishableKey:'sb_secret_wouldBePrivate'}),/invalid-publishable-key/);
  assert.throws(()=>createCloudIdentityClient({...opts,url,fetchImpl:null}),/missing-browser-adapter/);
});

test('existing-account login validates via GoTrue and retrieves only scoped roles', async () => {
  const mock=server(), {client,st}=make(mock);
  assert.equal(await client.currentUser(),null);
  await assert.rejects(client.myTeamContexts(),{code:'not-signed-in'});
  await assert.rejects(client.signInWithPassword('invalid','pass'),{code:'invalid-input'});
  assert.equal(mock.calls.length,0,'invalid input must not contact the service');
  const user=await client.signInWithPassword('COACH@EXAMPLE.TEST','test-password');
  assert.deepEqual(user,{id:userId,email:'coach@example.test'});
  const login=mock.calls.find(x=>x.path==='/auth/v1/token');
  assert.equal(login.payload.email,'coach@example.test');
  assert.equal(login.payload.password,'test-password');
  assert.equal(login.headers.apikey,publishableKey);
  assert.equal(login.headers.Authorization,undefined);
  assert(!st.entries().some(([k,v])=>v.includes('test-password')||v.includes('coach@example.test')));
  const rows=await client.myTeamContexts();
  assert.deepEqual(rows,[{
    teamId:'qa-team-1',club:'Fictional Comets',
    sport:'oztag',season:'2026',role:'team_coach'
  }]);
  assert.equal(Object.isFrozen(rows),true);
  const rpc=mock.calls.find(x=>x.path==='/rest/v1/rpc/tm_my_team_context');
  assert.equal(rpc.method,'POST');
  assert.match(rpc.headers.Authorization,/^Bearer access-initial/);
  assert(mock.calls.every(x=>x.url.startsWith(url+'/')));
  assert(!mock.calls.some(x=>/\/signup|tm_private|\/rest\/v1\/(accounts|role_grants)/.test(x.url)));
});

test('empty grants, missing function and malformed responses are distinct',async()=>{
  const a=make(server({teamRows:[]})).client;
  await a.signInWithPassword('coach@example.test','password');
  assert.deepEqual(await a.myTeamContexts(),[]);
  const b=make(server({reject:{path:'/rest/v1/rpc/tm_my_team_context',status:404}})).client;
  await b.signInWithPassword('coach@example.test','password');
  await assert.rejects(b.myTeamContexts(),{code:'server-not-ready'});
  for(const teamRows of [[{team_id:'qa',club_ref:'QA',sport_ref:'oztag',season_ref:'2026',
    team_role:'platform_owner'}],{rows:[]}]) {
    const client=make(server({teamRows})).client;
    await client.signInWithPassword('coach@example.test','password');
    await assert.rejects(client.myTeamContexts(),{code:'invalid-server-response'});
  }
});

test('expired session is refreshed with token; revocation clears persisted session',async()=>{
  let now=currentTime;
  const mock=server(), st=storage();
  const {client}=make(mock,st,()=>now);
  await client.signInWithPassword('coach@example.test','password');
  now+=3601*1000;
  await client.currentUser();
  assert.equal(mock.calls.filter(x=>x.path==='/auth/v1/token').length,2);
  assert(mock.calls.some(x=>x.path==='/auth/v1/token' &&
    x.url.includes('grant_type=refresh_token')));
  now+=3601*1000;
  const deny={fetchImpl:async()=>({ok:false,status:401,json:async()=>({})})};
  await assert.rejects(make(deny,st,()=>now).client.currentUser(),{code:'access-denied'});
  assert.deepEqual(st.entries(),[]);
});

test('signout clears local session despite remote failure and accepts HTTP 204',async()=>{
  const mock=server({reject:{path:'/auth/v1/logout',status:503}});
  const {client,st}=make(mock);
  await client.signInWithPassword('coach@example.test','password');
  assert.equal(await client.signOut(),false);
  assert.deepEqual(st.entries(),[]);
  assert.equal(await client.currentUser(),null);
  const healthy=make(server()).client;
  await healthy.signInWithPassword('coach@example.test','password');
  assert.equal(await healthy.signOut(),true);
});

test('Cloudflare build reproduces the accepted static host without changing demo UX',()=>{
  const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
  assert.equal(config.name,'team-manager');
  assert.equal(config.compatibility_date,'2026-11-17');
  assert.equal(config.assets.directory,'./dist');
  assert.equal(config.workers_dev,true);
  const tmp=mkdtempSync(join(tmpdir(),'tm-cloud-'));
  const out=join(tmp,'dist');
  build({outDir:out,dataDir:join(tmp,'missing'),log:()=>{},version:'rc1test'});
  assert(existsSync(join(out,'cloud-access.html')));
  assert(existsSync(join(out,'cloud-access.js')));
  const h=readFileSync(join(out,'cloud-access.html'),'utf8');
  assert.match(h,/src="cloud-access\.js\?v=rc1test"/);
  assert.match(h,/href="cloud-access\.css\?v=rc1test"/);
  const legacy=readFileSync(join(out,'index.html'),'utf8');
  assert.match(legacy,/src="app\.js\?v=rc1test"/);
  assert(!legacy.includes('cloud-access.js'));
});

test('database RPC gives only authenticated read-only team context',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/20261118020000_first_team_my_context.sql',import.meta.url),'utf8');
  const config=readFileSync(new URL('../site/cloud-public-config.js',import.meta.url),'utf8');
  assert.match(sql,/security definer\s+set search_path = ''/);
  assert.match(sql,/g\.user_id = auth\.uid\(\)/);
  assert.match(sql,/a\.status = 'active'/);
  assert.match(sql,/g\.status = 'active'/);
  assert.match(sql,/t\.status = 'active'/);
  assert.match(sql,/l\.status = 'verified'/);
  assert.match(sql,/part\.status = 'active'/);
  assert.match(sql,/revoke all on function public\.tm_my_team_context\(\) from public, anon, authenticated;/);
  assert.match(sql,/grant execute on function public\.tm_my_team_context\(\) to authenticated;/);
  assert.doesNotMatch(sql,/\b(?:insert into|update tm_private\.|delete from|grant select on tm_private\.)\b/i);
  assert.doesNotMatch(config,/sb_secret_|service_role|postgres:\/\/|password\s*:/i);
});
