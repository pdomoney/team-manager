// P12D: disposable fictional workflow sandbox for trial-only role/context testing.
// Pure data operations. Never load / mutate coach workspaces, accounts or real records.
// This is a UI-behaviour simulator, NOT production security, compliance or eligibility.
import {P12_ACCESS_ROLES} from './p12-role-groups.js';

const TEAM_TEMPLATES=Object.freeze({
  'qa-rangers-16':Object.freeze({sport:'Rugby league',fixture:'qa-rangers-fixture',name:'Example Rangers U16',
    players:['Rangers Demo Player A','Rangers Demo Player B','Rangers Demo Player C'],
    volunteers:['Rangers Demo Volunteer A','Rangers Demo Volunteer B']}),
  'qa-stars-women':Object.freeze({sport:'Touch',fixture:'qa-stars-fixture',name:'Example Stars Women',
    players:['Stars Demo Player A','Stars Demo Player B','Stars Demo Player C'],
    volunteers:['Stars Demo Volunteer A','Stars Demo Volunteer B']}),
  'qa-comets-mixed':Object.freeze({sport:'Oztag',fixture:'qa-comets-fixture',name:'Example Comets Mixed',
    players:['Comets Demo Player A','Comets Demo Player B','Comets Demo Player C'],
    volunteers:['Comets Demo Volunteer A','Comets Demo Volunteer B']}),
  'qa-comets-juniors':Object.freeze({sport:'Oztag',fixture:'qa-comets-junior-fixture',name:'Example Comets U14',
    players:['Junior Demo Player A','Junior Demo Player B','Junior Demo Player C'],
    volunteers:['Junior Demo Volunteer A','Junior Demo Volunteer B']})
});

const byValue=(items,id)=>items.find(x=>x.id===id);
const exactContext=view=>{
  const chosen=view?.selected;
  if(view?.mode!=='SYNTHETIC_ONLY_NO_AUTHORIZATION'||view.mayGrantAccess!==false||
     !chosen||chosen.kind!=='access'||chosen.status!=='active'||
     chosen.group?.type!=='team'||!Object.hasOwn(TEAM_TEMPLATES,chosen.group.id))return null;
  const definition=Object.hasOwn(P12_ACCESS_ROLES,chosen.role)?P12_ACCESS_ROLES[chosen.role]:null;
  if(definition?.scope!=='team')return null;
  const allowed=definition.capabilities.filter(c=>chosen.capabilities?.includes(c));
  return {teamId:chosen.group.id,role:chosen.role,allowed};
};

export function makeP12WorkflowSandbox(view){
  const ctx=exactContext(view);
  if(!ctx)return null;
  const t=TEAM_TEMPLATES[ctx.teamId];
  return {
    mode:'DISPOSABLE_SYNTHETIC_WORKFLOW',profileId:view.profileId,
    contextId:view.selected.id,role:ctx.role,teamId:ctx.teamId,
    teamName:t.name,sport:t.sport,fixtureId:t.fixture,fixtureStatus:'scheduled',
    players:t.players.map((name,i)=>({id:ctx.teamId+'-player-'+(i+1),name,
      selected:i<2,rsvp:'pending'})),
    volunteers:t.volunteers.map((name,i)=>({id:ctx.teamId+'-volunteer-'+(i+1),name})),
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
    'propose-duty':'match-staff:manage'}[kind];
  if(!permission||!context.allowed.includes(permission))return {error:'Role lacks this synthetic action'};
  const people=sandbox.players;
  const player=byValue(people,request.playerId);
  const volunteers=sandbox.volunteers;
  let next,detail;
  if(kind==='toggle-roster'){
    if(!player)return {error:'Player does not belong to this exact team'};
    next={...sandbox,players:people.map(p=>p.id===player.id?{...p,selected:!p.selected}:{...p})};
    detail='Roster selection changed for '+player.id;
  } else if(kind==='set-rsvp'){
    if(!player||!['yes','no','pending'].includes(request.status))return {error:'Invalid player or RSVP status'};
    next={...sandbox,players:people.map(p=>p.id===player.id?{...p,rsvp:request.status}:{...p})};
    detail='Coach-recorded fictional RSVP: '+player.id+' = '+request.status;
  } else {
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
    fixtureId:sandbox.fixtureId,players:sandbox.players.map(x=>({...x})),
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
