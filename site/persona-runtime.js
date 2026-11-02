// Development-only fictional persona runtime. Every view and action is scoped
// to the selected person's specific P12 role/membership, never a real account.
import {p12QaView,P12_QA_PROFILES} from './p12-qa-profiles.js';
import {P12_SAMPLE_CLUBS,P12_SAMPLE_TEAMS,makeP12SampleRoster} from './p12-qa-club-teams.js';

const NAV={
 personal_owner:['Home','Clubs','Teams','People','Seasons'],
 association_admin:['Home','Clubs','Teams','Seasons'],
 association_viewer:['Home','Clubs','Teams'],
 club_admin:['Home','Teams','People','Volunteers','Seasons'],
 club_support:['Home','Teams','Volunteers'],
 team_coach:['Home','Squad','Training','Matches','Plays','Seasons'],
 team_assistant:['Home','Squad','Training','Matches','Seasons'],
 team_manager:['Home','Squad','Fixtures','Availability','Match staff','Seasons'],
 fixture_scorekeeper:['Home','Fixtures'],
 player:['Home','My teams','Fixtures','Availability','Seasons'],
 guardian:['Home','My family','Fixtures','Availability'],
 helper:['Home','Volunteer duties','Fixtures'],
 staff:['Home','Volunteer duties','Fixtures'],
 none:['Home']
};
const LABEL={
 personal_owner:'Owner',association_admin:'Association administrator',association_viewer:'Association viewer',
 club_admin:'Club administrator',club_support:'Club support',
 team_coach:'Coach',team_assistant:'Assistant coach',team_manager:'Manager',
 fixture_scorekeeper:'Scorekeeper',player:'Player',guardian:'Guardian',
 helper:'Helper',staff:'Volunteer',none:'No active role'
};
const CAP={
 team_coach:['roster','attendance','training'],
 team_manager:['roster','attendance','staff'],
 team_assistant:[],
 player:['own-availability'],
 guardian:['own-availability']
};
const COPY=x=>JSON.parse(JSON.stringify(x));
const has=(list,value)=>list.includes(value);
const profile=id=>P12_QA_PROFILES.find(p=>p.id===id);
function scopedTeams(context){
 if(!context||context.status==='revoked'||context.status==='proposed')return [];
 const {group,role,kind}=context;
 if(kind==='inactive'||kind==='appointment')return [];
 if(group?.type==='team')return P12_SAMPLE_TEAMS.filter(t=>t.id===group.id);
 if(group?.type==='club'){
  // A club membership does not grant a directory view of every child.
  // These deliberately narrow fictional relationships identify a single
  // linked child or volunteer team for testing, not verified real assignments.
  if(kind==='membership'){
   const assigned={
    guardian:{'qa-comets':'qa-comets-juniors','qa-stars':'qa-stars-u12'},
    helper:{'qa-comets':'qa-comets-mixed'},
    staff:{'qa-rangers':'qa-rangers-16'}
   }[role]?.[group.id];
   return P12_SAMPLE_TEAMS.filter(t=>t.id===assigned);
  }
  return P12_SAMPLE_TEAMS.filter(t=>t.clubId===group.id);
 }
 if(group?.type==='association'){
  const ids=P12_SAMPLE_CLUBS.filter(c=>c.associationId===group.id).map(c=>c.id);
  return P12_SAMPLE_TEAMS.filter(t=>ids.includes(t.clubId));
 }
 if(kind==='access'&&role==='personal_owner'&&group?.type==='personal')return P12_SAMPLE_TEAMS;
 return [];
}
export function personaSession(id,contextId='',requestedTeamId=''){
 const p=p12QaView(id,contextId);
 if(!p)return null;
 const selected=p.selected;
 const role=(selected?.kind==='inactive'||selected?.kind==='appointment')?'none':(selected?.role||'none');
 const allowed=scopedTeams(selected);
 const selectedTeam=allowed.find(t=>t.id===requestedTeamId)||allowed[0]||null;
 const groups=new Set(allowed.map(t=>t.clubId));
 const club=P12_SAMPLE_CLUBS.find(c=>c.id===selectedTeam?.clubId)||null;
 const me=profile(id);
 // A multi-sport player's membership portfolio is independent of each selected
 // team context. It is not a cross-team management permission.
 const memberships=(me?.memberships||[]).filter(m=>m.type==='player'&&m.group.type==='team')
  .map(m=>P12_SAMPLE_TEAMS.find(t=>t.id===m.group.id)).filter(Boolean);
 return {
  profileId:id,profileLabel:p.profileLabel,contextId:selected?.id||'',context:selected,
  contexts:p.contexts,role,label:LABEL[role]||role,sections:NAV[role]||NAV.none,
  allowedTeams:allowed,team:selectedTeam,club,clubs:P12_SAMPLE_CLUBS.filter(c=>groups.has(c.id)),
  memberships,capabilities:CAP[role]||[],fictional:true,accessGrant:selected?.kind==='access'
 };
}
export function personaRoster(session){
 if(!session?.team)return null;
 const roster=makeP12SampleRoster(session.team.id);
 if(!roster)return null;
 const selfPlayer=session.role==='player'&&session.memberships.some(t=>t.id===session.team.id);
 // Show the fictional person as a player in their own roster. Do not imply
 // that their identity grants access to other team rosters.
 if(selfPlayer)roster.players[0]={...roster.players[0],id:'fictional-person-'+session.profileId,
  name:session.profileLabel,profileMember:true};
 return roster;
}
export function personaFixtures(session){
 if(!session)return [];
 return session.allowedTeams.map(t=>({
  id:'example-fixture-'+t.id,teamId:t.id,team:t.name,clubId:t.clubId,
  title:'Example upcoming match',date:'2026-11-14',sport:t.sport,
  status:'scheduled',season:t.season
 }));
}
export function personaSeasons(session){
 if(!session)return [];
 // Historical periods are illustrative records for multi-season UX testing.
 const targets=session.role==='player'?session.memberships:session.allowedTeams;
 return targets.flatMap(t=>[2024,2025,2026].map(year=>({
  id:t.id+'-'+year,teamId:t.id,teamName:t.name,sport:t.sport,year,
  status:year===2026?'Current example season':'Historical example season'
 })));
}
// Team-level workflow records must be shared by every fictional person
// assigned to that team. Historical PR144 data used a person/context/team key;
// the migration is additive, never deletes the original records.
const blankRecord=()=>({selected:{},attendance:{},staff:{},training:[],availabilityByPerson:{}});
const teamKey=teamId=>'team:'+teamId;
export function upgradePersonaRecords(records={}){
 if(!records||typeof records!=='object'||Array.isArray(records))return {};
 const output={...records};
 const staged={};
 for(const [key,value] of Object.entries(records)){
   const parts=key.split('|');
   if(parts.length!==3||!value||typeof value!=='object'||Array.isArray(value))continue;
   const [personId,contextId,teamId]=parts;
   if(!P12_SAMPLE_TEAMS.some(t=>t.id===teamId))continue;
   const session=personaSession(personId,contextId,teamId);
   if(!session||session.contextId!==contextId||session.team?.id!==teamId)continue;
   const k=teamKey(teamId),dest=staged[k]||(staged[k]=blankRecord());
   for(const field of ['selected','attendance','staff']){
     if(value[field]&&typeof value[field]==='object'&&!Array.isArray(value[field]))
       Object.assign(dest[field],value[field]);
   }
   if(Array.isArray(value.training))
     for(const item of value.training)if(typeof item==='string'&&!dest.training.includes(item))dest.training.push(item);
   if(['yes','no','maybe'].includes(value.availability))
     dest.availabilityByPerson[personId]=value.availability;
 }
 for(const [key,value] of Object.entries(staged)){
   if(!Object.hasOwn(output,key))output[key]=value;
 }
 return output;
}

export function personaAction(session,records={},action={}){
 const fail=error=>({error,records});
 if(!session?.team||!session.context)return fail('No assigned team selected');
 if(!session.allowedTeams.some(t=>t.id===session.team.id)||action.teamId!==session.team.id)
  return fail('Action is outside the selected person and team scope');
 if(!session.capabilities.includes(action.capability))
  return fail('This role cannot perform that action');
 const roster=personaRoster(session);
 const migrated=upgradePersonaRecords(records);
 const key=teamKey(session.team.id);
 const current=COPY(migrated[key]||blankRecord());
 if(action.capability==='roster'){
  if(!roster.players.some(p=>p.id===action.personId))return fail('Player is not in this squad');
  current.selected[action.personId]=!current.selected[action.personId];
 }else if(action.capability==='attendance'){
  if(!roster.players.some(p=>p.id===action.personId)||!has(['yes','no','pending'],action.value))
   return fail('Invalid squad member or availability value');
  current.attendance[action.personId]=action.value;
 }else if(action.capability==='own-availability'){
  if(!has(['yes','no','maybe'],action.value))return fail('Invalid availability response');
  if(session.role==='player'&&!session.memberships.some(t=>t.id===session.team.id))
   return fail('Person is not a player in this team');
  current.availabilityByPerson[session.profileId]=action.value;
 }else if(action.capability==='staff'){
  if(!roster.volunteers.some(v=>v.id===action.personId))return fail('Volunteer not in this team');
  if(!has(['trainer','helper'],action.value))return fail('Unrecognised proposed duty');
  current.staff[action.personId]=action.value; // proposal only, no accreditation
 }else if(action.capability==='training'){
  if(typeof action.value!=='string'||action.value.trim().length<3||action.value.length>160)
   return fail('Training title must be 3–160 characters');
  current.training.push(action.value.trim());
 }else return fail('Unknown action');
 return {records:{...migrated,[key]:current},state:{...current,availability:current.availabilityByPerson[session.profileId]||'pending'}};
}
export function personaCurrentState(session,records={}){
 if(!session?.team)return {...blankRecord(),availability:'pending'};
 const shared=upgradePersonaRecords(records)[teamKey(session.team.id)]||blankRecord();
 const state=COPY(shared);
 return {...state,availability:state.availabilityByPerson?.[session.profileId]||'pending'};
}

export function personaRoleTeams(id,role){
 const p=p12QaView(id);
 if(!p)return [];
 const result=new Map();
 for(const c of p.contexts){
  if(c.role!==role||c.kind==='inactive'||c.kind==='appointment')continue;
  for(const t of scopedTeams(c)){
   if(!result.has(t.id))result.set(t.id,{...t,contextId:c.id,
    clubName:P12_SAMPLE_CLUBS.find(cl=>cl.id===t.clubId)?.name||''});
  }
 }
 return [...result.values()];
}
