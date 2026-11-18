// Stage 2 connected first-team workspace. This never opens the legacy encrypted
// demo vault or reuses its synthetic role picker as a production permission.
import {CLOUD_SUPABASE} from './cloud-public-config.js';
import {createCloudIdentityClient} from './cloud-identity.js';
import {createCloudOperationsClient,newMutationId} from './cloud-operations.js';
import {previewCloudPlay} from './cloud-play-board.js';
import {loadPlayEventDraft} from './play-event-persistence.js';

const $=id=>document.getElementById(id);
const main=$('cloud-main'),notice=$('cloud-alert'),picker=$('role-context');
const auth=createCloudIdentityClient({...CLOUD_SUPABASE,
  fetchImpl:fetch.bind(window),storage:sessionStorage});
const ops=createCloudOperationsClient({identity:auth,fetchImpl:fetch.bind(window),
  origin:location.origin});
const ROLE_NAMES=Object.freeze({
  platform_owner:'Platform Owner',team_coach:'Coach',team_assistant:'Assistant Coach',
  team_manager:'Manager',team_player:'Player',team_volunteer:'Volunteer',
  team_play_viewer:'Play viewer'
});
const state={user:null,contexts:[],context:null,tab:'home',epoch:0,
  schedule:[],roster:[],duties:[],drafts:[],published:[],preview:null,busy:false};
const canEditSchedule=()=>['team_coach','team_manager','team_assistant'].includes(state.context?.role);
const canRoster=()=>['team_coach','team_manager'].includes(state.context?.role);
const canViewTactics=()=>['team_coach','team_assistant','team_manager',
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
    'stale-or-invalid-duty','revision-not-draft','mutation-id-reused'].includes(code))
    return 'This record changed on another device. Refresh to review the latest version before trying again.';
  if(['access-revoked','scope-denied','role-denied','account-inactive',
    'person-not-verified','participation-not-verified'].includes(code))
    return 'Your current role or team is not authorised for this action.';
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
  (ROLE_NAMES[c.role]||c.role)+' · '+c.teamId;}
function selectContext(index){
  state.epoch++;notice.hidden=true;state.context=state.contexts[index]||null;
  state.schedule=[];state.roster=[];state.duties=[];state.drafts=[];
  state.published=[];state.preview=null;
  $('active-context').textContent=state.context?contextLabel(state.context):'No active access';
  picker.value=String(index);
  state.tab='home';drawTabs();void showTab();
}
function drawTabs(){
  const owner=isOwner();
  for(const b of $('cloud-nav').querySelectorAll('button')){
    b.hidden=owner&&b.dataset.tab!=='home'&&b.dataset.tab!=='more';
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
    else if(c.role==='team_play_viewer')await need('play.published.read','published');
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
      info('Your Platform Owner grant is independently verified. This context does not open private team, player, volunteer or safeguarding records.',panel);
      info('To work as a Coach, select your separately approved team role above.',panel);
      info('Privileged platform administration requires its own protected workflows and step-up verification.',panel);
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
    const d=card('Team plays');h('p',{text:state.published.length+' published play(s)',parent:d});
    button('Watch published plays',()=>switchTab('tactics'),d,{primary:true});
  }else{
    const d=card('Upcoming training');
    const upcoming=state.schedule.filter(s=>s.status!=='cancelled')
      .slice().sort((a,b)=>String(a.startsAt||'').localeCompare(String(b.startsAt||''))).slice(0,4);
    readList(d,upcoming,(s,row)=>{
      h('strong',{text:s.title||'Training',parent:row});
      h('small',{text:when(s.startsAt)+(s.locationLabel?' · '+s.locationLabel:''),parent:row});
      if(c.role==='team_player')h('p',{text:'My availability: '+(s.myAvailability||'not answered'),parent:row});
    });
    button(c.role==='team_player'?'Reply to training':'Manage training',()=>switchTab('schedule'),d,{primary:true});
  }
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
    }else if(canEditSchedule()&&s.kind==='training'&&s.status==='planned'){
      const a=actions(row);
      button('Edit',()=>editTraining(s),a);
      button('Cancel',async()=>{if(!confirm('Cancel this training session?'))return;
        try{await mutation('schedule.edit',s.sessionId,s.version,{command:{op:'cancel'}});
          message('Training cancelled.');await showTab();}
        catch(e){message(explain(e),true);}},a);
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
function renderMore(){
  const c=card('Signed-in account');
  h('p',{text:state.user?.email||'Signed in',parent:c});
  info('All team records come from the server for one selected role and team. Nothing is copied into the legacy encrypted demo.',c);
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
  if(!['home','schedule','team','tactics','more'].includes(tab))return;
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
    info('This account has no independently approved team or Platform Owner grant.');return;}
  const ix=Math.max(0,choices.findIndex(c=>c.role+'|'+c.teamId===previous));
  selectContext(ix);
}
$('cloud-nav').addEventListener('click',e=>{
  const b=e.target.closest('button[data-tab]');if(b)switchTab(b.dataset.tab);
});
picker.addEventListener('change',()=>selectContext(Number(picker.value)));
initialise().catch(e=>{clear();title('Unable to verify access','Account');
  info(explain(e));$('cloud-nav').hidden=true;$('context-controls').hidden=true;});
