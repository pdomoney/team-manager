-- Team Manager first-team Supabase foundation. SCHEMA ONLY, NOT A LIVE RELEASE.
-- This migration is deliberately inaccessible to all browser/API identities.
-- Never run against the linked project until a separately approved migration preflight.
-- The repository does not currently deploy a Supabase runtime or store participant data.

create schema tm_private;

revoke all on schema tm_private from public, anon, authenticated;
grant usage on schema tm_private to service_role;

-- An auth user is not automatically a team member, Person or privileged role.
create table tm_private.accounts (
  user_id uuid primary key references auth.users(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending','active','disabled','archived')),
  created_at timestamptz not null default now(),
  disabled_at timestamptz
);

-- Deliberately omit names, dates of birth, addresses, phone numbers, medical data,
-- guardian evidence and WWCC data until independent per-field approval.
create table tm_private.persons (
  person_id text primary key,
  lifecycle text not null default 'proposed'
    check (lifecycle in ('proposed','active','inactive','archived')),
  created_at timestamptz not null default now()
);

create table tm_private.account_person_links (
  user_id uuid not null references tm_private.accounts(user_id) on delete restrict,
  person_id text not null references tm_private.persons(person_id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending','verified','revoked')),
  verified_by uuid references tm_private.accounts(user_id) on delete restrict,
  verified_at timestamptz,
  primary key (user_id, person_id),
  constraint link_no_self_review check (verified_by is null or verified_by <> user_id),
  constraint link_verification_complete check (
    status <> 'verified' or (verified_by is not null and verified_at is not null))
);
create unique index account_one_verified_person
  on tm_private.account_person_links(user_id) where status = 'verified';

-- Club reference does not itself confer club or association permissions.
create table tm_private.teams (
  team_id text primary key,
  club_ref text not null,
  sport_ref text not null,
  season_ref text not null,
  status text not null default 'proposed'
    check (status in ('proposed','active','archived')),
  created_at timestamptz not null default now()
);

-- Sporting participation is separate from a digital account or role grant.
create table tm_private.participations (
  team_id text not null references tm_private.teams(team_id) on delete restrict,
  person_id text not null references tm_private.persons(person_id) on delete restrict,
  kind text not null default 'player'
    check (kind in ('player')),
  status text not null default 'pending'
    check (status in ('pending','active','inactive')),
  verified_by uuid references tm_private.accounts(user_id) on delete restrict,
  verified_at timestamptz,
  primary key (team_id, person_id),
  constraint participation_activation_reviewed check (
    status <> 'active' or (verified_by is not null and verified_at is not null))
);

-- Only exact-team first-trial roles are represented. A proposed grant is not access.
create table tm_private.role_grants (
  grant_id text primary key,
  user_id uuid not null references tm_private.accounts(user_id) on delete restrict,
  team_id text not null references tm_private.teams(team_id) on delete restrict,
  role text not null check (role in (
    'team_coach','team_assistant','team_manager','team_player',
    'team_volunteer','team_play_viewer')),
  status text not null default 'proposed'
    check (status in ('proposed','active','revoked','expired')),
  policy_version integer not null default 1 check (policy_version = 1),
  approved_by uuid references tm_private.accounts(user_id) on delete restrict,
  approved_at timestamptz,
  valid_from timestamptz,
  expires_at timestamptz,
  constraint grant_no_self_approval check (approved_by is null or approved_by <> user_id),
  constraint grant_approval_complete check (
    status <> 'active' or (approved_by is not null and approved_at is not null)),
  constraint grant_valid_window check (
    valid_from is null or expires_at is null or valid_from < expires_at)
);
create index role_grants_account_scope
  on tm_private.role_grants(user_id, team_id, status, role);

-- These are Team Manager session records, not authoritative competition fixtures.
create table tm_private.sessions (
  session_id text primary key,
  team_id text not null references tm_private.teams(team_id) on delete restrict,
  kind text not null check (kind in ('training','match','other')),
  starts_at timestamptz,
  status text not null default 'planned'
    check (status in ('planned','cancelled','completed')),
  resource_version integer not null default 0 check (resource_version >= 0),
  unique (session_id, team_id)
);

create table tm_private.plays (
  play_id text primary key,
  team_id text not null references tm_private.teams(team_id) on delete restrict,
  publication_state text not null default 'draft'
    check (publication_state in ('draft','published','archived')),
  published_revision_id text,
  resource_version integer not null default 0 check (resource_version >= 0),
  constraint published_revision_required check (
    publication_state <> 'published' or published_revision_id is not null)
);

-- Retain the approved E5 play representation losslessly in a revision payload.
-- No conversion/normalisation of drawings, phases, paths, timings or instructions.
create table tm_private.play_revisions (
  revision_id text primary key,
  play_id text not null references tm_private.plays(play_id) on delete restrict,
  revision_number integer not null check (revision_number >= 1),
  status text not null default 'draft'
    check (status in ('draft','published','superseded')),
  e5_payload jsonb not null check (jsonb_typeof(e5_payload) = 'object'),
  created_by uuid references tm_private.accounts(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (play_id, revision_id),
  unique (play_id, revision_number)
);
alter table tm_private.plays
  add constraint published_revision_belongs_to_play
  foreign key (play_id, published_revision_id)
  references tm_private.play_revisions(play_id, revision_id)
  deferrable initially deferred;

create table tm_private.availability (
  availability_id text primary key,
  session_id text not null,
  team_id text not null,
  person_id text not null,
  response text check (response in ('yes','no','maybe')),
  resource_version integer not null default 0 check (resource_version >= 0),
  unique (session_id, person_id),
  foreign key (session_id, team_id)
    references tm_private.sessions(session_id, team_id) on delete restrict,
  foreign key (team_id, person_id)
    references tm_private.participations(team_id, person_id) on delete restrict
);

-- Duty assignment does not confer membership, credential or digital privileges.
create table tm_private.duties (
  duty_id text primary key,
  session_id text not null,
  team_id text not null,
  person_id text not null references tm_private.persons(person_id) on delete restrict,
  status text not null default 'proposed'
    check (status in ('proposed','assigned','confirmed','revoked','completed')),
  approved_by uuid references tm_private.accounts(user_id) on delete restrict,
  approved_at timestamptz,
  response text check (response in ('yes','no','done')),
  resource_version integer not null default 0 check (resource_version >= 0),
  foreign key (session_id, team_id)
    references tm_private.sessions(session_id, team_id) on delete restrict,
  constraint duty_assignment_reviewed check (
    status not in ('assigned','confirmed','completed')
    or (approved_by is not null and approved_at is not null))
);

-- Unique account/team key supports the server-side replay contract.
-- It does not itself reserve, compare-and-swap, commit or verify request bodies.
create table tm_private.mutation_receipts (
  user_id uuid not null references tm_private.accounts(user_id) on delete restrict,
  team_id text not null references tm_private.teams(team_id) on delete restrict,
  mutation_id text not null check (
    mutation_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{15,79}$'),
  action text not null,
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  resource_id text not null,
  expected_version integer not null check (expected_version >= 0),
  reserved_at timestamptz not null default now(),
  primary key (user_id, team_id, mutation_id)
);

-- No personal values, bearer credentials, raw evidence or provider errors in audit rows.
create table tm_private.audit_events (
  event_id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  team_id text,
  action text not null,
  resource_id text,
  decision text not null check (decision in ('ALLOW','DENY','ERROR')),
  mutation_id text,
  reason_code text not null
);

-- A privileged database owner can still administer the schema, but routine
-- changes cannot silently rewrite or remove an audit event.
create function tm_private.reject_audit_mutation()
returns trigger language plpgsql set search_path = ''
as $$
begin
  raise exception 'audit events are append-only';
end;
$$;
create trigger audit_events_append_only
before update or delete on tm_private.audit_events
for each row execute function tm_private.reject_audit_mutation();

-- RLS is enabled and forced with ZERO browser-facing policies. This is a
-- deliberately closed first milestone, not a functioning client data API.
alter table tm_private.accounts enable row level security;
alter table tm_private.accounts force row level security;
alter table tm_private.persons enable row level security;
alter table tm_private.persons force row level security;
alter table tm_private.account_person_links enable row level security;
alter table tm_private.account_person_links force row level security;
alter table tm_private.teams enable row level security;
alter table tm_private.teams force row level security;
alter table tm_private.participations enable row level security;
alter table tm_private.participations force row level security;
alter table tm_private.role_grants enable row level security;
alter table tm_private.role_grants force row level security;
alter table tm_private.sessions enable row level security;
alter table tm_private.sessions force row level security;
alter table tm_private.plays enable row level security;
alter table tm_private.plays force row level security;
alter table tm_private.play_revisions enable row level security;
alter table tm_private.play_revisions force row level security;
alter table tm_private.availability enable row level security;
alter table tm_private.availability force row level security;
alter table tm_private.duties enable row level security;
alter table tm_private.duties force row level security;
alter table tm_private.mutation_receipts enable row level security;
alter table tm_private.mutation_receipts force row level security;
alter table tm_private.audit_events enable row level security;
alter table tm_private.audit_events force row level security;

-- Privileges are explicit. service_role bypasses RLS, so a future trusted
-- adapter MUST still enforce PR258 identity, exact-team, classification,
-- domain, mutation/audit and output-policy checks inside one transaction.
revoke all on all tables in schema tm_private from public, anon, authenticated;
revoke all on all sequences in schema tm_private from public, anon, authenticated;
revoke execute on all functions in schema tm_private from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema tm_private to service_role;
grant usage, select on all sequences in schema tm_private to service_role;
grant execute on all functions in schema tm_private to service_role;

alter default privileges for role postgres in schema tm_private
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema tm_private
  revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema tm_private
  revoke execute on functions from public, anon, authenticated;
