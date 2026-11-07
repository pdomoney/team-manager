// Local, fictional profile appointments for the replaceable Titans test library.
//
// The original P12 18-team role fixtures stay independent. This bridge is
// enabled ONLY when the optional eight-team library is loaded and all expected
// Titans IDs/club boundaries match. It is never an account, a permission grant,
// a verified accreditation, or a source for live club records.
const APPOINTMENTS = Object.freeze({
  'qa-07': Object.freeze({role:'team_coach',teams:Object.freeze([
    Object.freeze({id:'testtitans',staff:'Alex Sample'}),
    Object.freeze({id:'testtitansgirls12',staff:'Dana Sample'})
  ])}),
  'qa-08': Object.freeze({role:'team_assistant',teams:Object.freeze([
    Object.freeze({id:'testtitans',staff:'Billie Sample'}),
    Object.freeze({id:'testtitansgirls12',staff:'Jamie Example'})
  ])}),
  'qa-09': Object.freeze({role:'team_manager',teams:Object.freeze([
    Object.freeze({id:'testtitans',staff:'Morgan Example'}),
    Object.freeze({id:'testleague',staff:'Riley Example'})
  ])}),
  'qa-12': Object.freeze({role:'staff',teams:Object.freeze([
    Object.freeze({id:'testtitans',staff:'Jules Example'}),
    Object.freeze({id:'testtitansmixed10',staff:'Lee Example'})
  ])})
});
const TEAM_IDS=Object.freeze(['testtitans','testleague','testtitansgirls12','testtitansmixed10']);
const TEAM_ROLE=Object.freeze({
  team_coach:'Head coach',
  team_assistant:'Assistant coach',
  team_manager:'Team manager',
  staff:'Trainer'
});
const list=xs=>Array.isArray(xs)?xs:[];
const workspaceTeams=ws=>ws&&ws.team&&ws.id?[ws,...list(ws.teams)]:[];

// Explicit fixture identity is required: a similarly named user-created club,
// a stale test copy or a partial library must never become a role assignment.
export function titansDemoAvailable(ws){
  if(!ws?.testLibrary||Number(ws.testLibrary.version)<3 ||
     !list(ws.clubs).some(c=>c.id==='tarenpointtitans'))return false;
  const all=workspaceTeams(ws);
  return TEAM_IDS.every(id=>all.some(t=>t.id===id && !t.archived &&
    t.team?.clubId==='tarenpointtitans'));
}
function appointment(ws,profileId){
  return titansDemoAvailable(ws)?APPOINTMENTS[profileId]||null:null;
}
const contextId=(profileId,role,teamId)=>'titans-demo:'+profileId+':'+role+':team:'+teamId;

function assignments(ws,profileId){
  const a=appointment(ws,profileId);
  if(!a)return null;
  const teams=workspaceTeams(ws);
  return a.teams.map(({id,staff})=>{
    const t=teams.find(t=>t.id===id);
    const wantedRole=TEAM_ROLE[a.role].toLocaleLowerCase('en-AU');
    const matching=list(t?.team?.staff).some(person=>
      String(person.name||'')===staff &&
      String(person.role||'').toLocaleLowerCase('en-AU')===wantedRole);
    // Missing or changed staff references must not assert the person is linked.
    // The team is still in the local fixture, but its role demo is ineligible.
    if(!matching)return null;
    const ctx={id:contextId(profileId,a.role,id),
      kind:a.role==='staff'?'membership':'access',
      role:a.role,group:{type:'team',id},
      label:TEAM_ROLE[a.role],groupLabel:t.team.name,
      status:a.role==='staff'?'participation only':'active',
      capabilities:[]};
    return {team:{id:t.id,name:t.team.name,clubId:t.team.clubId,
      sport:t.team.sport,contextId:ctx.id},context:ctx,staff};
  }).filter(Boolean);
}

export function titansDemoRoleTeams(ws,profileId,role){
  const a=appointment(ws,profileId);
  if(!a)return null; // Keep original P12 fixture semantics otherwise.
  if(a.role!==role)return [];
  return assignments(ws,profileId).map(x=>({...x.team}));
}

// A named demonstration participant is associated with a recorded team staff
// entry. The Trainer remains a read-only membership/fixture duty and gains no
// Coach privileges through this simulation.
export function titansDemoSession(ws,base,contextId='',teamId=''){
  if(!base)return null;
  const a=appointment(ws,base.profileId);
  if(!a)return null;
  const options=assignments(ws,base.profileId);
  const selected=options.find(x=>x.context.id===contextId)||
    options.find(x=>x.team.id===teamId)||options[0];
  if(!selected)return null;
  const team={...selected.team};
  const context=selected.context;
  const club=list(ws.clubs).find(c=>c.id===team.clubId);
  return {...base,role:a.role,contextId:context.id,context,
    contexts:options.map(x=>x.context),team,
    allowedTeams:options.map(x=>({...x.team})),
    clubs:club?[club]:[],club:club||null,
    label:a.role==='staff'?'Trainer':a.role==='team_assistant'?'Assistant coach':
      a.role==='team_manager'?'Manager':'Coach',
    capabilities:a.role==='team_coach'?['roster','attendance','training']:
      a.role==='team_manager'?['roster','attendance','staff','fixture-manage']:[],
    demoTitans:true,demoPerson:selected.staff,
    accessGrant:a.role!=='staff',fictional:true};
}

export function titansDemoProfileLabel(ws,profileId){
  const values=assignments(ws,profileId);
  const a=appointment(ws,profileId);
  return values?.length?values[0].staff+' · Titans '+TEAM_ROLE[a.role]+' (demo)':null;
}
