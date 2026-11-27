// Stage 2 connected first-team workspace. This never opens the legacy encrypted
// demo vault or reuses its synthetic role picker as a production permission.
import {CLOUD_SUPABASE,CLOUD_STAGE3C_MODE,CLOUD_STAGE3D3_POLICY_REQUIRED,CLOUD_STAGE4_TACTICS_ENABLED} from './cloud-public-config.js';
import {verifiedOwnerSetup} from './cloud-owner-status.js';
import {createCloudIdentityClient} from './cloud-identity.js';
import {createCloudOnboardingClient} from './cloud-onboarding.js';
import {teamContextLabel,teamDisplayName} from './first-live-team.js';
import {navArt,initials,originalSection,originalColumns,originalWorkingContext,originalCompetitionCard,originalDateBadge,originalRosterIdentity} from './cloud-original-presentation.js';
import {buildTeamNavigation,hasTeamRole,roleForAction,reviewerContext,
  clubsForNavigation,visibleSections} from './cloud-team-contexts.js';
import {createCloudOperationsClient,newMutationId} from './cloud-operations.js';
import {createCloudManagementClient} from './cloud-management.js';
import {createCloudManagementExperience} from './cloud-management-experience.js';
import {applyConnectedStyle,setConnectedCrest,validConnectedLogo,validConnectedStyle,paintClubChip,validClubBranding} from './connected-branding.js';
import {renderConnectedBranding} from './cloud-branding-editor.js';
import {teamRecordedMatchesFromSchedule,namedTrainingRegister} from './cloud-original-model-adapter.js';
import {teamIconSvg} from './shared-team-icons.js';
import {publishedMatchSquadText,publishedMatchRecordText,connectedMessageNeedsReview} from './shared-team-messages.js';
import {matchDayAccess,resolveMatchDayFixture,matchDayReview,matchDayRulesRequest,STATE_CUP_REFERENCE} from './cloud-matchday.js';
import {renderMatchDayRecord} from './cloud-matchday-record.js';
import {previewCloudPlay} from './cloud-play-board.js';
import {loadPlayEventDraft} from './play-event-persistence.js';
import {connectedPlayLibrary,capturePlayScope,resolveAssignedPlay} from './cloud-tactics-library.js';

const $=id=>document.getElementById(id);
const main=$('cloud-main'),notice=$('cloud-alert');
const clubs=$('club-chips'),teams=$('team-chips');
const auth=createCloudIdentityClient({...CLOUD_SUPABASE,
  fetchImpl:fetch.bind(window),storage:sessionStorage});
const ops=createCloudOperationsClient({identity:auth,fetchImpl:fetch.bind(window),
  origin:location.origin});
const onboarding=createCloudOnboardingClient({identity:auth,fetchImpl:fetch.bind(window),origin:location.origin});
const management=createCloudManagementClient({identity:auth,fetchImpl:fetch.bind(window),
  origin:location.origin});
const ROLE_NAMES=Object.freeze({
  platform_owner:'Platform Owner',team_coach:'Coach',team_assistant:'Assistant Coach',
  team_manager:'Manager',team_player:'Player',team_volunteer:'Volunteer',
  team_play_viewer:'Play viewer'
});
const state={user:null,contexts:[],context:null,activeClub:null,isPlatformOwner:false,branding:null,clubLogos:new Map(),clubBrands:new Map(),brandingGeneration:0,brandingEditing:false,
  founderTeamId:null,tab:'home',sub:'',epoch:0,competitions:null,
  schedule:[],roster:[],members:[],duties:[],drafts:[],published:[],notices:[],playerTeam:null,preview:null,busy:false};
const hasRole=(...roles)=>hasTeamRole(state.context,...roles);
const canEditSchedule=()=>hasRole('team_coach','team_manager','team_assistant');
const canRoster=()=>hasRole('team_coach','team_manager');
const canManage=canRoster;
const canReadNotices=()=>hasRole('team_coach','team_manager','team_assistant','team_player','team_volunteer');
const MANAGEMENT_PARITY=CLOUD_STAGE3D3_POLICY_REQUIRED===true;
const playsDeferred=()=>!CLOUD_STAGE4_TACTICS_ENABLED&&(CLOUD_STAGE3C_MODE||CLOUD_STAGE3D3_POLICY_REQUIRED);
const canViewTactics=()=>!playsDeferred()&&hasRole('team_coach','team_assistant','team_manager','team_player','team_play_viewer');
const canDraft=()=>!playsDeferred()&&hasRole('team_coach','team_assistant');
const isOwner=()=>state.context?.kind==='platform';
const escapeText=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;',
  '>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function h(tag,{className,text,attrs={},parent}={}){
  const e=document.createElement(tag);if(className)e.className=className;
  if(text!==undefined)e.textContent=String(text??'');
  for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));
  parent?.append(e);return e;
}
let e5Host=null;
function clear(){e5Host?.destroy();e5Host=null;applySavedBranding();main.replaceChildren();main.dataset.view=state.tab||'home';}
function mayLeaveE5(){return !e5Host?.editing||(!e5Host.pending()&&confirm('Leave the editor? Unsaved changes will be discarded.'));}
function card(title,parent=main){
  const c=h('section',{className:'cloud-card',parent});if(title)h('h3',{text:title,parent:c});return c;
}
function info(text,parent=main){return h('p',{className:'cloud-intro',text,parent});}
function button(label,fn,parent,{primary=false,disabled=false}={}){
  const b=h('button',{className:'btn cloud-btn'+(primary?' primary':''),
    text:label,attrs:{type:'button'},parent});b.disabled=disabled;b.addEventListener('click',fn);return b;
}
function actions(parent=main){return h('div',{className:'cloud-actions',parent});}
function form(parent,submit){
  const f=h('form',{className:'cloud-form',parent});
  f.addEventListener('submit',async e=>{
    e.preventDefault();if(state.busy)return;
    state.busy=true;for(const b of f.querySelectorAll('button'))b.disabled=true;
    try{await submit(new FormData(f),e.submitter);}
    catch(e){message(explain(e),true);}
    finally{state.busy=false;for(const b of f.querySelectorAll('button'))b.disabled=false;}
  });return f;
}
function field(f,label,name,{type='text',value='',required=true,max=120}={}){
  const l=h('label',{className:'field-l',parent:f});h('span',{text:label,parent:l});
  const e=h('input',{attrs:{name,type,value,maxlength:max},parent:l});
  e.required=required;return e;
}
function selectField(f,label,name,options){
  const l=h('label',{className:'field-l',parent:f});h('span',{text:label,parent:l});
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
  if(code==='invalid-play'||code==='invalid-request')return 'Select a supported E5 play or Team Manager play-library JSON. Review the selected play before saving; no change was confirmed.';
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
  if(state.context?.kind==='team'){
    const c=state.context;
    originalWorkingContext(h,main,{team:teamDisplayName(c),club:c.club,
      meta:c.roles.map(r=>ROLE_NAMES[r]||r).join(' / ')+' · '+c.season,
      onHome:()=>switchTab('home')});
    if(subtitle&&subtitle!==contextLabel(c))h('p',{className:'cloud-eyebrow',text:subtitle,parent:main});
  }else h('p',{className:'cloud-eyebrow',text:subtitle,parent:main});
  h('h2',{className:'cloud-page-title',text:name,parent:main});
  if(state.context?.kind==='team'&&['schedule','team'].includes(state.tab)){
    const sub=h('nav',{className:'chips cloud-mobile-subnav',attrs:{'aria-label':state.tab==='team'?'Team pages':'Schedule pages'},parent:main});
    for(const [key,label] of subviews()[state.tab]||[]){
      const btn=h('button',{className:'chip',text:label,attrs:{type:'button','aria-pressed':String(key===state.sub)},parent:sub});
      btn.addEventListener('click',()=>switchTab(state.tab,key));
    }
  }
}
function contextLabel(c){
  if(c.kind==='platform')return 'Platform Owner · platform administration';
  const roleNames=c.roles.map(role=>ROLE_NAMES[role]||role);
  return roleNames.join(' / ')+' · '+teamContextLabel(c);
}
function chip(parent,label,pressed,handler,clubRef=null){
  const b=button(label,handler,parent);
  b.className=parent===clubs?'scope-club':'scope-team';
  b.setAttribute('aria-label',label);b.setAttribute('aria-pressed',pressed?'true':'false');
  b.replaceChildren();
  if(parent===clubs){h('span',{className:'crest all',attrs:{'aria-hidden':'true'},parent:b});if(clubRef!==null)b.dataset.clubRef=clubRef;paintClubChip(b,state.clubBrands.get(clubRef),initials(label));}
  else {const art=h('span',{attrs:{'aria-hidden':'true'},parent:b});art.innerHTML=navArt('team');}
  h('span',{className:'scope-name',text:label,parent:b});
  return b;
}
function drawContextChips(){
  clubs.replaceChildren();teams.replaceChildren();
  const active=state.context;
  if(state.isPlatformOwner)chip(clubs,'Platform',isOwner(),()=>selectContext('platform'));
  for(const club of clubsForNavigation(state.contexts)){
    chip(clubs,club,state.activeClub===club,()=>{
      const matches=state.contexts.filter(c=>c.kind==='team'&&c.club===club);
      if(matches.length===1){selectContext(matches[0].key);return;}
      if(!mayLeaveE5())return;
      // Clubs with more than one authorised team require exact team selection.
      // Clear previous team's private records before revealing team chips.
      state.epoch++;state.brandingGeneration++;state.brandingEditing=false;state.context=null;state.activeClub=club;state.branding=null;applySavedBranding();
      state.schedule=[];state.roster=[];state.members=[];state.duties=[];state.notices=[];
      state.drafts=[];state.published=[];state.playerTeam=null;state.preview=null;state.competitions=null;
      $('cloud-team-title').textContent=club;
      setConnectedCrest($('cloud-crest'),state.clubLogos.get(club)||'',initials(club));
      $('cloud-notices-shortcut').hidden=true;$('cloud-settings-shortcut').hidden=true;
      $('active-context').textContent='Choose a team · '+club;
      $('cloud-nav').hidden=true;$('cloud-desktop-nav').hidden=true;
      clear();title('Choose an authorised team',club);
      info('Select a team chip to open only the functions approved for that team.');
      drawContextChips();void refreshNavigationBranding();
    },club);
  }
  const selectedClub=state.activeClub;
  if(selectedClub)for(const team of state.contexts.filter(c=>c.kind==='team'&&c.club===selectedClub))
    chip(teams,teamContextLabel(team)+' · '+team.season,
      active?.key===team.key,()=>selectContext(team.key));
}
function selectContext(key){
  const next=state.contexts.find(c=>c.key===key);
  if(!next||!mayLeaveE5())return;
  state.epoch++;state.brandingGeneration++;state.brandingEditing=false;notice.hidden=true;state.context=next;state.branding=null;
  state.activeClub=next.kind==='team'?next.club:null;
  state.schedule=[];state.roster=[];state.members=[];state.duties=[];state.notices=[];state.drafts=[];
  state.published=[];state.playerTeam=null;state.preview=null;state.competitions=null;
  $('cloud-team-title').textContent=next.kind==='team'?teamDisplayName(next):'Team Manager';
  applySavedBranding();
  $('active-context').textContent=contextLabel(next);
  $('cloud-notices-shortcut').hidden=!canReadNotices();
  $('cloud-settings-shortcut').hidden=!(MANAGEMENT_PARITY&&canManage());
  $('cloud-nav').hidden=false;$('cloud-desktop-nav').hidden=false;
  state.tab='home';state.sub='';drawContextChips();drawTabs();void showTab();
}
function applySavedBranding(){
  const ctx=state.context,v=ctx?.kind==='team'?state.branding:null;
  const club=ctx?.kind==='team'?ctx.club:!ctx?state.activeClub:null;
  const saved=club?state.clubBrands.get(club):null;
  applyConnectedStyle(v?.teamStyle??null,v?v.clubStyle:saved?.style??null);
  setConnectedCrest($('cloud-crest'),v?v.logo:saved?.logo||'',initials(club||'Team Manager'));
}
function validBranding(ctx,v){
  return !!v&&v.clubRef===ctx.club&&validConnectedLogo(v.logo)&&validConnectedStyle(v.clubStyle)&&validConnectedStyle(v.teamStyle)&&
    Number.isSafeInteger(v.clubVersion)&&v.clubVersion>=0&&Number.isSafeInteger(v.teamVersion)&&v.teamVersion>=0&&
    typeof v.canEditTeam==='boolean'&&typeof v.canEditClub==='boolean';
}
function storeClubBranding(brand){
  if(!validClubBranding(brand))return;
  state.clubBrands.set(brand.clubRef,brand);state.clubLogos.set(brand.clubRef,brand.logo);
  for(const item of clubs.querySelectorAll('button[data-club-ref]')){
    if(item.dataset.clubRef===brand.clubRef)paintClubChip(item,brand,initials(brand.clubRef));
  }
}
function forgetClubBranding(club){
  state.clubBrands.delete(club);state.clubLogos.delete(club);
  for(const item of clubs.querySelectorAll('button[data-club-ref]'))if(item.dataset.clubRef===club)paintClubChip(item,null,initials(club));
}
function applyBrandingValue(ctx,v){
  state.branding=v;storeClubBranding({clubRef:ctx.club,style:v.clubStyle,logo:v.logo,version:v.clubVersion,locked:v.locked===true});applySavedBranding();
}
async function refreshNavigationBranding(){
  if(state.brandingEditing||!state.user||!MANAGEMENT_PARITY)return;
  const generation=++state.brandingGeneration,user=state.user,selected=state.context;
  const current=()=>state.user===user&&generation===state.brandingGeneration&&state.context===selected&&!state.brandingEditing;
  // Platform reads only a club branding projection, never Coach team data.
  if(selected?.kind==='platform'){
    try{
      const result=await ownerCall('branding.catalogue');
      if(!current()||!Array.isArray(result.clubs)||!result.clubs.every(validClubBranding))return;
      const available=new Set(result.clubs.map(x=>x.clubRef));
      for(const club of state.clubBrands.keys())if(!available.has(club))forgetClubBranding(club);
      for(const brand of result.clubs)storeClubBranding(brand);
    }catch{if(current())for(const club of state.clubBrands.keys())forgetClubBranding(club);}
    return;
  }
  // One exact eligible team grant per visible club, preferring the selected team.
  const byClub=new Map();
  for(const ctx of state.contexts)if(ctx.kind==='team'&&!byClub.has(ctx.club))byClub.set(ctx.club,ctx);
  if(selected?.kind==='team')byClub.set(selected.club,selected);
  await Promise.all([...byClub.values()].map(async ctx=>{
    try{
      const v=await management.call(ctx,'branding.read');
      if(!current())return;
      if(!validBranding(ctx,v))throw Error('invalid-branding');
      if(selected===ctx)applyBrandingValue(ctx,v);
      else {storeClubBranding({clubRef:ctx.club,style:v.clubStyle,logo:v.logo,version:v.clubVersion,locked:v.locked===true});
        if(!selected&&state.activeClub===ctx.club)applySavedBranding();}
    }catch{
      if(current()){forgetClubBranding(ctx.club);
        if(selected===ctx){state.branding=null;applySavedBranding();}
        else if(!selected&&state.activeClub===ctx.club)applySavedBranding();}
    }
  }));
}
async function openBranding(){
  if(!canManage()||state.context?.kind!=='team')return;
  const ctx=state.context,epoch=++state.epoch;state.brandingEditing=true;state.brandingGeneration++;
  const current=()=>state.context===ctx&&state.epoch===epoch;
  clear();title('Club and team branding',contextLabel(ctx));
  const loading=info('Loading the authorised club and team branding…');
  try{
    const v=await management.call(ctx,'branding.read');
    if(!current())return;
    if(!validBranding(ctx,v))throw Object.assign(new Error(),{code:'service-unavailable'});
    loading.remove();applyBrandingValue(ctx,v);
    renderConnectedBranding({parent:main,ctx,value:v,ui:{h,card,info,button,actions,form,field,message},
      isCurrent:current,restore:applySavedBranding,onBack:()=>{state.brandingEditing=false;void managementExperience.open('Settings');void refreshNavigationBranding();},
      preview:(teamStyle,clubStyle,logo)=>{
        if(!current())return;applyConnectedStyle(teamStyle,clubStyle);
        setConnectedCrest($('cloud-crest'),logo,initials(ctx.club));
      },save:async(action,input)=>{
        if(!current())throw Object.assign(new Error(),{code:'scope-denied'});
        await management.call(ctx,action,input);
        if(!current())return;
        message('Branding saved for the authorised scope.');await openBranding();
      }});
  }catch(e){if(current()){loading.textContent=explain(e);message(explain(e),true);}}
}
function subviews(){
  const children={schedule:[['upcoming','Upcoming'],['training','Training'],['matches','Matches']],team:[]};
  if(MANAGEMENT_PARITY&&canManage()){
    children.schedule.push(['competitions','Tournaments']);
    children.team.push(['squad','Squad'],['tasks','Tasks'],['helpers','Helpers'],
      ['match-support','Match staff'],['invitations','Invitations']);
  }else if(MANAGEMENT_PARITY&&hasRole('team_player'))children.team.push(['squad','Squad']);
  else if(hasRole('team_volunteer')&&!canManage())children.team.push(['squad','My duties']);
  return children;
}
function drawTabs(){
  const allowed=visibleSections(state.context,{playsDeferred:playsDeferred()});
  const labels={home:'Home',schedule:'Schedule',team:'Team',tactics:'Tactics',more:'More'};
  const children=subviews();
  $('cloud-nav').style.gridTemplateColumns='repeat('+Math.max(1,allowed.length)+',minmax(0,1fr))';
  for(const id of ['cloud-nav','cloud-desktop-nav']){
    const nav=$(id);
    const active=nav.contains(document.activeElement)?document.activeElement:null;
    const activeTab=active?.dataset.tab,activeSub=active?.dataset.sub||'';
    nav.replaceChildren();
    for(const tab of allowed){
      const group=h('div',{className:'nav-group'+(tab===state.tab?' on':''),parent:nav});
      const btn=h('button',{className:'nav-main',attrs:{type:'button','data-tab':tab,
        'aria-current':state.tab===tab&&(id==='cloud-nav'||!state.sub)?'page':'false'},parent:group});
      btn.innerHTML=navArt(tab);h('span',{text:labels[tab],parent:btn});
      if(id==='cloud-desktop-nav'&&children[tab]?.length){
        const sub=h('div',{className:'nav-sub',parent:group});
        for(const [key,label] of children[tab])
          h('button',{text:label,attrs:{type:'button','data-tab':tab,'data-sub':key,
            'aria-current':tab===state.tab&&key===state.sub?'page':'false'},parent:sub});
      }
    }
    if(activeTab)Array.from(nav.querySelectorAll('button')).find(btn=>btn.dataset.tab===activeTab&&(btn.dataset.sub||'')===activeSub)?.focus({preventScroll:true});
  }
}
async function action(name,resource,payload={}){
  // Selecting a team never grants permissions. Resolve one eligible role for
  // this operation only, and require the trusted backend to recheck that grant.
  const role=roleForAction(state.context,name);
  if(!role)throw Object.assign(new Error('no-eligible-team-grant'),{code:'scope-denied'});
  return ops.operation({...state.context,role},name,resource,payload);
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
  if(!c||isOwner())return;
  const need=async(actionName,key)=>{
    if(epoch!==state.epoch||state.context!==c)return;
    const records=await action(actionName,c.teamId);
    if(state.epoch===epoch)state[key]=records;
  };
  if(tab==='home'){
    if(roleForAction(c,'schedule.read'))await need('schedule.read','schedule');
    if(canRoster())await need('roster.read','roster');
    if(epoch!==state.epoch||state.context!==c)return;
    if(MANAGEMENT_PARITY&&(canManage()||hasRole('team_player'))){
      try{
        const result=await management.call(c,canManage()?'competitions.read':'player.team.read');
        if(epoch===state.epoch)state.competitions=canManage()?result:result.competitions;
      }catch{if(epoch===state.epoch)state.competitions=null;}
    }
    if(roleForAction(c,'duty.read'))await need('duty.read','duties');
    if(canViewTactics()&&!roleForAction(c,'schedule.read'))
      await need('play.published.read','published');
  }else if(tab==='schedule'&&roleForAction(c,'schedule.read')){
    await need('schedule.read','schedule');
  }else if(tab==='team'){
    if(canRoster()){
      await need('roster.read','roster');
      if(epoch!==state.epoch||state.context!==c)return;
      if(MANAGEMENT_PARITY){
        const members=await management.call(c,'team.members');
        if(state.epoch===epoch)state.members=members;
      }
    }
    if(roleForAction(c,'duty.read'))await need('duty.read','duties');
    if(MANAGEMENT_PARITY&&hasRole('team_player')){
      const snapshot=await management.call(c,'player.team.read');
      if(state.epoch===epoch)state.playerTeam=snapshot;
    }
    if(hasRole('team_manager','team_coach'))await need('schedule.read','schedule');
  }else if(tab==='tactics'){
    if(canViewTactics())await need('play.published.read','published');
    if(canDraft())await need('play.draft.read','drafts');
  }
}
async function showTab(){
  const epoch=++state.epoch;state.brandingEditing=false;clear();
  void refreshNavigationBranding();
  if(!state.context){title('No authorised team','Account access');info('An approved team or platform role is required.');return;}
  title(({upcoming:'Upcoming',training:'Training',matches:'Matches',squad:'Squad',invitations:'Invitations'})[state.sub]||
    ({home:'Home',schedule:'Schedule',team:'Team',tactics:'Tactics',more:'More'})[state.tab],
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
    await renderOwnerDashboard(epoch);
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
// Platform administration is part of the signed-in workspace, not a different
// profile. Only the trusted Owner endpoint can issue/review/revoke invitations.
async function ownerCall(action,details={}){
  const bearer=await auth.verifiedBearer();
  let response;
  try{response=await fetch('/api/stage3d4/v1/owner',{
    method:'POST',mode:'same-origin',credentials:'omit',cache:'no-store',
    redirect:'error',headers:{Authorization:'Bearer '+bearer,
      'Content-Type':'application/json'},
    body:JSON.stringify({action,...details})
  });}catch{throw Object.assign(new Error('service-unavailable'),{code:'service-unavailable'});}
  let result;try{result=await response.json();}catch{throw Error('invalid-owner-response');}
  if(!response.ok||result?.ok!==true)
    throw Object.assign(new Error('owner-action-denied'),{code:result?.code||'scope-denied'});
  return result;
}
async function openOwnerBranding(selectedClub=null,editing=false){
  if(!isOwner())return;
  const epoch=++state.epoch;state.brandingEditing=true;state.brandingGeneration++;
  const current=()=>isOwner()&&state.epoch===epoch;
  clear();title('Club branding management','Platform administration');
  button('Back to Platform',()=>{state.brandingEditing=false;void showTab();},actions(main));
  const loading=info('Loading saved club branding…');loading.setAttribute('role','status');
  try{
    const result=await ownerCall('branding.catalogue');
    if(!current())return;
    if(!Array.isArray(result.clubs)||!result.clubs.every(validClubBranding))throw Error('invalid-branding');
    loading.remove();
    for(const brand of result.clubs)storeClubBranding(brand);
    if(!result.clubs.length){info('No active clubs to moderate.');return;}
    const selected=result.clubs.find(x=>x.clubRef===selectedClub)||result.clubs[0];
    const list=card('Clubs');list.setAttribute('aria-label','Select club to manage branding');
    const choices=actions(list);
    for(const brand of result.clubs){
      const choice=button(brand.clubRef,()=>void openOwnerBranding(brand.clubRef),choices);
      choice.setAttribute('aria-pressed',String(brand.clubRef===selected.clubRef));
    }
    const panel=card(selected.clubRef);panel.setAttribute('aria-label','Moderation for '+selected.clubRef);
    panel.dataset.brandingVersion=String(selected.version);
    const crest=h('span',{className:'crest big all',parent:panel});setConnectedCrest(crest,selected.logo,initials(selected.clubRef));
    info(selected.locked?'Branding locked by Platform administration.':'Branding changes are available to authorised delegates.',panel);
    const reason=selectField(panel,'Moderation reason','brandingReason',[
      ['owner-correction','Owner correction'],['inappropriate-image','Inappropriate image'],['incorrect-branding','Incorrect branding'],['policy-review','Policy review'],['resolved','Resolved']]);
    let pending=false;
    const mutate=async(action,details={})=>{
      if(!current()||pending)return;
      pending=true;
      try{await ownerCall(action,{clubRef:selected.clubRef,expectedVersion:selected.version,reason:reason.value,...details});
        if(current()){message('Branding moderation saved.');await openOwnerBranding(selected.clubRef);}
      }catch(e){if(current())message(explain(e),true);}
      finally{pending=false;}
    };
    const controls=actions(panel);
    button('Replace club logo or colours',()=>void openOwnerBranding(selected.clubRef,true),controls);
    button('Remove inappropriate logo and lock',()=>{if(confirm('Remove this club logo and lock further delegated branding changes?'))void mutate('branding.moderation.remove',{reason:'inappropriate-image'});},controls);
    button(selected.locked?'Unlock branding changes':'Lock branding changes',()=>{if(confirm('Confirm the branding moderation change?'))void mutate(selected.locked?'branding.moderation.unlock':'branding.moderation.lock');},controls);
    button('Revoke club branding delegations',()=>{if(confirm('Revoke existing branding-only delegations for this club?'))void mutate('branding.moderation.revoke');},controls);
    if(editing){
      renderConnectedBranding({parent:panel,ctx:{club:selected.clubRef,season:''},value:{logo:selected.logo,clubStyle:selected.style,clubVersion:selected.version,canEditClub:true,canEditTeam:false,locked:selected.locked},clubOnly:true,
        ui:{h,card,info,button,actions,form,field,message},isCurrent:current,
        preview:(_team,_style,logo)=>{setConnectedCrest(crest,logo,initials(selected.clubRef));},
        restore:()=>setConnectedCrest(crest,selected.logo,initials(selected.clubRef)),onBack:()=>void openOwnerBranding(selected.clubRef),
        save:async(_action,input)=>{await mutate('branding.moderation.save',input);}
      });
    }
    const audit=card('Branding audit history');
    button('View branding audit history',async()=>{
      try{const data=await ownerCall('branding.history',{clubRef:selected.clubRef});
        if(!current())return;
        const events=card('Latest branding events',audit);
        info('Showing up to 100 latest recorded changes.',events);
        if(!data.events.length)info('No branding events recorded.',events);
        for(const row of data.events)info(row.at+' · '+row.action+' · '+row.reason+' · Actor '+(row.actor||'system'),events);
      }catch(e){if(current())message(explain(e),true);}
    },actions(audit));
  }catch(e){if(current()){loading.remove();message(explain(e),true);}}
}
function ownerInvitationStatus(delivery){
  if(delivery==='sent')return 'Provider reported invitation sent. Team access still requires claim, review, policy acknowledgement and activation.';
  if(delivery==='existing-account')return 'Existing account invited. Ask the recipient to sign in and claim.';
  if(delivery==='failed')return 'Email delivery failed. No recipient invitation was confirmed; check the provider before retrying.';
  return 'Saved; refresh to verify the next invitation action.';
}
async function ownerMutation(action,details={}){
  const result=await ownerCall(action,details);
  message(action==='invite.issue'||action==='invite.approve'?
    ownerInvitationStatus(result.delivery):'Owner action saved and recorded.');
  void showTab();
}
function ownerInvitationRow(item,parent){
  const row=h('div',{className:'cloud-owner-invite-item',parent});
  h('strong',{text:item.email+' · '+(ROLE_NAMES[item.role]||item.role),parent:row});
  info('Status: '+item.status+' · Email: '+(item.delivery||'not sent'),row);
  const controls=actions(row);
  const confirmAndRun=(label,action)=>{
    button(label,()=>{
      if(!confirm(label+' for this exact team and adult?'))return;
      void ownerMutation(action,{invitationId:item.invitationId})
        .catch(e=>message(explain(e),true));
    },controls);
  };
  if(item.status==='proposed')
    confirmAndRun('Approve and send','invite.approve');
  if(item.status==='approved'||item.status==='claimed'){
    button('Record verified adult review',()=>{
      const evidenceRef=prompt('Private, independently verified adult evidence reference (evidence-ref/...)');
      if(!evidenceRef)return;
      if(!/^evidence-ref\/[A-Za-z0-9._/-]{12,100}$/.test(evidenceRef)){
        message('A valid private verification evidence reference is required.',true);return;
      }
      void ownerMutation('invite.review-adult',{invitationId:item.invitationId,
        evidenceRef}).catch(e=>message(explain(e),true));
    },controls);
    confirmAndRun('Cancel invitation','invite.cancel');
  }
  if(item.status==='claimed')confirmAndRun('Activate verified role','invite.activate');
  if(item.status==='activated')confirmAndRun('Revoke role','invite.revoke');
}
async function renderOwnerDashboard(epoch){
  if(state.tab==='more'){renderMore();return;}
  const loading=info('Checking your Platform Owner administration…');
  let data;
  try{data=await ownerCall('status');}
  catch(e){
    if(epoch!==state.epoch)return;
    loading.textContent='Owner administration could not be verified. No changes were made.';
    message(explain(e),true);return;
  }
  if(epoch!==state.epoch)return;
  loading.remove();
  const summary=h('div',{className:'cloud-owner-overview',parent:main});
  const account=card('Platform account',summary);
  h('strong',{text:state.user?.email||'Verified account',parent:account});
  info('Your platform administration is separate from your team permissions.',account);
  const team=card('First approved team',summary);
  if(data.team){
    h('strong',{text:data.team.clubRef,parent:team});
    info(data.team.teamId+' · '+data.team.seasonRef+' · '+data.team.sportRef,team);
    info(data.coachAssigned?'Your Coach grant is active and team-scoped.':
      'Your Coach grant is awaiting assignment.',team);
  }else info('No first team recorded.',team);
  const invites=card('Adult invitations',summary);
  h('strong',{text:String(data.invitations?.length||0),parent:invites});
  info('Approved team invitations; none grants access before activation.',invites);
  if(!data.policyReady){
    const gate=card('Registration requirements');
    info('You must acknowledge the current approved Terms and Privacy Notice before inviting people.',gate);
    h('a',{className:'cloud-btn',text:'Review registration documents',
      attrs:{href:'cloud-registration.html'},parent:gate});
    return;
  }
  if(!data.team){
    const setup=card('Initial team setup');
    info('Only the restricted first-team setup flow can create the initial team.',setup);
    h('a',{className:'cloud-btn',text:'Open first-team setup',
      attrs:{href:'cloud-owner.html'},parent:setup});
    return;
  }
  const grid=h('div',{className:'cloud-owner-actions',parent:main});
  const brand=card('First club branding authority',grid);
  info('A separate, revocable branding-only delegation. It does not grant membership, roster or general Club Administrator access.',brand);
  const brandStatus=info('Check the current branding permission.',brand);
  const brandActions=actions(brand);
  const refreshAuthority=async()=>{
    if(epoch!==state.epoch||!isOwner())return;
    brandActions.replaceChildren();brandStatus.textContent='Checking branding authority…';
    try{
      const status=await ownerCall('branding.status');
      if(epoch!==state.epoch||!isOwner())return;
      brandStatus.textContent=status.clubRef+' · '+(status.brandingAuthorised?'Branding authorised':'No branding delegation');
      button(status.brandingAuthorised?'Revoke my club branding permission':'Authorise my first-club branding permission',async()=>{
        if(epoch!==state.epoch||!isOwner())return;
        if(!window.confirm((status.brandingAuthorised?'Revoke':'Explicitly authorise')+' branding-only permission for '+status.clubRef+'? No additional team or private-data access is granted.'))return;
        try{await ownerCall(status.brandingAuthorised?'branding.revoke':'branding.authorise');await refreshAuthority();}
        catch(e){if(epoch===state.epoch)message(explain(e),true);}
      },brandActions);
    }catch(e){if(epoch===state.epoch){brandStatus.textContent=explain(e);button('Check branding permission',()=>void refreshAuthority(),brandActions);}}
  };
  button('Check branding permission',()=>void refreshAuthority(),brandActions);
  const moderation=card('Club branding management',grid);
  info('Review saved club logos and colours, or moderate inappropriate branding. This does not grant team access.',moderation);
  button('Manage club branding',()=>void openOwnerBranding(),actions(moderation));
  if(CLOUD_STAGE4_TACTICS_ENABLED){
    const templates=card('Play template library',grid);
    info('Owner-authored reusable plays. Collection of Free Account plays is disabled until licence and account eligibility are verified.',templates);
    button('Manage play templates',()=>void openOwnerTemplates(),actions(templates));
  }
  const invite=card('Invite an adult',grid);
  info('Invite a Manager, Coach, Assistant Coach, adult Player or Volunteer to the existing team. Invitation is not an active team role.',invite);
  const f=form(invite,async d=>{
    if(!confirm('Send this invitation to an approved adult for '+data.team.clubRef+'?'))return;
    const result=await ownerCall('invite.issue',{
      email:String(d.get('email')||'').trim(),
      role:String(d.get('role')||'')
    });
    message(ownerInvitationStatus(result.delivery));
    void showTab();
  });
  field(f,'Recipient email','email',{type:'email',max:254});
  selectField(f,'Team role','role',[
    ['team_manager','Manager'],['team_coach','Coach'],
    ['team_assistant','Assistant Coach'],['team_player','Adult Player'],
    ['team_volunteer','Volunteer']
  ]);
  h('button',{className:'cloud-btn primary',text:'Approve and send invitation',
    attrs:{type:'submit'},parent:f});
  const active=card('Pending and active invitations',grid);
  if(!data.invitations?.length)info('No invitations yet. Invite your first adult Team Manager.',active);
  else for(const item of data.invitations)ownerInvitationRow(item,active);
  const help=card('Administration and team access');
  info('Use the club and team chips above to switch to the Coach functions for an approved team. Platform Owner never receives automatic access to private team records.',help);
  h('a',{className:'cloud-btn',text:'View detailed first-team administration',
    attrs:{href:'cloud-owner.html'},parent:actions(help)});
}

async function openOwnerTemplates(){
  if(!isOwner()||!CLOUD_STAGE4_TACTICS_ENABLED)return;
  const epoch=++state.epoch,current=()=>isOwner()&&state.epoch===epoch;
  clear();title('Play template library','Platform Owner');
  button('Back to Platform',()=>void showTab(),actions());
  const starters=card('Original starter library');
  void renderStarterLibrary(starters,{scope:{current},owner:true}).catch(()=>{if(current())info('Starter library unavailable.',starters);});
  const panel=card('Owner-authored templates');
  info('Only upload your own original, privacy-reviewed tactics. No team, member, paid account or private draft collection is enabled. Export a reusable copy and import it as a team draft from its Coach context.',panel);
  const loading=info('Loading templates…',panel);
  try{
    const result=await ownerCall('template.list');
    if(!current())return;loading.remove();
    if(!result.templates.length)info('No owner-authored templates yet.',panel);
    else readList(panel,result.templates,(t,row)=>{
      h('strong',{text:t.name,parent:row});
      h('small',{text:(t.sport||'Sport not specified')+' · '+t.state+' · '+t.origin+' · version '+t.version,parent:row});
      if(t.state!=='active')return;
      button('Watch template',async()=>{
        try{const data=await ownerCall('template.read',{templateId:t.templateId});
          if(current()&&data.version===t.version)await openOwnerPlay(data.play,current);
          else if(current())message('Template changed. Review the latest version.',true);
        }catch(e){if(current())message(explain(e),true);}
      },actions(row));
      button('Download play JSON',async()=>{
        try{
          if(!current())return;
          const data=await ownerCall('template.read',{templateId:t.templateId});
          if(!current()||data.version!==t.version)throw Object.assign(new Error(),{code:'stale-version'});
          const url=URL.createObjectURL(new Blob([JSON.stringify(data.play,null,2)],{type:'application/json'}));
          const a=document.createElement('a');a.href=url;a.download=t.templateId+'.json';document.body.append(a);a.click();a.remove();
          setTimeout(()=>URL.revokeObjectURL(url),1000);
        }catch(e){if(current())message(explain(e),true);}
      },actions(row));
      button('Archive template',async()=>{
        if(!current()||!confirm('Archive this template? Existing exported copies are unchanged.'))return;
        try{await ownerCall('template.archive',{templateId:t.templateId,expectedVersion:t.version});if(current())void openOwnerTemplates();}
        catch(e){if(current())message(explain(e),true);}
      },actions(row));
    });
  }catch(e){if(current())loading.textContent=explain(e);return;}
  let generation=0;
  async function saveTemplate(play){
    if(!current()||!attestation.checked||!confirm('Save '+play.name+' as an owner-authored private template?'))return;
    await ownerCall('template.create',{templateId:'template-'+crypto.randomUUID().replaceAll('-',''),ownerAuthored:true,play});
    if(current())void openOwnerTemplates();
  }
  const f=form(panel,async d=>{
    const selected=++generation;selection.replaceChildren();
    const file=d.get('templateFile');
    if(!(file instanceof File)||file.size>2000000||!file.size||d.get('ownerAuthored')!=='yes')throw Object.assign(new Error(),{code:'invalid-play'});
    const {inspectPlayImport}=await import('./cloud-play-import.js');
    let value;try{value=JSON.parse(await file.text());}catch{throw Object.assign(new Error(),{code:'invalid-play'});}
    const result=inspectPlayImport(value);
    if(!current()||selected!==generation)return;
    if(!result.ok)throw Object.assign(new Error(),{code:'invalid-play'});
    if(value.format!=='team-manager-library'&&result.rows.length===1){await saveTemplate(result.rows[0].play);return;}
    info(result.rows.length+' eligible plays · '+result.omitted.length+' held for review',selection);
    for(const omitted of result.omitted)info((omitted.id||'Unidentified record')+' · '+omitted.reason,selection);
    readList(selection,result.rows,(entry,row)=>{
      h('strong',{text:entry.name,parent:row});
      button('Save selected owner template',async()=>{
        if(!current()||generation!==selected||state.busy)return;
        if(!attestation.checked){message('Confirm authorship and rights before saving.',true);return;}
        state.busy=true;
        try{await saveTemplate(entry.play);}catch(e){if(current())message(explain(e),true);}
        finally{state.busy=false;}
      },actions(row));
    });
  });
  const l=h('label',{text:'Owner-authored E5 play or library JSON file',parent:f});
  const fileInput=h('input',{attrs:{type:'file',name:'templateFile',accept:'application/json,.json',required:'true'},parent:l});
  const consent=h('label',{parent:f});
  const attestation=h('input',{attrs:{type:'checkbox',name:'ownerAuthored',value:'yes',required:'true'},parent:consent});
  consent.append(document.createTextNode(' I authored the selected play, have the necessary rights, and checked all content for personal or confidential information.'));
  h('button',{className:'cloud-btn primary',text:'Save owner template',attrs:{type:'submit'},parent:f});
  const selection=h('div',{parent:panel});
  fileInput.addEventListener('change',()=>{generation++;selection.replaceChildren();attestation.checked=false;});
}
function renderHome(){
  const c=state.context;
  const [left,right]=originalColumns(h,main,'home-cols cloud-home-cols');
  const now=Date.now();
  const upcoming=state.schedule.filter(item=>item.status==='planned'&&
    Number.isFinite(Date.parse(item.startsAt))&&Date.parse(item.startsAt)>=now)
    .slice().sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt));
  const next=upcoming[0],pending=state.roster.filter(p=>p.status==='pending');
  const volunteerPending=state.duties.filter(d=>d.status==='assigned');
  const nextReply=hasRole('team_player')&&upcoming.find(x=>!x.myAvailability);
  const focus=h('section',{className:'focus '+(next?'lvl-2':'calm'),parent:left});
  const kicker=h('p',{className:'spot-k',parent:focus});
  h('span',{className:'lvl-pill',text:next?'Next up':'Team overview',parent:kicker});
  h('h2',{text:next?(next.title||'Upcoming session'):'Nothing coming up',parent:focus});
  h('p',{className:'spot-what',text:next?[when(next.startsAt),next.locationLabel].filter(Boolean).join(' · '):
    'Training, matches and team activities will appear here when recorded.',parent:focus});
  const controls=h('div',{className:'btn-row',parent:focus});
  if(roleForAction(c,'schedule.read'))button(canEditSchedule()?'Manage training':
    hasRole('team_player')?'Reply to training':'View schedule',
    ()=>switchTab('schedule'),controls,{primary:true});
  if(canRoster())button('Open squad',()=>switchTab('team','squad'),controls);
  if(roleForAction(c,'duty.read'))button('View your duties',()=>switchTab('team'),controls);
  if(MANAGEMENT_PARITY&&(canManage()||hasRole('team_player'))){
    if(!Array.isArray(state.competitions))info('Competition entries could not be loaded.',left);
    else{
      const current=state.competitions.filter(x=>x.status!=='withdrawn');
      for(const entry of current.slice(0,3))originalCompetitionCard(h,left,entry,{
        onOpen:()=>canManage()?void managementExperience.open('Competitions'):switchTab('team')});
      if(!current.length)info('No current team competition entries.',left);
      const other=state.competitions.length-current.slice(0,3).length;
      if(other)info(other+' other or withdrawn entries are available in the team competition view.',left);
    }
  }
  if(roleForAction(c,'schedule.read')){
    const {section,heading}=originalSection(h,left,'Coming up','home-up');
    button('Full schedule',()=>switchTab('schedule'),heading);
    const list=h('div',{className:'list',parent:section});
    if(!upcoming.length)info('No upcoming activities recorded.',list);
    for(const item of upcoming.slice(0,5)){
      const row=h('button',{className:'tl-row',attrs:{type:'button'},parent:list});
      row.addEventListener('click',()=>switchTab('schedule',item.kind==='match'?'matches':item.kind==='training'?'training':'upcoming'));
      const whenBox=h('span',{className:'tl-when',parent:row});
      h('b',{text:new Date(item.startsAt).toLocaleDateString('en-AU',{day:'numeric',month:'short'}),parent:whenBox});
      h('span',{text:new Date(item.startsAt).toLocaleTimeString('en-AU',{hour:'numeric',minute:'2-digit'}),parent:whenBox});
      const desc=h('span',{className:'grow',parent:row});
      h('strong',{text:item.title||item.kind,parent:desc});
      h('span',{className:'tagline cloud-block',text:item.locationLabel||'Venue TBC',parent:desc});
      if(hasRole('team_player'))h('span',{className:'cloud-block sub',text:'My availability: '+(item.myAvailability||'Not answered'),parent:desc});
    }
    if(upcoming.length>5)info('And '+(upcoming.length-5)+' more.',section);
  }
  const {section:out}=originalSection(h,right,'Outstanding actions','home-act');
  const items=[];
  if(canRoster()&&!state.roster.length)items.push(['Start with your squad','No team placements recorded',()=>switchTab('team')]);
  if(canRoster()&&pending.length)items.push(['Review squad nominations',pending.length+' pending',()=>switchTab('team','squad')]);
  if(canEditSchedule()&&!upcoming.length)items.push(['Schedule training','No upcoming activity',()=>switchTab('schedule','training')]);
  if(canManage()&&next)items.push(['Review availability',next.title||'Upcoming session',()=>switchTab('schedule')]);
  if(nextReply)items.push(['Reply to availability',nextReply.title||'Upcoming activity',()=>switchTab('schedule')]);
  if(volunteerPending.length)items.push(['Confirm your volunteer duties',volunteerPending.length+' awaiting response',()=>switchTab('team')]);
  if(items.length){
    const list=h('div',{className:'list',parent:out});
    for(const [label,description,go] of items){
      const btn=h('button',{className:'pick act-row lvl-3',attrs:{type:'button'},parent:list});
      btn.addEventListener('click',go);
      h('span',{className:'u-dot l3',attrs:{'aria-hidden':'true'},parent:btn});
      const copy=h('span',{className:'grow',parent:btn});
      h('span',{className:'name cloud-block',text:label,parent:copy});
      h('span',{className:'tagline',text:description,parent:copy});
      h('span',{className:'chev',text:'›',attrs:{'aria-hidden':'true'},parent:btn});
    }
  }else info('Nothing else requiring attention in the records available to this view.',out);
  if(canReadNotices())renderNotices('home',right);
}
// HTML datetime-local is a device-local wall time, not UTC.
function localDateTimeValue(value){
  const d=new Date(value);
  if(!Number.isFinite(d.valueOf()))return '';
  const pad=n=>String(n).padStart(2,'0');
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+
    pad(d.getHours())+':'+pad(d.getMinutes());
}
function renderSchedule(){
  if(!roleForAction(state.context,'schedule.read')){
    info('Your current role does not include the team schedule.');return;
  }
  const sub=state.sub;
  const list=card(sub==='training'?'Training sessions':sub==='matches'?'Matches':'Sessions');
  const filtered=state.schedule.filter(s=>sub==='training'?s.kind==='training':
    sub==='matches'?s.kind==='match':sub==='upcoming'?s.status==='planned'&&Date.parse(s.startsAt)>=Date.now():true);
  if(sub&&filtered.length!==state.schedule.length)info((state.schedule.length-filtered.length)+' other schedule records are outside this view.',list);
  readList(list,filtered,(s,row)=>{
    row.classList.add('cloud-session-row');
    const head=h('div',{className:'cloud-session-head',parent:row});
    originalDateBadge(h,head,s.startsAt);
    const details=h('div',{className:'grow',parent:head});
    h('strong',{className:'name cloud-block',text:s.title||s.kind||'Session',parent:details});
    h('small',{text:when(s.startsAt)+(s.locationLabel?' · '+s.locationLabel:'')+' · '+s.status,parent:details});
    if(CLOUD_STAGE4_TACTICS_ENABLED&&['training','match'].includes(s.kind)&&canViewTactics())
      button('Assigned plays',()=>void openSessionPlays(s),actions(row));
    if(MANAGEMENT_PARITY&&s.kind==='match'&&matchDayAccess(state.context).view)
      button('Match Day',()=>void openMatchDay(s.sessionId),actions(row));
    if(hasRole('team_player')){
      if(MANAGEMENT_PARITY&&s.kind==='match')
        button('Selected match squad',()=>void openMatchSquad(s,true),actions(row));
      h('p',{text:'My response: '+(s.myAvailability||'Not answered'),parent:row});
      if(s.status!=='planned'){info('Availability replies are closed for this session.',row);return;}
      const a=actions(row);
      for(const reply of ['yes','no','maybe'])
        button(reply[0].toUpperCase()+reply.slice(1),async()=>{
          try{await mutation('availability.reply',s.sessionId,s.myAvailabilityVersion??0,{response:reply});
            message('Your response was saved.');await showTab();}
          catch(e){message(explain(e),true);}},a,{primary:s.myAvailability===reply});
    }else if(canManage()){
      const a=actions(row);
      if(MANAGEMENT_PARITY&&s.kind==='match'){
        button('Match availability',()=>void openAttendance(s),a);
        button('Selected match squad',()=>void openMatchSquad(s,false),a);
      }
      if(s.kind==='training'){
        button('Attendance and responses',()=>void openAttendance(s),a);
        if(s.status==='planned'){
          button('Edit',()=>editTraining(s),a);
          button('Cancel',async()=>{if(!confirm('Cancel this training session?'))return;
            try{await mutation('schedule.edit',s.sessionId,s.version,{command:{op:'cancel'}});
              message('Training cancelled.');await showTab();}
            catch(e){message(explain(e),true);}},a);
        }
      }else if((['team-friendly','team-activity'].includes(s.managementOrigin)||
          (!MANAGEMENT_PARITY&&s.sessionId.startsWith('event-')))&&s.status==='planned'){
        button('Reschedule team event',()=>editTeamEvent(s),a);
        button('Cancel team event',async()=>{
          if(!confirm('Cancel this team-managed event?'))return;
          try{await mutation('event.change',s.sessionId,s.version,{command:{op:'cancel'}});
            message('Team event cancelled.');await showTab();}
          catch(e){message(explain(e),true);}
        },a);
      }else if(s.kind==='match'){
        info('Fixture scheduling is read-only here; confirm official details with the competition authority.',row);
      }
    }
  });
  if(canEditSchedule()&&sub!=='matches'){
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
  if(canManage()&&sub!=='training'){
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
  field(f,'New start','startsAt',{type:'datetime-local',value:localDateTimeValue(s.startsAt)});
  field(f,'Location','locationLabel',{value:s.locationLabel||'',required:false,max:120});
  h('button',{className:'cloud-btn primary',text:'Save team event',
    attrs:{type:'submit'},parent:f});
  button('Back to schedule',()=>void showTab(),c);
}
async function openAttendance(s){
  const ctx=state.context,epoch=++state.epoch;
  const training=s.kind==='training';
  clear();title(training?'Attendance and availability':'Match availability',s.title||'Team session');
  const loading=info('Loading this team register…');
  try{
    const [attendance,replies,members,rights]=await Promise.all([
      training?action('attendance.read',s.sessionId):Promise.resolve([]),
      action('availability.board',s.sessionId),
      MANAGEMENT_PARITY?management.call(ctx,'team.members'):Promise.resolve([]),
      MANAGEMENT_PARITY?management.call(ctx,'admin.status'):Promise.resolve({canAdmin:hasRole('team_manager')})]);
    if(epoch!==state.epoch||ctx!==state.context)return;
    const roll=namedTrainingRegister({context:ctx,rows:attendance,members});
    const availability=namedTrainingRegister({context:ctx,rows:replies,members});
    loading.remove();
    if(training){
    const registers=card('Training roll call');
    info('Coach and Manager record attendance for active team players only. This does not certify registration or eligibility.',registers);
    info(roll.shown+' of '+roll.eligible+' active player records shown; '+roll.unnamed+' without a verified display name.',registers);
    readList(registers,roll.rows,(p,row)=>{
      h('strong',{text:p.displayName,parent:row});
      h('small',{text:'Attendance: '+(p.status||'Not marked'),parent:row});
      if(s.status==='cancelled')return;
      const f=form(row,async d=>{
        if(ctx!==state.context||epoch!==state.epoch)throw Error('scope-denied');
        if(!d.get('status'))throw Object.assign(new Error(),{code:'invalid-input'});
        await mutation('attendance.record',s.sessionId,p.version,
          {command:{personId:p.personId,status:String(d.get('status'))}});
        if(ctx!==state.context||epoch!==state.epoch)return;
        message('Attendance recorded.');await openAttendance(s);
      });
      selectField(f,'Attendance','status',[
        ['','Choose attendance'],['present','Present'],['absent','Absent'],['late','Late'],['excused','Excused']])
        .value=p.status||'';
      h('button',{className:'cloud-btn',text:'Save attendance',
        attrs:{type:'submit'},parent:f});
    });
    }
    const board=card('Availability responses');
    info('Manager, or Coach while no verified Manager is appointed, can record reported replies with their stated source. Players can still update their own response.',board);
    info(availability.shown+' of '+availability.eligible+' active player records shown; '+availability.unnamed+' without a verified display name.',board);
    readList(board,availability.rows,(p,row)=>{
      h('strong',{text:p.displayName,parent:row});
      h('small',{text:'Reply: '+(p.response||'Not answered')+
        ' · source: '+(p.source||'none'),parent:row});
      if(rights.canAdmin!==true||s.status!=='planned')return;
      const f=form(row,async d=>{
        if(ctx!==state.context||epoch!==state.epoch)throw Error('scope-denied');
        if(!d.get('response')||!d.get('source'))throw Object.assign(new Error(),{code:'invalid-input'});
        await mutation('availability.transcribe',s.sessionId,p.version,{command:{
          personId:p.personId,response:String(d.get('response')),
          source:String(d.get('source'))}});
        if(ctx!==state.context||epoch!==state.epoch)return;
        message('External availability response recorded with provenance.');
        await openAttendance(s);
      });
      selectField(f,'Reported reply','response',[
        ['','Choose reply'],['yes','Yes'],['no','No'],['maybe','Maybe']]).value=p.response||'';
      selectField(f,'Received by','source',[
        ['','Choose source'],['phone','Phone'],['in_person','In person'],['email','Email']]);
      h('button',{className:'cloud-btn',text:'Record reported reply',
        attrs:{type:'submit'},parent:f});
    });
    button('Back to schedule',()=>void switchTab('schedule'),actions());
  }catch(e){if(epoch!==state.epoch)return;loading.textContent=explain(e);message(explain(e),true);
    button('Back to schedule',()=>void switchTab('schedule'),actions());}
}
async function openSessionPlays(session){
  const ctx=state.context,epoch=++state.epoch;
  if(!CLOUD_STAGE4_TACTICS_ENABLED||!ctx||!canViewTactics())return;
  const current=()=>state.context===ctx&&state.epoch===epoch&&state.tab==='schedule';
  clear();title('Assigned plays',session.title||session.kind);
  button('Back to schedule',()=>void showTab(),actions());
  const loading=info('Loading the selected session and play revisions…');
  try{
    const data=await management.call(ctx,'play.assignment.read',{sessionId:session.sessionId});
    if(!current())return;
    if(!Array.isArray(data.rows)||!Number.isSafeInteger(data.sessionVersion))throw Error('invalid-assignment-response');
    const panel=card('Session play assignments'),coach=hasRole('team_coach'),canPropose=hasRole('team_coach','team_assistant');
    loading.remove();
    info('Assignments identify the exact published play and session revision. Changed fixtures or plays must be reviewed again.',panel);
    let pending=false;
    const mutate=async(action,r,revisionId=r.revisionId)=>{
      if(!current()||pending)return;
      pending=true;
      try{
        await management.call(ctx,action,{sessionId:session.sessionId,sessionVersion:data.sessionVersion,
          playId:r.playId,revisionId,expectedVersion:r.version});
        if(current()){message('Assignment saved.');await openSessionPlays(session);}
      }catch(e){if(current())message(e?.code==='stale-version'?'Session, play or assignment changed. Reopen to review the latest revision.':explain(e),true);}
      finally{pending=false;}
    };
    readList(panel,data.rows,(r,row)=>{
      h('strong',{text:r.name||'Play revision requires review',parent:row});
      info(({current:'Approved',withdrawn:'Withdrawn','session-cancelled':'Session cancelled','session-changed':'Session changed','revision-changed':'Published play changed','awaiting-coach':'Awaiting Head Coach approval'})[r.reason]||'Review required',row);
      const a=actions(row);
      if(coach&&r.reason==='awaiting-coach'&&data.sessionStatus==='planned')
        button('Approve assignment',()=>{if(confirm('Approve this exact play revision for this session?'))void mutate('play.assignment.approve',r);},a);
      if(coach&&r.state!=='withdrawn')
        button('Withdraw assignment',()=>{if(confirm('Withdraw this play assignment?'))void mutate('play.assignment.withdraw',r);},a);
      if(r.reason==='current')button('Watch and Learn',async()=>{
        if(!current()||pending)return;
        pending=true;
        try{
          // Refresh the published projection and assignment independently;
          // the exact selected revision must still be approved and current.
          const records=await action('play.published.read',ctx.teamId);
          if(!current())return;
          const fresh=await management.call(ctx,'play.assignment.read',{sessionId:session.sessionId});
          if(!current())return;
          const entry=resolveAssignedPlay(fresh,r,records);
          if(!entry){message('This assignment or published revision has changed or is unavailable. Reopen assigned plays to review the current selection.',true);return;}
          await openE5(entry,'view',{returnTo:()=>void openSessionPlays(session)});
        }catch(e){if(current())message(explain(e),true);}
        finally{pending=false;}
      },a,{primary:true});
    });
    if(!canPropose||data.sessionStatus!=='planned')return;
    const records=await action('play.published.read',ctx.teamId);
    if(!current())return;
    const choices=records.filter(p=>!p.unavailableReason&&!data.rows.some(r=>r.playId===p.playId&&
      r.revisionId===p.revisionId&&r.sessionVersion===data.sessionVersion&&['current','awaiting-coach'].includes(r.reason)));
    const propose=card('Propose a published play');
    if(!choices.length){info('No other current published play is available for proposal.',propose);return;}
    for(const p of choices){
      const row=h('div',{className:'cloud-list-item',parent:propose});h('strong',{text:p.play.name,parent:row});
      button('Propose assignment',()=>void mutate('play.assignment.propose',{playId:p.playId,
        revisionId:p.revisionId,version:data.rows.find(r=>r.playId===p.playId)?.version??0}),actions(row));
    }
  }catch(e){if(current()){loading.textContent=explain(e);message(explain(e),true);}}
}
async function openMatchDay(sessionId){
  const ctx=state.context,access=matchDayAccess(ctx),epoch=++state.epoch;
  if(!MANAGEMENT_PARITY||!access.view)return;
  const current=()=>state.context===ctx&&state.epoch===epoch;
  clear();title('Match Day','Match preparation');
  button('Back to schedule',()=>void switchTab('schedule','matches'),actions());
  const loading=info('Loading this match…');
  try{
    const sessions=await action('schedule.read',ctx.teamId);
    if(!current())return;
    const fixture=resolveMatchDayFixture(ctx,sessions,sessionId);
    const selection=access.review?await management.call(ctx,'match.selection.read',{sessionId}):
      access.player?await management.call(ctx,'player.match.selection.read',{sessionId}):null;
    if(!current())return;
    const review=access.review?matchDayReview(ctx,fixture,selection):null;
    const arrivalAction=access.proposedRecord?'matchday.arrivals':access.player?'player.matchday.arrivals':null;
    const arrivals=arrivalAction?await management.call(ctx,arrivalAction+'.read',{sessionId}):null;
    if(!current())return;
    const record=await management.call(ctx,access.proposedRecord?'matchday.read':'player.matchday.read',{sessionId});
    if(!current())return;
    if(arrivals&&(!Array.isArray(arrivals.rows)||arrivals.fixtureVersion!==fixture.version||
      typeof arrivals.canRecord!=='boolean'))throw Object.assign(new Error(),{code:'stale-version'});
    loading.remove();
    const details=card(fixture.title||'Match');
    info(when(fixture.startsAt)+(fixture.locationLabel?' · '+fixture.locationLabel:'')+' · '+fixture.status,details);
    info('Team schedule record. Confirm official fixture details with the competition authority.',details);
    if(review){
      const readiness=card('Match readiness');
      info(review.shown+' of '+review.eligible+' verified participant records shown; '+review.omitted+' unavailable for named selection.',readiness);
      info(review.selected+' selected · '+review.omittedSelected+' selected records no longer available.',readiness);
      info(review.current?'Current published squad.':'No current published squad. Review before publication.',readiness);
      for(const p of review.selectedRows)info(p.displayName+' · '+(p.response==='none'?'Not answered':p.response),readiness);
      info('Availability is not arrival or playing eligibility.',readiness);
      const a=actions(readiness);
      button('Match availability',()=>void openAttendance(fixture),a);
      button('Selected match squad',()=>void openMatchSquad(fixture,false),a);
      const rules=card('Competition rules');
      const request=matchDayRulesRequest(ctx);
      if(record.state==='blocked')info('Persistent lineup, scoring, interchange, clock and results are unavailable until the exact competition rules are verified and approved.',rules);
      if(request&&record.state==='blocked'){
        info('Proposed target: '+STATE_CUP_REFERENCE.competition+' · Mixed 20. Not linked or approved for this fixture.',rules);
        for(const item of STATE_CUP_REFERENCE.pending)info(item,rules);
        h('a',{text:'National rulebook reference',attrs:{href:STATE_CUP_REFERENCE.nationalSource,target:'_blank',rel:'noopener noreferrer'},parent:rules});
        const label=h('label',{className:'field-l',parent:rules});
        h('span',{text:'Organiser rules confirmation request (copy only)',parent:label});
        const requestText=h('textarea',{attrs:{readonly:'readonly',rows:'8'},parent:label});
        requestText.value=request.copyText;
        button('Copy rules confirmation checklist',async()=>{
          if(!current())return;
          try{await navigator.clipboard.writeText(request.copyText);if(current())message('Checklist copied; nothing sent.');}
          catch{if(current()){requestText.focus();requestText.select();message('Select and copy the checklist text.');}}
        },actions(rules));
      }else if(record.state==='blocked')info('No verified competition profile for this match.',rules);
      else info('Competition profile: '+record.rules?.edition,rules);
    }else if(access.player){
      const panel=card('Published match squad');
      if(selection?.state==='published'&&fixture.status!=='cancelled'&&Array.isArray(selection.players)&&selection.players.length){
        for(const p of selection.players)if(typeof p.displayName==='string'&&p.displayName.trim())info(p.displayName,panel);
      }else info('No current published squad for this match.',panel);
      info('My response: '+(fixture.myAvailability||'Not answered'),details);
    }else{
      info('Assistant Coach can record venue arrivals, not approve or publish match squads.',details);
    }
    if(arrivals){
      const panel=card('Venue arrivals');
      info('Venue presence only. Records apply to this fixture version, not registration or sporting eligibility.',panel);
      info(arrivals.canRecord?'Record on the match date.':'Read-only outside the scheduled match date or after cancellation.',panel);
      if(!arrivals.rows.length)info('No verified participant records available.',panel);
      for(const p of arrivals.rows){
        const row=h('div',{className:'cloud-list-item',parent:panel});
        h('strong',{text:arrivalAction.startsWith('player.')?'My arrival':p.displayName,parent:row});
        info(p.arrived===true?'Arrived':p.arrived===false?'Not arrived':'Not recorded',row);
        if(!arrivals.canRecord)continue;
        for(const arrived of [true,false])button(arrived?'Mark arrived':'Mark not arrived',async()=>{
          if(!current())return;
          try{
            await management.call(ctx,arrivalAction+'.record',{sessionId,fixtureVersion:fixture.version,
              expectedVersion:p.version,arrived,...(arrivalAction.startsWith('player.')?{}:{personId:p.personId})});
            if(current()){message('Venue arrival recorded.');await openMatchDay(sessionId);}
          }catch(e){if(current())message(explain(e),true);}
        },actions(row));
      }
    }
    renderMatchDayRecord({record,ctx,fixture,access,current,
      ui:{h,card,info,button,actions,form,field,selectField,message,explain},
      commit:async(name,input)=>{
        if(!current())return;
        try{
          await management.call(ctx,name,{sessionId,fixtureVersion:fixture.version,expectedVersion:record.version,ruleId:record.rules.id,...input});
          if(current()){message('Match Day record updated.');await openMatchDay(sessionId);}
        }catch(e){if(current())message(explain(e),true);}
      },refresh:()=>void openMatchDay(sessionId),onMessage:async(kind)=>{
        if(!current()||!access.review)return;
        try{
          const latest=await management.call(ctx,'matchday.read',{sessionId});
          if(!current())return;
          if(latest.version!==record.version||latest.fixtureVersion!==fixture.version)throw Object.assign(new Error(),{code:'stale-version'});
          const body=publishedMatchRecordText({kind,teamName:teamContextLabel(ctx),match:fixture,record:latest});
          if(!body||body.length>1500)throw Object.assign(new Error(),{code:'invalid-request'});
          await managementExperience.open('Messages',{kind,body,sessionId,version:latest.version,fixtureVersion:latest.fixtureVersion});
        }catch(e){if(current())message(explain(e),true);}
      }});

  }catch(e){if(current()){loading.textContent=explain(e);message(explain(e),true);}}
}
async function openMatchSquad(s,player){
  const ctx=state.context,epoch=++state.epoch;
  const current=()=>state.context===ctx&&state.epoch===epoch;
  clear();title('Selected match squad',s.title||'Match');
  button('Back to schedule',()=>void switchTab('schedule'),actions());
  const panel=card('Match squad');
  info('Selected participants only. This is not an on-field lineup, eligibility decision or approved scoring format.',panel);
  const loading=info('Loading the current selection…',panel);
  const read=()=>management.call(ctx,player?'player.match.selection.read':'match.selection.read',{sessionId:s.sessionId});
  try{
    const data=await read();
    if(!current())return;
    loading.remove();
    const names=player?data.players:data.publishedPlayers;
    if((player?data.state==='published':data.current)&&Array.isArray(names)&&names.length){
      const published=card('Published match squad');
      for(const p of names)h('p',{text:p.displayName,parent:published});
      if(!player)button('Prepare squad message',async()=>{
        try{
          if(!current())return;
          const latest=await read();
          if(!current())return;
          if(!latest.current||latest.version!==data.version||latest.fixtureVersion!==s.version)
            throw Object.assign(new Error(),{code:'stale-version'});
          const body=publishedMatchSquadText({teamName:teamContextLabel(ctx),match:s,players:latest.publishedPlayers});
          if(body.length>1500)throw Object.assign(new Error(),{code:'invalid-input'});
          await managementExperience.open('Messages',{body,sessionId:s.sessionId,
            version:latest.version,fixtureVersion:latest.fixtureVersion});
        }catch(e){if(current())message(explain(e),true);}
      },actions(published));
    }else info('No current published squad for this match.',panel);
    if(player)return;
    info('Selection status: '+data.state,panel);
    if(data.state==='published'&&!data.current)info('The match or squad has changed. Review and save a new draft before publishing again.',panel);
    info(data.shown+' of '+data.eligible+' verified participant records available for selection. '+(data.eligible-data.shown)+' do not have current verified Player access and a display name.',panel);
    if(!hasRole('team_coach')){
      info('The Head Coach selects and publishes the match squad. Managers can review the published squad and prepare communications.',panel);
      return;
    }
    const change=async(action,extra={})=>{
      if(!current())throw Object.assign(new Error(),{code:'scope-denied'});
      await management.call(ctx,action,{sessionId:s.sessionId,expectedVersion:data.version,fixtureVersion:data.fixtureVersion,...extra});
      if(!current())return;
      message('Match squad updated.');await openMatchSquad(s,false);
    };
    if(s.status==='planned'){
      const f=form(panel,async d=>change('match.selection.save',{personIds:d.getAll('personIds').map(String)}));
      info('Select the named participants. Review declined, unsure and unanswered availability before saving. Saving a draft removes the previous publication.',f);
      for(const p of data.candidates){
        const label=h('label',{className:'cloud-checkbox-row',parent:f});
        const cb=h('input',{attrs:{type:'checkbox',name:'personIds',value:p.personId},parent:label});
        cb.checked=data.selectedIds.includes(p.personId);
        h('span',{text:p.displayName+' · '+(p.response||'Not answered'),parent:label});
      }
      h('button',{className:'cloud-btn primary',text:'Save squad draft',attrs:{type:'submit'},parent:f});
      if(data.state==='draft'&&data.selectedIds.length)
        button('Publish match squad',async()=>{
          if(!confirm('Publish the saved match squad to this team’s verified Players? This is not an on-field lineup.'))return;
          try{await change('match.selection.publish');}catch(e){message(explain(e),true);}
        },actions(panel));
    }
    if(['draft','published'].includes(data.state))
      button('Withdraw match squad',async()=>{
        if(!confirm('Withdraw this match squad from the Player view?'))return;
        try{await change('match.selection.withdraw');}catch(e){message(explain(e),true);}
      },actions(panel));
    info('On-field formations and scorekeeping require the existing competition rule review and owner approval.',panel);
  }catch(e){if(current()){loading.textContent=explain(e);message(explain(e),true);}}
}
function editTraining(s){
  const ctx=state.context,epoch=++state.epoch;
  clear();title('Edit training','Schedule');
  const c=card(s.title||'Training');
  const initialStart=localDateTimeValue(s.startsAt);
  const f=form(c,async d=>{
    if(ctx!==state.context||epoch!==state.epoch)throw Error('scope-denied');
    const start=String(d.get('startsAt')),date=new Date(start);
    if(!Number.isFinite(date.valueOf())||localDateTimeValue(date)!==start)
      throw Object.assign(new Error(),{code:'invalid-input'});
    const command={op:'update',title:String(d.get('title')).trim(),
      locationLabel:String(d.get('locationLabel')).trim()};
    if(start!==initialStart)command.startsAt=date.toISOString();
    await mutation('schedule.edit',s.sessionId,s.version,{command});
    if(ctx!==state.context||epoch!==state.epoch)return;
    message('Training changes saved.');await showTab();
  });
  field(f,'Title','title',{value:s.title||''});
  field(f,'Start date and time','startsAt',{type:'datetime-local',value:initialStart});
  field(f,'Location','locationLabel',{value:s.locationLabel||'',required:false});
  h('button',{className:'cloud-btn primary',text:'Save changes',attrs:{type:'submit'},parent:f});
  button('Back to schedule',()=>void showTab(),c);
}
function renderTeam(){
  const c=state.context;
  if(MANAGEMENT_PARITY&&state.sub==='invitations'&&canRoster()){renderTeamInvitations(c);return;}
  if(canRoster()){
    const roster=card('Squad nominations');
    info('Nomination and placement do not verify registration, payment or competition eligibility.',roster);
    readList(roster,state.roster,(p,row)=>{
      const member=state.members.find(m=>m.personId===p.personId);
      originalRosterIdentity(h,row,member?.name||p.personId,
        p.status+' · version '+p.version);
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
  if(hasRole('team_manager')&&!MANAGEMENT_PARITY){
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
  if(hasRole('team_volunteer')&&!roleForAction(c,'schedule.read')){
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
  if(!canRoster()&&hasRole('team_player'))
    info('Private player records, contact details and volunteer assignments are not available to Players. Verified team display names appear below.',main);
  else if(!canRoster()&&hasRole('team_play_viewer'))
    info('Private squad and volunteer information is not available to this role.');
  if(hasRole('team_manager')&&!MANAGEMENT_PARITY)renderDutyBoard(c);
  if(MANAGEMENT_PARITY&&hasRole('team_coach','team_manager')&&state.sub!=='squad'){
    const duties=card('Volunteer assignments');
    info('Coach covers team administration until a verified Team Manager is appointed. Current permission is rechecked before each action.',duties);
    button('Manage volunteer duties',()=>void managementExperience.open('Volunteer tally'),
      actions(duties),{primary:true});
  }
  if(MANAGEMENT_PARITY&&hasRole('team_player'))renderPlayerTeamSnapshot();
    if(hasRole('team_coach','team_manager')&&state.sub!=='squad')renderTeamInvitations(c);
}
function renderPlayerTeamSnapshot(){
  const snapshot=state.playerTeam;
  if(!snapshot){
    info('Your verified squad and tournament details are not available. Refresh your permissions and team data.');return;
  }
  const squad=card('Our team');
  info('Only independently verified adult participant display names are shown. Other private player details are never included.',squad);
  if(!snapshot.roster?.length)info('No approved player display names are available.',squad);
  for(const item of snapshot.roster||[]){
    const row=h('div',{className:'cloud-list-item',parent:squad});
    originalRosterIdentity(h,row,item.displayName);
  }
  if(snapshot.rosterOmittedUnverified)
    info(snapshot.rosterOmittedUnverified+' active squad member(s) are not displayed because their name is not independently verified.',squad);
  const comps=card('Tournaments and competitions');
  info('Team-recorded competition entries and fixtures. Official competition draws require confirmation from the organiser.',comps);
  if(!snapshot.competitions?.length)info('No competition entries have been published for this team.',comps);
  for(const item of snapshot.competitions||[]){
    const row=h('div',{className:'cloud-list-item',parent:comps});
    h('strong',{text:item.name,parent:row});
    info([item.format,item.division,item.status,item.venue].filter(Boolean).join(' · '),row);
    for(const fixture of (snapshot.fixtures||[]).filter(f=>f.competitionId===item.competitionId)){
      const event=h('div',{className:'cloud-list-item',parent:row});
      h('strong',{text:fixture.title||'Team-recorded fixture',parent:event});
      info(when(fixture.startsAt)+(fixture.locationLabel?' · '+fixture.locationLabel:''),event);
      info('Team recorded, not an official draw',event);
    }
  }
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
function openNoticeboard(archived=false){
  if(!canReadNotices())return;
  state.epoch++;clear();
  title('Noticeboard',contextLabel(state.context));
  button('Back to More',()=>switchTab('more'),actions());
  renderNotices('noticeboard',main,archived===true&&canManage());
}
function renderNotices(place='more',parent=main,archived=false){
  if(!canReadNotices())return;
  const ctx=state.context,epoch=state.epoch;
  const current=()=>ctx===state.context&&epoch===state.epoch;
  const c=card(place==='home'?'Latest team notices':'Team notices',parent);
  if(place==='noticeboard'&&canManage()){
    const tabs=actions(c);
    button(archived?'Current notices':'Archived notices',()=>openNoticeboard(!archived),tabs);
  }
  if(place!=='home'&&canManage()&&!archived){
    const f=form(c,async d=>{
      if(!current())throw Object.assign(new Error('scope-denied'),{code:'scope-denied'});
      const body=String(d.get('body')).trim();
      if(connectedMessageNeedsReview(body,ctx.teamId)){
        message('Review the notice: remove incomplete or fictional template text.',true);return;
      }
      await mutation('notice.create',ctx.teamId,0,{command:{
        title:String(d.get('title')).trim(),body,
        audience:String(d.get('audience'))}});
      if(!current())return;
      message('Notice saved as a draft. Review it before publishing.');
      if(place==='noticeboard')openNoticeboard();
      else await showTab();
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
  const content=h('div',{parent:c});
  const loading=info('Loading team notices…',content);
  const selectedRows=new Map();
  const bulkActions=h('div',{className:'cloud-actions',parent:c});
  const refresh=()=>place==='noticeboard'?openNoticeboard(archived):showTab();
  const manage=async(operation,input,done)=>{
    try{
      if(!current())throw Object.assign(new Error('scope-denied'),{code:'scope-denied'});
      await management.call(ctx,operation,input);
      if(!current())return;
      message(done);await refresh();
    }catch(e){if(current())message(explain(e),true);}
  };
  const remove=entries=>{
    if(!entries.length||!current())return;
    if(window.confirm('Remove '+entries.length+' notice'+(entries.length===1?'':'s')+' from normal team views? Already shared messages are not recalled.'))
      void manage('notice.remove',{entries},'Notice removed from team views.');
  };
  const drawBulk=()=>{
    bulkActions.replaceChildren();
    if(selectedRows.size)button('Remove selected notices ('+selectedRows.size+')',()=>remove([...selectedRows.values()]),bulkActions).classList.add('danger');
  };
  void (archived?management.call(ctx,'notice.archived'):action('notices.read',ctx.teamId)).then(items=>{
    if(!current())return;loading.remove();
    readList(content,place==='home'?items.filter(n=>n.status==='published').slice(0,3):items,
      (n,row)=>{
        h('strong',{text:n.title,parent:row});
        h('small',{text:n.audience+' · '+n.status,parent:row});
        const needsReview=connectedMessageNeedsReview(n.body,ctx.teamId);
        h('p',{text:needsReview&&!canManage()?'Notice needs correction by team staff.':n.body,parent:row});
        if(needsReview&&canManage())info('Review this existing notice: incomplete or fictional template. Archive it if incorrect.',row);
        if(place==='home'||!canManage())return;
        const entry={id:n.noticeId,expectedVersion:n.version};
        const label=h('label',{className:'check cloud-checkbox-row',parent:row});
        const check=h('input',{attrs:{type:'checkbox','aria-label':'Select notice'},parent:label});
        h('span',{text:'Select for bulk removal',parent:label});
        check.addEventListener('change',()=>{
          if(check.checked&&selectedRows.size>=20){check.checked=false;message('Select up to 20 entries at a time.',true);return;}
          if(check.checked)selectedRows.set(entry.id,entry);else selectedRows.delete(entry.id);
          drawBulk();
        });
        const a=actions(row);
        button('Remove notice',()=>remove([entry]),a).classList.add('danger');
        if(n.status==='archived')return;
        const edit=h('details',{className:'cloud-notice-correction',parent:row});
        h('summary',{text:n.status==='draft'?'Edit notice draft':'Correct published notice',parent:edit});
        const editor=form(edit,async d=>{
          const body=String(d.get('correctedBody')).trim();
          if(!body||connectedMessageNeedsReview(body,ctx.teamId)){message('Complete the notice details before saving.',true);return;}
          if(n.status==='published'&&!window.confirm('Publish the corrected notice and archive the previous version?'))return;
          await manage(n.status==='draft'?'notice.edit':'notice.correct',{
            noticeId:n.noticeId,expectedVersion:n.version,title:String(d.get('correctedTitle')).trim(),
            body,audience:String(d.get('correctedAudience'))
          },n.status==='draft'?'Notice draft updated.':'Corrected notice published; previous version archived.');
        });
        field(editor,'Corrected title','correctedTitle',{max:100,value:n.title});
        const editLabel=h('label',{text:'Corrected notice message',parent:editor});
        const editBody=h('textarea',{attrs:{name:'correctedBody',maxlength:1000,rows:4,required:true},parent:editLabel});editBody.value=n.body;
        const editAudience=selectField(editor,'Corrected audience','correctedAudience',[
          ['all','Everyone in this team'],['players','Players'],['volunteers','Volunteers'],['coaches','Coaching staff']]);editAudience.value=n.audience;
        h('button',{className:'btn primary',text:n.status==='draft'?'Save corrected draft':'Publish correction',attrs:{type:'submit'},parent:editor});
        const change=async(operation,command)=>{
          try{
            if(!current())throw Object.assign(new Error('scope-denied'),{code:'scope-denied'});
            await mutation(operation,n.noticeId,n.version,{command});
            if(!current())return;
            message(operation==='notice.publish'?'Notice published to its approved audience.':'Notice archived.');
            if(place==='noticeboard')openNoticeboard();
            else await showTab();}
          catch(e){message(explain(e),true);}
        };
        if(n.status==='draft'&&!needsReview)button('Publish notice',()=>void change('notice.publish',{op:'publish'}),a,{primary:true});
        button('Archive notice',()=>void change('notice.archive',{op:'archive'}),a);
      });
    if(place==='home')button('View notices',openNoticeboard,actions(c));
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
function playScope(tab='tactics'){
  return capturePlayScope({context:state.context,epoch:state.epoch,tab,current:()=>state,
    operation:(ctx,name,resource,payload)=>ops.operation(ctx,name,resource,payload),mutationId:newMutationId});
}
// Use the original native playSVG thumbnail, not a second diagram renderer.
// The transient, lazy frames get only their already-authorised revision.
async function nativePlayThumbnail(row,entry,scope,presentation=null){
  if(!CLOUD_STAGE4_TACTICS_ENABLED||entry.unavailableReason)return;
  const slot=h('div',{className:'cloud-native-thumbnail',parent:row});
  slot.setAttribute('aria-label','Play diagram preview');
  const ctx=state.context,sport=presentation?.sport||({'oztag':'Oztag','rugby league':'Rugby league','rugby-league':'Rugby league','league tag':'League tag','league-tag':'League tag'})[String(ctx?.sport).toLowerCase()];
  const {validConnectedE5Play}=await import('./cloud-e5-payload.js');
  if(!scope.current()||!slot.isConnected)return;
  if(!sport||!validConnectedE5Play(entry.play)){info('Diagram needs compatibility review.',slot);return;}
  const frame=document.createElement('iframe'),nonce=crypto.randomUUID();
  frame.title='Diagram: '+entry.play.name;frame.loading='lazy';frame.tabIndex=-1;
  frame.setAttribute('referrerpolicy','no-referrer');
  const style={},computed=getComputedStyle(document.documentElement);
  for(const key of ['--pitch','--ink','--accent','--dark','--brand','--primary']){
    const value=computed.getPropertyValue(key).trim();if(/^#[0-9a-f]{6}$/i.test(value))style[key]=value;
  }
  frame.addEventListener('load',()=>{
    if(scope.current()&&frame.isConnected)frame.contentWindow?.postMessage({
      channel:'tm-connected-e5-v1',type:'init',nonce,mode:'thumbnail',play:entry.play,
      sport,teamLabel:presentation?.teamLabel||teamDisplayName(ctx),style
    },location.origin);
  },{once:true});
  frame.src='cloud-e5-workspace.html'+new URL(import.meta.url).search;
  slot.append(frame);
}
function tacticsLibrary(parent,records,render){
  const filters=h('div',{className:'cloud-form',parent});
  const q=field(filters,'Search plays','query',{type:'search',required:false});
  const categories=connectedPlayLibrary(records).categories;
  const category=selectField(filters,'Category','category',[['','All categories'],...categories.map(x=>[x,x])]);
  const summary=h('p',{className:'cloud-muted',attrs:{role:'status','aria-live':'polite'},parent});
  const results=h('div',{parent});
  const pager=actions(parent);let page=0,cardMode=CLOUD_STAGE4_TACTICS_ENABLED;
  if(CLOUD_STAGE4_TACTICS_ENABLED){
    const controls=actions(parent);
    const cards=button('Cards',()=>{cardMode=true;refresh();},controls);
    const list=button('List',()=>{cardMode=false;refresh();},controls);
    const sync=()=>{cards.setAttribute('aria-pressed',String(cardMode));list.setAttribute('aria-pressed',String(!cardMode));};
    controls.addEventListener('click',sync);sync();
  }
  function refresh(){
    const lib=connectedPlayLibrary(records,{query:q.value,filter:category.value});
    summary.textContent=lib.shown+' of '+lib.eligible+' revisions shown'
      +(lib.reasons.invalidRecord?' · '+lib.reasons.invalidRecord+' invalid records':'')
      +(lib.reasons.duplicateRevision?' · '+lib.reasons.duplicateRevision+' duplicate revisions':'')
      +(lib.reasons.filtered?' · '+lib.reasons.filtered+' filtered':'');
    results.replaceChildren();pager.replaceChildren();
    const size=CLOUD_STAGE4_TACTICS_ENABLED?12:Math.max(1,lib.rows.length);
    const pages=Math.max(1,Math.ceil(lib.rows.length/size));page=Math.min(page,pages-1);
    const visible=lib.rows.slice(page*size,(page+1)*size);
    if(pages>1){
      summary.textContent+=' · page '+(page+1)+' of '+pages;
      button('Previous page',()=>{page--;refresh();},pager,{disabled:page===0});
      button('Next page',()=>{page++;refresh();},pager,{disabled:page+1>=pages});
    }
    const list=readList(results,visible,render);
    if(CLOUD_STAGE4_TACTICS_ENABLED)list.classList.add('plays-grid','cloud-play-catalogue',cardMode?'view-cards':'view-list');
  }
  const reset=()=>{page=0;refresh();};
  q.addEventListener('input',reset);category.addEventListener('change',reset);refresh();
}
async function renderStarterLibrary(panel,{scope,owner=false,teamId=null}){
  const {starterPlays}=await import('./play-starters.js');
  const {validConnectedE5Play}=await import('./cloud-e5-payload.js');
  if(!scope.current()||!panel.isConnected)return;
  const source=starterPlays(),records=source.map(play=>({playId:play.id,revisionId:'starter-'+play.rev,version:play.rev,
    play:{...play,sport:'Oztag',set:'oztag'}}));
  info('Original Oztag starter collection. Copy an individual play to a team draft; the original and existing team plays are not overwritten.',panel);
  tacticsLibrary(panel,records,(entry,row)=>{
    const valid=validConnectedE5Play(entry.play);
    h('strong',{text:entry.play.name,parent:row});
    h('small',{text:entry.play.category+' · Original starter · revision '+entry.version,parent:row});
    if(!valid){info('Original play requires compatibility review; its source is unchanged.',row);return;}
    void nativePlayThumbnail(row,entry,scope,owner?{sport:'Oztag',teamLabel:'Starter library'}:null).catch(()=>{});
    if(entry.play.headline)info(entry.play.headline,row);
    const a=actions(row);
    button('Watch starter',()=>{if(scope.current())void (owner?openOwnerPlay(entry.play,scope.current):openE5(entry,'view'));},a);
    if(!owner)button('Copy to coach drafts',async()=>{
      if(!scope.current()||state.busy||!confirm('Create an independent draft of '+entry.play.name+'?'))return;
      state.busy=true;
      try{
        const play=structuredClone(entry.play);play.builtin=false;
        const saved=await scope.mutate('play.draft.edit',teamId,0,{command:{op:'create',play}});
        if(saved.stillCurrent){message('Starter copied to your coach drafts. Review before publishing.');await showTab();}
      }catch(e){if(scope.current())message(explain(e),true);}
      finally{state.busy=false;}
    },a,{primary:true});
  });
}
async function openOwnerPlay(play,current){
  if(!isOwner()||!current())return;
  const {mountConnectedE5}=await import('./cloud-e5-host.js');
  const {validConnectedE5Play}=await import('./cloud-e5-payload.js');
  if(!current()||!validConnectedE5Play(play))return;
  const epoch=++state.epoch,scope={current:()=>isOwner()&&state.epoch===epoch};
  clear();title(play.name,'Platform Owner · template review');
  const panel=card(null),sport=play.sport||'Oztag';
  try{e5Host=mountConnectedE5(panel,{mode:'view',play,sport,teamLabel:'Template library',scope,
    onClose:()=>{if(scope.current())void openOwnerTemplates();},onError:explain});}
  catch{info('The E5 workspace could not be opened. No data changed.',panel);button('Back',()=>void openOwnerTemplates(),actions(panel));}
}
function renderTactics(){
  const c=state.context;
  if(!canViewTactics()){info('No published-play permission is assigned to your selected role.');return;}
  const scope=playScope(),published=card('Published team plays');
  tacticsLibrary(published,state.published,(p,row)=>{
    void nativePlayThumbnail(row,p,scope).catch(()=>{});
    h('strong',{text:p.play.name,parent:row});
    h('small',{text:(p.play.category||'Other')+' · Published revision '+p.revisionId,parent:row});
    if(p.play.headline)info(p.play.headline,row);
    const a=actions(row);
    if(p.unavailableReason){info('This published revision needs compatibility review. The source has not changed.',row);return;}
    button('Watch and Learn',()=>{if(scope.current())void openE5(p,'view');},a,{primary:true});
    if(!CLOUD_STAGE4_TACTICS_ENABLED)button('View diagram and Learn / authored timing',()=>{if(scope.current())viewPlay(p);},a);
  });
  if(!canDraft())return;
  const drafts=card('Coach play drafts');
  info('Coach drafts are never shown to Players. Assistant Coaches may save drafts; only the Head Coach can publish.',drafts);
  button('New play',()=>{if(scope.current())void openE5(null,'edit');},actions(drafts),{primary:true});
  tacticsLibrary(drafts,state.drafts,(p,row)=>{
    void nativePlayThumbnail(row,p,scope).catch(()=>{});
    h('strong',{text:p.play.name,parent:row});
    h('small',{text:(p.play.category||'Other')+' · Revision '+p.revisionId+' · '+p.revisionStatus,parent:row});
    const a=actions(row);
    button('Watch and Learn',()=>{if(scope.current())void openE5(p,'view');},a);
    button('Edit play',()=>{if(scope.current())void openE5(p,'edit');},a);
    if(!CLOUD_STAGE4_TACTICS_ENABLED){
      button('Preview',()=>{if(scope.current())viewPlay(p);},a);
      button('Edit coaching instructions',()=>{if(scope.current())editPlayInstructions(p);},a);
    }
    if(hasRole('team_coach')&&p.revisionStatus==='draft')
      button('Publish reviewed revision',async()=>{
        if(!scope.current()||!confirm('Publish this reviewed E5 revision to the selected team?'))return;
        if(state.busy)return;
        state.busy=true;
        try{
          const saved=await scope.mutate('play.publish',p.playId,p.version,{revisionId:p.revisionId});
          if(saved.stillCurrent){message('Reviewed revision published.');await showTab();}
        }catch(e){if(scope.current())message(explain(e),true);}
        finally{state.busy=false;}
      },a,{primary:true});
  });
  if(CLOUD_STAGE4_TACTICS_ENABLED&&String(c.sport).toLowerCase()==='oztag'){
    const starters=card('Original starter plays');
    void renderStarterLibrary(starters,{scope,teamId:c.teamId}).catch(()=>{if(scope.current())info('Starter library unavailable.',starters);});
  }
  const importer=card('Bring an authored E5 play into this team');
  info('Import an E5 play JSON object or select one play from an original Team Manager library export. Geometry, phases and authored timing are preserved. No encrypted backup or personal information.',importer);
  let importGeneration=0;
  const f=form(importer,async d=>{
    const generation=++importGeneration;selection.replaceChildren();
    const file=d.get('playFile');
    if(!(file instanceof File)||file.size>(CLOUD_STAGE4_TACTICS_ENABLED?2000000:65536)||file.size===0)
      throw Object.assign(new Error(),{code:'invalid-play'});
    let p;try{p=JSON.parse(await file.text());}catch{
      throw Object.assign(new Error(),{code:'invalid-play'});}
    if(!CLOUD_STAGE4_TACTICS_ENABLED){
      if(!validE5Play(p))throw Object.assign(new Error(),{code:'invalid-play'});
      const saved=await scope.mutate('play.draft.edit',c.teamId,0,{command:{op:'create',play:p}});
      if(saved.stillCurrent){message('Play saved as a coach-only draft. Review before publishing.');await showTab();}
      return;
    }
    const {inspectPlayImport}=await import('./cloud-play-import.js');
    const result=inspectPlayImport(p);
    if(!scope.current()||generation!==importGeneration)return;
    if(!result.ok)throw Object.assign(new Error(),{code:'invalid-play'});
    selection.replaceChildren();
    info(result.rows.length+' eligible plays · '+result.omitted.length+' held for review',selection);
    for(const omitted of result.omitted)info((omitted.id||'Unidentified record')+' · '+omitted.reason,selection);
    readList(selection,result.rows,(row,item)=>{
      h('strong',{text:row.name,parent:item});
      button('Import selected play as draft',async()=>{
        if(!scope.current()||generation!==importGeneration||state.busy||!confirm('Create a coach-only copy of '+row.name+' in this team?'))return;
        state.busy=true;
        try{
          const saved=await scope.mutate('play.draft.edit',c.teamId,0,{command:{op:'create',play:row.play}});
          if(saved.stillCurrent){message('Play saved as a coach-only draft. Review before publishing.');await showTab();}
        }catch(e){if(scope.current())message(explain(e),true);}
        finally{state.busy=false;}
      },actions(item));
    });
  });
  const l=h('label',{text:'Authored E5 JSON file',parent:f});
  const input=h('input',{attrs:{type:'file',name:'playFile',accept:'application/json,.json',required:'true'},parent:l});
  input.addEventListener('change',()=>{++importGeneration;selection.replaceChildren();});
  h('button',{className:'cloud-btn primary',text:CLOUD_STAGE4_TACTICS_ENABLED?'Review import':'Import as draft',attrs:{type:'submit'},parent:f});
  const selection=h('div',{parent:importer});
}
async function openE5(entry,mode,{returnTo}={}){
  const originTab=returnTo?'schedule':'tactics';
  if(!canViewTactics()||(mode==='edit'&&!canDraft())||
     (returnTo&&(mode!=='view'||typeof returnTo!=='function')))return;
  const before=playScope(originTab);
  let mount,valid;
  try{
    // Remains absent from management-only builds until a reviewed Stage 4
    // asset-closure and server activation contract is accepted.
    ({mountConnectedE5:mount}=await import('./cloud-e5-host.js'));
    ({validConnectedE5Play:valid}=await import('./cloud-e5-payload.js'));
  }catch{if(before.current())message('E5 workspace is unavailable.',true);return;}
  if(!before.current())return;
  if(entry&&!valid(entry.play)){message('Unsupported E5 record. Existing source is unchanged.',true);return;}
  ++state.epoch;const scope=playScope(originTab),ctx=state.context;
  const back=returnTo||(()=>void showTab());
  clear();title(mode==='edit'?(entry?'Edit '+entry.play.name:'New play'):entry.play.name,'Tactics');
  const panel=card(null);
  const sport=({'oztag':'Oztag','rugby league':'Rugby league','rugby-league':'Rugby league','league tag':'League tag','league-tag':'League tag'})[String(ctx.sport).toLowerCase()];
  if(!sport){info('This sport has no reviewed connected E5 profile.',panel);button('Back',back,actions(panel));return;}
  const style={},computed=getComputedStyle(document.documentElement);
  for(const key of ['--pitch','--ink','--accent','--dark','--brand','--primary']){
    const value=computed.getPropertyValue(key).trim();if(/^#[0-9a-f]{6}$/i.test(value))style[key]=value;
  }
  const close=saved=>{if(!scope.current())return;if(saved)message('Coach draft saved. Publication remains separate.');back();};
  try{e5Host=mount(panel,{mode,play:entry?entry.play:null,sport,teamLabel:teamDisplayName(ctx),style,scope,
    onClose:close,onError:e=>{const reason=explain(e);message(reason,true);return reason;},
    onSave:play=>scope.mutate('play.draft.edit',entry?entry.playId:ctx.teamId,entry?entry.version:0,{command:{op:entry?'save':'create',play}})});
  }catch{info('The E5 workspace could not be opened. No data changed.',panel);button('Back',back,actions(panel));}
}
function editPlayInstructions(entry){
  ++state.epoch;const scope=playScope();
  clear();title('Edit play instructions','Coach draft');
  const panel=card(entry.play.name);
  info('This edits coaching text only. All E5 diagram geometry, paths, phases and timeline fields remain unchanged.',panel);
  const f=form(panel,async d=>{
    const play=JSON.parse(JSON.stringify(entry.play));
    play.name=String(d.get('name')).trim();
    play.headline=String(d.get('headline')).trim();
    play.steps=String(d.get('steps'));
    if(!validE5Play(play))throw Object.assign(new Error(),{code:'invalid-play'});
    const saved=await scope.mutate('play.draft.edit',entry.playId,entry.version,
      {command:{op:'save',play}});
    if(saved.stillCurrent){message('Coach draft saved; published revision remains unchanged.');await showTab();}
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
  ++state.epoch;clear();title(entry.play.name,'Tactics · authored E5 play');
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
    loading.textContent='Invitations could not be verified. Please refresh or contact the Platform Owner. No team permission has been granted.';
  });
}
function renderTeamMemberInvitations(team,panel){
  const epoch=state.epoch;
  info('Team membership is managed here. A Head Coach handles ordinary Player and Volunteer approvals while no Team Manager is appointed. Coach or Manager appointments still require Club Admin or Platform approval.',panel);
  const status=info('Checking your current team administration authority…',panel);
  void management.call(team,'admin.status').then(async rights=>{
    if(epoch!==state.epoch)return;
    status.remove();
    if(!rights.canAdmin){
      info('A verified Team Manager is appointed to this team. Membership approvals and volunteer duties now belong to that Team Manager; your Coach functions remain available.',panel);
      return;
    }
    const f=form(panel,async d=>{
      if(!confirm('Invite this verified adult to '+teamContextLabel(team)+'?'))return;
      const result=await management.call(team,'invite.issue',{
        email:String(d.get('email')||'').trim(),role:String(d.get('role')||'')
      });
      message(ownerInvitationStatus(result.delivery));await showTab();
    });
    field(f,'Adult invitee email','email',{type:'email',max:254});
    selectField(f,'Team access','role',[
      ['team_player','Adult Player'],['team_volunteer','Adult Volunteer']]);
    h('button',{className:'cloud-btn primary',text:'Invite to this team',
      attrs:{type:'submit'},parent:f});
    const records=await management.call(team,'invite.list');
    if(epoch!==state.epoch)return;
    const section=h('div',{className:'cloud-list',parent:panel});
    if(!records.length)info('No pending adult Player or Volunteer invitations.',section);
    for(const item of records){
      const row=h('section',{className:'cloud-list-item',parent:section});
      h('strong',{text:item.email+' · '+(ROLE_NAMES[item.role]||item.role),parent:row});
      info('Status: '+item.status+' · delivery: '+(item.delivery||'not sent'),row);
      const controls=actions(row);
      if(['approved','claimed'].includes(item.status)){
        button('Record verified adult review',()=>{
          const evidenceRef=prompt('Verified adult identity evidence reference (evidence-ref/...)');
          if(!evidenceRef||!/^evidence-ref\/[A-Za-z0-9._/-]{12,100}$/.test(evidenceRef)){
            message('A private identity-verification reference is required.',true);return;
          }
          void management.call(team,'invite.review-adult',{
            invitationId:item.invitationId,evidenceRef
          }).then(()=>{message('Adult identity review recorded.');void showTab();})
            .catch(e=>message(explain(e),true));
        },controls);
      }
      if(item.status==='claimed'){
        button('Activate verified team member',()=>{
          if(!confirm('Confirm this is the verified adult, accepted policy, correct team and appropriate Player/Volunteer role?'))return;
          void management.call(team,'invite.activate',{
            invitationId:item.invitationId
          }).then(()=>{message('Team member activated.');void showTab();})
            .catch(e=>message(explain(e),true));
        },controls,{primary:true});
      }
      if(['approved','claimed','activated'].includes(item.status)){
        button(item.status==='activated'?'Revoke team access':'Cancel invitation',()=>{
          if(!confirm('Withdraw only this invitation and its team-level role?'))return;
          void management.call(team,'invite.revoke',{
            invitationId:item.invitationId
          }).then(()=>{message('Team access or invitation revoked.');void showTab();})
            .catch(e=>message(explain(e),true));
        },controls);
      }
    }
    const a=actions(panel);
    if(state.isPlatformOwner)button('Appoint a Team Manager or Coach (Platform)',
      ()=>selectContext('platform'),a);
    else info('Team Manager or Coach appointments require an authorised Club Administrator or Platform Owner.',panel);
  }).catch(e=>{if(epoch!==state.epoch)return;status.textContent=explain(e);});
}
function renderTeamInvitations(team){
  const ctx=reviewerContext(team);
  if(!ctx)return;
  const panel=card('Team account invitations');
  if(MANAGEMENT_PARITY){
    renderTeamMemberInvitations(team,panel);
    return;
  }
  if(state.founderTeamId===ctx.teamId){
    info('Your initial Coach grant is for coaching this team, not administrator approval. To invite, review or revoke adult accounts, switch to your separate Platform Owner role and use restricted administration.',panel);
    if(state.isPlatformOwner)
      button('Open Platform administration',()=>selectContext('platform'),
        actions(panel),{primary:true});
    else h('a',{className:'cloud-btn',text:'Open Platform Owner invitations',
      attrs:{href:'cloud-owner.html'},parent:actions(panel)});
    return;
  }
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

const managementExperience=createCloudManagementExperience({
  api:management,getContext:()=>state.context,getEpoch:()=>state.epoch,
  beginView:(section)=>{
    state.epoch++;
    const target=({Competitions:['schedule','competitions'],Tasks:['team','tasks'],
      Helpers:['team','helpers'],'Match staff':['team','match-support']})[section]||['more',''];
    state.tab=target[0];state.sub=target[1];drawTabs();return state.epoch;
  },
  getSchedule:ctx=>{
    if(state.context?.key!==ctx?.key||state.epoch!==ctx.viewEpoch)throw Object.assign(new Error('scope-denied'),{code:'scope-denied'});
    return action('schedule.read',ctx.teamId);
  },getTeamLabel:ctx=>teamContextLabel(ctx),
  publishMessageNotice:async(ctx,{title,body,audience})=>{
    if(state.context?.key!==ctx?.key||state.epoch!==ctx.viewEpoch||connectedMessageNeedsReview(body,ctx.teamId))throw Object.assign(new Error('scope-denied'),{code:'scope-denied'});
    // The existing validated notice endpoint is team scoped and requires
    // independent Coach/Manager approval. No external messaging API is used.
    const created=await mutation('notice.create',ctx.teamId,0,{
      command:{title,body,audience}});
    if(state.context?.key!==ctx?.key||state.epoch!==ctx.viewEpoch)throw Object.assign(new Error('scope-denied'),{code:'scope-denied'});
    try{
      await mutation('notice.publish',created.resourceId,created.version,
        {command:{op:'publish'}});
      return {status:'published'};
    }catch(e){
      // Draft exists even if publish fails. Do not claim a full rollback.
      return {status:'draft-only',error:e?.code||'request-denied'};
    }
  },
  ui:{h,card,info,button,actions,form,field,selectField,title,clear,message,explain},
  onBack:()=>switchTab('more'),onReport:()=>openReports(),
  onNotices:openNoticeboard,onTeam:()=>switchTab('team'),onBranding:openBranding
});
function moreEntry(parent,name,description,handler,artwork){
  // Original Team Manager pick/more-item structure and original SVG artwork.
  // All SVG paths originate in the fixed shared icon catalogue, never user data.
  const item=button('',handler,parent);
  item.className='cloud-more-item pick more-item';
  const artworkSlot=h('span',{className:'more-ic cloud-more-icon',parent:item});
  artworkSlot.innerHTML=teamIconSvg(artwork,22);
  const content=h('span',{className:'grow cloud-more-content',parent:item});
  h('span',{className:'name',text:name,parent:content});
  h('span',{className:'tagline',text:description,parent:content});
  const arrow=h('span',{className:'cloud-more-arrow',parent:item});
  arrow.innerHTML=teamIconSvg('chevron-right',18);
  item.setAttribute('aria-label',name);
  return item;
}
function renderMyMatchDates(){
  const ctx=state.context;
  if(!roleForAction(ctx,'schedule.read'))return;
  const epoch=++state.epoch;
  clear();title('Team match dates',teamContextLabel(ctx)+' · '+ctx.season);
  button('All team tools',()=>switchTab('more'),actions());
  const content=card('Recorded match dates');
  info('These matches come from your approved team schedule. Local team records are not an official competition draw.',content);
  const loading=info('Loading your authorised matches…',content);
  void action('schedule.read',ctx.teamId).then(sessions=>{
    if(epoch!==state.epoch||state.context?.key!==ctx.key)return;
    const rows=teamRecordedMatchesFromSchedule({context:ctx,sessions});
    loading.remove();
    if(!rows.length)info('No match dates are recorded for this team yet.',content);
    else readList(content,rows,(m,row)=>{
      h('strong',{text:m.title,parent:row});
      h('small',{text:when(m.startsAt)+(m.locationLabel?' · '+m.locationLabel:'')+
        ' · '+m.status,parent:row});
      info(m.source==='team-recorded'?'Team-recorded date, not an official draw':
        'Check the competition authority for the official draw',row);
      button('Match Day',()=>void openMatchDay(m.sessionId),actions(row));
      button('Selected match squad',()=>void openMatchSquad(m,true),actions(row));
    });
  }).catch(e=>{
    if(epoch!==state.epoch||state.context?.key!==ctx.key)return;
    loading.textContent=explain(e);
  });
}
function renderMore(){
  if(canManage()&&MANAGEMENT_PARITY){
    const menu=card('Team management');
    menu.classList.add('cloud-more-list');
    const add=(name,description,artwork)=>moreEntry(menu,name,description,
      ()=>void managementExperience.open(name),artwork);
    add('Messages','WhatsApp messages and the message log','chat');
    moreEntry(menu,'Noticeboard','Post notices for players to see on Home',
      openNoticeboard,'clip');
    add('Volunteer tally','Who has helped, and how often','check');
    moreEntry(menu,'Reports','Attendance, results, volunteering and loose ends',
      ()=>void openReports(),'chart');
    add('Competitions','Leagues, tournaments and team entries','chart');
    add('Clubs and teams','Your authorised clubs and team settings','team');
    add('People','Verified player names and squad associations','team');
    add('Jerseys','Jersey numbers, issue and returns','team');
    add('Settings','Team, field, team contact and screen layout','cog');
  }else if(!isOwner()){
    const menu=card('Your team');
    menu.classList.add('cloud-more-list');
    if(hasRole('team_player')){
      info('Select your team to see the approved squad, competition entries and fixtures.',menu);
      moreEntry(menu,'Our team','Verified squad and tournament participation',
        ()=>switchTab('team'),'team');
      moreEntry(menu,'Match dates','Your recorded team matches; confirm official fixtures',
        renderMyMatchDates,'clock');
    }else info('Only the activities and notices approved for your team role are available.',menu);
    if(canReadNotices())moreEntry(menu,'Noticeboard',
      'Team notices published for your permitted audience',openNoticeboard,'clip');
  }
  if(canReadNotices()&&!MANAGEMENT_PARITY)renderNotices();
  // Preserve the accepted Stage 3B/3C synthetic management journey. The
  // richer Supabase views activate only in the approved first-team runtime.
  if(canManage()&&!MANAGEMENT_PARITY){
    const reports=card('Reports');
    info('Attendance, availability and duties for your selected team.',reports);
    button('Open team reports',()=>void openReports(),reports,{primary:true});
  }
  const account=card('My account');
  h('p',{text:state.user?.email||'Signed in',parent:account});
  info('All team permissions come from your independently approved server grants. Choosing another team never combines access.',account);
  renderProfilePanel();
  renderMyInvitations();
  const a=actions(account);
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
function switchTab(tab,sub=''){
  if(!mayLeaveE5())return;
  if(!visibleSections(state.context,{playsDeferred:playsDeferred()}).includes(tab))return;
  if(MANAGEMENT_PARITY&&canManage()){
    const destination=({competitions:'Competitions',tasks:'Tasks',helpers:'Helpers','match-support':'Match staff'})[sub];
    if(destination){notice.hidden=true;void managementExperience.open(destination);return;}
  }
  state.tab=tab;state.sub=sub;state.preview=null;notice.hidden=true;drawTabs();void showTab();
}
async function initialOwnerReadiness(){
  if(CLOUD_STAGE3D3_POLICY_REQUIRED!==true)return null;
  return verifiedOwnerSetup({identity:auth,fetchImpl:fetch.bind(window)});
}
function showOwnerRegistrationPending(current,founder){
  state.epoch++;state.user=current;state.context=null;state.contexts=[];
  state.founderTeamId=founder.team?.teamId||null;
  state.tab='home';
  $('context-controls').hidden=true;
  $('cloud-nav').hidden=true;
  $('cloud-desktop-nav').hidden=true;
  $('active-context').textContent='Registration pending';
  $('cloud-notices-shortcut').hidden=true;$('cloud-settings-shortcut').hidden=true;
  clear();
  title('Team access awaiting registration','Account permissions');
  info('Your Platform Owner grant is verified. A team role can be recorded without giving access to protected team data.');
  const roles=card('Recorded roles and first team');
  info('Platform Owner · verified platform administration',roles);
  if(founder.team){
    const team=founder.team;
    info(team.clubRef+' · '+team.teamId+' · '+team.sportRef+' · '+team.seasonRef,roles);
    info(founder.coachAssigned
      ? 'Coach grant recorded for this team. It cannot be used for team records until the current approved terms and privacy notice are acknowledged.'
      : 'First team created. Your initial Coach grant has not been assigned.',roles);
  }else info('No first team has been created.',roles);
  const a=actions(roles);
  h('a',{className:'cloud-btn',text:'Platform Owner setup',
    attrs:{href:'cloud-owner.html'},parent:a});
  h('a',{className:'cloud-btn',text:'Registration and privacy',
    attrs:{href:'cloud-registration.html'},parent:a});
  const next=card('Why access is restricted');
  info('No team roster, attendance, invitations or profile changes are available until the approved registration requirements are complete. Your existing role grants remain recorded.',next);
}
async function initialise(keep=false){
  const current=await auth.currentUser();
  if(!current){location.replace('cloud-access.html');return;}
  let grants;
  try{grants=await auth.myTeamContexts();}
  catch(e){
    const founder=await initialOwnerReadiness();
    if(founder){showOwnerRegistrationPending(current,founder);return;}
    throw e;
  }
  let owner=false;
  try{owner=await auth.myOperatorAccess();}
  catch{/* unavailable Owner RPC cannot create an Owner permission */}
  const choices=buildTeamNavigation(grants,owner);
  const previous=keep&&state.context?state.context.key:null;
  state.brandingGeneration++;state.brandingEditing=false;state.branding=null;state.clubBrands.clear();state.clubLogos.clear();
  state.user=current;state.contexts=choices;state.isPlatformOwner=owner;
  const founder=owner?await initialOwnerReadiness():null;
  state.founderTeamId=founder?.team?.teamId||null;
  $('context-controls').hidden=!choices.length;
  $('cloud-nav').hidden=!choices.length;
  $('cloud-desktop-nav').hidden=!choices.length;
  if(!choices.length){
    const fallback=await initialOwnerReadiness();
    if(fallback){showOwnerRegistrationPending(current,fallback);return;}
    state.epoch++;state.context=null;state.activeClub=null;clear();
    $('active-context').textContent='No currently available team';
    $('cloud-notices-shortcut').hidden=true;$('cloud-settings-shortcut').hidden=true;
    title('No currently available team','Account permissions');
    info('Your identity is verified, but no approved active team is assigned. Review registration or claim your approved invitation.');
    h('a',{className:'cloud-btn',text:'Registration and privacy',
      attrs:{href:'cloud-registration.html'},parent:main});
    renderMyInvitations();renderProfilePanel();return;
  }
  // A Platform Owner opens Platform. Everyone else lands directly in their
  // first approved team. There is no explicit role/profile selection step.
  const target=choices.find(c=>c.key===previous)?.key||
    (owner?'platform':choices.find(c=>c.kind==='team')?.key);
  selectContext(target);
}
for(const id of ['cloud-nav','cloud-desktop-nav']){
  $(id).addEventListener('click',e=>{
    const b=e.target.closest('button[data-tab]');
    if(b)switchTab(b.dataset.tab,b.dataset.sub||'');
  });
}
$('cloud-notices-shortcut').innerHTML=teamIconSvg('clip',24);
$('cloud-notices-shortcut').addEventListener('click',()=>{if(mayLeaveE5())openNoticeboard();});
$('cloud-settings-shortcut').innerHTML=teamIconSvg('cog',24);
$('cloud-settings-shortcut').addEventListener('click',()=>{if(mayLeaveE5()){e5Host?.destroy();e5Host=null;void managementExperience.open('Settings');}});
initialise().catch(e=>{
  clear();title('Unable to verify access','Account');info(explain(e));
  $('cloud-nav').hidden=true;
  $('cloud-desktop-nav').hidden=true;
  $('context-controls').hidden=true;
});

window.addEventListener('focus',()=>void refreshNavigationBranding());
