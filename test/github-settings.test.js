import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGitHubSettings, saveGitHubSettings, GITHUB_SETTINGS_KEY, GITHUB_SESSION_TOKEN_KEY } from '../site/github-settings.js';

const store = () => {
  const db = new Map();
  return {
    get: key => db.get(key) || null,
    set: (key, value) => { db.set(key, value); return true; },
    del: key => { db.delete(key); }
  };
};
test('new publishing token stays session-only by default', () => {
  const local = store(), session = store();
  const gh = { owner: 'o', repo: 'r', token: 'secret-token', autoPublish: true, rememberToken: false };
  saveGitHubSettings(gh, local, session);
  assert.equal(JSON.parse(local.get(GITHUB_SETTINGS_KEY)).token, undefined);
  assert.equal(session.get(GITHUB_SESSION_TOKEN_KEY), 'secret-token');
  assert.equal(loadGitHubSettings(local, session).token, 'secret-token');
  assert.equal(loadGitHubSettings(local, store()).token, '');
});
test('legacy locally stored credentials are migrated out of durable storage', () => {
  const local = store(), session = store();
  local.set(GITHUB_SETTINGS_KEY, JSON.stringify({ owner: 'o', repo: 'r', token: 'legacy' }));
  const gh = loadGitHubSettings(local, session);
  assert.equal(gh.token, 'legacy');
  assert.equal(gh.rememberToken, false);
  saveGitHubSettings(gh, local, session);
  assert.equal(JSON.parse(local.get(GITHUB_SETTINGS_KEY)).token, undefined);
  assert.equal(session.get(GITHUB_SESSION_TOKEN_KEY), 'legacy');
});
test('trusted-device opt-in explicitly retains a token across sessions', () => {
  const local = store(), session = store();
  saveGitHubSettings({ owner: 'o', repo: 'r', token: 'opt-in', rememberToken: true }, local, session);
  assert.equal(JSON.parse(local.get(GITHUB_SETTINGS_KEY)).token, 'opt-in');
  assert.equal(loadGitHubSettings(local, store()).token, 'opt-in');
  const gh = loadGitHubSettings(local, session);
  gh.rememberToken = false;
  saveGitHubSettings(gh, local, session);
  assert.equal(JSON.parse(local.get(GITHUB_SETTINGS_KEY)).token, undefined);
});
test('clearing token removes both local and session copies', () => {
  const local = store(), session = store();
  saveGitHubSettings({ token: 'configured', rememberToken: true }, local, session);
  saveGitHubSettings({ token: '', rememberToken: false }, local, session);
  assert.equal(session.get(GITHUB_SESSION_TOKEN_KEY), null);
  assert.equal(loadGitHubSettings(local, session).token, '');
});
test('malformed saved preferences cannot crash login', () => {
  const local = store(), session = store();
  local.set(GITHUB_SETTINGS_KEY, '{invalid');
  assert.deepEqual(loadGitHubSettings(local, session), { token: '', rememberToken: false });
});
