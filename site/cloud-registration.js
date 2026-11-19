import {CLOUD_SUPABASE,CLOUD_STAGE3D3_POLICY_REQUIRED}
  from './cloud-public-config.js';
import {createCloudIdentityClient} from './cloud-identity.js';

const $=id=>document.getElementById(id);
const form=$('registration-form');
const unavailable=$('registration-unavailable');
const status=$('registration-status');
const submit=$('registration-submit');
const done=$('registration-continue');
const client=createCloudIdentityClient({
  ...CLOUD_SUPABASE,fetchImpl:fetch.bind(window),storage:sessionStorage
});
let policyId=null;
let busy=false;
function message(text){status.textContent=text;}
function approvedUrl(value){
  let u;
  try{u=new URL(value);}catch{return null;}
  return u.protocol==='https:'&&!u.username&&!u.password&&
    !u.search&&!u.hash&&u.href.length<=512?u.href:null;
}
async function query(method,body){
  const bearer=await client.verifiedBearer();
  const res=await fetch('/api/stage3d3/v1/registration',{
    method,cache:'no-store',redirect:'error',
    headers:{Authorization:'Bearer '+bearer,
      ...(method==='POST'?{'Content-Type':'application/json'}:{})},
    ...(method==='POST'?{body:JSON.stringify(body)}:{})
  });
  let response;
  try{response=await res.json();}catch{throw Error('registration-service-unavailable');}
  if(!response||typeof response!=='object')throw Error('registration-service-unavailable');
  return response;
}
async function start(){
  if(CLOUD_STAGE3D3_POLICY_REQUIRED!==true){
    message('This public demonstration does not activate real-team accounts.');
    return;
  }
  const user=await client.currentUser();
  if(!user){message('Sign in with your independently approved account first.');return;}
  const result=await query('GET');
  if(result.code==='accepted'&&result.canProceed===true){
    unavailable.hidden=true;done.hidden=false;
    message('You have acknowledged the current policy. Team access is still role-scoped.');
    return;
  }
  if(result.code!=='acceptance-required'||result.ok!==true||
     result.canProceed!==false||!result.policy){
    message(result.code==='adult-review-required'
      ? 'Your adult identity review is not complete. Contact your authorised team administrator.'
      : 'Registration is not yet available for this account.');
    return;
  }
  const p=result.policy;
  const terms=approvedUrl(p.termsUrl);
  const privacy=approvedUrl(p.privacyUrl);
  if(!/^[a-z0-9][a-z0-9._-]{4,63}$/.test(p.policyId||'')||
     !terms||!privacy||!p.termsVersion||!p.privacyVersion)
    throw Error('invalid-approved-policy');
  policyId=p.policyId;
  $('registration-terms-link').href=terms;
  $('registration-privacy-link').href=privacy;
  $('registration-terms-version').textContent=' (version '+p.termsVersion+')';
  $('registration-privacy-version').textContent=' (version '+p.privacyVersion+')';
  unavailable.hidden=true;form.hidden=false;
  message('Review each document before acknowledging it.');
}
form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(busy||!policyId)return;
  if(!$('registration-terms').checked||!$('registration-privacy').checked){
    message('Both required acknowledgements must be selected.');return;
  }
  busy=true;submit.disabled=true;
  try{
    const response=await query('POST',{
      policyId,termsAccepted:true,privacyAcknowledged:true,
      marketingOptIn:$('registration-marketing').checked
    });
    if(!response.ok||response.code!=='accepted'||response.canProceed!==true)
      throw Error('acceptance-not-recorded');
    form.hidden=true;done.hidden=false;
    message('Your acknowledgement was recorded. You can return to team access.');
  }catch{
    message('The acknowledgement could not be saved. Nothing has been accepted. Please try again.');
  }finally{busy=false;submit.disabled=false;}
});
start().catch(()=>message('Registration is unavailable. No team access has been granted.'));
