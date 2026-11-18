// Standalone Stage 1 operations candidate. The original Team Manager app is
// unchanged. These controls never authorise themselves or write directly to DB.
import { CLOUD_SUPABASE } from './cloud-public-config.js';
import { createCloudIdentityClient } from './cloud-identity.js';

const $=id=>document.getElementById(id);
const identity=createCloudIdentityClient({
  ...CLOUD_SUPABASE,fetchImpl:fetch.bind(window),storage:sessionStorage
});
const ROLES=new Set(['team_coach','team_assistant','team_manager','team_player','team_volunteer']);
const canScheduleEdit=role=>['team_coach','team_assistant','team_manager'].includes(role);
const canManage=role=>['team_coach','team_manager'].includes(role);
const canSchedule=role=>['team_coach','team_assistant','team_manager','team_player'].includes(role);
let contexts=[],scope=null,sessions=[],roster=[],duties=[],editing=null,busy=false;

const label=(value)=>String(value??'').replaceAll('_',' ');
const message=text=>{$('stage-status').textContent=text;};
function list(id,items,render){
  const parent=$(id);parent.replaceChildren();
  if(!items.length){
    const li=document.createElement('li');li.textContent='No records in this team.';
    parent.append(li);return;
  }
  for(const item of items){
    const li=document.createElement('li');render(li,item);parent.append(li);
  }
}
function button(labelText,click){
  const b=document.createElement('button');b.type='button';
  b.className='access-secondary';b.textContent=labelText;
  b.addEventListener('click',click);return b;
}
const isSelected=()=>Boolean(scope&&ROLES.has(scope.role));
const mutation=()=>({
  mutationId:'stage1_'+crypto.randomUUID().replaceAll('-',''),
  expectedVersion:0
});
function requestBody(action,resourceId,payload={}){
  return {activeTeamId:scope.teamId,activeRole:scope.role,action,resourceId,payload};
}
async function send(action,resourceId,payload={}){
  if(!isSelected())throw new Error('No approved team is selected.');
  const token=await identity.accessToken();
  if(!token)throw new Error('Your session has ended. Sign in again.');
  let response;
  try{
    response=await fetch('/api/stage1/v1/operation',{
      method:'POST',cache:'no-store',credentials:'omit',
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
      body:JSON.stringify(requestBody(action,resourceId,payload))
    });
  }catch{throw new Error('The team server cannot be reached. No changes were confirmed.');}
  let result;
  try{result=await response.json();}catch{
    throw new Error('The team server returned an invalid response.');
  }
  if(!result||result.ok!==true){
    const code=typeof result?.code==='string'?result.code:'service-unavailable';
    if(response.status===409)throw new Error('This record has changed. Refresh before trying again ('+code+').');
    if(response.status===401)throw new Error('Session expired. Sign in again.');
    if(response.status===403)throw new Error('The selected role is not allowed to do that ('+code+').');
    throw new Error('Team operations are unavailable ('+code+').');
  }
  return result;
}
async function withBusy(task){
  if(busy)return;
  busy=true;
  $('stage-refresh').disabled=true;
  $('stage-context').disabled=true;
  try{await task();}
  catch(error){message(error.message||'The operation could not be completed.');}
  finally{busy=false;$('stage-refresh').disabled=false;$('stage-context').disabled=false;}
}
function localInput(value){
  if(!value)return '';
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return '';
  return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
}
function setTrainingEdit(item=null){
  editing=item;
  $('stage-training-heading').textContent=item?'Update training':'Add training';
  $('stage-training-save').textContent=item?'Save changes':'Save training';
  $('stage-training-cancel').hidden=!item;
  $('stage-title-field').value=item?.title||'';
  $('stage-when').value=localInput(item?.startsAt);
  $('stage-place').value=item?.locationLabel||'';
  if(item)$('stage-training').scrollIntoView({block:'nearest'});
}
function renderSchedule(){
  list('stage-sessions',sessions,(li,s)=>{
    const text=document.createElement('span');
    text.textContent=(s.title||label(s.kind))+' · '+(s.startsAt?
      new Date(s.startsAt).toLocaleString('en-AU'):'Time TBC')+
      ' · '+s.status+(s.locationLabel?' · '+s.locationLabel:'');
    li.append(text);
    if(canScheduleEdit(scope.role)&&s.kind==='training'&&s.status==='planned'){
      li.append(button('Edit',()=>setTrainingEdit(s)));
      li.append(button('Cancel',()=>withBusy(async()=>{
        const result=await send('schedule.edit',s.sessionId,{
          ...mutation(),expectedVersion:s.version,command:{op:'cancel'}
        });
        await refresh();message('Training cancelled. Version '+result.version+'.');
      })));
    }
  });
  const eligible=sessions.filter(s=>s.status==='planned');
  for(const selectId of ['stage-session-picker','stage-duty-session']){
    const select=$(selectId);select.replaceChildren();
    for(const s of eligible){
      const opt=document.createElement('option');opt.value=s.sessionId;
      opt.textContent=(s.title||s.kind)+' · '+s.sessionId;select.append(opt);
    }
  }
}
function renderRoster(){
  list('stage-roster',roster,(li,p)=>{
    const span=document.createElement('span');
    span.textContent=p.personId+' · '+p.status+' · version '+p.version;
    li.append(span);
    if(p.status!=='inactive')li.append(button('Withdraw',()=>withBusy(async()=>{
      await send('roster.edit',scope.teamId,{
        ...mutation(),expectedVersion:p.version,
        command:{op:'withdraw',personId:p.personId}
      });
      await refresh();message('Participation withdrawn. Club registration was not altered.');
    })));
  });
}
function renderDuties(){
  list('stage-duties',duties,(li,d)=>{
    const span=document.createElement('span');
    span.textContent=d.sessionId+' · '+d.status+
      (d.response?' · '+d.response:'');
    li.append(span);
    for(const [code,title] of [['yes','Accept'],['no','Decline'],['done','Mark done']]){
      if(code==='done'&&d.status!=='confirmed')continue;
      if(!['assigned','confirmed'].includes(d.status))continue;
      li.append(button(title,()=>withBusy(async()=>{
        await send('duty.reply',d.dutyId,{
          ...mutation(),expectedVersion:d.version,response:code
        });
        await refresh();message('Your duty response was saved.');
      })));
    }
  });
}
async function refresh(){
  if(!isSelected())return;
  const role=scope.role;
  $('stage-schedule-section').hidden=!canSchedule(role);
  $('stage-training').hidden=!canScheduleEdit(role);
  $('stage-roster-section').hidden=!canManage(role);
  $('stage-availability-section').hidden=role!=='team_player';
  $('stage-duty-assign-section').hidden=role!=='team_manager';
  $('stage-duty-section').hidden=role!=='team_volunteer';
  sessions=canSchedule(role)||role==='team_manager'?
    (await send('schedule.read',scope.teamId)).data:[];
  roster=canManage(role)?(await send('roster.read',scope.teamId)).data:[];
  duties=role==='team_volunteer'?(await send('duty.read',scope.teamId)).data:[];
  renderSchedule();
  if(canManage(role))renderRoster();
  if(role==='team_volunteer')renderDuties();
  $('stage-workspace').hidden=false;
  message('Team records verified for '+scope.teamId+' as '+label(role)+'.');
}
async function open(){
  try{
    const user=await identity.currentUser();
    if(!user){message('No current session. Use Team sign-in first.');return;}
    $('stage-identity').textContent='Signed in as '+user.email;
    contexts=(await identity.myTeamContexts()).filter(x=>ROLES.has(x.role));
    const selected=$('stage-context');selected.replaceChildren();
    if(!contexts.length){message('No verified operational team roles are assigned.');return;}
    for(const [index,c] of contexts.entries()){
      const opt=document.createElement('option');opt.value=String(index);
      opt.textContent=c.teamId+' · '+label(c.role)+' · '+c.club;
      selected.append(opt);
    }
    selected.disabled=false;
    scope=contexts[0];
    await refresh();
  }catch{
    $('stage-workspace').hidden=true;
    message('The authenticated team service is not ready. No private data was opened.');
  }
}
$('stage-context').addEventListener('change',()=>withBusy(async()=>{
  scope=contexts[Number($('stage-context').value)]||null;
  $('stage-workspace').hidden=true;
  setTrainingEdit();
  await refresh();
}));
$('stage-refresh').addEventListener('click',()=>withBusy(refresh));
$('stage-training-cancel').addEventListener('click',()=>setTrainingEdit());
$('stage-training').addEventListener('submit',event=>{
  event.preventDefault();withBusy(async()=>{
    const start=new Date($('stage-when').value);
    if(!Number.isFinite(start.getTime()))throw new Error('Enter a valid training date and time.');
    const command={op:editing?'update':'create',
      title:$('stage-title-field').value.trim(),
      startsAt:start.toISOString(),locationLabel:$('stage-place').value.trim()};
    if(!editing)command.kind='training';
    const result=await send('schedule.edit',editing?editing.sessionId:scope.teamId,{
      ...mutation(),expectedVersion:editing?.version||0,command
    });
    setTrainingEdit();await refresh();
    message('Training saved. Version '+result.version+'.');
  });
});
$('stage-roster-form').addEventListener('submit',event=>{
  event.preventDefault();withBusy(async()=>{
    const personId=$('stage-person').value.trim();
    const old=roster.find(p=>p.personId===personId);
    await send('roster.edit',scope.teamId,{
      ...mutation(),expectedVersion:old?.version||0,
      command:{op:'nominate',personId}
    });
    $('stage-person').value='';await refresh();
    message('Participation proposed. This does not verify registration.');
  });
});
$('stage-availability-form').addEventListener('submit',event=>{
  event.preventDefault();withBusy(async()=>{
    const s=sessions.find(x=>x.sessionId===$('stage-session-picker').value);
    if(!s)throw new Error('Select a current session.');
    await send('availability.reply',s.sessionId,{
      ...mutation(),expectedVersion:s.myAvailabilityVersion??0,response:$('stage-rsvp').value
    });
    await refresh();message('Your availability response was saved.');
  });
});
$('stage-duty-assign-form').addEventListener('submit',event=>{
  event.preventDefault();withBusy(async()=>{
    const sessionId=$('stage-duty-session').value;
    const personId=$('stage-duty-person').value.trim();
    if(!sessionId)throw new Error('Select a current session.');
    const result=await send('duty.assign',scope.teamId,{
      ...mutation(),command:{op:'assign',sessionId,personId}
    });
    $('stage-duty-person').value='';
    await refresh();message('Duty assigned as '+result.resourceId+'.');
  });
});
open();
