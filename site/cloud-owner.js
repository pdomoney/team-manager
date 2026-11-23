// Stage 3D.4 Platform Owner setup. Server owns identity, scope and grants.
import {CLOUD_SUPABASE} from './cloud-public-config.js';
import {createCloudIdentityClient} from './cloud-identity.js';

const $=id=>document.getElementById(id);
const identity=createCloudIdentityClient({...CLOUD_SUPABASE,
  fetchImpl:fetch.bind(window),storage:sessionStorage});
let busy=false;
function status(text){$('owner-state').textContent=text;}
function element(tag,parent,text,cls){
  const e=document.createElement(tag);
  if(text!==undefined)e.textContent=text;
  if(cls)e.className=cls;
  parent.append(e);return e;
}
async function call(action,detail={}){
  const bearer=await identity.verifiedBearer();
  const response=await fetch('/api/stage3d4/v1/owner',{
    method:'POST',cache:'no-store',redirect:'error',credentials:'omit',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+bearer},
    body:JSON.stringify({action,...detail})
  });
  let result;
  try{result=await response.json();}
  catch{throw Error('Server response unavailable');}
  if(!response.ok||result?.ok!==true)
    throw Error(result?.code==='registration-required'
      ? 'Approved registration and policy acknowledgement are required first.'
      : 'Action denied: '+String(result?.code||'server-unavailable'));
  return result;
}
async function run(action,detail={}){
  if(busy)return;
  busy=true;
  document.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{
    const res=await call(action,detail);
    await refresh();
    if(action==='invite.issue'||action==='invite.approve'){
      status(res.delivery==='sent'
        ? 'Invitation approved and email delivery reported sent. The recipient must still claim it, complete adult verification, acknowledge the current policy and receive a separate role activation.'
        : res.delivery==='existing-account'
          ? 'Invitation approved for an existing account. Ask the verified recipient to sign in and claim it. No team access has been granted.'
          : 'Invitation approved, but email delivery FAILED. No invitation email was confirmed. Check the approved email provider and cancel/reissue after fixing it.');
    }else status('Saved. Your current permissions have been checked.');
  }catch(e){status(e.message);}
  finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);}
}
function invitationRow(item,parent){
  const card=element('section',parent,undefined,'owner-invite');
  element('h4',card,item.email+' · '+item.role.replaceAll('_',' '));
  element('p',card,'Status: '+item.status+' · email: '+item.delivery);
  const controls=element('div',card,undefined,'owner-actions');
  function action(label,command,needsEvidence=false){
    const b=element('button',controls,label);
    b.type='button';
    b.addEventListener('click',()=>{
      let evidenceRef;
      if(needsEvidence){
        evidenceRef=window.prompt(
          'Enter the private, independently checked adult identity evidence reference (evidence-ref/...).');
        if(!evidenceRef)return;
        if(!/^evidence-ref\/[A-Za-z0-9._/-]{12,100}$/.test(evidenceRef)){
          status('A valid private evidence reference is required.');return;
        }
      }else if(!window.confirm(label+' for this adult and exact team?'))return;
      void run(command,{invitationId:item.invitationId,
        ...(evidenceRef?{evidenceRef}:{})});
    });
  }
  if(item.status==='proposed')
    action('Approve and send invitation','invite.approve');
  if(item.status==='approved'||item.status==='claimed')
    action('Review confirmed adult', 'invite.review-adult',true);
  if(item.status==='claimed')action('Activate team role','invite.activate');
  if(item.status==='activated')action('Revoke team access','invite.revoke');
  if(item.status==='approved'||item.status==='claimed')
    action('Cancel invitation','invite.cancel');
}
async function refresh(){
  const current=await identity.currentUser();
  if(!current){location.replace('cloud-access.html');return;}
  const data=await call('status');
  $('owner-workspace').hidden=false;
  $('owner-create-team').hidden=!!data.team;
  $('owner-team-summary').replaceChildren();
  if(data.team){
    const team=data.team;
    element('h3',$('owner-team-summary'),'First team established');
    element('p',$('owner-team-summary'),
      team.clubRef+' · '+team.teamId+' · '+team.sportRef+' · '+team.seasonRef);
    element('p',$('owner-team-summary'),
      data.coachAssigned?'Your initial Coach grant is recorded.':
        'Your initial Coach grant has not been activated.');
  }
  $('owner-coach-panel').hidden=!data.team||data.coachAssigned;
  $('owner-policy-pending').hidden=!!data.policyReady;
  $('owner-invitations').hidden=!data.policyReady||!data.team;
  const list=$('owner-invite-list');list.replaceChildren();
  if(data.policyReady&&data.team){
    if(!data.invitations.length)element('p',list,'No administrator-approved invitations.');
    else data.invitations.forEach(x=>invitationRow(x,list));
  }
  status(!data.team
    ? 'Your Platform Owner permission is verified. Create your first team to continue.'
    : !data.coachAssigned
      ? 'Your first team is recorded. Assign your Coach role to continue.'
      : data.policyReady
        ? 'Your Platform Owner and Coach roles are recorded. Registration requirements are active.'
        : 'Your Platform Owner and Coach roles are recorded. Team data remains restricted until an approved registration policy is active and acknowledged.');
}
$('owner-create-team').addEventListener('submit',e=>{
  e.preventDefault();
  const d=Object.fromEntries(new FormData(e.currentTarget));
  void run('team.create',d);
});
$('owner-coach-action').addEventListener('click',()=>void run('coach.assign'));
$('owner-invite-form').addEventListener('submit',e=>{
  e.preventDefault();
  const d=Object.fromEntries(new FormData(e.currentTarget));
  if(!window.confirm('Approve this adult-only invitation for the selected first team?'))return;
  void run('invite.issue',d);
});
refresh().catch(e=>status(
  'Platform Owner setup is not yet authorised or available. '+e.message));
