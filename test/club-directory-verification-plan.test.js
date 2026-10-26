import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {CLUB_REFERENCE_RECORDS} from '../site/club-directory-data.js';
import {makeClubVerificationPlan} from '../site/club-directory-verification-plan.js';
const candidates=()=>CLUB_REFERENCE_RECORDS;
const first=()=>candidates()[0];
const synthetic=(r=first())=>({
 directoryId:r.id,sport:r.sport,state:r.state,
 sourceKind:'governing_body_club_directory',
 evidenceUrl:'https://governing.example.org/clubs/fake-id',
 evidenceRef:'evidence-ref:synthetic-no-real-approval',
 rightsDecisionRef:'evidence-ref:synthetic-terms-not-a-licence',
 reviewer:'Example Reviewer',reviewedAt:'2026-10-26',officialClubId:'SYNTH-ID-1',
 proposedFields:{suburb:'Example suburb'},
});
test('D3A dry-run keeps all 275 unverified and identifies state coverage gaps without inventing totals',()=>{
 const before=structuredClone(candidates());
 const plan=makeClubVerificationPlan(candidates());
 assert.equal(plan.recordCount,275);
 assert.equal(plan.bySport['Rugby league'],143);
 assert.equal(plan.bySport.Oztag,132);
 assert.equal(plan.coverage.find(x=>x.state==='TAS').rugbyLeagueCandidates,0);
 assert.equal(plan.coverage.find(x=>x.state==='QLD').rugbyLeagueCandidates,14);
 assert.ok(plan.coverage.every(x=>x.label.includes('not verified registration totals')));
 assert.equal(plan.proposalsReceived,0);
 assert.equal(plan.catalogueChanged,false);
 assert.equal(plan.verifiedRegistrationCountFromThisPlan,0);
 assert.equal(plan.rightsClearanceGranted,false);
 assert.equal(plan.rolesGranted,false);
 assert.equal(plan.status,'DRY_RUN_ONLY_NO_REGISTRATIONS_VERIFIED');
 assert.deepEqual(candidates(),before);
});
test('D3A fully populated synthetic proposal awaits independent approval and cannot auto-promote registration',()=>{
 const p=synthetic(),raw=structuredClone(p);
 const plan=makeClubVerificationPlan(candidates(),[p]);
 assert.equal(plan.blockedCount,0);
 assert.equal(plan.awaitingDecisionCount,1);
 assert.equal(plan.reviews[0].stateOfReview,'awaiting_independent_owner_decision');
 assert.equal(plan.reviews[0].mayChangeDirectory,false);
 assert.equal(plan.reviews[0].mayGrantPermissions,false);
 assert.equal(plan.verifiedRegistrationCountFromThisPlan,0);
 assert.deepEqual(p,raw);
});
test('D3A rejects cross-state substitutions, untrusted claims and forbidden fields',()=>{
 const p=synthetic();
 p.state='VIC';
 p.sourceKind='third_party_news';
 p.evidenceUrl='javascript:alert(1)';
 p.reviewedAt='2026-10-27';
 p.requestedStatus='verified';
 p.publish=true;
 p.assignRole=true;
 p.proposedFields={status:'verified',players:'names',phone:'privateNotes'};
 const z=makeClubVerificationPlan(candidates(),[p]);
 const reasons=z.reviews[0].issues;
 for(const c of ['source_identity_scope_mismatch','authoritative_source_type_or_url_not_evidenced',
    'missing_or_future_human_review_evidence','direct_registration_promotion_forbidden',
    'automatic_publish_or_privilege_request_forbidden','field_outside_public_club_allowlist',
    'invalid_or_sensitive_public_field']) assert.ok(reasons.includes(c),c);
 assert.equal(z.blockedCount,1);
 assert.equal(z.catalogueChanged,false);
});
test('D3A rejects missing evidence, stale source checks, and repeats of the same directory ID',()=>{
 const p=synthetic();
 delete p.officialClubId;
 delete p.rightsDecisionRef;
 p.reviewedAt='2020-01-01';
 const z=makeClubVerificationPlan(candidates(),[p,{...p}]);
 assert.equal(z.blockedCount,2);
 assert.ok(z.reviews[0].issues.includes('no_official_club_identity_or_registration_evidence'));
 assert.ok(z.reviews[0].issues.includes('source_rights_decision_not_cited'));
 assert.ok(z.reviews[0].issues.includes('stale_review_evidence'));
 assert.ok(z.reviews[1].issues.includes('multiple_reviews_for_same_directory_id'));
});
test('D3A is fail-closed on unknown IDs and same-state/name collisions, never silently merging clubs',()=>{
 const a=first(),b=candidates().find(x=>x.id!==a.id&&x.state===a.state&&x.sport===a.sport);
 assert.ok(b);
 const collision=synthetic(a);
 collision.proposedFields.name=b.name;
 const result=makeClubVerificationPlan(candidates(),[collision,synthetic({...a,id:'made-up-id'})]);
 assert.equal(result.blockedCount,2);
 assert.ok(result.reviews[0].issues.includes('same_sport_state_name_collision_requires_manual_reconciliation'));
 assert.ok(result.reviews[1].issues.includes('unknown_exact_directory_id'));
});
test('D3A reviewed plan exports only safe index, status and field names, never raw source/private values',()=>{
 const p=synthetic();
 p.evidenceRef='evidence-ref:secret-diagnostic-token';
 p.proposedFields.email='sensitive@example.org';
 const out=JSON.stringify(makeClubVerificationPlan(candidates(),[p]));
 for(const secret of ['secret-diagnostic-token','sensitive@example.org','https://governing.example.org/clubs/fake-id'])
   assert.ok(!out.includes(secret),secret);
 assert.equal(makeClubVerificationPlan(candidates(),[p]).reviews[0].proposedFieldNames[0],'email');
});
test('D3A CLI never reads arbitrary files and refuses malformed/blocked evidence',()=>{
 const cli=fileURLToPath(new URL('../scripts/plan-directory-verification.mjs',import.meta.url));
 const baseline=spawnSync(process.execPath,[cli],{encoding:'utf8'});
 assert.equal(baseline.status,0,baseline.stderr);
 assert.equal(JSON.parse(baseline.stdout).verifiedRegistrationCountFromThisPlan,0);
 const bad=spawnSync(process.execPath,[cli,'--stdin'],{encoding:'utf8',input:JSON.stringify([{directoryId:'unknown'}])});
 assert.equal(bad.status,1,bad.stderr);
 assert.equal(JSON.parse(bad.stdout).blockedCount,1);
 const valid=spawnSync(process.execPath,[cli,'--stdin'],{encoding:'utf8',input:JSON.stringify([synthetic()])});
 assert.equal(valid.status,0,valid.stderr);
 assert.equal(JSON.parse(valid.stdout).awaitingDecisionCount,1);
 const path=spawnSync(process.execPath,[cli,'/private/data.zip'],{encoding:'utf8'});
 assert.equal(path.status,2);
 assert.equal(path.stdout,'');
});
