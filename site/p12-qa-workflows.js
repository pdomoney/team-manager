// P12D: disposable fictional workflow sandbox for trial-only role/context testing.
// Pure data operations. Never load / mutate coach workspaces, accounts or real records.
// This is a UI-behaviour simulator, NOT production security, compliance or eligibility.
import {P12_ACCESS_ROLES} from './p12-role-groups.js';
import {sampleTeam,makeP12SampleRoster} from './p12-qa-club-teams.js';

const byValue=(items,id)=>items.find(x=>x.id===id);
const exactContext=view=>{
  const chosen=view?.selected;
  if(view?.mode!=='SYNTHETIC_ONLY_NO_AUTHORIZATION'||view.mayGrantAccess!==false||
     !chosen||chosen.kind!=='access'||chosen.status!=='active'||
     chosen.group?.type!=='team'||!sampleTeam(chosen.group.id))return null;
  const definition=Object.hasOwn(P12_ACCESS_ROLES,chosen.role)?P12_ACCESS_ROLES[chosen.role]:null;
  if(definition?.scope!=='team')return null;
  const allowed=definition.capabilities.filter(c=>chosen.capabilities?.includes(c));
  return {teamId:chosen.group.id,role:chosen.role,allowed};
};

export function makeP12WorkflowSandbox(view){
  const ctx=exactContext(view);
  if(!ctx)return null;
  const t=makeP12SampleRoster(ctx.teamId);
  return {
    mode:'DISPOSABLE_SYNTHETIC_WORKFLOW',profileId:view.profileId,
    contextId:view.selected.id,role:ctx.role,teamId:ctx.teamId,clubId:t.clubId,
    teamName:t.teamName,clubName:t.clubName,sport:t.sport,
    category:t.category,ageGroup:t.ageGroup,season:t.season,
    fixtureId:t.fixtureId,fixtureStatus:'scheduled',
    players:t.players,staff:t.staff,volunteers:t.volunteers,
    proposedDuties:[],log:[],rulesApproved:false,staffingVerified:false,
    published:false,containsRealPeople:false,transient:true
  };
}

// Only exact profile, role and group may operate on the sandbox.
// Every action creates a fresh snapshot; callers must explicitly keep it in memory.
// These checks are regression expectations only, not an authentication boundary.
export function applyP12WorkflowAction(view,sandbox,request={}){
  const context=exactContext(view);
  if(!context||!sandbox||sandbox.mode!=='DISPOSABLE_SYNTHETIC_WORKFLOW'||
     sandbox.profileId!==view.profileId||sandbox.contextId!==view.selected.id||
     sandbox.role!==context.role||sandbox.teamId!==context.teamId||
     sandbox.fixtureStatus!=='scheduled'||sandbox.published!==false||
     sandbox.containsRealPeople!==false)return {error:'Synthetic workflow context does not match'};
  const kind=request.kind;
  const permission={'toggle-roster':'roster:manage','set-rsvp':'schedule:manage',
    'propose-duty':'match-staff:manage','propose-role-change':'match-staff:manage'}[kind];
  if(!permission||!context.allowed.includes(permission))return {error:'Role lacks this synthetic action'};
  const people=sandbox.players;
  const player=byValue(people,request.playerId);
  const volunteers=sandbox.volunteers;
  const staff=sandbox.staff;
  let next,detail;
  if(kind==='toggle-roster'){
    if(!player)return {error:'Player does not belong to this exact team'};
    next={...sandbox,players:people.map(p=>p.id===player.id?{...p,selected:!p.selected}:{...p})};
    detail='Roster selection changed for '+player.id;
  } else if(kind==='set-rsvp'){
    if(!player||!['yes','no','pending'].includes(request.status))return {error:'Invalid player or RSVP status'};
    next={...sandbox,players:people.map(p=>p.id===player.id?{...p,rsvp:request.status}:{...p})};
    detail='Coach-recorded fictional RSVP: '+player.id+' = '+request.status;
  } else if(kind==='propose-duty') {
    const volunteer=byValue(volunteers,request.volunteerId);
    const duty=request.duty;
    if(!volunteer||!['trainer','acting_coach'].includes(duty))return {error:'Invalid volunteer or proposed duty'};
    if(sandbox.proposedDuties.some(p=>p.volunteerId===volunteer.id&&p.duty===duty))
      return {error:'Duplicate fixture duty proposal'};
    next={...sandbox,proposedDuties:[...sandbox.proposedDuties,{
      volunteerId:volunteer.id,duty,fixtureId:sandbox.fixtureId,status:'proposed',
      qualification:'unverified',registration:'unverified',coverage:'not-verified',
      grantsAccess:false
    }]};
    detail='Unverified fixture duty proposed: '+duty+' for '+volunteer.id;
  } else {
    const member=byValue(staff,request.staffId);
    if(!member||!['trainer','acting_coach'].includes(request.duty))
      return {error:'Unknown staff member or requested fixture duty'};
    if(!request.reason||typeof request.reason!=='string')
      return {error:'A reason for the acting appointment is required'};
    const duty=request.duty;
    if(sandbox.proposedDuties.some(p=>p.staffId===member.id&&p.duty===duty))
      return {error:'Duplicate acting-role proposal'};
    next={...sandbox,proposedDuties:[...sandbox.proposedDuties,{
      staffId:member.id,personId:member.personId,previousRole:member.role,
      duty,fixtureId:sandbox.fixtureId,reason:request.reason.slice(0,160),
      status:'proposed',qualification:'unverified',registration:'unverified',
      coverage:'not-verified',grantsAccess:false,
      staffReplacementRequired:true,actualPermissionChange:false
    }]};
    detail='Acting role requested: '+member.role+' to '+duty+' for '+member.id;
  }
  return {...next,log:[...sandbox.log,detail]};
}

// Display-only summary. This deliberately never claims a scheduled match is staffed,
// approved, scored or published. Unsupported roles show no team sandbox.
export function inspectP12Workflow(view,sandbox){
  const ctx=exactContext(view);
  if(!ctx||!sandbox||sandbox.profileId!==view.profileId||
     sandbox.contextId!==view.selected.id||sandbox.teamId!==ctx.teamId||
     sandbox.role!==ctx.role||sandbox.mode!=='DISPOSABLE_SYNTHETIC_WORKFLOW')return null;
  return {
    teamId:sandbox.teamId,teamName:sandbox.teamName,sport:sandbox.sport,
    fixtureId:sandbox.fixtureId,clubId:sandbox.clubId,
    category:sandbox.category,ageGroup:sandbox.ageGroup,season:sandbox.season,
    players:sandbox.players.map(x=>({...x})),
    staff:sandbox.staff.map(x=>({...x})),
    volunteers:sandbox.volunteers.map(x=>({...x})),
    proposals:sandbox.proposedDuties.map(x=>({...x})),
    selectedCount:sandbox.players.filter(x=>x.selected).length,
    canRoster:ctx.allowed.includes('roster:manage'),
    canRsvp:ctx.allowed.includes('schedule:manage'),
    canPropose:ctx.allowed.includes('match-staff:manage'),
    activityCount:sandbox.log.length,
    officialRuleApproval:false,matchEligibilityConfirmed:false,
    canScore:false,canPublish:false,realWorkspaceAffected:false
  };
}
