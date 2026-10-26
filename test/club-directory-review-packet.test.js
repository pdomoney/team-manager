import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {CLUB_REFERENCE_RECORDS as records} from '../site/club-directory-data.js';
import {prepareDirectoryReviewPacket} from '../site/club-directory-review-packet.js';
import {makeClubVerificationPlan} from '../site/club-directory-verification-plan.js';

const ledger=JSON.parse(readFileSync(new URL('../config/directory-source-rights.json',import.meta.url),'utf8'));
const id=records[0].id;
const packet=(directoryId=id,rights=ledger)=>prepareDirectoryReviewPacket(records,rights,{directoryId});

test('D3C selects exactly one public candidate, preserves inputs and never grants or verifies',()=>{
  const before=structuredClone(records),rightsBefore=structuredClone(ledger);
  const p=packet();
  assert.equal(p.candidate.directoryId,id);
  assert.equal(p.candidate.name,records[0].name);
  assert.equal(p.candidate.reviewState,'candidate_unverified');
  assert.equal(p.recordScope,'one_exact_public_research_candidate');
  assert.equal(p.reviewGates.length,5);
  assert.ok(p.reviewGates.every(x=>x.status==='not_reviewed'&&x.requiresHumanReview));
  assert.equal(p.status,'REVIEW_HANDOFF_ONLY_NO_DATA_CHANGE');
  assert.equal(p.registration,'not_independently_verified');
  assert.equal(p.sourceRights,'unresolved_until_independent_decision');
  assert.equal(p.verifiedByThisPacket,0);
  for(const flag of ['publicationEligible','canGrantRoles','catalogueChanged','coachWorkspaceChanged'])
    assert.equal(p[flag],false);
  assert.deepEqual(records,before);
  assert.deepEqual(ledger,rightsBefore);
});

test('D3C proposed evidence is blank and deliberately blocked by D3A itself',()=>{
  const p=packet();
  const preflight=makeClubVerificationPlan(records,[p.proposalTemplate]);
  assert.equal(preflight.blockedCount,1);
  assert.equal(preflight.awaitingDecisionCount,0);
  assert.equal(p.proposalPreflight.state,'blocked_until_real_evidence_submitted');
  assert.deepEqual(p.proposalPreflight.issueCodes,preflight.reviews[0].issues);
  for(const field of ['sourceKind','evidenceUrl','rightsDecisionRef','reviewer','officialClubId'])
    assert.equal(p.proposalTemplate[field],'');
});

test('D3C packet omits private and publicly collected contact/source links',()=>{
  const out=JSON.stringify(packet());
  for(const field of ['"email":','"phone":','"sourceUrl":',
    '"website":','"players":','"guardian":','"medical":','"licenceOrConsentRef":'])
    assert.ok(!out.includes(field),field);
  assert.ok(!out.includes(records[0].sourceUrl));
  assert.equal(packet().registration,'not_independently_verified');
});

test('D3C synthetic approved source-ledger claim cannot remove human gates',()=>{
  const fake=structuredClone(ledger);
  const s=fake.sources.find(x=>x.hostname==='bartv.com.au');
  assert.ok(s);
  Object.assign(s,{permissionDecision:'approved',status:'reviewed',reviewedBy:'Fictional reviewer',
    licenceOrConsentRef:'fictional-reference-is-not-a-licence',decisionDate:'2026-10-26',
    termsUrl:'https://example.org/fictional-terms',intendedUse:'public_read_only_directory',
    permittedSourceClasses:['third_party_listing_only'],permittedFields:Object.keys(records[0])});
  const p=packet(id,fake);
  assert.equal(p.publicationEligible,false);
  assert.equal(p.sourceRights,'unresolved_until_independent_decision');
  assert.ok(p.reviewGates.find(x=>x.code==='source_terms').status==='not_reviewed');
});

test('D3C rejects unknown, malformed, ambiguous, noncandidate and invalid-scope records',()=>{
  for(const bad of ['',null,'../coach.enc.json','rlc_abc;--publish','?id=12','--json','x'.repeat(90)])
    assert.throws(()=>packet(bad));
  assert.throws(()=>packet('rlc_does_not_exist'));
  assert.throws(()=>prepareDirectoryReviewPacket([...records,records[0]],ledger,{directoryId:id}));
  assert.throws(()=>prepareDirectoryReviewPacket([{...records[0],status:'verified'}],ledger,{directoryId:id}));
  assert.throws(()=>prepareDirectoryReviewPacket([{...records[0],sport:'Other'}],ledger,{directoryId:id}));
});

test('D3C works across sports and states while keeping all candidates unverified',()=>{
  const found=records.find(x=>x.sport==='Oztag'&&x.state==='QLD');
  assert.ok(found);
  const p=packet(found.id);
  assert.equal(p.candidate.sport,'Oztag');
  assert.equal(p.candidate.state,'QLD');
  assert.equal(p.registration,'not_independently_verified');
});

test('D3C CLI generates exact-ID report without accepting paths or unsupported flags',()=>{
  const cmd=fileURLToPath(new URL('../scripts/prepare-directory-review.mjs',import.meta.url));
  const good=spawnSync(process.execPath,[cmd,'--id',id,'--json'],{encoding:'utf8'});
  assert.equal(good.status,0,good.stderr);
  assert.equal(JSON.parse(good.stdout).proposalPreflight.state,'blocked_until_real_evidence_submitted');
  const text=spawnSync(process.execPath,[cmd,'--id',id],{encoding:'utf8'});
  assert.equal(text.status,0,text.stderr);
  assert.ok(text.stdout.includes('UNVERIFIED RESEARCH CANDIDATE'));
  for(const args of [['--id','/private/backup.enc.json'],['--id','unknown-id'],
    ['--id',id,'--output','/tmp/out'],['--id',id,'--id',id],['--json'],
    ['--id',id,'--json','--json']]){
    const run=spawnSync(process.execPath,[cmd,...args],{encoding:'utf8'});
    assert.equal(run.status,2,args.join(' '));
    assert.equal(run.stdout,'');
  }
});
