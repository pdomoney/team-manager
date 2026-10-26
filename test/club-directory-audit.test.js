import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CLUB_REFERENCE_RECORDS } from '../site/club-directory-data.js';
import { auditClubDirectory } from '../site/club-directory-audit.js';

test('D1 inventory describes exactly the public 275 candidate catalogue without registration claims',()=>{
  const d=auditClubDirectory(CLUB_REFERENCE_RECORDS);
  assert.equal(d.recordCount,275);
  assert.deepEqual(d.bySport,{'Oztag':132,'Rugby league':143});
  assert.deepEqual(d.byStatus,{research_candidate:275});
  assert.equal(d.validation.unreviewedStatusClaims,0);
  assert.equal(d.validation.invalidReviewDates,0);
  assert.equal(d.validation.badSourceUrls,0);
  assert.equal(d.rights.recordCountWithoutExplicitApprovedEvidence,275);
  assert.equal(d.releaseGate,'BLOCKED_UNTIL_SOURCE_RIGHTS_AND_REGISTRATION_EVIDENCE_REVIEW');
  assert.equal(d.technicalInventory,'PASS');
});
test('D1 covers all Australian jurisdictions honestly: missing TAS research does not mean no real clubs',()=>{
  const d=auditClubDirectory(CLUB_REFERENCE_RECORDS);
  assert.equal(d.bySportState['Rugby league | QLD'],14);
  assert.equal(d.bySportState['Rugby league | NSW'],70);
  assert.equal(d.bySportState['Oztag | NSW'],68);
  assert.equal(d.bySportState['Rugby league | TAS'],undefined);
  assert.ok(d.knownCoverageGaps.some(x=>x.state==='TAS'&&x.type==='no_research_candidates_not_zero_real_clubs'));
  assert.ok(d.knownCoverageGaps.some(x=>x.state==='QLD'&&x.type.includes('limited_pilot')));
});
test('D1 duplicate, invalid URL, future date and forged registration status fail technical QA, without auto-fixing',()=>{
  const raw=[{id:'same',name:'A',sport:'Rugby league',state:'NSW',sourceUrl:'https://example.org',sourceClass:'candidate',reviewed:'2026-10-20',status:'research_candidate'}];
  const saved=structuredClone(raw);
  const d=auditClubDirectory([...raw[0]?raw:[],{...raw[0],sourceUrl:'javascript:bad',reviewed:'2099-01-01',status:'verified'}]);
  assert.equal(d.technicalInventory,'REVIEW_REQUIRED');
  for(const code of ['duplicate_directory_id','potential_same_state_name_collision','invalid_source_url','future_review_date','unreviewed_status_claim']){
    assert.ok(d.warnings.some(x=>x.code===code),code);
  }
  assert.equal(d.validation.unreviewedStatusClaims,1);
  assert.deepEqual(raw,saved);
  assert.equal(d.releaseGate,'BLOCKED_UNTIL_SOURCE_RIGHTS_AND_REGISTRATION_EVIDENCE_REVIEW');
});
test('D1 output contains only aggregate inventory and index-based warnings, never contacts or source URLs',()=>{
  const record={id:'x',name:'PRIVATE CLUB NAME',sport:'Rugby league',state:'NSW',sourceUrl:'https://example.org/confidential',sourceClass:'demo',reviewed:'2026-10-20',status:'research_candidate',email:'private@example.org',phone:'0412 000 000'};
  const d=auditClubDirectory([record]);
  const text=JSON.stringify(d);
  for(const phrase of ['PRIVATE CLUB NAME','private@example.org','0412 000 000','https://example.org/confidential'])assert.ok(!text.includes(phrase),phrase);
});
test('D1 CLI reports release blocked and refuses unexpected arguments',()=>{
  const cli=fileURLToPath(new URL('../scripts/audit-club-directory.mjs',import.meta.url));
  const json=spawnSync(process.execPath,[cli,'--json'],{encoding:'utf8'});
  assert.equal(json.status,0,json.stderr);
  const d=JSON.parse(json.stdout);
  assert.equal(d.technicalInventory,'PASS');
  assert.equal(d.rights.recordCountWithoutExplicitApprovedEvidence,275);
  assert.equal(d.releaseGate,'BLOCKED_UNTIL_SOURCE_RIGHTS_AND_REGISTRATION_EVIDENCE_REVIEW');
  const rejected=spawnSync(process.execPath,[cli,'--import-zip','/secret/path'],{encoding:'utf8'});
  assert.equal(rejected.status,2);
  assert.equal(rejected.stdout,'');
});
