// Future competition decisions for fictional records. NOT an official draw,
// a scorer accreditation system or server-side authorisation.
const txt=x=>typeof x==='string'?x.trim():'';
const validAt=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(x)&&
 Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,19)===x.slice(0,19);
const deny=reason=>Object.freeze({allowed:false,reason,official:false,productionAuthorised:false});
const allow=(kind,detail={})=>Object.freeze({allowed:true,kind,...detail,productionAuthorised:false});
const roles=['team_coach','team_manager','club_admin','association_admin','competition_manager'];
const teamRoles=['team_coach','team_manager'];
const approvedAppointment=(a,actorId,fixtureId,duty,at)=>
 a?.status==='approved'&&a.actorId===actorId&&a.fixtureId===fixtureId&&
 a.duty===duty&&!!txt(a.approvedBy)&&validAt(a.expiresAt)&&at<a.expiresAt;

// Official competition authority is a *separate approved delegation* even
// when a Manager, Coach or Club Admin is performing the authorised work.
// No automatic chain-of-command permission across an association.
const hasAuthority=(d,actorId,competitionId,action,at)=>
 !!d&&d.status==='active'&&d.actorId===actorId&&
 d.competitionId===competitionId&&d.action===action&&
 !!txt(d.approvedBy)&&!!txt(d.evidenceRef)&&validAt(d.expiresAt)&&
 at<d.expiresAt;

export function reviewFixtureOperation({
 actorId,role,actorTeamId,fixture,operation,delegation,
 at='2026-11-03T00:00:00Z'
}={}){
 if(!txt(actorId)||!txt(role)||!fixture?.id||!fixture?.teamId||!validAt(at))
   return deny('invalid-request');
 if(fixture.kind==='friendly'){
   if(operation!=='create'&&operation!=='reschedule'&&operation!=='cancel')
     return deny('invalid-friendly-operation');
   return teamRoles.includes(role)&&actorTeamId===fixture.teamId
     ?allow('team-friendly-management',{official:false})
     :deny('not-appointed-to-this-team');
 }
 if(fixture.kind!=='official'||!txt(fixture.competitionId))
   return deny('unverified-fixture-type');
 if(operation==='propose'){
   return teamRoles.includes(role)&&actorTeamId===fixture.teamId
     ?allow('official-fixture-change-request',{official:false})
     :deny('not-appointed-to-this-team');
 }
 if(operation==='publish'||operation==='reschedule'||operation==='cancel'){
   if(!roles.includes(role))return deny('role-ineligible-for-delegation');
   return hasAuthority(delegation,actorId,fixture.competitionId,
     'fixture:manage',at)?
     allow('explicit-delegated-competition-authority',{official:true}):
     deny('explicit-competition-delegation-required');
 }
 return deny('unknown-operation');
}

// D08: the appointed volunteer or Team Manager can *record* a provisional score.
// An appointed official confirms it; competition authority approves publication.
// These are distinct steps, with distinct actors and a shared fixture ID.
export function reviewResultOperation({
 actorId,role,fixtureId,competitionId,operation,
 appointment,confirmation,delegation,at='2026-11-03T00:00:00Z'
}={}){
 if(!txt(actorId)||!txt(fixtureId)||!validAt(at))return deny('invalid-request');
 if(operation==='record-provisional'){
   const duty=appointment?.duty;
   const validDuty=duty==='scorekeeper' || duty==='team_manager';
   return validDuty&&approvedAppointment(appointment,actorId,fixtureId,duty,at)&&
     (role==='fixture_scorekeeper'||role==='team_manager'||role==='helper')
       ?allow('provisional-result',{official:false}):deny('scorer-appointment-required');
 }
 if(operation==='confirm'){
   return approvedAppointment(appointment,actorId,fixtureId,'match_official',at)
     ?allow('official-confirmation',{official:false})
     :deny('appointed-match-official-required');
 }
 if(operation==='publish'){
   if(!txt(competitionId)||!confirmation||confirmation.fixtureId!==fixtureId||
      confirmation.status!=='verified'||!txt(confirmation.evidenceRef)||
      !txt(confirmation.officialId)||confirmation.officialId===actorId||
      !txt(confirmation.auditId))
     return deny('independent-confirmation-required');
   return hasAuthority(delegation,actorId,competitionId,'result:publish',at)
     ?allow('official-result-publication',{official:true})
     :deny('competition-publication-delegation-required');
 }
 return deny('unknown-operation');
}
