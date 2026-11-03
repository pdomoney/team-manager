import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewActiveRoleCapability,reviewSportDuty,reviewTeamParticipation}
 from '../site/future-role-decisions.js';
const at='2026-11-03T10:00:00Z';
const coach={id:'g1',kind:'role-grant',accountId:'a1',role:'team_coach',
 group:{type:'team',id:'Rangers-U16'},status:'active',
 approvedBy:'other-admin',expiresAt:'2026-12-01T00:00:00Z'};
const manager={id:'g2',kind:'role-grant',accountId:'a1',role:'team_manager',
 group:{type:'team',id:'Comets-U12'},status:'active',
 approvedBy:'other-admin',expiresAt:'2026-12-01T00:00:00Z'};
const ask=(activeGrantId,capability,targetScope,grants=[coach,manager])=>
 reviewActiveRoleCapability({accountId:'a1',activeGrantId,capability,targetScope,grants,at});

test('D02/D20: explicit active Coach grant never applies to another team',()=>{
 const source=structuredClone([coach,manager]);
 assert.equal(ask('g1','roster:manage',{type:'team',id:'Rangers-U16'}).allowed,true);
 assert.equal(ask('g1','roster:manage',{type:'team',id:'Comets-U12'}).allowed,false);
 assert.equal(ask('g2','roster:manage',{type:'team',id:'Comets-U12'}).allowed,true);
 assert.deepEqual([coach,manager],source);
});
test('D02: no role union, even when another grant has the requested permission',()=>{
 const result=ask('g2','tactics:manage',{type:'team',id:'Comets-U12'});
 assert.equal(result.allowed,false);
 assert.equal(result.reason,'active-role-lacks-capability');
 assert.equal(ask('g1','tactics:manage',{type:'team',id:'Rangers-U16'}).allowed,true);
});
test('D20/D24: membership or fixture appointment cannot impersonate a role grant',()=>{
 const target={type:'team',id:'Rangers-U16'};
 for(const extra of [
   {id:'membership',accountId:'a1',kind:'membership',role:'team_coach',group:target,status:'active',approvedBy:'x'},
   {id:'duty',accountId:'a1',kind:'fixture-duty',role:'team_coach',group:target,status:'proposed',approvedBy:'x'},
   {...coach,id:'expired',expiresAt:'2026-11-01T00:00:00Z'}
 ]){
   const res=ask(extra.id,'team:manage',target,[extra]);
   assert.equal(res.allowed,false);
 }
 assert.equal(ask('g1','team:manage',target,[{...coach,status:'revoked'}]).allowed,false);
 assert.equal(ask('g1','team:manage',target,[coach,coach]).allowed,false);
});
test('D01/D11: protected data stays outside synthetic generic role grants',()=>{
 for(const resourceClass of ['medical','safeguarding','minor-private','personal-contact']){
   const p=reviewActiveRoleCapability({accountId:'a1',activeGrantId:'g1',
     grants:[coach],capability:'team:manage',targetScope:coach.group,at,resourceClass});
   assert.equal(p.allowed,false,resourceClass);
 }
});
test('D03: sporting role accreditation is exact sport + verified policy + not expired',()=>{
 const input={personId:'p1',role:'trainer',sport:'Rugby league',fixtureId:'f1',at,
   requirement:{sourceVerified:true,sport:'Rugby league',duty:'trainer',qualification:'Sports trainer'},
   credential:{personId:'p1',sport:'Rugby league',qualification:'Sports trainer',
     status:'verified',verifiedBy:'official',evidenceRef:'registry-ref',
     expiresAt:'2026-12-01T00:00:00Z'}};
 const r=reviewSportDuty(input);
 assert.equal(r.allowed,true);
 assert.equal(r.grantsAccess,false);
 for(const bad of [
   {credential:{...input.credential,sport:'Rugby union'}},
   {requirement:{...input.requirement,sourceVerified:false}},
   {requirement:{...input.requirement,duty:'first_aider'}},
   {credential:{...input.credential,expiresAt:'2026-11-02T00:00:00Z'}},
   {credential:{...input.credential,status:'self-reported'}}
 ])assert.equal(reviewSportDuty({...input,...bad}).allowed,false);
});
const participation=()=>({
 teamId:'r16',clubId:'rangers',
 nomination:{by:'coach1',role:'team_coach',teamId:'r16'},
 teamApproval:{by:'manager1',role:'team_manager',teamId:'r16',auditId:'accept-1'},
 registration:{status:'verified',sourceRef:'registration-office-1',verifiedBy:'registrar'},
 financial:{status:'paid',providerRef:'payment-provider-1'},
 clubApproval:{clubId:'rangers',role:'club_admin',by:'admin1',auditId:'club-ok-1'}
});
test('D04: team acceptance is not financial or official participation eligibility',()=>{
 const p=participation();
 const ok=reviewTeamParticipation(p);
 assert.equal(ok.teamAccepted,true);
 assert.equal(ok.fullyRegistered,true);
 assert.equal(ok.clearedToPlay,null);
 assert.equal(ok.eligibility,'not-evaluated-pending-D17-competition-rules');
 for(const changed of [
   {financial:{status:'outstanding'}},
   {registration:{status:'self-declared'}},
   {clubApproval:{...p.clubApproval,clubId:'Comets'}}
 ]){
   const r=reviewTeamParticipation({...p,...changed});
   assert.equal(r.teamAccepted,true);
   assert.equal(r.fullyRegistered,false);
   assert.equal(r.matchDaySelectionMayBeProposed,true);
   assert.equal(r.clearedToPlay,null);
 }
});
test('D04: independently audited one-team exception, never bypass payment verification',()=>{
 const p=participation();
 const exception={enabled:true,teamCount:1,teamId:'r16',approverRole:'personal_owner',
   approvedBy:'platform-owner',auditId:'audit-01'};
 const a=reviewTeamParticipation({...p,clubApproval:null,tenantException:exception});
 assert.equal(a.fullyRegistered,true);
 assert.equal(a.approvalRoute,'audited-single-team-exception');
 assert.equal(reviewTeamParticipation({...p,clubApproval:null,
   tenantException:{...exception,teamCount:6}}).fullyRegistered,false);
 assert.equal(reviewTeamParticipation({...p,clubApproval:null,financial:{status:'outstanding'},
   tenantException:exception}).fullyRegistered,false);
});
