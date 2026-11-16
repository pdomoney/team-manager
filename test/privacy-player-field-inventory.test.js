import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const policy = JSON.parse(fs.readFileSync(new URL('../config/privacy-player-field-inventory.json',import.meta.url),'utf8'));
const register = JSON.parse(fs.readFileSync(new URL('../config/privacy-decision-register.json',import.meta.url),'utf8'));
const mandatory=['fullName','dateOfBirth','phoneNumber','residentialAddress','profilePhoto'];
const optional=['socialMediaAccounts','otherClubs','otherSports','profession','educationLevel','educationInstitution'];

test('player collection inventory preserves precisely five requested mandatory and six optional categories',()=>{
  assert.equal(policy.schemaVersion,1);
  assert.equal(policy.kind,'team-manager-player-field-policy-inventory');
  assert.equal(policy.classification,'public-policy-metadata-only');
  assert.equal(policy.decisionId,'TM-PR-004');
  assert.equal(policy.productionCollectionAuthorised,false);
  assert.equal(policy.status,'owner-requirements-captured-pending-privacy-review');
  assert.deepEqual(policy.fields.filter(x=>x.ownerRequirement==='proposed-mandatory').map(x=>x.key),mandatory);
  assert.deepEqual(policy.fields.filter(x=>x.ownerRequirement==='proposed-optional').map(x=>x.key),optional);
  assert.equal(new Set(policy.fields.map(x=>x.key)).size,11);
});
test('mandatory request cannot silently authorise child, address, photo, or optional marketing collection',()=>{
  assert.equal(register.decisions.find(x=>x.id==='TM-PR-004').status,'answered-pending-review');
  for(const field of policy.fields){
    assert.equal(field.policyStatus,'review-required',field.key);
    assert.equal(field.approvedForCollection,false,field.key);
    assert.equal(field.approvedForMarketingUse,false,field.key);
    assert.equal(field.minorHandling,'pending-age-specific-decision',field.key);
    assert.equal(field.visibility,'pending-role-by-field-review',field.key);
    assert.equal(field.retention,'undecided',field.key);
    assert.ok(field.reviewFlags.length>=1,field.key);
  }
  const guardian=register.decisions.find(x=>x.id==='TM-PR-006');
  assert.equal(guardian.status,'answered-pending-review');
  assert.equal(guardian.reviewState,'not-reviewed');
  assert.equal(guardian.responseCode,'requires-detailed-policy');
  assert.ok(guardian.clarificationNeeded);
  const junior=register.decisions.find(x=>x.id==='TM-PR-005');
  assert.equal(junior.status,'answered-pending-review');
  assert.equal(junior.reviewState,'not-reviewed');
  assert.equal(junior.responseCode,'junior-own-login-guardian-contact-candidate');
  for(const id of ['TM-PR-007','TM-PR-008','TM-PR-009','TM-PR-013']){
    assert.equal(register.decisions.find(x=>x.id===id).status,'unanswered',id);
  }
});
