// D04/D17: Fictional team placement review log, separate from registration,
// financial clearance and competition eligibility. NOT real authorisation.
// No child, medical, contact, registration evidence or payment data is stored.
const list=x=>Array.isArray(x)?x:[];
const clean=x=>typeof x==='string'?x.trim():'';
const iso=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(x)&&
 Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,19)===x.slice(0,19);
const roles=['team_coach','team_manager'];
const states={nominate:'nominated',approve:'team-approved',withdraw:'withdrawn'};

export function teamPlacementStatus(team,playerId){
 const events=list(team?.teamPlacementEvents).filter(x=>x?.playerId===playerId&&x.teamId===team?.id);
 const last=events.at(-1);
 return Object.freeze({
  state:last?.state||'not-nominated',
  revision:events.length,
  actorProfileId:last?.actorProfileId||'',
  at:last?.at||'',
  // A team placement is not an official registration or clearance to play.
  clubRegistrationVerified:false,financiallyCleared:false,competitionEligible:null
 });
}

// The owner-approved D04 change lets either Coach or Manager nominate and
// approve team placement. A separate Club/Registrar workflow verifies the
// governing registration and fee status; D17 grace-period policy stays open.
export function recordTeamPlacement(team,{
 playerId,role,actorProfileId,contextId,contextStatus,contextKind,
 scopeTeamId,action,reason,expectedRevision,at
}={}){
 const fail=error=>({error});
 if(!team||!clean(team.id)||team.archived||!Array.isArray(team.players))
   return fail('Active team is required');
 if(!team.players.some(p=>p?.id===playerId))return fail('Player is not in this team');
 if(!roles.includes(role)||!/^qa-\d{2}$/.test(actorProfileId)||
    contextKind!=='access'||contextStatus!=='active'||
    scopeTeamId!==team.id||
    contextId!==`grant:${role}:team:${team.id.replace(/^qa/,'qa-').replace(/^qa-([a-z])/, 'qa-$1')}` &&
    contextId!==`grant:${role}:team:${team.id}`)
   return fail('No active exact-team Coach or Manager role');
 if(!Object.hasOwn(states,action))return fail('Unknown placement action');
 if(!iso(at))return fail('Valid action timestamp required');
 if(clean(reason).length<3||clean(reason).length>200)return fail('Reason of 3–200 characters required');
 const before=teamPlacementStatus(team,playerId);
 if(!Number.isInteger(expectedRevision)||expectedRevision!==before.revision)
   return fail('Placement changed since it was opened');
 const from=before.state;
 if(action==='nominate'&&!['not-nominated','withdrawn'].includes(from)||
    action==='approve'&&from!=='nominated'||
    action==='withdraw'&&!['nominated','team-approved'].includes(from))
   return fail('Placement action is not valid from its current state');
 const source=list(team.teamPlacementEvents);
 // Append only. Neither player records nor external eligibility flags mutate.
 const entry=Object.freeze({
  id:`team-placement-${team.id}-${playerId}-${source.length+1}`,
  teamId:team.id,playerId,action,state:states[action],
  role,actorProfileId,contextId,reason:clean(reason),at,
  scope:'fictional-team-preview',officialRegistrationVerified:false
 });
 return {events:[...source,entry],entry,
  status:teamPlacementStatus({...team,teamPlacementEvents:[...source,entry]},playerId)};
}
