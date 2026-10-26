import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {CLUB_REFERENCE_RECORDS as records} from '../site/club-directory-data.js';
import {prepareDirectoryBatchReview,inspectDirectoryBatchDecisions} from '../site/club-directory-batch-review.js';
const ledger=JSON.parse(readFileSync(new URL('../config/directory-source-rights.json',import.meta.url),'utf8'));
const ids=[records[0].id,records.find(x=>x.sport==='Oztag').id];
const batch=(list=ids)=>prepareDirectoryBatchReview(records,ledger,{ids:list});
test('D3E batch groups distinct exact IDs from both sports without a data write',()=>{
 const first=structuredClone(records),rights=structuredClone(ledger);
 const r=batch();assert.equal(r.requested,2);assert.equal(r.packets.length,2);
 assert.equal(r.decisionTemplate.length,2);
 assert.equal(r.sourceRightsApproved,0);assert.equal(r.verifiedRegistrations,0);
 assert.equal(r.publicationEligible,false);assert.equal(r.canUpdateCatalogue,false);
 assert.equal(r.canGrantRoles,false);assert.equal(r.changedCatalogue,false);
 assert.equal(r.changedCoachWorkspace,false);
 assert.ok(r.packets.every(x=>x.publicationEligible===false&&x.registration==='not_independently_verified'));
 assert.ok(r.decisionTemplate.every(x=>x.ownerApprovalRef===''&&x.permittedFields.length===0));
 assert.deepEqual(records,first);assert.deepEqual(ledger,rights);
});
test('D3E malformed, ambiguous and duplicate requests fail the whole batch closed',()=>{
 for(const ids of [[],[ids[0],ids[0]],['../../private'],['unknown'],Array(31).fill(ids[0]),[ids[0],'missing']])
   assert.throws(()=>batch(ids));
 assert.throws(()=>prepareDirectoryBatchReview(records,ledger,{ids,asOf:'2026-02-30'}));
 assert.throws(()=>prepareDirectoryBatchReview([...records,records[0]],ledger,{ids:[ids[0]]}));
});
test('D3E human evidence remains an unapproved independent decision even when fully populated',()=>{
 const b=batch(),first=structuredClone(records);
 const result=inspectDirectoryBatchDecisions(b,[{
  directoryId:ids[0],sourceRightsReviewer:'A',sourceTermsUrl:'https://example.org/terms',
  termsCheckedAt:'2026-10-26',reuseDecisionRef:'fictional',permittedFields:['name'],
  attribution:'credit',withdrawalProcess:'email',identityReviewer:'B',
  officialRegistrationRef:'fictional',identityScopeDecision:'match',ownerApprovalRef:'fictional'
 }]);
 assert.equal(result.canPublish,false);assert.equal(result.verified,0);
 assert.ok(result.rows.every(x=>!x.canPublish&&x.humanReviewNeeded));
 assert.deepEqual(records,first);
 assert.throws(()=>inspectDirectoryBatchDecisions(b,[{directoryId:'unknown'}]));
 assert.throws(()=>inspectDirectoryBatchDecisions(b,[{directoryId:ids[0]},{directoryId:ids[0]}]));
});
test('D3E batch CLI is bounded, stdout only, and rejects arbitrary paths',()=>{
 const cmd=fileURLToPath(new URL('../scripts/prepare-directory-batch.mjs',import.meta.url));
 const good=spawnSync(process.execPath,[cmd,'--ids',ids.join(','),'--json'],{encoding:'utf8'});
 assert.equal(good.status,0,good.stderr);
 const result=JSON.parse(good.stdout);assert.equal(result.returned,2);
 assert.equal(result.canUpdateCatalogue,false);
 for(const args of [['--ids','../../private'],['--ids',ids[0]+','+ids[0]],['--json'],
  ['--ids',ids[0],'--output','/tmp/file'],['--ids','unknown']]){
  const r=spawnSync(process.execPath,[cmd,...args],{encoding:'utf8'});
  assert.equal(r.status,2,args.join(' '));assert.equal(r.stdout,'');
 }
});
