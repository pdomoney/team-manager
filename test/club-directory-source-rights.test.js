import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {CLUB_REFERENCE_RECORDS} from '../site/club-directory-data.js';
import {auditSourceRights} from '../site/club-directory-source-rights.js';
const ledger=JSON.parse(readFileSync(new URL('../config/directory-source-rights.json',import.meta.url),'utf8'));
const audit=()=>auditSourceRights(CLUB_REFERENCE_RECORDS,ledger);
test('D2 lists 13 source hosts and 275 research candidates without rights grants',()=>{
 const out=audit();
 assert.equal(out.totalPublicResearchRecords,275);
 assert.equal(out.sourceHostCount,13);
 assert.equal(out.staticLedgerSourceCount,13);
 assert.equal(out.unresolvedRecordCount,275);
 assert.equal(out.unresolvedHostCount,13);
 assert.equal(out.releaseStatus,'BLOCKED_RIGHTS_AND_VERIFICATION_REVIEW');
 assert.equal(out.invalidSourceUrls,0);
 assert.equal(out.futureReviewCount,0);
 assert.equal(out.staleReviewCount,0);
 assert.deepEqual(out.sourceHosts.map(x=>x.hostname),[...out.sourceHosts.map(x=>x.hostname)].sort());
});
test('D2 groups exact original hosts rather than treating subdomains as automatic licences',()=>{
 const out=audit();
 assert.equal(out.sourceHosts.find(x=>x.hostname==='oztag.com.au').records,109);
 assert.equal(out.sourceHosts.find(x=>x.hostname==='prl.mysideline.com.au').records,59);
 assert.equal(out.sourceHosts.find(x=>x.hostname==='portmacquarie.oztag.com.au').records,20);
 assert.equal(out.sourceHosts.find(x=>x.hostname==='nrl.com').records,2);
 assert.equal(out.sourceHosts.find(x=>x.hostname==='bartv.com.au').records,17);
 assert.equal(out.sourceHosts.find(x=>x.hostname==='nrlnt.com.au').records,15);
 assert.equal(out.sourceHosts.find(x=>x.hostname==='nrlwa.com.au').records,27);
 assert.equal(out.sourceHosts.find(x=>x.hostname==='qrl.com.au').records,14);
});
test('D2 flags semicolon-concatenated source URLs for manual remediation',()=>{
 const out=audit();
 assert.equal(out.compoundSourceFields,1);
 assert.ok(out.sourceHosts.find(x=>x.hostname==='nswoztag.au').compoundSourceFields===1);
 assert.ok(out.warnings.some(x=>x.code==='multiple_source_urls_in_one_field'));
});
test('D2 NRL terms page is a lead and not a grant; official-looking sources stay unapproved',()=>{
 const out=audit();
 const nrl=out.sourceHosts.find(x=>x.hostname==='nrl.com');
 assert.equal(nrl.termsLocated,true);
 assert.equal(nrl.rights,'unresolved');
 assert.equal(nrl.status,'terms_identified_review_required');
 const official=out.sourceHosts.find(x=>x.hostname==='oztag.com.au');
 assert.ok(official.sourceClasses.includes('official_registration_portal'));
 assert.equal(official.rights,'unresolved');
});
test('D2 only accepts an explicitly reviewed, dated, complete, scoped record in synthetic fixtures',()=>{
 const c=[{id:'id1',name:'Fictional source',sport:'Oztag',state:'NSW',
  sourceUrl:'https://example.org/club',sourceClass:'research_lead',status:'research_candidate',reviewed:'2026-10-20'}];
 const e={schemaVersion:1,sources:[{hostname:'example.org',permissionDecision:'approved',status:'reviewed',
  termsUrl:'https://example.org/terms',reviewedBy:'Authorised reviewer',decisionDate:'2026-10-26',
  licenceOrConsentRef:'evidence-ref:fictional-mocked-written-consent',
  intendedUse:'public_read_only_directory',
  permittedSourceClasses:['research_lead'],permittedFields:Object.keys(c[0])}]};
 assert.equal(auditSourceRights(c,e).unresolvedRecordCount,0);
 assert.equal(auditSourceRights(c,e).releaseStatus,'TECHNICAL_EVIDENCE_PRESENT_HUMAN_SIGNOFF_REQUIRED');
 const broken=structuredClone(e);
 broken.sources[0].permittedFields=['name'];
 assert.equal(auditSourceRights(c,broken).unresolvedRecordCount,1);
 broken.sources[0].permittedFields=Object.keys(c[0]);
 broken.sources[0].termsUrl='javascript:alert(1)';
 assert.equal(auditSourceRights(c,broken).unresolvedRecordCount,1);
 broken.sources[0].termsUrl='https://example.org/terms';
 broken.sources[0].expiresAt='2026-10-25';
 assert.equal(auditSourceRights(c,broken).unresolvedRecordCount,1);
 broken.sources[0].expiresAt=null;
 broken.sources[0].decisionDate='2026-10-27';
 assert.equal(auditSourceRights(c,broken).unresolvedRecordCount,1);
});
test('D2 neither mutates any source records nor embeds source URLs/person details in aggregated output',()=>{
 const x=structuredClone(CLUB_REFERENCE_RECORDS);
 const out=audit();
 assert.deepEqual(CLUB_REFERENCE_RECORDS,x);
 const str=JSON.stringify(out);
 assert.ok(!str.includes('https://prl.mysideline.com.au/competitions/'));
 assert.ok(!str.includes('"club_name"'));
 assert.ok(!str.includes('"email":"'));
});
test('D2 CLI accepts only no args or --json, and documents release gate',()=>{
 const cli=fileURLToPath(new URL('../scripts/audit-source-rights.mjs',import.meta.url));
 const x=spawnSync(process.execPath,[cli,'--json'],{encoding:'utf8'});
 assert.equal(x.status,0,x.stderr);
 assert.equal(JSON.parse(x.stdout).unresolvedRecordCount,275);
 assert.equal(JSON.parse(x.stdout).releaseStatus,'BLOCKED_RIGHTS_AND_VERIFICATION_REVIEW');
 const denied=spawnSync(process.execPath,[cli,'--read-private-workspace'],{encoding:'utf8'});
 assert.equal(denied.status,2);
 assert.equal(denied.stdout,'');
});
