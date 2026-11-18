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

export function createCloudIdentityClient({ url, publishableKey, fetchImpl, storage, now = Date.now } = {}) {
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
  async function signOut() {
    const s = read();
    clear(); // local session is cleared even if provider logout is unavailable
    if (!s) return true;
    try {
      await request('/auth/v1/logout', { method: 'POST', bearer: s.access_token });
      return true;
    } catch { return false; } // caller must distinguish local vs provider sign-out
  }
  return Object.freeze({ signInWithPassword, currentUser, myTeamContexts, signOut });
}
