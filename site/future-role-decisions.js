// Future role policy: explicit, exact-scope decisions for fictional data only.
// NOT production authorisation. A real release must enforce every check on a
// trusted server after authentication (see issue #55).
import {P12_ACCESS_ROLES,P12_PROTECTED_CLASSES} from './p12-role-groups.js';

const text=x=>typeof x==='string'?x.trim():'';
const same=(a,b)=>!!a&&!!b&&text(a.type)===text(b.type)&&text(a.id)!==''&&a.id===b.id;
const iso=x=>{
 if(typeof x!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(x))return null;
 const t=Date.parse(x);
 return Number.isFinite(t)&&new Date(t).toISOString().slice(0,19)===x.slice(0,19)?t:null;
};
const denied=reason=>Object.freeze({allowed:false,reason});
const approved=detail=>Object.freeze({allowed:true,...detail});

// D02/D20/D24: choose ONE active approved grant and its exact group.
// Never OR permissions across simultaneous group contexts. A player membership,
// coaching appointment, qualification or match-duty nomination is not a grant.
export function reviewActiveRoleCapability({
 accountId,activeGrantId,grants=[],capability,targetScope,
 resourceClass='ordinary',at='2026-11-03T00:00:00Z'
}={}){
 const now=iso(at);
 if(!text(accountId)||!text(activeGrantId)||!text(capability)||!targetScope||
    !text(targetScope.type)||!text(targetScope.id)||now===null)
   return denied('invalid-request');
 if(P12_PROTECTED_CLASSES.includes(resourceClass))
   return denied('protected-content-requires-separate-policy');
 if(!Array.isArray(grants))return denied('invalid-grant-list');
 const matches=grants.filter(g=>g?.id===activeGrantId);
 if(matches.length!==1)return denied('no-unique-active-context');
 const g=matches[0],role=P12_ACCESS_ROLES[g.role];
 if(!role||g.kind!=='role-grant'||g.accountId!==accountId||g.status!=='active'||!text(g.approvedBy)||
    !same(g.group,targetScope)||role.scope!==targetScope.type)
   return denied('grant-not-active-or-out-of-scope');
 const begin=g.validFrom==null?null:iso(g.validFrom);
 const end=g.expiresAt==null?null:iso(g.expiresAt);
 if((g.validFrom!=null&&begin===null)||(g.expiresAt!=null&&end===null)||
    (begin!==null&&now<begin)||(end!==null&&now>=end))
   return denied('grant-expired-or-not-started');
 if(!role.capabilities.includes(capability))
   return denied('active-role-lacks-capability');
 return approved({activeRole:g.role,scope:Object.freeze({...targetScope}),
   grantId:g.id,productionAuthorised:false});
}

// D03/D12/D24: accreditation is tied to its *sport and duty*, not inferred
// from holding a Club Administrator account, membership or volunteer badge.
// A reviewed nomination still does NOT automatically give any app permission.
export function reviewSportDuty({
 personId,role,sport,fixtureId,requirement,credential,
 at='2026-11-03T00:00:00Z'
}={}){
 const now=iso(at);
 if(!text(personId)||!text(role)||!text(sport)||!text(fixtureId)||now===null)
   return denied('invalid-duty');
 if(!requirement?.sourceVerified||!text(requirement.qualification)||
    requirement.sport!==sport||requirement.duty!==role)
   return denied('competition-duty-policy-not-verified');
 if(!credential||credential.personId!==personId||credential.sport!==sport||
    credential.qualification!==requirement.qualification||credential.status!=='verified'||
    !text(credential.verifiedBy)||!text(credential.evidenceRef))
   return denied('sport-specific-accreditation-not-verified');
 const expiry=iso(credential.expiresAt);
 if(expiry===null||now>=expiry)return denied('accreditation-expired');
 return approved({appointmentEligibleForReview:true,grantsAccess:false,
   fixtureId,role,qualification:credential.qualification,productionAuthorised:false});
}

// D04: team acceptance and club registration/financial standing are
// deliberately distinct. Neither can manufacture official match eligibility.
// The D17 grace-period/temporary-match policy is unresolved.
export function reviewTeamParticipation({
 teamId,clubId,nomination,teamApproval,registration,financial,clubApproval,
 tenantException
}={}){
 const nominated=!!text(teamId)&&!!text(clubId)&&
   nomination?.teamId===teamId&&
   ['team_coach','team_manager'].includes(nomination?.role)&&!!text(nomination?.by);
 const teamAccepted=nominated&&teamApproval?.teamId===teamId&&
   ['team_coach','team_manager'].includes(teamApproval?.role)&&
   !!text(teamApproval?.by)&&!!text(teamApproval?.auditId);
 const verified=registration?.status==='verified'&&!!text(registration.sourceRef)&&
   !!text(registration.verifiedBy);
 const paid=financial?.status==='paid'&&!!text(financial.providerRef);
 const normalApproval=clubApproval?.clubId===clubId&&clubApproval?.role==='club_admin'&&
   !!text(clubApproval.by)&&!!text(clubApproval.auditId);
 // Small, one-team tenants may ask for an expressly enabled and audited
 // platform-owner exception. Still never self-certify fees or registration.
 const singleTeam=tenantException?.enabled===true&&tenantException.teamCount===1&&
   tenantException.teamId===teamId&&tenantException.approverRole==='personal_owner'&&
   !!text(tenantException.approvedBy)&&!!text(tenantException.auditId);
 const fullyRegistered=teamAccepted&&verified&&paid&&(normalApproval||singleTeam);
 return Object.freeze({
   nominated,teamAccepted,fullyRegistered,
   registrationVerified:verified,financialVerified:paid,
   approvalRoute:normalApproval?'club-admin':singleTeam?'audited-single-team-exception':'none',
   matchDaySelectionMayBeProposed:teamAccepted,
   // Whether a provisional participant may ACTUALLY play is an authority- and
   // sport-specific open question (D17), not a Coach/Manager override.
   clearedToPlay:null,eligibility:'not-evaluated-pending-D17-competition-rules',
   productionAuthorised:false
 });
}
