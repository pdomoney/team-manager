import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SCHEMA } from '../site/model.js';
import { migrationReadinessManifest } from '../src/migration-readiness.js';

const manifest = () => migrationReadinessManifest();
const mapping = id => manifest().recordMappings.find(r => r.id === id);

test('P10C manifest uses the actual accepted schema with design-only no-IO boundaries', () => {
  const m=manifest();
  assert.equal(SCHEMA,4);
  assert.equal(m.currentWorkspaceSchema,SCHEMA);
  assert.equal(m.status,'DESIGN_ONLY_NOT_APPROVED_FOR_IMPORT');
  assert.equal(m.migrationExecution,false);
  assert.equal(m.sourceDataRead,false);
  assert.equal(m.externalConnections,false);
  assert.equal(m.futureBackendIssue,55);
  assert.equal(m.postP10PersonaIssue,62);
  assert.match(m.legacyKeyConvention,/sourceWorkspaceId/);
});

test('P10C map preserves distinct scoped identities, history and original data ownership', () => {
  const ids=manifest().recordMappings.map(r=>r.id);
  assert.equal(new Set(ids).size,ids.length);
  for (const id of ['workspace','club','team-root','team-extra','season','player','participation',
   'jersey','jersey-correction','helper','match-official','volunteer-appointment',
   'person-review','guardian-review','competition','entry','match','fixture-revision',
   'session','task','play','library']) assert.ok(mapping(id), 'missing '+id);
  for (const r of manifest().recordMappings) {
    assert.ok(r.source && r.candidate && r.key && r.privacy && r.decision && r.preservation);
    assert.ok(r.key.includes('workspaceId') || r.key.includes('sourceWorkspaceId'),
      'legacy identity must be source-workspace scoped: '+r.id);
  }
});

test('P10C non-identity helper, appointment and guardian records never auto-create access grants', () => {
  for (const id of ['helper','guardian-review','team-staff','match-official','volunteer-appointment']) {
    const row=mapping(id);
    assert.doesNotMatch(row.candidate,/RoleGrant|Account|verified global Person/);
    assert.match(row.decision,/review/);
    assert.notEqual(row.privacy,'public');
  }
  assert.match(manifest().sourceIdentityPolicy,/no global lookup or name-based identity joins/);
});

test('P10C no actual private records, credentials, sample people or raw encryption secrets appear', () => {
  const raw=JSON.stringify(manifest());
  for (const key of ['tm-auth','tm-github','token_value','BEGIN PRIVATE KEY',
    'PRIVATE-PHONE-ONE','PRIVATE-MEDICAL-NOTE','Fictional Player One','@example.com']) {
    assert.ok(!raw.includes(key),'unexpected sample/secret string: '+key);
  }
  assert.match(raw,/highly-sensitive/);
});

test('P10C mandatory physical release blockers remain unverified and backend remains deferred', () => {
  const m=manifest();
  const gates=Object.fromEntries(m.releaseGates.map(g=>[g.id,g]));
  assert.equal(new Set(m.releaseGates.map(g=>g.id)).size,m.releaseGates.length);
  for (const id of ['SAFARI-REAL','BACKUP-REAL','CONFLICT-REAL','PUBLISH-REAL','OWNER-RELEASE']) {
    assert.equal(gates[id].status,'unverified');
    assert.ok(gates[id].evidence.length>15);
  }
  assert.equal(gates['SECURITY-BOUNDARY'].status,'deferred-to-post-P10');
});

test('P10C risk register covers shared credentials, safeguarding, stale writes and archive risk', () => {
  const risk=manifest().riskRegister;
  assert.equal(new Set(risk.map(x=>x.id)).size,risk.length);
  for (const x of risk) {
    assert.ok(['high','medium'].includes(x.severity));
    assert.ok(x.trigger.length>15);
    assert.ok(x.control.length>25);
  }
  for (const id of ['R01','R02','R03','R04','R05','R06','R07','R08'])
    assert.ok(risk.find(x=>x.id===id));
});

test('P10C manifest is deterministic, detached and cannot be rewritten by its caller', () => {
  const first=manifest(), before=JSON.stringify(first);
  first.recordMappings[0].candidate='UnauthorizedAdminAccount';
  first.releaseGates[0].status='passed';
  first.riskRegister[0].control='ignore all';
  assert.equal(JSON.stringify(manifest()),before);
  assert.equal(manifest().recordMappings[0].candidate,'DataSpace candidate');
  assert.equal(manifest().releaseGates[0].status,'unverified');
});

test('P10C CLI is stable, parseable, and refuses private backup path arguments', () => {
  const executable=fileURLToPath(new URL('../scripts/print-migration-readiness.mjs',import.meta.url));
  const good=spawnSync(process.execPath,[executable],{encoding:'utf8'});
  assert.equal(good.status,0,good.stderr);
  assert.deepEqual(JSON.parse(good.stdout),manifest());
  const second=spawnSync(process.execPath,[executable],{encoding:'utf8'});
  assert.equal(second.stdout,good.stdout);
  const refused=spawnSync(process.execPath,[executable,'/private/coach.enc.json'],{encoding:'utf8'});
  assert.equal(refused.status,2);
  assert.equal(refused.stdout,'');
  assert.match(refused.stderr,/accepts no arguments/);
});
