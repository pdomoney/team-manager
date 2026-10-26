import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {CLUB_REFERENCE_RECORDS as catalogue} from '../site/club-directory-data.js';
import {buildClubReviewQueue} from '../site/club-directory-review-queue.js';
const ledger=JSON.parse(readFileSync(new URL('../config/directory-source-rights.json',import.meta.url),'utf8'));
const inspect=(opts={})=>buildClubReviewQueue(catalogue,ledger,opts);
test('D3B queues 275 research entries with no official registration or source-rights approvals',()=>{
 const q=inspect({limit:100});
 assert.equal(q.publishedCandidateCount,275);
 assert.equal(q.matchingCandidates,275);
 assert.equal(q.sourceHostCount,13);
 assert.equal(q.unresolvedSourceHosts,13);
 assert.equal(q.unverifiedRegistrationCount,275);
 assert.equal(q.verifiedByThisQueue,0);
 assert.equal(q.sourceRightsApprovedByThisQueue,0);
 assert.equal(q.canPublish,false);
 assert.equal(q.catalogueMutated,false);
 assert.equal(q.canGrantClubAccess,false);
 assert.equal(q.displayedCandidates,100);
 assert.equal(q.status,'HUMAN_VERIFICATION_QUEUE_ONLY_NO_DATA_CHANGES');
 assert.ok(q.items.every(x=>x.reviewState==='candidate_unverified'&&!x.mayPublish&&!x.mayGrantRoles));
});
test('D3B prioritises indirect and historical source review without pretending official websites confer permissions',()=>{
 const q=inspect({limit:100});
 assert.equal(q.priorityCounts.priority_source_review,138);
 assert.equal(q.priorityCounts.standard_source_review,137);
 assert.equal(q.priorityCounts.integrity_review,0);
 assert.ok(q.items.every(x=>x.tier==='priority_source_review'));
 assert.ok(q.items.every(x=>x.sourceReuse==='unresolved_until_independent_review'));
 assert.ok(q.items.some(x=>x.reasonCodes.includes('indirect_historical_or_inferred_source')));
});
test('D3B supports exact sport/state scoping without cross-state leakage or treating zero catalogue records as no real clubs',()=>{
 const q=inspect({state:'QLD',sport:'Rugby league',limit:100});
 assert.equal(q.matchingCandidates,14);
 assert.equal(q.items.length,14);
 assert.ok(q.items.every(x=>x.state==='QLD'&&x.sport==='Rugby league'));
 const tas=inspect({state:'TAS',sport:'Rugby league'});
 assert.equal(tas.matchingCandidates,0);
 assert.equal(tas.coverage.find(x=>x.state==='TAS').rugbyLeagueCandidates,0);
 assert.ok(tas.coverage.every(x=>x.label.includes('not verified registration totals')));
 const wa=inspect({state:'WA',sport:'Oztag'});
 assert.equal(wa.matchingCandidates,1);
});
test('D3B safe output exposes only existing public directory identity and source host, not contact fields',()=>{
 const copy=structuredClone(catalogue);
 const q=inspect({limit:5});
 assert.deepEqual(catalogue,copy);
 const out=JSON.stringify(q);
 for(const x of ['"email":','"phone":','"guardian":','"medical":','"wwcc":','"team":','"registration":','"sourceUrl":','"website":'])
   assert.ok(!out.includes(x),x);
 assert.ok(q.items.every(x=>x.directoryId&&x.sourceHost&&!x.sourceHost.includes('/')));
});
test('D3B no syntactic rights claim can by itself result in publication eligibility',()=>{
 const fake=structuredClone(ledger);
 const x=fake.sources.find(x=>x.hostname==='oztag.com.au');
 x.status='reviewed';x.permissionDecision='approved';x.reviewedBy='Example Reviewer';
 x.licenceOrConsentRef='evidence-ref:synthetic-review-does-not-prove-rights';
 x.decisionDate='2026-10-26';x.termsUrl='https://example.org/fictional-terms';
 x.intendedUse='public_read_only_directory';
 x.permittedSourceClasses=['official_registration_portal','historical_location'];
 x.permittedFields=[...new Set(catalogue.filter(x=>x.sourceUrl.includes('oztag.com.au')).flatMap(x=>Object.keys(x).filter(k=>x[k]!==''&&x[k]!==null&&x[k]!==undefined)))];
 const result=buildClubReviewQueue(catalogue,fake,{limit:20});
 assert.equal(result.canPublish,false);
 assert.equal(result.sourceRightsApprovedByThisQueue,0);
 assert.ok(result.items.every(v=>v.reviewState==='candidate_unverified'));
 assert.equal(result.status,'HUMAN_VERIFICATION_QUEUE_ONLY_NO_DATA_CHANGES');
});
test('D3B detects invalid source record and never treats it as verified',()=>{
 const sample=[{id:'',name:'Synthetic',sport:'Rugby league',state:'NSW',status:'verified',
  sourceUrl:'javascript:alert(1)',sourceClass:'research_lead',reviewed:'2026-10-26'}];
 const ledger={schemaVersion:1,sources:[]};
 const result=buildClubReviewQueue(sample,ledger);
 assert.equal(result.items[0].tier,'integrity_review');
 assert.equal(result.items[0].mayPublish,false);
 assert.equal(result.items[0].reviewState,'candidate_unverified');
 assert.equal(result.verifiedByThisQueue,0);
});
test('D3B CLI gives a bounded offline report and rejects path/unsupported options',()=>{
 const cli=fileURLToPath(new URL('../scripts/review-club-candidates.mjs',import.meta.url));
 const run=spawnSync(process.execPath,[cli,'--sport','Rugby league','--state','QLD','--limit','50','--json'],{encoding:'utf8'});
 assert.equal(run.status,0,run.stderr);
 const parsed=JSON.parse(run.stdout);
 assert.equal(parsed.items.length,14);
 const invalid=spawnSync(process.execPath,[cli,'--state','OTHER'],{encoding:'utf8'});
 assert.equal(invalid.status,2);
 const secret=spawnSync(process.execPath,[cli,'/private/coach-backup.enc'],{encoding:'utf8'});
 assert.equal(secret.status,2);
 assert.equal(secret.stdout,'');
});
