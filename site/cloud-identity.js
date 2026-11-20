import {createPkceStore,safeAuthReturn,validOAuthDestination} from './cloud-auth-flows.js';

// First-team read-only identity boundary. No self-signup, private table access,
// privileged key, writable operation or authorisation inferred from login alone.
// Published browser key is a project identifier, NOT an account permission.
const SESSION_KEY = 'tm-cloud-identity-preview-v1';
const VALID_ROLES = new Set([
  'team_coach', 'team_assistant', 'team_manager',
  'team_player', 'team_volunteer', 'team_play_viewer'
]);
const text = value => typeof value === 'string' && value.length <= 8192;
const str = (value, max = 120) => typeof value === 'string' && value.length > 0 && value.length <= max;
const tokenValid = value => text(value) && value.length > 10;
const safeError = code => Object.assign(new Error(code), { code });

export function createCloudIdentityClient({ url, publishableKey, fetchImpl, storage, now = Date.now, cryptoImpl = globalThis.crypto } = {}) {
  let base;
  try { base = new URL(url); } catch { throw new TypeError('invalid-project-url'); }
  if (base.protocol !== 'https:' ||
      !/^[a-z0-9-]+\.supabase\.co$/.test(base.hostname) ||
      base.username || base.password || base.search || base.hash ||
      base.pathname !== '/' || base.port)
    throw new TypeError('invalid-project-url');
  if (typeof publishableKey !== 'string' ||
      !/^sb_publishable_[A-Za-z0-9_-]{10,160}$/.test(publishableKey))
    throw new TypeError('invalid-publishable-key');
  if (typeof fetchImpl !== 'function' || !storage ||
      ['getItem', 'setItem', 'removeItem'].some(k => typeof storage[k] !== 'function') ||
      typeof now !== 'function') throw new TypeError('missing-browser-adapter');

  const pkce=createPkceStore({storage,cryptoImpl,now});
  function clear() { storage.removeItem(SESSION_KEY); }
  function read() {
    try {
      const s = JSON.parse(storage.getItem(SESSION_KEY) || 'null');
      if (!s || !tokenValid(s.access_token) || !tokenValid(s.refresh_token) ||
          !Number.isSafeInteger(s.expires_at)) return null;
      return s;
    } catch { return null; }
  }
  function save(body) {
    // Raw GoTrue API may provide expires_in, unlike the JS client's expires_at.
    const expiry = Number.isSafeInteger(body?.expires_at) ? body.expires_at
      : Number.isSafeInteger(body?.expires_in) && body.expires_in > 0
        ? Math.floor(now()/1000) + body.expires_in : null;
    if (!body || !tokenValid(body.access_token) || !tokenValid(body.refresh_token) ||
        !Number.isSafeInteger(expiry) || expiry <= Math.floor(now()/1000))
      throw safeError('invalid-auth-response');
    // Persist only opaque session tokens and expiry in sessionStorage, never passwords,
    // account profile fields, personal information or grants.
    const s = { access_token: body.access_token,
      refresh_token: body.refresh_token, expires_at: expiry };
    storage.setItem(SESSION_KEY, JSON.stringify(s));
    return s;
  }
  async function request(path, { method = 'GET', body, bearer } = {}) {
    let response;
    try {
      response = await fetchImpl(new URL(path, base).href, {
        method, mode: 'cors', cache: 'no-store', redirect: 'error',
        headers: { apikey: publishableKey,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
    } catch { throw safeError('network-unavailable'); }
    if (!response || !response.ok) {
      if (response && (response.status === 401 || response.status === 403))
        throw safeError('access-denied');
      if (response && response.status === 404) throw safeError('server-not-ready');
      throw safeError('request-failed');
    }
    if (response.status === 204) return {};
    try { return await response.json(); } catch { throw safeError('invalid-server-response'); }
  }
  async function accessToken() {
    let s = read();
    if (!s) return null;
    if (s.expires_at > Math.floor(now()/1000) + 60) return s.access_token;
    try {
      const renewed = await request('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST', body: { refresh_token: s.refresh_token }
      });
      s = save(renewed);
      return s.access_token;
    } catch (e) {
      if (e.code === 'access-denied' || e.code === 'invalid-auth-response') clear();
      throw e;
    }
  }
  async function currentUser() {
    const bearer = await accessToken();
    if (!bearer) return null;
    let user;
    try {
      user = await request('/auth/v1/user', { bearer });
    } catch (e) {
      if (e.code === 'access-denied') clear();
      throw e;
    }
    if (!user || !/^[0-9a-f-]{36}$/i.test(user.id) || !str(user.email, 254)) {
      clear();
      throw safeError('invalid-auth-response');
    }
    return Object.freeze({ id: user.id, email: user.email });
  }
  async function signInWithPassword(email, password) {
    const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!str(normalized, 254) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized) ||
        typeof password !== 'string' || password.length < 1 || password.length > 1024)
      throw safeError('invalid-input');
    // No signup endpoint is reachable from this client. Accounts must already
    // exist and be invited/authorised through a separately approved process.
    const reply = await request('/auth/v1/token?grant_type=password', {
      method: 'POST', body: { email: normalized, password }
    });
    save(reply);
    return currentUser();
  }
  // OAuth is a provider identity only. Even a valid new GoTrue user receives
  // no Account/Person/Team role until the separately reviewed onboarding RPC.
  async function beginOAuth({provider,redirectTo,link=false}={}) {
    const expectedUserId=link?(await currentUser())?.id:null;
    if(link&&!expectedUserId)throw safeError('not-signed-in');
    // A second rejected request must not erase a valid earlier PKCE flow.
    const flow=await pkce.begin({provider,redirectTo,kind:link?'link':'sign-in',
      expectedUserId});
    try{
      const qs=new URLSearchParams({provider,redirect_to:flow.redirectTo,
        flow_type:'pkce',code_challenge:flow.challenge,
        code_challenge_method:'s256'});
      if(!link)return new URL('/auth/v1/authorize?'+qs,base).href;
      qs.set('skip_http_redirect','true');
      const bearer=await verifiedBearer();
      const url=new URL('/auth/v1/user/identities/authorize?'+qs,base);
      let response;
      try{response=await fetchImpl(url.href,{
        method:'GET',mode:'cors',cache:'no-store',redirect:'error',
        headers:{apikey:publishableKey,Authorization:'Bearer '+bearer}
      });}catch{throw safeError('network-unavailable');}
      if(!response?.ok)throw safeError('identity-link-unavailable');
      let body;
      try{body=await response.json();}catch{throw safeError('invalid-server-response');}
      return validOAuthDestination(body?.url,provider);
    }catch(e){pkce.clear();throw e;}
  }
  async function completeOAuth(callbackUrl){
    let callback;
    try{callback=safeAuthReturn(new URL(callbackUrl).origin+
      new URL(callbackUrl).pathname);}
    catch{pkce.clear();throw safeError('invalid-oauth-callback');}
    const url=new URL(callbackUrl);
    const code=url.searchParams.getAll('code');
    if(callback.origin!==url.origin || callback.pathname!==url.pathname ||
       code.length!==1 || !/^[A-Za-z0-9._~-]{4,2048}$/.test(code[0]) ||
       url.searchParams.has('error') || url.hash){
      pkce.clear();throw safeError('invalid-oauth-callback');
    }
    let flow;
    try{flow=pkce.consume(callbackUrl);}
    catch{throw safeError('missing-or-expired-oauth-request');}
    let session;
    try{
      session=await request('/auth/v1/token?grant_type=pkce',{
        method:'POST',body:{auth_code:code[0],code_verifier:flow.verifier}
      });
      save(session);
      const user=await currentUser();
      if(flow.kind==='link'&&user.id!==flow.expectedUserId){
        clear();throw safeError('identity-link-mismatch');
      }
      return Object.freeze({user,linked:flow.kind==='link',provider:flow.provider});
    }catch(e){clear();throw e;}
  }
  async function requestEmailOtp(email){
    const normalized=typeof email==='string'?email.trim().toLowerCase():'';
    if(!str(normalized,254)||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized))
      throw safeError('invalid-input');
    // create_user=false: requesting a code never self-registers an account.
    await request('/auth/v1/otp',{method:'POST',
      body:{email:normalized,create_user:false}});
    return true;
  }
  async function verifyEmailOtp(email,token){
    const normalized=typeof email==='string'?email.trim().toLowerCase():'';
    if(!str(normalized,254)||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)||
       typeof token!=='string'||!/^[0-9]{6,8}$/.test(token))
      throw safeError('invalid-input');
    const session=await request('/auth/v1/verify',{method:'POST',
      body:{email:normalized,token,type:'email'}});
    try{
      save(session);
      const user=await currentUser();
      if(user.email.toLowerCase()!==normalized){
        clear();throw safeError('otp-identity-mismatch');
      }
      return user;
    }catch(e){clear();throw e;}
  }

  async function requestPasswordRecovery(email, redirectTo) {
    const normalized=typeof email==='string'?email.trim().toLowerCase():'';
    let redirect;
    try{redirect=new URL(redirectTo);}catch{throw safeError('invalid-input');}
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)||
       normalized.length>254||redirect.protocol!=='https:'&&
         !(redirect.protocol==='http:'&&['localhost','127.0.0.1'].includes(redirect.hostname))||
       !redirect.pathname.endsWith('/cloud-access.html')||
       redirect.username||redirect.password||redirect.search||redirect.hash)
      throw safeError('invalid-input');
    // GoTrue handles account existence, email rate limiting and reset-link expiry.
    // Never expose whether the email is registered.
    await request('/auth/v1/recover?redirect_to='+
      encodeURIComponent(redirect.href),{method:'POST',body:{email:normalized}});
    return true;
  }
  async function acceptAuthLink(fragment) {
    if(typeof fragment!=='string'||fragment.length>8192)
      throw safeError('invalid-auth-link');
    const params=new URLSearchParams(fragment.replace(/^#/, ''));
    const type=params.get('type');
    const bearer=params.get('access_token');
    const refresh=params.get('refresh_token');
    const seconds=Number(params.get('expires_in'));
    if(!['invite','recovery'].includes(type)||!tokenValid(bearer)||
       !tokenValid(refresh)||!Number.isSafeInteger(seconds)||
       seconds<1||seconds>86400)
      throw safeError('invalid-auth-link');
    save({access_token:bearer,refresh_token:refresh,expires_in:seconds});
    try{await currentUser();}catch(e){clear();throw e;}
    return type;
  }
  async function setPassword(password) {
    if(typeof password!=='string'||password.length<12||password.length>128)
      throw safeError('invalid-input');
    const bearer=await verifiedBearer();
    const result=await request('/auth/v1/user',{
      method:'PUT',body:{password},bearer
    });
    if(!result||typeof result.id!=='string')
      throw safeError('invalid-auth-response');
    return true;
  }
  async function myTeamContexts() {
    const user = await currentUser();
    if (!user) throw safeError('not-signed-in');
    const bearer = await accessToken();
    const rows = await request('/rest/v1/rpc/tm_my_team_context', {
      method: 'POST', body: {}, bearer
    });
    if (!Array.isArray(rows) || rows.length > 50) throw safeError('invalid-server-response');
    return Object.freeze(rows.map(row => {
      if (!row || !str(row.team_id, 100) || !str(row.club_ref, 120) ||
          !str(row.sport_ref, 120) || !str(row.season_ref, 120) ||
          !VALID_ROLES.has(row.team_role))
        throw safeError('invalid-server-response');
      // Retain only the public organisational scope, not other provider fields.
      return Object.freeze({
        teamId: row.team_id, club: row.club_ref,
        sport: row.sport_ref, season: row.season_ref, role: row.team_role
      });
    }));
  }
  async function myOperatorAccess() {
    const user = await currentUser();
    if (!user) throw safeError('not-signed-in');
    const bearer = await accessToken();
    const result = await request('/rest/v1/rpc/tm_my_operator_context', {
      method: 'POST', body: {}, bearer
    });
    if (!result || typeof result !== 'object' || typeof result.isOwner !== 'boolean')
      throw safeError('invalid-server-response');
    return result.isOwner;
  }
  async function myProfile() {
    const bearer = await verifiedBearer();
    const profile = await request('/rest/v1/rpc/tm_my_profile', {
      method: 'POST', body: {}, bearer
    });
    if (profile === null) throw safeError('account-unavailable');
    if (!profile || !['pending','active'].includes(profile.accountStatus) ||
        typeof profile.displayName !== 'string' || profile.displayName.length > 80 ||
        !Number.isSafeInteger(profile.version) || profile.version < 0 ||
        !['none','pending','verified'].includes(profile.linkStatus))
      throw safeError('invalid-server-response');
    // No account IDs, verification evidence, or provider-defined profile extras.
    return Object.freeze({accountStatus: profile.accountStatus,
      displayName: profile.displayName, version: profile.version,
      linkStatus: profile.linkStatus});
  }
  async function saveMyProfile({displayName, expectedVersion} = {}) {
    if (typeof displayName !== 'string' ||
        displayName.trim().length < 1 || displayName.trim().length > 80 ||
        /[\u0000-\u001f\u007f]/.test(displayName) ||
        !Number.isSafeInteger(expectedVersion) || expectedVersion < 0)
      throw safeError('invalid-profile');
    const bearer = await verifiedBearer();
    const outcome = await request('/rest/v1/rpc/tm_save_my_profile', {
      method: 'POST', body: {
        p_display_name: displayName.trim(), p_expected_version: expectedVersion
      }, bearer
    });
    if (outcome?.ok === false &&
        ['stale-profile','invalid-profile','account-unavailable','registration-required'].includes(outcome.code))
      throw safeError(outcome.code);
    if (!outcome || outcome.ok !== true ||
        !Number.isSafeInteger(outcome.version) || outcome.version <= expectedVersion ||
        outcome.displayName !== displayName.trim())
      throw safeError('invalid-server-response');
    return Object.freeze({displayName: outcome.displayName, version: outcome.version});
  }
  async function verifiedBearer() {
    const user = await currentUser();
    if (!user) throw safeError('not-signed-in');
    const bearer = await accessToken();
    if (!bearer) throw safeError('not-signed-in');
    return bearer;
  }
  async function signOut() {
    const s = read();
    clear(); // local session is cleared even if provider logout is unavailable
    if (!s) return true;
    try {
      await request('/auth/v1/logout', { method: 'POST', bearer: s.access_token });
      return true;
    } catch { return false; } // caller must distinguish local vs provider sign-out
  }
  return Object.freeze({ signInWithPassword, beginOAuth, completeOAuth, requestEmailOtp, verifyEmailOtp, currentUser, myTeamContexts, myOperatorAccess, myProfile, saveMyProfile, requestPasswordRecovery, acceptAuthLink, setPassword, verifiedBearer, signOut });
}
