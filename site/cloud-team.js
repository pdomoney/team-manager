// Stage 2 connected first-team workspace. This never opens the legacy encrypted
// demo vault or reuses its synthetic role picker as a production permission.
import {CLOUD_SUPABASE,CLOUD_STAGE3C_MODE} from './cloud-public-config.js';
import {createCloudIdentityClient} from './cloud-identity.js';
import {createCloudOnboardingClient} from './cloud-onboarding.js';
import {teamContextLabel} from './first-live-team.js';
import {createCloudOperationsClient,newMutationId} from './cloud-operations.js';
import {previewCloudPlay} from './cloud-play-board.js';
import {loadPlayEventDraft} from './play-event-persistence.js';

const $=id=>document.getElementById(id);
const main=$('cloud-main'),notice=$('cloud-alert'),picker=$('role-context');
const auth=createCloudIdentityClient({...CLOUD_SUPABASE,
  fetchImpl:fetch.bind(window),storage:sessionStorage});
const ops=createCloudOperationsClient({identity:auth,fetchImpl:fetch.bind(window),
  origin:location.origin});
const onboarding=createCloudOnboardingClient({identity:auth,fetchImpl:fetch.bind(window),origin:location.origin});
const ROLE_NAMES=Object.freeze({
  platform_owner:'Platform Owner',team_coach:'Coach',team_assistant:'Assistant Coach',
  team_manager:'Manager',team_player:'Player',team_volunteer:'Volunteer',
  team_play_viewer:'Play viewer'
});
const state={user:null,contexts:[],context:null,tab:'home',epoch:0,
  schedule:[],roster:[],duties:[],drafts:[],published:[],notices:[],preview:null,busy:false};
const canEditSchedule=()=>['team_coach','team_manager','team_assistant'].includes(state.context?.role);
const canRoster=()=>['team_coach','team_manager'].includes(state.context?.role);
const canManage=canRoster;
const canReadNotices=()=>['team_coach','team_manager','team_assistant','team_player','team_volunteer'].includes(state.context?.role);
const canViewTactics=()=>!CLOUD_STAGE3C_MODE&&['team_coach','team_assistant','team_manager',
  'team_player','team_play_viewer'].includes(state.context?.role);
const canDraft=()=>['team_coach','team_assistant'].includes(state.context?.role);
const isOwner=()=>state.context?.role==='platform_owner';
const escapeText=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;',
  '>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function h(tag,{className,text,attrs={},parent}={}){
  const e=document.createElement(tag);if(className)e.className=className;
  if(text!==undefined)e.textContent=String(text??'');
  for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));
  parent?.append(e);return e;
}
function clear(){main.replaceChildren();}
function card(title,parent=main){
  const c=h('section',{className:'cloud-card',parent});if(title)h('h3',{text:title,parent:c});return c;
}
function info(text,parent=main){return h('p',{className:'cloud-intro',text,parent});}
function button(label,fn,parent,{primary=false,disabled=false}={}){
  const b=h('button',{className:'cloud-btn'+(primary?' primary':''),
    text:label,attrs:{type:'button'},parent});b.disabled=disabled;b.addEventListener('click',fn);return b;
}
function actions(parent){return h('div',{className:'cloud-actions',parent});}
function form(parent,submit){
  const f=h('form',{className:'cloud-form',parent});
  f.addEventListener('submit',async e=>{
    e.preventDefault();if(state.busy)return;
    state.busy=true;for(const b of f.querySelectorAll('button'))b.disabled=true;
    try{await submit(new FormData(f));}
    catch(e){message(explain(e),true);}
    finally{state.busy=false;for(const b of f.querySelectorAll('button'))b.disabled=false;}
  });return f;
}
function field(f,label,name,{type='text',value='',required=true,max=120}={}){
  const l=h('label',{text:label,parent:f});
  const e=h('input',{attrs:{name,type,value,maxlength:max},parent:l});
  e.required=required;return e;
}
function selectField(f,label,name,options){
  const l=h('label',{text:label,parent:f});
  const s=h('select',{attrs:{name},parent:l});
  for(const [value,title] of options)h('option',{text:title,attrs:{value},parent:s});return s;
}
function message(text,isError=false){
  notice.textContent=text;notice.hidden=false;
  notice.style.background=isError?'var(--bad)':'var(--pitch)';
}
function explain(err){
  const code=err?.code||'request-denied';
  if(['stale-or-protected-session','stale-roster','stale-availability','stale-play',
    'stale-or-invalid-duty','stale-profile','revision-not-draft','mutation-id-reused',
    'stale-attendance','stale-event','stale-notice','stale-or-external-event'].includes(code))
    return 'This record changed on another device. Refresh to review the latest version before trying again.';
  if(['access-revoked','scope-denied','role-denied','account-inactive',
    'person-not-verified','participation-not-verified'].includes(code))
    return 'Your current role or team is not authorised for this action.';
  if(code==='already-pending')return 'There is already an invitation awaiting action for this email and role.';
  if(code==='self-approval-denied')return 'A different authorised reviewer must approve this request.';
  if(code==='invitation-unavailable')return 'This invitation is no longer available. Refresh the list.';
  if(code==='already-active')return 'This individual already has the selected team role.';
    if(code==='service-unavailable'||code==='network-unavailable')
    return 'The shared team service is unavailable. Your changes have not been queued or saved.';
  if(code==='unauthenticated'||code==='not-signed-in')
    return 'Your session has expired. Please sign in again.';
  return 'This action could not be completed. No change was confirmed.';
}
function title(name,subtitle){
  h('p',{className:'cloud-eyebrow',text:subtitle,parent:main});
  h('h2',{text:name,parent:main});
}
function contextLabel(c){return c.role==='platform_owner'?'Platform Owner · platform administration':
  (ROLE_NAMES[c.role]||c.role)+' · '+teamContextLabel(c);}
function selectContext(index){
  state.epoch++;notice.hidden=true;state.context=state.contexts[index]||null;
  state.schedule=[];state.roster=[];state.duties=[];state.notices=[];state.drafts=[];
  state.published=[];state.preview=null;
  $('active-context').textContent=state.context?contextLabel(state.context):'No active access';
  picker.value=String(index);
  state.tab='home';drawTabs();void showTab();
}
function drawTabs(){
  const owner=isOwner();
  for(const b of $('cloud-nav').querySelectorAll('button')){
    b.hidden=(CLOUD_STAGE3C_MODE&&b.dataset.tab==='tactics')||
      (owner&&b.dataset.tab!=='home'&&b.dataset.tab!=='more');
    b.setAttribute('aria-current',state.tab===b.dataset.tab?'page':'false');
  }
}
async function action(name,resource,payload={}){
  if(!state.context||isOwner())throw Object.assign(new Error('no-team-context'),{code:'scope-denied'});
  return ops.operation(state.context,name,resource,payload);
}
async function mutation(name,resource,expectedVersion,detail){
  const payload={mutationId:newMutationId(),expectedVersion,...detail};
  return action(name,resource,payload);
}
function readList(parent,items,render){
  const list=h('div',{className:'cloud-list',parent});
  if(!items.length)info('No records for this selected team.',list);
  for(const item of items)render(item,h('div',{className:'cloud-list-item',parent:list}));
  return list;
}
function when(s){
  if(!s)return 'Time to be confirmed';
  const d=new Date(s);return Number.isFinite(d.valueOf())?
    d.toLocaleString('en-AU',{dateStyle:'medium',timeStyle:'short'}):'Time to be confirmed';
}
async function loadForTab(tab,epoch){
  const c=state.context;
  if(!c||c.role==='platform_owner')return;
  const need=async(a,key)=>{const records=await action(a,c.teamId);
    if(state.epoch===epoch)state[key]=records;};
  if(tab==='home'){
    if(c.role==='team_volunteer')await need('duty.read','duties');
    else if(c.role==='team_play_viewer'){
      if(!CLOUD_STAGE3C_MODE)await need('play.published.read','published');
    }
    else await need('schedule.read','schedule');
  }else if(tab==='schedule'&&c.role!=='team_volunteer'&&c.role!=='team_play_viewer'){
    await need('schedule.read','schedule');
  }else if(tab==='team'){
    if(canRoster())await need('roster.read','roster');
    if(c.role==='team_volunteer')await need('duty.read','duties');
    if(c.role==='team_manager')await need('schedule.read','schedule');
  }else if(tab==='tactics'){
    if(canViewTactics())await need('play.published.read','published');
    if(canDraft())await need('play.draft.read','drafts');
  }
}
async function showTab(){
  const epoch=++state.epoch;clear();
  if(!state.context){title('No authorised team','Account access');info('An approved team or platform role is required.');return;}
  title(({home:'Home',schedule:'Schedule',team:'Team',tactics:'Tactics',more:'More'})[state.tab],
    contextLabel(state.context));
  if(state.tab!=='more'){
    const loading=info('Loading your authorised team records…');
    try{await loadForTab(state.tab,epoch);}
    catch(e){if(epoch!==state.epoch)return;loading.textContent=explain(e);
      message(explain(e),true);return;}
    if(epoch!==state.epoch)return;
    loading.remove();
  }
  if(isOwner()){
    if(state.tab==='more')renderMore();else{
      const panel=card('Platform administration');
      info('Your authorised Platform Owner context does not automatically open private team, player, volunteer or safeguarding records.',panel);
      info('To work as a Coach, select your separately approved team role above.',panel);
      info('Use restricted administration to configure the first team and review adult team invitations.',panel);
      button('Open Platform Owner administration',
        ()=>location.assign('cloud-owner.html'),panel,{primary:true});
    }
    return;
  }
  switch(state.tab){
    case 'home':renderHome();break;
    case 'schedule':renderSchedule();break;
    case 'team':renderTeam();break;
    case 'tactics':renderTactics();break;
    case 'more':renderMore();break;
  }
}
function renderHome(){
  const c=state.context;
  const banner=card('Your working team');
  h('p',{text:c.club+' · '+c.sport+' · '+c.season,parent:banner});
  info('Only records for this exact team and selected role are shown.',banner);
  if(c.role==='team_volunteer'){
    const d=card('Your assigned duties');h('p',{text:state.duties.length+' assignment(s)',parent:d});
    button('View your duties',()=>switchTab('team'),d,{primary:true});
  }else if(c.role==='team_play_viewer'){
    const d=card('Selected role');
    if(CLOUD_STAGE3C_MODE)info('Play-only access is deferred until Stage 4. Choose an approved management role to continue.',d);
    else{
      h('p',{text:state.published.length+' published play(s)',parent:d});
      button('Watch published plays',()=>switchTab('tactics'),d,{primary:true});
    }
  }else{
    const d=card('Upcoming sessions');
    const upcoming=state.schedule.filter(s=>s.status!=='cancelled')
      .slice().sort((a,b)=>String(a.startsAt||'').localeCompare(String(b.startsAt||''))).slice(0,4);
    readList(d,upcoming,(s,row)=>{
      h('strong',{text:s.title||s.kind||'Team session',parent:row});
      h('small',{text:when(s.startsAt)+(s.locationLabel?' · '+s.locationLabel:''),parent:row});
      if(c.role==='team_player')h('p',{text:'My availability: '+(s.myAvailability||'not answered'),parent:row});
    });
    button(c.role==='team_player'?'Reply to training':'Manage training',()=>switchTab('schedule'),d,{primary:true});
  }
  if(canReadNotices())renderNotices('home');
}
function renderSchedule(){
  if(state.context.role==='team_volunteer'||state.context.role==='team_play_viewer'){
    info('Your current role does not include the team schedule.');return;
  }
  const list=card('Sessions');
  readList(list,state.schedule,(s,row)=>{
    h('strong',{text:s.title||s.kind||'Session',parent:row});
    h('small',{text:when(s.startsAt)+(s.locationLabel?' · '+s.locationLabel:''),parent:row});
    if(state.context.role==='team_player'){
      h('p',{text:'My response: '+(s.myAvailability||'Not answered'),parent:row});
      const a=actions(row);
      for(const reply of ['yes','no','maybe'])
        button(reply[0].toUpperCase()+reply.slice(1),async()=>{
          try{await mutation('availability.reply',s.sessionId,s.myAvailabilityVersion??0,{response:reply});
            message('Your response was saved.');await showTab();}
          catch(e){message(explain(e),true);}},a,{primary:s.myAvailability===reply});
    }else if(canManage()){
      const a=actions(row);
      if(s.kind==='training'){
        button('Attendance and responses',()=>void openAttendance(s),a);
        if(s.status==='planned'){
          button('Edit',()=>editTraining(s),a);
          button('Cancel',async()=>{if(!confirm('Cancel this training session?'))return;
            try{await mutation('schedule.edit',s.sessionId,s.version,{command:{op:'cancel'}});
              message('Training cancelled.');await showTab();}
            catch(e){message(explain(e),true);}},a);
        }
      }else if(s.sessionId.startsWith('event-')&&s.status==='planned'){
        button('Reschedule team event',()=>editTeamEvent(s),a);
        button('Cancel team event',async()=>{
          if(!confirm('Cancel this team-managed event?'))return;
          try{await mutation('event.change',s.sessionId,s.version,{command:{op:'cancel'}});
            message('Team event cancelled.');await showTab();}
          catch(e){message(explain(e),true);}
        },a);
      }else if(s.kind==='match'){
        info('Official fixture: read-only unless the competition grants separate authority.',row);
      }
    }
  });
  if(canEditSchedule()){
    const c=card('Schedule training');
    const f=form(c,async d=>{
      const start=new Date(String(d.get('startsAt')));if(!Number.isFinite(start.valueOf()))
        throw Object.assign(new Error(),{code:'invalid-input'});
      await mutation('schedule.edit',state.context.teamId,0,{command:{
        op:'create',kind:'training',title:String(d.get('title')).trim(),
        locationLabel:String(d.get('locationLabel')).trim(),startsAt:start.toISOString()
      }});
      message('Training added to the team schedule.');await showTab();
    });
    field(f,'Session title','title',{max:120});
    field(f,'Start date and time','startsAt',{type:'datetime-local',max:120});
    field(f,'Location','locationLabel',{required:false,max:120});
    h('button',{className:'cloud-btn primary',text:'Create training',
      attrs:{type:'submit'},parent:f});
  }
  if(canManage()){
    const c=card('Add team event or friendly');
    info('Team-controlled activities only. Official competition fixtures cannot be created or edited here.',c);
    const f=form(c,async d=>{
      const startsAt=new Date(String(d.get('eventStartsAt')));
      if(!Number.isFinite(startsAt.valueOf()))
        throw Object.assign(new Error(),{code:'invalid-input'});
      await mutation('event.create',state.context.teamId,0,{command:{
        kind:String(d.get('kind')),title:String(d.get('eventTitle')).trim(),
        locationLabel:String(d.get('eventLocation')).trim(),
        startsAt:startsAt.toISOString()}});
      message('Team-managed event created.');await showTab();
    });
    selectField(f,'Event type','kind',[
      ['activity','Team activity'],['friendly','Friendly match (unofficial)']]);
    field(f,'Event title','eventTitle',{max:120});
    field(f,'Start','eventStartsAt',{type:'datetime-local'});
    field(f,'Location','eventLocation',{required:false,max:120});
    h('button',{className:'cloud-btn primary',text:'Add team event',
      attrs:{type:'submit'},parent:f});
  }
}
function editTeamEvent(s){
  clear();title('Reschedule team event','Schedule');
  const c=card(s.title||'Team event');
  info('Only a team-managed activity or friendly can be rescheduled. Official fixtures are protected.',c);
  const f=form(c,async d=>{
    const startsAt=new Date(String(d.get('startsAt')));
    if(!Number.isFinite(startsAt.valueOf()))
      throw Object.assign(new Error(),{code:'invalid-input'});
    await mutation('event.change',s.sessionId,s.version,{
      command:{op:'reschedule',title:String(d.get('title')).trim(),
        locationLabel:String(d.get('locationLabel')).trim(),
        startsAt:startsAt.toISOString()}});
    message('Team event updated.');await showTab();
  });
  field(f,'Title','title',{value:s.title||'',max:120});
  field(f,'New start','startsAt',{type:'datetime-local'});
  field(f,'Location','locationLabel',{value:s.locationLabel||'',required:false,max:120});
  h('button',{className:'cloud-btn primary',text:'Save team event',
    attrs:{type:'submit'},parent:f});
  button('Back to schedule',()=>void showTab(),c);
}
async function openAttendance(s){
  const epoch=++state.epoch;
  clear();title('Attendance and availability',s.title||'Training');
  const loading=info('Loading this team training register…');
  try{
    const [attendance,replies]=await Promise.all([
      action('attendance.read',s.sessionId),
      action('availability.board',s.sessionId)]);
    if(epoch!==state.epoch)return;
    loading.remove();
    const registers=card('Training roll call');
    info('Coach and Manager record attendance for active team players only. This does not certify registration or eligibility.',registers);
    readList(registers,attendance,(p,row)=>{
      h('strong',{text:'Player reference '+p.personId,parent:row});
      h('small',{text:'Attendance: '+(p.status||'Not marked'),parent:row});
      const f=form(row,async d=>{
        await mutation('attendance.record',s.sessionId,p.version,
          {command:{personId:p.personId,status:String(d.get('status'))}});
        message('Attendance recorded.');await openAttendance(s);
      });
      selectField(f,'Attendance','status',[
        ['present','Present'],['absent','Absent'],['late','Late'],['excused','Excused']])
        .value=p.status||'present';
      h('button',{className:'cloud-btn',text:'Save attendance',
        attrs:{type:'submit'},parent:f});
    });
    const board=card('Availability responses');
    info('Manager entries retain their stated source. Players can still update their own response.',board);
    readList(board,replies,(p,row)=>{
      h('strong',{text:'Player reference '+p.personId,parent:row});
      h('small',{text:'Reply: '+(p.response||'Not answered')+
        ' · source: '+(p.source||'none'),parent:row});
      if(state.context.role!=='team_manager')return;
      const f=form(row,async d=>{
        await mutation('availability.transcribe',s.sessionId,p.version,{command:{
          personId:p.personId,response:String(d.get('response')),
          source:String(d.get('source'))}});
        message('External availability response recorded with provenance.');
        await openAttendance(s);
      });
      selectField(f,'Reported reply','response',[
        ['yes','Yes'],['no','No'],['maybe','Maybe']]).value=p.response||'maybe';
      selectField(f,'Received by','source',[
        ['phone','Phone'],['in_person','In person'],['email','Email']]);
      h('button',{className:'cloud-btn',text:'Record reported reply',
        attrs:{type:'submit'},parent:f});
    });
    button('Back to schedule',()=>void switchTab('schedule'),actions());
  }catch(e){if(epoch!==state.epoch)return;loading.textContent=explain(e);message(explain(e),true);
    button('Back to schedule',()=>void switchTab('schedule'),actions());}
}
function editTraining(s){
  clear();title('Edit training','Schedule');
  const c=card(s.title||'Training');
  const f=form(c,async d=>{
    await mutation('schedule.edit',s.sessionId,s.version,{
      command:{op:'update',title:String(d.get('title')).trim(),
        locationLabel:String(d.get('locationLabel')).trim()}
    });
    message('Training changes saved.');await showTab();
  });
  field(f,'Title','title',{value:s.title||''});
  field(f,'Location','locationLabel',{value:s.locationLabel||'',required:false});
  h('button',{className:'cloud-btn primary',text:'Save changes',attrs:{type:'submit'},parent:f});
  button('Back to schedule',()=>void showTab(),c);
}
function renderTeam(){
  const c=state.context;
  if(canRoster()){
    const roster=card('Squad nominations');
    info('Nomination and placement do not verify registration, payment or competition eligibility.',roster);
    readList(roster,state.roster,(p,row)=>{
      h('strong',{text:p.personId,parent:row});
      h('small',{text:p.status+' · version '+p.version,parent:row});
      if(p.status==='pending')button('Approve team placement',async()=>{
        if(!confirm('Approve team placement only? Registration, payment and competition eligibility remain separate.'))return;
        try{await mutation('roster.approve',p.personId,p.version,{command:{op:'approve'}});
          message('Team placement approved. Registration and eligibility are not verified.');await showTab();}
        catch(e){message(explain(e),true);}
      },actions(row));
      if(p.status!=='inactive')button('Withdraw nomination',async()=>{
        try{await mutation('roster.edit',c.teamId,p.version,
          {command:{op:'withdraw',personId:p.personId}});
          message('Nomination withdrawn, without changing registrar evidence.');await showTab();
        }catch(e){message(explain(e),true);}},actions(row));
    });
    const f=form(roster,async d=>{
      await mutation('roster.edit',c.teamId,0,{
        command:{op:'nominate',personId:String(d.get('personId')).trim()}});
      message('Nomination recorded as pending, not registered.');await showTab();
    });
    field(f,'Existing or new candidate reference (no personal details)','personId');
    h('button',{className:'cloud-btn primary',text:'Nominate player',attrs:{type:'submit'},parent:f});
  }
  if(c.role==='team_manager'){
    const v=card('Assign verified volunteer duty');
    info('A valid independently approved volunteer grant and verified person link are required.',v);
    const f=form(v,async d=>{
      await mutation('duty.assign',c.teamId,0,{command:{
        op:'assign',sessionId:String(d.get('sessionId')),
        personId:String(d.get('personId')).trim()
      }});
      message('Duty assigned to the verified volunteer.');await showTab();
    });
    selectField(f,'Session','sessionId',state.schedule.filter(s=>s.status==='planned')
      .map(s=>[s.sessionId,(s.title||s.kind)+' · '+when(s.startsAt)]));
    field(f,'Verified volunteer person reference','personId');
    h('button',{className:'cloud-btn primary',text:'Assign duty',attrs:{type:'submit'},
      parent:f});
  }
  if(c.role==='team_volunteer'){
    const v=card('Your verified assignments');
    readList(v,state.duties,(d,row)=>{
      h('strong',{text:'Assignment '+d.dutyId,parent:row});
      h('small',{text:'Session '+d.sessionId+' · '+d.status,parent:row});
      h('p',{text:'Your response: '+(d.response||'Not answered'),parent:row});
      if(!['assigned','confirmed'].includes(d.status))return;
      const a=actions(row);
      for(const response of d.status==='confirmed'?['done']:['yes','no']){
        button(({yes:'Accept',no:'Decline',done:'Mark completed'})[response],async()=>{
          try{await mutation('duty.reply',d.dutyId,d.version,{response});
            message('Your response was saved.');await showTab();
          }catch(e){message(explain(e),true);}},a);
      }
    });
  }
  if(c.role==='team_player'||c.role==='team_play_viewer')
    info('Private squad and volunteer information is not available to this role.');
  if(c.role==='team_manager')renderDutyBoard(c);
    if(['team_coach','team_manager'].includes(c.role))renderTeamInvitations(c);
}
function renderDutyBoard(ctx){
  const c=card('Team volunteer duty board');
  info('Assignments do not grant software access or prove sporting accreditation. Certified roles require a separate verified process.',c);
  const content=h('div',{parent:c});
  const epoch=state.epoch;
  const loading=info('Loading verified team assignments…',content);
  void action('duty.board',ctx.teamId).then(rows=>{
    if(epoch!==state.epoch)return;loading.remove();
    readList(content,rows,(d,row)=>{
      h('strong',{text:'Duty '+d.dutyId,parent:row});
      h('small',{text:'Session '+d.sessionId+' · volunteer '+d.personId+
        ' · '+d.status+' · '+(d.type||'general_help'),parent:row});
      if(!['assigned','confirmed'].includes(d.status))return;
      const f=form(row,async data=>{
        await mutation('duty.label',d.dutyId,d.version,
          {command:{type:String(data.get('type'))}});
        message('Duty category updated.');await showTab();
      });
      selectField(f,'Non-accredited duty type','type',[
        ['general_help','General help'],['setup','Setup'],
        ['equipment','Equipment'],['scorer_support','Scorer support']])
        .value=d.type||'general_help';
      h('button',{className:'cloud-btn',text:'Update duty type',
        attrs:{type:'submit'},parent:f});
      button('Withdraw duty',async()=>{
        if(!confirm('Withdraw this volunteer assignment?'))return;
        try{await mutation('duty.withdraw',d.dutyId,d.version,
          {command:{op:'withdraw'}});
          message('Duty withdrawn.');await showTab();}
        catch(e){message(explain(e),true);}
      },actions(row));
    });
  }).catch(e=>{if(epoch!==state.epoch)return;loading.textContent=explain(e);});
}
function renderNotices(place='more'){
  if(!canReadNotices())return;
  const c=card(place==='home'?'Latest team notices':'Team notices');
  if(place==='more'&&canManage()){
    const f=form(c,async d=>{
      const result=await mutation('notice.create',state.context.teamId,0,{command:{
        title:String(d.get('title')).trim(),body:String(d.get('body')).trim(),
        audience:String(d.get('audience'))}});
      message('Notice saved as a draft. Review it before publishing.');
      await showTab();
    });
    field(f,'Notice title','title',{max:100});
    const label=h('label',{text:'Notice message',parent:f});
    const ta=h('textarea',{attrs:{name:'body',maxlength:1000,rows:4,required:true},
      parent:label});
    selectField(f,'Audience','audience',[
      ['all','Everyone in this team'],['players','Players'],
      ['volunteers','Volunteers'],['coaches','Coaching staff']]);
    h('button',{className:'cloud-btn primary',text:'Save notice draft',
      attrs:{type:'submit'},parent:f});
  }
  const content=h('div',{parent:c}),epoch=state.epoch;
  const loading=info('Loading team notices…',content);
  void action('notices.read',state.context.teamId).then(items=>{
    if(epoch!==state.epoch)return;loading.remove();
    readList(content,place==='home'?items.filter(n=>n.status==='published').slice(0,3):items,
      (n,row)=>{
        h('strong',{text:n.title,parent:row});
        h('small',{text:n.audience+' · '+n.status,parent:row});
        h('p',{text:n.body,parent:row});
        if(place!=='more'||!canManage())return;
        const a=actions(row);
        const change=async(operation,command)=>{
          try{await mutation(operation,n.noticeId,n.version,{command});
            message(operation==='notice.publish'?'Notice published to its approved audience.':'Notice archived.');
            await showTab();}
          catch(e){message(explain(e),true);}
        };
        if(n.status==='draft')button('Publish notice',()=>void change('notice.publish',{op:'publish'}),a,{primary:true});
        button('Archive notice',()=>void change('notice.archive',{op:'archive'}),a);
      });
    if(place==='home')button('View notices',()=>switchTab('more'),actions(c));
  }).catch(e=>{if(epoch!==state.epoch)return;loading.textContent=explain(e);});
}
function openReports(){
  if(!canManage())return;
  const ctx=state.context,epoch=++state.epoch;
  clear();title('Team reports','Attendance, availability and duties');
  const loading=info('Loading team-scoped management summary…');
  void action('report.summary',ctx.teamId).then(rows=>{
    if(epoch!==state.epoch)return;loading.remove();
    info('Small cohorts of 1–4 are suppressed in aggregate reports. Only this selected team is included.');
    const c=card('Session summaries');
    const value=n=>n===null?'Under 5':String(n??0);
    readList(c,rows,(s,row)=>{
      h('strong',{text:s.title||s.kind||'Team session',parent:row});
      h('small',{text:when(s.startsAt),parent:row});
      h('p',{text:'Active roster: '+value(s.activeRoster)+
        ' · Available: '+value(s.availabilityYes)+
        ' · Attended: '+value(s.attendancePresent)+
        ' · Volunteer confirmations: '+value(s.volunteerAccepted),parent:row});
      if(s.kind==='training')button('Attendance detail',()=>{
        void openAttendance(s);
      },actions(row));
    });
    button('Back to More',()=>void switchTab('more'),actions());
  }).catch(e=>{if(epoch!==state.epoch)return;loading.textContent=explain(e);
    button('Back to More',()=>void switchTab('more'),actions());});
}
function validE5Play(play){
  return play&&typeof play==='object'&&!Array.isArray(play)
    &&typeof play.name==='string'&&play.name.trim().length>0&&play.name.length<=120
    &&play.players&&typeof play.players==='object'&&!Array.isArray(play.players)
    &&Array.isArray(play.moves)&&(!play.phases||Array.isArray(play.phases))
    &&(!Object.hasOwn(play,'eventTimeline')||loadPlayEventDraft(play).status==='ready')
    &&!Object.keys(play).some(x=>/^(phone|email|medical|guardian|password|token|accountId|personId)$/i.test(x));
}
function renderTactics(){
  const c=state.context;
  if(!canViewTactics()){info('No published-play permission is assigned to your selected role.');return;}
  const published=card('Published team plays');
  readList(published,state.published,(p,row)=>{
    h('strong',{text:p.play.name,parent:row});
    h('small',{text:'Published revision '+p.revisionId,parent:row});
    button('View diagram and Learn / authored timing',()=>viewPlay(p),actions(row),{primary:true});
  });
  if(!canDraft())return;
  const drafts=card('Coach play drafts');
  info('Coach drafts are never shown to Players. Assistant Coaches may save drafts; only the Head Coach can publish.',drafts);
  readList(drafts,state.drafts,(p,row)=>{
    h('strong',{text:p.play.name,parent:row});
    h('small',{text:'Revision '+p.revisionId+' · '+p.revisionStatus,parent:row});
    const a=actions(row);
    button('Preview',()=>viewPlay(p),a);
    button('Edit coaching instructions',()=>editPlayInstructions(p),a);
    if(c.role==='team_coach'&&p.revisionStatus==='draft')
      button('Publish reviewed revision',async()=>{
        if(!confirm('Publish this reviewed E5 revision to the selected team?'))return;
        try{await mutation('play.publish',p.playId,p.version,{revisionId:p.revisionId});
          message('Reviewed revision published.');await showTab();}
        catch(e){message(explain(e),true);}},a,{primary:true});
  });
  const importer=card('Bring an authored E5 play into this team');
  info('Import an exported E5 play JSON object. The original diagram, phases, movements and event timing are preserved without conversion. Do not import an encrypted workspace backup or any personal information.',importer);
  const f=form(importer,async d=>{
    const file=d.get('playFile');
    if(!(file instanceof File)||file.size>65536||file.size===0)
      throw Object.assign(new Error(),{code:'invalid-play'});
    let p;try{p=JSON.parse(await file.text());}catch{
      throw Object.assign(new Error(),{code:'invalid-play'});}
    if(!validE5Play(p))throw Object.assign(new Error(),{code:'invalid-play'});
    await mutation('play.draft.edit',c.teamId,0,{command:{op:'create',play:p}});
    message('Play saved as a coach-only draft. Review before publishing.');await showTab();
  });
  const l=h('label',{text:'Authored E5 JSON file',parent:f});
  h('input',{attrs:{type:'file',name:'playFile',accept:'application/json,.json',required:'true'},parent:l});
  h('button',{className:'cloud-btn primary',text:'Import as draft',attrs:{type:'submit'},parent:f});
}
function editPlayInstructions(entry){
  clear();title('Edit play instructions','Coach draft');
  const panel=card(entry.play.name);
  info('This edits coaching text only. All E5 diagram geometry, paths, phases and timeline fields remain unchanged.',panel);
  const f=form(panel,async d=>{
    const play=JSON.parse(JSON.stringify(entry.play));
    play.name=String(d.get('name')).trim();
    play.headline=String(d.get('headline')).trim();
    play.steps=String(d.get('steps'));
    if(!validE5Play(play))throw Object.assign(new Error(),{code:'invalid-play'});
    await mutation('play.draft.edit',entry.playId,entry.version,
      {command:{op:'save',play}});
    message('Coach draft saved; published revision remains unchanged.');await showTab();
  });
  field(f,'Play name','name',{value:entry.play.name});
  field(f,'Coaching headline','headline',{value:entry.play.headline||'',required:false});
  const l=h('label',{text:'Teaching steps',parent:f});
  const t=h('textarea',{attrs:{name:'steps'},parent:l});t.value=entry.play.steps||'';
  h('button',{className:'cloud-btn primary',text:'Save draft',
    attrs:{type:'submit'},parent:f});
  button('Back',()=>void showTab(),panel);
}
function viewPlay(entry){
  clear();title(entry.play.name,'Tactics · authored E5 play');
  const panel=card(entry.play.headline||'Team play');
  const viewer=h('div',{parent:panel});
  previewCloudPlay(entry.play,viewer);
  button('Back to team plays',()=>void showTab(),panel);
}
function invitationOutcome(outcome){
  if(outcome.delivery==='sent')return 'Invitation approved and email sent. Access still requires verification.';
  if(outcome.delivery==='existing-account')return 'Invitation approved. This existing user can sign in to claim it.';
  if(outcome.delivery==='failed')return 'Approved, but invitation email was not delivered. Check provider configuration or retry.';
  if(outcome.code==='proposed')return 'Invitation proposed. Another authorised reviewer must approve it.';
  if(outcome.code==='claimed')return 'Invitation claimed. Awaiting independent person verification and team approval.';
  if(outcome.code==='activated')return 'Access approved for the selected team and role.';
  if(outcome.code==='revoked')return 'Team access withdrawn.';
  return 'Invitation updated.';
}
function renderMyInvitations(){
  const panel=card('My team invitations');
  const content=h('div',{parent:panel});
  info('Your verified sign-in email determines which invitations belong to you. Claiming does not grant access.',content);
  const epoch=state.epoch;
  const loading=info('Checking invitations…',content);
  void onboarding.listMine().then(items=>{
    if(epoch!==state.epoch)return;
    loading.remove();
    if(!items.length){info('No approved invitations are waiting for this account.',content);return;}
    readList(content,items,(entry,row)=>{
      h('strong',{text:entry.teamId+' · '+(ROLE_NAMES[entry.teamRole]||entry.teamRole),parent:row});
      h('small',{text:entry.status+' · expires '+when(entry.expiresAt),parent:row});
      if(entry.status==='approved')button('Claim invitation',async()=>{
        try{const result=await onboarding.claim(entry.invitationId);
          message(invitationOutcome(result));await initialise(true);}
        catch(e){message(explain(e),true);}
      },actions(row),{primary:true});
    });
  }).catch(()=>{
    if(epoch!==state.epoch)return;
    loading.textContent='Team invitations are unavailable until the approved onboarding service is installed.';
  });
}
function renderTeamInvitations(ctx){
  const panel=card('Team account invitations');
  info('This is for approved adult account trials. Invitation proposals never grant access. A second Coach or Manager with their own verified role must approve.',panel);
  const formNode=form(panel,async d=>{
    const result=await onboarding.propose(ctx,String(d.get('email')||'').trim(),
      String(d.get('teamRole')||''));
    message(invitationOutcome(result));await showTab();
  });
  field(formNode,'Invitee email','email',{type:'email',max:254});
  selectField(formNode,'Proposed team access','teamRole',[
    ['team_coach','Coach'],['team_manager','Manager'],
    ['team_assistant','Assistant Coach'],['team_player','Player'],
    ['team_volunteer','Volunteer']]);
  h('button',{className:'cloud-btn primary',text:'Propose invitation',
    attrs:{type:'submit'},parent:formNode});
  const content=h('div',{parent:panel});
  const epoch=state.epoch;
  const loading=info('Loading team invitations…',content);
  void onboarding.listTeam(ctx).then(items=>{
    if(epoch!==state.epoch)return;
    loading.remove();
    if(!items.length){info('No team invitations recorded.',content);return;}
    readList(content,items,(entry,row)=>{
      h('strong',{text:entry.email+' · '+(ROLE_NAMES[entry.teamRole]||entry.teamRole),parent:row});
      h('small',{text:entry.status+' · email '+entry.delivery+
        ' · expires '+when(entry.expiresAt),parent:row});
      const a=actions(row);
      const next=async fn=>{
        try{const result=await fn(ctx,entry.invitationId);
          message(invitationOutcome(result));await showTab();}
        catch(e){message(explain(e),true);}
      };
      if(entry.canReview){
        if(entry.status==='proposed')
          button('Approve invitation',()=>void next(onboarding.approve),a,{primary:true});
        if(entry.status==='approved'&&entry.delivery!=='sent')
          button('Send invitation email',()=>void next(onboarding.resend),a);
        if(entry.status==='claimed')
          button('Verify person and activate access',async()=>{
            if(!confirm('I have independently verified this adult individual, their correct team and role. This is not proof of sporting or financial registration. Approve access?'))return;
            await next(onboarding.activate);
          },a,{primary:true});
        if(entry.status==='activated')
          button('Revoke team access',async()=>{
            if(!confirm("Revoke this individual's selected team role?"))return;
            await next(onboarding.revoke);
          },a);
        if(['proposed','approved','claimed'].includes(entry.status))
          button('Cancel invitation',async()=>{
            if(!confirm('Cancel this invitation?'))return;
            await next(onboarding.cancel);
          },a);
      }else info('A separate authorised reviewer is required.',row);
    });
  }).catch(()=>{
    if(epoch!==state.epoch)return;
    loading.textContent='Invitation management is unavailable until the approved onboarding service is installed.';
  });
}
function renderProfilePanel(parent=main){
  const panel=card('My profile',parent);
  const content=h('div',{parent:panel});
  const epoch=state.epoch;
  const paint=profile=>{
    if(epoch!==state.epoch)return;
    content.replaceChildren();
    info('Manage your own display name. Team roles and account-to-person verification require an independent authorised reviewer.',content);
    h('p',{text:'Account: '+profile.accountStatus+' · Person link: '+profile.linkStatus,
      parent:content});
    const f=form(content,async d=>{
      const saved=await auth.saveMyProfile({displayName:String(d.get('displayName')||''),
        expectedVersion:profile.version});
      if(epoch!==state.epoch)return;
      paint({...profile,displayName:saved.displayName,version:saved.version});
      message('Your display name was saved.');
    });
    field(f,'Display name','displayName',{value:profile.displayName,max:80});
    h('button',{className:'cloud-btn primary',text:'Save my profile',
      attrs:{type:'submit'},parent:f});
  };
  const loading=info('Loading your profile…',content);
  void auth.myProfile().then(paint).catch(e=>{
    if(epoch!==state.epoch)return;
    loading.textContent=e.code==='account-unavailable'
      ?'Claim your approved invitation first. Your personal profile becomes available after account activation.'
      :e.code==='server-not-ready'
      ?'Profile setup is unavailable until the approved database migration is installed.'
      :'Your profile could not be verified. No details have been changed.';
  });
}

function renderMore(){
  const c=card('Signed-in account');
  h('p',{text:state.user?.email||'Signed in',parent:c});
  info('All team records come from the server for one selected role and team. Nothing is copied into the legacy encrypted demo.',c);
  renderProfilePanel();
  renderMyInvitations();
  if(canReadNotices())renderNotices();
  if(canManage()){
    const reports=card('Reports');
    info('Attendance, availability and duties for your selected team.',reports);
    button('Open team reports',()=>void openReports(),reports,{primary:true});
  }
  const a=actions(c);
  button('Refresh permissions and team data',async()=>{
    try{await initialise(true);message('Current grants refreshed.');}
    catch(e){message(explain(e),true);}},a);
  button('Sign out',async()=>{
    state.epoch++;state.context=null;state.contexts=[];
    const ok=await auth.signOut();
    location.replace('cloud-access.html');
    if(!ok)message('Signed out locally. Provider logout could not be confirmed.',true);
  },a);
}
function switchTab(tab){
  if(!['home','schedule','team','tactics','more'].includes(tab)||
     (CLOUD_STAGE3C_MODE&&tab==='tactics'))return;
  if(isOwner()&&!['home','more'].includes(tab))return;
  state.tab=tab;state.preview=null;notice.hidden=true;drawTabs();void showTab();
}
async function initialise(keep=false){
  const current=await auth.currentUser();
  if(!current){location.replace('cloud-access.html');return;}
  const grants=await auth.myTeamContexts();
  let owner=false;
  try{owner=await auth.myOperatorAccess();}catch{/* fail closed, without losing team grants */}
  const choices=[...(owner?[{role:'platform_owner',teamId:'platform',club:'',
    sport:'',season:''}]:[]),...grants];
  const previous=keep&&state.context?state.context.role+'|'+state.context.teamId:null;
  state.user=current;state.contexts=choices;
  picker.replaceChildren();choices.forEach((c,i)=>
    h('option',{text:contextLabel(c),attrs:{value:i},parent:picker}));
  $('context-controls').hidden=!choices.length;
  $('cloud-nav').hidden=!choices.length;
  if(!choices.length){state.epoch++;state.context=null;clear();
    title('No active access','Account permissions');
    info('You can set up your own profile, but team access requires an independently approved grant.');
    renderMyInvitations();renderProfilePanel();return;}
  const ix=choices.findIndex(c=>c.role+'|'+c.teamId===previous);
  if(ix>=0||choices.length===1){selectContext(ix>=0?ix:0);return;}
  // Multiple grants: never automatically operate as Owner or Coach.
  state.epoch++;state.context=null;state.tab='home';state.schedule=[];state.roster=[];
  state.duties=[];state.notices=[];state.drafts=[];state.published=[];state.preview=null;
  $('cloud-nav').hidden=true;
  $('active-context').textContent='Choose one active role and team';
  picker.insertBefore(h('option',{text:'Choose a role and team',
    attrs:{value:'',disabled:'true'}}),picker.firstChild);
  picker.value='';
  clear();title('Choose your role and team','Signed-in account');
  info('One login can hold more than one approved role. Select a single working context; permissions are never combined.');
  const list=card('Your available contexts');
  for(const [i,ctx] of choices.entries())
    button(contextLabel(ctx),()=>{ $('cloud-nav').hidden=false;selectContext(i);},list);

}
$('cloud-nav').addEventListener('click',e=>{
  const b=e.target.closest('button[data-tab]');if(b)switchTab(b.dataset.tab);
});
picker.addEventListener('change',()=>{if(picker.value!==''){$('cloud-nav').hidden=false;selectContext(Number(picker.value));}});
initialise().catch(e=>{clear();title('Unable to verify access','Account');
  info(explain(e));$('cloud-nav').hidden=true;$('context-controls').hidden=true;});
