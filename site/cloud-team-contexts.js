// Stage 3D.5: one authenticated account, team chips and server-verified grants.
// The UI may display the union of same-team capabilities, but EVERY request
// still supplies one exact eligible role and the server rechecks that grant.
export const TEAM_ROLES=Object.freeze([
  'team_coach','team_manager','team_assistant','team_player',
  'team_volunteer','team_play_viewer'
]);
const ROLE_ORDER=TEAM_ROLES;
const OWN=Object.freeze({key:'platform',kind:'platform',teamId:'platform',
  role:'platform_owner',roles:Object.freeze([]),club:'',sport:'',season:''});
const permissions=Object.freeze({
  'schedule.read':['team_coach','team_manager','team_assistant','team_player'],
  'schedule.edit':['team_coach','team_manager','team_assistant'],
  'event.create':['team_coach','team_manager'],
  'event.change':['team_coach','team_manager'],
  'roster.read':['team_coach','team_manager'],
  'roster.edit':['team_coach','team_manager'],
  'roster.approve':['team_coach','team_manager'],
  'attendance.read':['team_coach','team_manager'],
  'attendance.record':['team_coach','team_manager'],
  'availability.board':['team_coach','team_manager'],
  'availability.reply':['team_player'],
  'availability.transcribe':['team_manager'],
  'duty.read':['team_volunteer'],
  'duty.reply':['team_volunteer'],
  'duty.board':['team_manager'],
  'duty.assign':['team_manager'],
  'duty.label':['team_manager'],
  'duty.withdraw':['team_manager'],
  'notices.read':['team_coach','team_manager','team_assistant','team_player','team_volunteer'],
  'notice.create':['team_coach','team_manager'],
  'notice.publish':['team_coach','team_manager'],
  'notice.archive':['team_coach','team_manager'],
  'report.summary':['team_coach','team_manager'],
  'play.published.read':['team_coach','team_assistant','team_manager','team_player','team_play_viewer'],
  'play.draft.read':['team_coach','team_assistant'],
  'play.draft.edit':['team_coach','team_assistant'],
  'play.publish':['team_coach']
});
const present=(value,limit=120)=>typeof value==='string'&&value.length>0&&value.length<=limit;
export function buildTeamNavigation(grants,owner=false){
  if(!Array.isArray(grants)||grants.length>50||typeof owner!=='boolean')throw new TypeError('invalid-grants');
  const teams=new Map();
  for(const entry of grants){
    if(!entry||!present(entry.teamId,100)||!present(entry.club)||
       !present(entry.sport)||!present(entry.season)||!TEAM_ROLES.includes(entry.role))
      throw new TypeError('invalid-grant');
    const key=entry.teamId;
    const old=teams.get(key);
    if(old){
      if(old.club!==entry.club||old.sport!==entry.sport||old.season!==entry.season)
        throw new TypeError('conflicting-team-identity');
      old.roles.add(entry.role);
    }else teams.set(key,{key:'team:'+key,kind:'team',teamId:key,
      club:entry.club,sport:entry.sport,season:entry.season,
      roles:new Set([entry.role])});
  }
  const result=[];
  if(owner)result.push(OWN);
  for(const team of teams.values()){
    const roles=Object.freeze(ROLE_ORDER.filter(r=>team.roles.has(r)));
    result.push(Object.freeze({...team,roles,role:roles[0]}));
  }
  return Object.freeze(result);
}
export function hasTeamRole(context,...roles){
  return context?.kind==='team'&&roles.some(role=>context.roles.includes(role));
}
export function roleForAction(context,action){
  if(context?.kind!=='team'||!Object.hasOwn(permissions,action))return null;
  return permissions[action].find(role=>context.roles.includes(role))||null;
}
export function reviewerContext(context){
  if(!hasTeamRole(context,'team_coach','team_manager'))return null;
  const role=context.roles.includes('team_coach')?'team_coach':'team_manager';
  return Object.freeze({teamId:context.teamId,role});
}
export function visibleSections(context,{playsDeferred=true}={}){
  if(context?.kind==='platform')return Object.freeze(['home','team','more']);
  if(context?.kind!=='team')return Object.freeze([]);
  const sections=['home'];
  if(roleForAction(context,'schedule.read'))sections.push('schedule');
  if(hasTeamRole(context,'team_coach','team_manager','team_assistant','team_player','team_volunteer'))
    sections.push('team');
  if(!playsDeferred&&roleForAction(context,'play.published.read'))sections.push('tactics');
  sections.push('more');
  return Object.freeze(sections);
}
export function clubsForNavigation(contexts){
  return Object.freeze([...new Set(contexts.filter(c=>c.kind==='team').map(c=>c.club))]);
}
