import test from 'node:test';
import assert from 'node:assert/strict';
import {p12QaView} from '../site/p12-qa-profiles.js';
import {
  P12_GOVERNANCE_CLOCK,createP12GovernanceScenario,
  inspectP12Governance,applyP12GovernanceAction
} from '../site/p12-qa-governance.js';

const actor=(id,role,groupId)=>{
  const v=p12QaView(id);
  const x=v?.contexts.find(c=>c.kind==='access'&&c.role===role&&c.group.id===groupId);
  return x?p12QaView(id,x.id):null;
};
const rangers=()=>actor('qa-04','club_admin','qa-rangers');
const comets=()=>actor('qa-05','club_admin','qa-comets');
const owner=()=>actor('qa-01','personal_owner','qa-platform');
const assoc=()=>actor('qa-02','association_admin','qa-east');
const dual=()=>actor('qa-18','club_admin','qa-rangers');
const go=(s,a,id,decision)=>applyP12GovernanceAction(s,a,{id,decision});
const row=(s,id)=>inspectP12Governance(s).records.find(r=>r.id===id);

test('P12E: deterministic fictional cases, expired and revoked grants',()=>{
  const s=createP12GovernanceScenario(),view=inspectP12Governance(s);
  assert.equal(s.at,P12_GOVERNANCE_CLOCK);
  assert.equal(view.records.length,9);
  assert.equal(view.pending,7);
  assert.equal(view.expired,1);
  assert.equal(view.active,0);
  assert.equal(row(s,'gov-07').effectiveStatus,'expired-or-invalid');
  assert.equal(row(s,'gov-08').effectiveStatus,'revoked');
  assert.equal(view.containsRealPeople,false);
  assert.equal(view.actualPermissions,false);
  assert.equal(view.canPublish,false);
  assert.equal(s.productionGrantsCreated,false);
});

test('P12E: exact club admin may approve team role and event shows in synthetic audit',()=>{
  const original=createP12GovernanceScenario(),snapshot=structuredClone(original);
  const approved=go(original,rangers(),'gov-01','approve');
  assert.equal(row(approved,'gov-01').effectiveStatus,'active');
  assert.equal(row(approved,'gov-01').approvedBy,'fictional-reviewer-qa-04');
  assert.equal(approved.audit.length,1);
  assert.deepEqual(approved.audit[0],{
    requestId:'gov-01',reviewerProfile:'qa-04',reviewerContext:rangers().selected.id,
    decision:'approve',from:'proposed',to:'active',at:P12_GOVERNANCE_CLOCK,syntheticOnly:true
  });
  assert.deepEqual(original,snapshot);
});

test('P12E: cross-club reviewer and sport participant cannot approve unrelated team',()=>{
  const s=createP12GovernanceScenario();
  assert.ok(go(s,comets(),'gov-01','approve').error,'Comets cannot approve Rangers');
  assert.ok(go(s,rangers(),'gov-04','approve').error,'Rangers cannot approve Comets');
  assert.ok(go(s,actor('qa-07','team_coach','qa-rangers-16'),'gov-01','approve').error);
  assert.ok(go(s,p12QaView('qa-14'),'gov-03','approve').error);
  assert.ok(go(s,p12QaView('qa-12'),'gov-06','approve').error);
  assert.ok(go(s,null,'gov-01','approve').error);
  assert.deepEqual(s.audit,[]);
});

test('P12E: approval is exact role administration, never cross-club data rights',()=>{
  const s=createP12GovernanceScenario();
  assert.equal(inspectP12Governance(s,comets()).records.find(r=>r.id==='gov-03').canApprove,true);
  assert.equal(inspectP12Governance(s,rangers()).records.find(r=>r.id==='gov-03').canApprove,false);
  assert.equal(inspectP12Governance(s,owner()).records.find(r=>r.id==='gov-05').canApprove,true);
  assert.equal(inspectP12Governance(s,rangers()).records.find(r=>r.id==='gov-05').canApprove,false);
  assert.equal(inspectP12Governance(s,assoc()).records.find(r=>r.id==='gov-09').canApprove,true);
  assert.equal(inspectP12Governance(s,rangers()).records.find(r=>r.id==='gov-09').canApprove,false);
  const club=go(s,comets(),'gov-03','approve');
  assert.equal(row(club,'gov-03').effectiveStatus,'active');
  const senior=go(s,owner(),'gov-05','approve');
  assert.equal(row(senior,'gov-05').effectiveStatus,'active');
  const viewer=go(s,assoc(),'gov-09','approve');
  assert.equal(row(viewer,'gov-09').effectiveStatus,'active');
});

test('P12E: self-approval is forbidden despite a second active admin role',()=>{
  const s=createP12GovernanceScenario(),p=dual();
  assert.ok(p);
  assert.equal(inspectP12Governance(s,p).records.find(r=>r.id==='gov-02').canApprove,false);
  assert.equal(go(s,p,'gov-02','approve').error,'Reviewer is not eligible for this exact request');
  const other=go(s,rangers(),'gov-02','approve');
  assert.equal(row(other,'gov-02').effectiveStatus,'active');
});

test('P12E: revoke removes synthetic effective grant while preserving audit history',()=>{
  const s=createP12GovernanceScenario();
  const approved=go(s,rangers(),'gov-01','approve');
  const revoked=go(approved,rangers(),'gov-01','revoke');
  assert.equal(row(revoked,'gov-01').status,'revoked');
  assert.equal(row(revoked,'gov-01').effectiveStatus,'revoked');
  assert.equal(revoked.audit.length,2);
  assert.equal(revoked.audit[1].from,'active');
  assert.equal(revoked.audit[1].to,'revoked');
  assert.ok(go(revoked,rangers(),'gov-01','revoke').error);
  assert.ok(go(revoked,rangers(),'gov-01','approve').error);
  assert.equal(approved.audit.length,1);
  assert.equal(row(approved,'gov-01').effectiveStatus,'active');
});

test('P12E: reject and expired pre-existing grant never become active',()=>{
  const s=createP12GovernanceScenario();
  const rejected=go(s,comets(),'gov-04','reject');
  assert.equal(row(rejected,'gov-04').effectiveStatus,'rejected');
  assert.ok(go(rejected,comets(),'gov-04','approve').error);
  assert.equal(row(s,'gov-07').effectiveStatus,'expired-or-invalid');
  assert.equal(row(s,'gov-08').status,'revoked');
  assert.ok(go(s,assoc(),'gov-08','approve').error);
});

test('P12E: proposal to act as fixture staff can be reviewed but never verifies accreditation',()=>{
  const s=createP12GovernanceScenario();
  const approved=go(s,rangers(),'gov-06','approve');
  assert.equal(row(approved,'gov-06').effectiveStatus,'active');
  assert.equal(row(approved,'gov-06').role,'fixture_staff_viewer');
  assert.equal(approved.productionGrantsCreated,false);
  assert.equal(approved.saved,false);
  assert.equal(approved.published,false);
});

test('P12E: unknown, forged, ambiguous or destructive operations denied',()=>{
  const s=createP12GovernanceScenario();
  for(const id of ['','missing','__proto__','gov-011']){
    assert.ok(go(s,rangers(),id,'approve').error);
  }
  for(const decision of ['publish','grant-identity','enable-medical','delete','']){
    assert.ok(go(s,rangers(),'gov-01',decision).error);
  }
  const corrupt=structuredClone(s);corrupt.productionGrantsCreated=true;
  assert.equal(inspectP12Governance(corrupt),null);
  assert.ok(go(corrupt,rangers(),'gov-01','approve').error);
  const ambiguous=structuredClone(s);ambiguous.records.push(structuredClone(s.records[0]));
  assert.ok(go(ambiguous,rangers(),'gov-01','approve').error);
});

test('P12E: 100 approvals and revocations on fresh scenarios remain isolated',()=>{
  const pristine=createP12GovernanceScenario();
  for(let i=0;i<100;i++){
    const s=createP12GovernanceScenario();
    const reviewed=go(s,rangers(),'gov-01','approve');
    const revoked=go(reviewed,rangers(),'gov-01','revoke');
    assert.equal(revoked.audit.length,2);
    assert.equal(row(revoked,'gov-01').effectiveStatus,'revoked');
    assert.equal(pristine.audit.length,0);
    assert.equal(row(pristine,'gov-01').status,'proposed');
  }
});
