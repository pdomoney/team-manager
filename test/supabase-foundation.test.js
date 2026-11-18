import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../supabase/migrations/20261118010000_first_team_private_foundation.sql',import.meta.url),'utf8');
const review=readFileSync(new URL('../supabase/tests/first_team_private_foundation.sql',import.meta.url),'utf8');
const config=readFileSync(new URL('../supabase/config.toml',import.meta.url),'utf8');
const ignore=readFileSync(new URL('../.gitignore',import.meta.url),'utf8');
const tables=['accounts','persons','account_person_links','teams','participations',
  'role_grants','sessions','plays','play_revisions','availability','duties',
  'mutation_receipts','audit_events'];

test('private database foundation covers all thirteen explicitly scoped tables',()=>{
  assert.equal((sql.match(/create table tm_private\./g)||[]).length,tables.length);
  for(const name of tables){
    assert.match(sql,new RegExp('create table tm_private\\.'+name+'\\s*\\('));
    assert.match(sql,new RegExp('alter table tm_private\\.'+name+' enable row level security;'));
    assert.match(sql,new RegExp('alter table tm_private\\.'+name+' force row level security;'));
  }
});

test('no direct Supabase browser role privileges, policies or public table exposure',()=>{
  assert.match(sql,/create schema tm_private;/);
  assert.match(sql,/revoke all on schema tm_private from public, anon, authenticated;/);
  assert.match(sql,/revoke all on all tables in schema tm_private from public, anon, authenticated;/);
  assert.match(sql,/revoke all on all sequences in schema tm_private from public, anon, authenticated;/);
  assert.match(sql,/revoke execute on all functions in schema tm_private from public, anon, authenticated;/);
  assert.doesNotMatch(sql,/create policy\s/i);
  assert.doesNotMatch(sql,/create table public\./i);
  assert.doesNotMatch(sql,/grant [^;]*\bto (?:anon|authenticated|public)\b/i);
  assert.doesNotMatch(sql,/security definer/i);
  assert.match(review,/has_table_privilege\('authenticated'/);
  assert.match(review,/has_table_privilege\('anon'/);
  assert.match(review,/pg_policies/);
});

test('identity linking and exact-team privileges cannot be self-approved',()=>{
  assert.match(sql,/link_no_self_review check \(verified_by is null or verified_by <> user_id\)/);
  assert.match(sql,/grant_no_self_approval check \(approved_by is null or approved_by <> user_id\)/);
  assert.match(sql,/grant_approval_complete check/);
  assert.match(sql,/account_one_verified_person/);
  assert.match(sql,/status <> 'active' or \(verified_by is not null and verified_at is not null\)/);
  assert.match(sql,/role_grants_account_scope/);
});

test('E5 revisions and versioned participant writes remain scoped',()=>{
  assert.match(sql,/e5_payload jsonb not null/);
  assert.match(sql,/published_revision_belongs_to_play/);
  assert.match(sql,/foreign key \(session_id, team_id\)/);
  assert.match(sql,/foreign key \(team_id, person_id\)/);
  assert.match(sql,/resource_version integer not null default 0 check \(resource_version >= 0\)/);
  assert.match(sql,/primary key \(user_id, team_id, mutation_id\)/);
  assert.match(sql,/audit_events_append_only/);
});

test('source-only setup carries no remote project secrets, migration hooks or auto-deploy',()=>{
  assert.match(config,/project_id = "team-manager"/);
  const activeSettings=config.split(/\r?\n/).map(line=>line.trim()).filter(line=>line && !line.startsWith('#'));
  assert.deepEqual(activeSettings,['project_id = "team-manager"']);
  assert.match(ignore,/supabase\/\.env\*/);
  assert.match(ignore,/supabase\/\.temp\//);
  assert.doesNotMatch(sql,/\b(insert into|copy\s+\w+\s+from)\b/i);
});
