import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {CLUB_REFERENCE_RECORDS as records} from '../site/club-directory-data.js';
import {auditDirectorySourceObservations as audit} from '../site/club-directory-source-observations.js';
const evidence=JSON.parse(readFileSync(new URL('../config/directory-source-observations.json',import.meta.url),'utf8'));
const first='rlc_c4d2672383f09c',second='rlc_1004b6ffaa6d1e';
const run=(rows=records,ledger=evidence,opts={})=>audit(rows,ledger,opts);

test('D3D contains two public ACT official-site observations and never changes the 275 candidate catalogue',()=>{
 const before=structuredClone(records),old=structuredClone(evidence);
 const out=run();
 assert.equal(out.observationCount,2);
 assert.equal(out.returnedCount,2);
 assert.equal(records.length,275);
 assert.deepEqual(out.items.map(x=>x.directoryId),[first,second]);
 assert.ok(out.items.every(x=>x.reviewState==='observation_only_not_verified'));
 assert.ok(out.items.every(x=>x.candidateState==='ACT'&&x.candidateSport==='Rugby league'));
 assert.equal(out.registrationsVerified,0);
 assert.equal(out.sourceRightsApproved,0);
 assert.equal(out.mayPublish,false);
 assert.equal(out.mayGrantRoles,false);
 assert.equal(out.catalogueChanged,false);
 assert.equal(out.coachWorkspaceChanged,false);
 assert.deepEqual(records,before);
 assert.deepEqual(evidence,old);
});
test('D3D identifies Seniors as a source identity variant, not an automatic rename',()=>{
 const out=run();
 assert.equal(out.items[0].candidateName,'Belconnen United Sharks');
 assert.equal(out.items[0].observedName,'Belconnen United Sharks Seniors');
 assert.equal(out.items[1].candidateName,'Gungahlin Bulls');
 assert.equal(out.items[1].observedName,'Gungahlin Bulls Seniors');
 assert.ok(out.items.every(x=>x.nameAssessment==='source_name_variant_manual_reconciliation'));
 assert.ok(out.items.every(x=>x.identityScopeHint==='seniors_named_separately_from_juniors'));
 assert.ok(out.items.every(x=>x.requiresIndependentIdentityReview&&x.requiresSourceRightsReview));
 assert.ok(out.items.every(x=>x.registration==='not_independently_verified'&&!x.mayUpdateCatalogue&&!x.mayGrantClubAccess));
});
test('D3D exact candidate filter cannot return another club',()=>{
 const out=run(records,evidence,{directoryId:second});
 assert.equal(out.returnedCount,1);
 assert.equal(out.items[0].directoryId,second);
 assert.throws(()=>run(records,evidence,{directoryId:'rlc_nonexistent'}));
 assert.throws(()=>run(records,evidence,{directoryId:'../../private.json'}));
});
test('D3D rejects unverifiable host, username, private path, altered sport and fabricated status',()=>{
 const mutate=(overrides)=>({schemaVersion:1,observations:[{...evidence.observations[0],...overrides}]});
 for(const value of ['https://example.com/Competitions/Club/unknown',
  'http://www.playrugbyleague.com/Competitions/Club/example',
  'https://admin:secret@www.playrugbyleague.com/Competitions/Club/example',
  'javascript:alert(1)'])
   assert.throws(()=>run(records,mutate({sourceUrl:value})),value);
 assert.throws(()=>run(records,mutate({candidateState:'NSW'})));
 assert.throws(()=>run(records,mutate({reviewStatus:'verified'})));
 assert.throws(()=>run(records,mutate({reuseApproved:true})));
});
test('D3D fails closed on duplicate IDs, nonexistent IDs, future observation and unsafe evidence',()=>{
 const dupe=structuredClone(evidence);dupe.observations.push({...dupe.observations[0]});
 assert.throws(()=>run(records,dupe));
 const bad={schemaVersion:1,observations:[{...evidence.observations[0],directoryId:'not-present'}]};
 assert.throws(()=>run(records,bad));
 assert.throws(()=>run(records,{schemaVersion:1,observations:[{...evidence.observations[0],observedAt:'2026-12-01'}]}));
 assert.throws(()=>run(records,{schemaVersion:1,observations:[{...evidence.observations[0],observedAt:'2026-02-30'}]}));
 assert.throws(()=>run([...records,records[0]],evidence));
});
test('D3D source record never authorises reuse or updates despite a matching public name',()=>{
 const same={schemaVersion:1,observations:[{...evidence.observations[0],observedName:records[0].name,
    identityScopeHint:'scope_requires_manual_resolution'}]};
 const p=run(records,same).items[0];
 assert.equal(p.nameAssessment,'name_matches_but_identity_still_unverified');
 assert.equal(p.sourceReuse,'not_approved_by_observation');
 assert.equal(p.mayUpdateCatalogue,false);
});
test('D3D CLI emits safe public evidence links and rejects private-path or extra args',()=>{
 const cli=fileURLToPath(new URL('../scripts/audit-directory-source-observations.mjs',import.meta.url));
 const all=spawnSync(process.execPath,[cli,'--json'],{encoding:'utf8'});
 assert.equal(all.status,0,all.stderr);
 assert.equal(JSON.parse(all.stdout).items.length,2);
 const exact=spawnSync(process.execPath,[cli,'--id',first,'--json'],{encoding:'utf8'});
 assert.equal(exact.status,0,exact.stderr);
 assert.equal(JSON.parse(exact.stdout).items[0].directoryId,first);
 for(const args of [['--id','/private/coach.enc.json'],['--id','bad_id'],
    ['--output','data.json'],['--id',first,'--id',first],['--json','--json']]){
   const p=spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});
   assert.equal(p.status,2,args.join(' '));
   assert.equal(p.stdout,'');
 }
});
