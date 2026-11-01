import test from 'node:test';
import assert from 'node:assert/strict';
import {
  P12_STAFFING_POLICY,makeP12FixtureStaffingScenario,
  assessP12FixtureActingDuty,proposeP12FixtureReview
} from '../site/p12-fixture-role-review.js';

const make=()=>makeP12FixtureStaffingScenario('qa-rangers-16');
const safety=s=>s.baselineSafetyId;
const orange=s=>s.participants.find(x=>x.personId===s.baselineSafetyId);
const backup=s=>s.participants.find(x=>x.role==='Sports trainer (blue)');
const manager=s=>s.participants.find(x=>x.role==='Team Manager');
const input=(s,options={})=>({
  candidatePersonId:s.baselineSafetyId,duty:'acting_coach',
  replacesPersonId:s.baselineCoachId,headCoachUnavailable:true,
  ...options
});
const review=(s,options)=>assessP12FixtureActingDuty(s,input(s,options));

test('P12F: exact official NSWRL 2026 policy and section are source-linked, not a generic sport rule',()=>{
  assert.equal(P12_STAFFING_POLICY.id,'nswrl-community-2026');
  assert.equal(P12_STAFFING_POLICY.section,'4.8, page 103');
  assert.ok(P12_STAFFING_POLICY.sourceUrl.startsWith('https://www.nswrl.com.au/'));
  assert.equal(P12_STAFFING_POLICY.coachAndRequiredSafetyDifferentPeople,true);
  assert.equal(P12_STAFFING_POLICY.u16PlusRegisteredAccreditedTrainerAtVenue,true);
  assert.equal(P12_STAFFING_POLICY.authorisesMatchStart,false);
  assert.equal(P12_STAFFING_POLICY.approvedLocalCompetitionPolicy,false);
  assert.ok(P12_STAFFING_POLICY.externalPolicyNeeded.includes('section 1.2'));
});

test('P12F: synthetic fixture has stable, separate, unverified candidate and duty nominations',()=>{
  const x=make();
  assert.equal(x.sport,'Rugby league');
  assert.equal(x.ageGroup,'U16');
  assert.equal(x.policyId,P12_STAFFING_POLICY.id);
  assert.equal(x.participants.length,10);
  assert.notEqual(x.baselineCoachId,x.baselineSafetyId);
  assert.equal(orange(x).role,'Sports trainer (orange)');
  assert.equal(x.participants.every(p=>p.registration==='unverified'&&
    p.accreditation==='unverified'&&!p.grantsAccess),true);
  assert.equal(x.actualComplianceVerified,false);
  assert.equal(x.published,false);
  assert.deepEqual(x.audit,[]);
});

test('P12F: Trainer becomes Acting Coach only if required safety duty covered by different person',()=>{
  const x=make();
  const blocked=review(x);
  assert.equal(blocked.status,'blocked');
  assert.ok(blocked.blockers.includes('required-safety-position-left-vacant'));
  assert.equal(blocked.canStartMatch,false);
  const same=review(x,{replacementSafetyPersonId:safety(x)});
  assert.ok(same.blockers.includes('coach-and-required-safety-must-be-distinct'));
  const covered=review(x,{replacementSafetyPersonId:backup(x).personId});
  assert.equal(covered.status,'review-required');
  assert.equal(covered.blockers.length,0);
  assert.ok(covered.warnings.includes('trainer-original-duty-must-be-replaced'));
  assert.ok(covered.verificationRequired.includes('independent-registration-check'));
  assert.ok(covered.verificationRequired.includes('NRL-on-field-policy-section-1.2-age-grade-coverage'));
  assert.ok(covered.warnings.includes('NSWRL-u16-plus-registered-accredited-trainer-at-venue-required'));
  assert.equal(covered.registrationVerified,false);
  assert.equal(covered.accreditationVerified,false);
  assert.equal(covered.automaticApproval,false);
  assert.equal(covered.actualStaffingChanged,false);
  assert.equal(covered.canStartMatch,false);
});

test('P12F: acting coach requires an actual absent head coach with exact replacement reference',()=>{
  const s=make();
  assert.ok(review(s,{headCoachUnavailable:false,replacementSafetyPersonId:backup(s).personId})
    .blockers.includes('head-coach-absence-not-confirmed'));
  assert.ok(review(s,{replacesPersonId:'',replacementSafetyPersonId:backup(s).personId})
    .blockers.includes('acting-coach-must-identify-replaced-coach'));
  assert.ok(review(s,{replacesPersonId:s.baselineCoachId,replacementSafetyPersonId:s.baselineCoachId})
    .blockers.includes('unavailable-coach-cannot-cover-safety'));
  assert.ok(review(s,{replacesPersonId:'qa-stars-women-staff-person-1'}).blockers
    .includes('replacement-reference-not-on-this-team'));
});

test('P12F: Team Manager acting as Trainer retains management duty and needs checked eligibility',()=>{
  const s=make(),candidate=manager(s);
  const r=assessP12FixtureActingDuty(s,{
    candidatePersonId:candidate.personId,duty:'trainer',at:'2026-11-07T01:00:00Z'
  });
  assert.equal(r.status,'review-required');
  assert.ok(r.warnings.includes('team-manager-original-duty-coverage-to-confirm'));
  assert.equal(r.canStartMatch,false);
  assert.equal(r.automaticApproval,false);
  assert.equal(s.participants.find(x=>x.personId===candidate.personId).role,'Team Manager');
  assert.deepEqual(s.audit,[]);
});

test('P12F: actual scheduled head coach cannot simultaneously be the required safety person',()=>{
  const s=make();
  const r=assessP12FixtureActingDuty(s,{
    candidatePersonId:s.baselineCoachId,duty:'trainer',
    headCoachUnavailable:false
  });
  assert.ok(r.blockers.includes('head-coach-cannot-also-be-required-onfield-safety'));
});

test('P12F: Oztag and Touch never borrow 2026 NSWRL coach/trainer rules',()=>{
  for(const id of ['qa-comets-mixed','qa-stars-women']){
    const s=makeP12FixtureStaffingScenario(id);
    assert.equal(s.policyId,'unverified');
    assert.equal(s.baselineSafetyId,null);
    const x=assessP12FixtureActingDuty(s,{
      candidatePersonId:s.participants[2].personId,duty:'trainer'
    });
    assert.equal(x.status,'blocked');
    assert.ok(x.blockers.includes('competition-policy-not-reviewed'));
    assert.equal(x.ruleProfile,'unverified');
    assert.equal(x.canStartMatch,false);
    const forged=structuredClone(s);forged.policyId=P12_STAFFING_POLICY.id;
    const y=assessP12FixtureActingDuty(forged,{
      candidatePersonId:forged.participants[2].personId,duty:'trainer'
    });
    assert.ok(y.blockers.includes('rugby-league-policy-not-transferable'));
  }
});

test('P12F: temporal expiry is exact fixture-end and prevents later reviews',()=>{
  const s=make();
  const before=review(s,{at:'2026-11-06T23:59:59Z'});
  assert.equal(before.status,'blocked');
  assert.ok(before.blockers.includes('fixture-not-started'));
  const active=review(s,{replacementSafetyPersonId:backup(s).personId,
    at:'2026-11-07T02:59:59Z'});
  assert.equal(active.status,'review-required');
  const ending=review(s,{at:s.fixtureEnd});
  assert.equal(ending.status,'expired');
  assert.equal(ending.expired,true);
  assert.equal(ending.canStartMatch,false);
  assert.equal(proposeP12FixtureReview(s,input(s,{at:s.fixtureEnd}),'qa-04').error,
    'Malformed or ended fixture proposal');
});

test('P12F: suspicious cross-team IDs, bad timestamps, or unsupported duties fail closed',()=>{
  const s=make();
  for(const options of [
    {candidatePersonId:'qa-stars-women-staff-person-1'},
    {replacementSafetyPersonId:'qa-comets-mixed-volunteer-person-3'},
    {duty:'club_admin'},
    {at:'2026-11-07Tinvalid'},
    {at:'2026-02-30T01:00:00Z'}
  ]){
    const r=review(s,options);
    assert.equal(r.status,'blocked');
    assert.equal(r.canStartMatch,false);
  }
  assert.equal(makeP12FixtureStaffingScenario('unknown-team'),null);
  assert.equal(assessP12FixtureActingDuty(null,{}).status,'blocked');
  const corrupted=structuredClone(s);corrupted.committed=true;
  assert.ok(assessP12FixtureActingDuty(corrupted,input(s)).blockers.includes('invalid-or-foreign-scenario'));
  const long=structuredClone(s);long.fixtureEnd='2026-11-09T00:00:00Z';
  assert.ok(assessP12FixtureActingDuty(long,input(s)).blockers.includes('invalid-or-foreign-scenario'));
});

test('P12F: a fictional review logs analysis, never mutates the permanent staff or approves fixture',()=>{
  const s=make(),original=structuredClone(s);
  const result=proposeP12FixtureReview(s,input(s,{replacementSafetyPersonId:backup(s).personId}),'qa-04');
  assert.equal(result.audit.length,1);
  assert.deepEqual(result.audit[0],{
    event:'fictional-staffing-impact-reviewed',reviewer:'qa-04',
    fixtureId:s.fixtureId,personId:s.baselineSafetyId,duty:'acting_coach',
    reviewStatus:'review-required',blockerCount:0,expiresAt:s.fixtureEnd,
    actualApproval:false,actualRoleChange:false
  });
  assert.deepEqual(s,original);
  assert.equal(result.actualComplianceVerified,false);
  assert.equal(result.published,false);
  assert.equal(result.committed,false);
});

test('P12F: repeated scenarios are disposable and never accumulate approved grants',()=>{
  for(let i=0;i<80;i++){
    const s=make();
    const result=proposeP12FixtureReview(s,input(s),'qa-18');
    assert.equal(result.audit[0].blockerCount>0,true);
    assert.equal(make().audit.length,0);
    assert.equal(result.participants.every(x=>!x.grantsAccess),true);
  }
});
