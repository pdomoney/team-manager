import { CLOUD_SUPABASE } from './cloud-public-config.js';
import { createCloudIdentityClient } from './cloud-identity.js';
import {teamDisplayName} from './first-live-team.js';

const $ = id => document.getElementById(id);
const form = $('cloud-login');
const submit = $('cloud-submit');
const account = $('cloud-account');
const status = $('cloud-status');
const teams = $('cloud-teams');
const workspaceLink = $('cloud-workspace-link');
const client = createCloudIdentityClient({
  ...CLOUD_SUPABASE, fetchImpl: fetch.bind(window), storage: sessionStorage
});
let busy = false;
const recovery=$('cloud-recovery');
const setup=$('cloud-password-setup');
function showSignIn(){
  recovery.hidden=true;setup.hidden=true;account.hidden=true;form.hidden=false;
}


function setBusy(value) {
  busy = value;
  submit.disabled = value;
  $('cloud-signout').disabled = value;
}
function showMessage(message) { status.textContent = message; }
function showGuest() {
  showSignIn();
  teams.replaceChildren();
  workspaceLink.hidden = true;
  $('cloud-password').value = '';
}
function showUser(user, contexts, owner = false, checked = true) {
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
    name.textContent = teamDisplayName(item) + ' · ' + item.role.replaceAll('_', ' ');
    const extra = document.createElement('span');
    extra.textContent = item.club + ' · ' + item.sport + ' · ' + item.season;
    li.append(name, extra);
    teams.append(li);
  }
  // The workspace action is not a team or a role grant.
  workspaceLink.hidden = !checked;
  workspaceLink.textContent = (contexts.length || owner)
    ? 'Open your team workspace' : 'Set up your profile';
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
    showUser(user, [], false, false);
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
$('cloud-forgot').addEventListener('click',()=>{
  form.hidden=true;account.hidden=true;setup.hidden=true;recovery.hidden=false;
  $('cloud-recovery-email').value=$('cloud-email').value;
  showMessage('');
});
$('cloud-recovery-back').addEventListener('click',()=>{
  showSignIn();showMessage('');
});
recovery.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;
  busy=true;const control=recovery.querySelector('button[type=submit]');
  control.disabled=true;
  try{
    const redirect=new URL('cloud-access.html',location.href).href;
    await client.requestPasswordRecovery($('cloud-recovery-email').value,redirect);
    showMessage('If that account exists, recovery instructions have been sent. Check your email.');
    recovery.hidden=true;form.hidden=false;
  }catch{
    // Do not disclose whether an account exists.
    showMessage('Recovery could not be requested. Please try again later.');
  }finally{busy=false;control.disabled=false;}
});
setup.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;
  const pwd=$('cloud-new-password').value;
  if(pwd!==$('cloud-confirm-password').value){
    showMessage('Passwords must match.');return;
  }
  busy=true;const control=setup.querySelector('button[type=submit]');
  control.disabled=true;
  try{
    await client.setPassword(pwd);
    $('cloud-new-password').value='';
    $('cloud-confirm-password').value='';
    setup.hidden=true;
    showMessage('Password saved. Your account is ready to continue.');
    await loadAccess();
  }catch{
    showMessage('Password could not be saved. The link may have expired.');
  }finally{busy=false;control.disabled=false;}
});
async function start(){
  // Remove bearer credentials from browser address before contacting the provider.
  const fragment=location.hash;
  if(fragment){
    history.replaceState(null,'',location.pathname+location.search);
    if(fragment.includes('access_token=')||fragment.includes('type=invite')||
       fragment.includes('type=recovery')){
      try{
        await client.acceptAuthLink(fragment);
        form.hidden=true;account.hidden=true;recovery.hidden=true;setup.hidden=false;
        showMessage('Email verified. Choose a password to continue.');
        return;
      }catch{
        showGuest();showMessage('This invitation or recovery link is invalid or expired.');
        return;
      }
    }
  }
  await loadAccess();
}
start().catch(() => {
  showGuest();
  showMessage('Unable to verify an existing session. No team access has been granted.');
});
