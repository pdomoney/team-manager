import { CLOUD_SUPABASE } from './cloud-public-config.js';
import { createCloudIdentityClient } from './cloud-identity.js';

const $ = id => document.getElementById(id);
const form = $('cloud-login');
const submit = $('cloud-submit');
const account = $('cloud-account');
const status = $('cloud-status');
const teams = $('cloud-teams');
const client = createCloudIdentityClient({
  ...CLOUD_SUPABASE, fetchImpl: fetch.bind(window), storage: sessionStorage
});
let busy = false;

function setBusy(value) {
  busy = value;
  submit.disabled = value;
  $('cloud-signout').disabled = value;
}
function showMessage(message) { status.textContent = message; }
function showGuest() {
  account.hidden = true;
  form.hidden = false;
  teams.replaceChildren();
  $('cloud-password').value = '';
}
function showUser(user, contexts, owner = false) {
  form.hidden = true;
  account.hidden = false;
  $('cloud-identity').textContent = 'Signed in as ' + user.email;
  teams.replaceChildren();
  $('cloud-team-message').textContent = contexts.length
    ? 'These are your current team/role grants. The full team app is not connected yet.'
    : 'No verified active team access is assigned to this account.';
  if (owner) {
    const li=document.createElement('li');
    li.textContent='Platform Owner · administration context (no automatic team-data access)';
    teams.append(li);
  }
  for (const item of contexts) {
    const li = document.createElement('li');
    const name = document.createElement('strong');
    name.textContent = item.teamId + ' · ' + item.role.replaceAll('_', ' ');
    const extra = document.createElement('span');
    extra.textContent = item.club + ' · ' + item.sport + ' · ' + item.season;
    li.append(name, extra);
    teams.append(li);
  }
  const link=document.createElement('a');
  link.href='cloud-team.html';
  link.className='access-primary access-workspace-link';
  link.textContent='Open your team workspace';
  if (contexts.length||owner) {
    const launch=document.createElement('li');
    launch.className='access-team-launch';
    launch.append(link);
    teams.append(launch);
  }
}
async function loadAccess() {
  const user = await client.currentUser();
  if (!user) { showGuest(); showMessage('Sign in with an existing invited test account.'); return; }
  try {
    const contexts = await client.myTeamContexts();
    let owner=false;
    try { owner=await client.myOperatorAccess(); } catch { /* owner is not inferred */ }
    showUser(user, contexts, owner);
    showMessage('Identity verified. This preview does not grant access to private team data.');
  } catch (error) {
    showUser(user, []);
    showMessage(error.code === 'server-not-ready'
      ? 'The read-only database endpoint has not been installed. Your identity is verified; team access is not yet available.'
      : 'Team access could not be verified. No permissions have been granted.');
  }
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  setBusy(true);
  showMessage('Checking account…');
  try {
    const email = $('cloud-email').value;
    const password = $('cloud-password').value;
    await client.signInWithPassword(email, password);
    $('cloud-password').value = '';
    await loadAccess();
  } catch (error) {
    showGuest();
    showMessage(error.code === 'invalid-input'
      ? 'Enter a valid email and password.'
      : 'Sign-in could not be completed. Check your existing account or try again.');
  } finally { setBusy(false); }
});
$('cloud-signout').addEventListener('click', async () => {
  if (busy) return;
  setBusy(true);
  const remotelyRevoked = await client.signOut();
  showGuest();
  showMessage(remotelyRevoked
    ? 'Signed out.'
    : 'Signed out on this device. Remote sign-out could not be confirmed.');
  setBusy(false);
});
loadAccess().catch(() => {
  showGuest();
  showMessage('Unable to verify an existing session. No team access has been granted.');
});
