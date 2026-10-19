// Local-only GitHub publishing preferences. A fine-grained publishing token is sensitive:
// keep it for this tab's session by default; long-term storage requires an explicit opt-in.
// A token previously stored in tm-github is migrated to session storage on startup.
export const GITHUB_SETTINGS_KEY = 'tm-github';
export const GITHUB_SESSION_TOKEN_KEY = 'tm-github:token';

export function loadGitHubSettings(local, session) {
  let saved = {};
  try {
    const parsed = JSON.parse(local.get(GITHUB_SETTINGS_KEY) || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) saved = parsed;
  } catch (e) { /* invalid settings are ignored */ }
  const sessionToken = session.get(GITHUB_SESSION_TOKEN_KEY);
  return {
    ...saved,
    token: sessionToken || String(saved.token || ''),
    rememberToken: saved.rememberToken === true
  };
}

export function saveGitHubSettings(settings, local, session) {
  const { token, ...preferences } = settings;
  // Do not place the bearer credential into durable storage unless explicitly authorised.
  if (preferences.rememberToken === true && token) preferences.token = String(token);
  if (token) session.set(GITHUB_SESSION_TOKEN_KEY, String(token));
  else session.del(GITHUB_SESSION_TOKEN_KEY);
  return local.set(GITHUB_SETTINGS_KEY, JSON.stringify(preferences));
}
