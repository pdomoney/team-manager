-- Team Manager | Stage 3D.4 INITIAL OWNER | OPERATOR EXECUTION ONLY
-- This is a one-time Supabase SQL Editor script. It is NOT a migration,
-- and MUST NOT run in CI, on a demo/test fixture or via a browser account.
-- Prerequisites: separately authorised install of 20261121010000 migration;
-- verified exact project/region, immutable source, schema, backup and rollback;
-- operator independently confirms control of the named existing Supabase
-- project, GitHub repository and existing Cloudflare Worker.
-- Replace two placeholders privately. Never commit the filled script.
-- A Supabase SQL Editor session with administrative privileges is the trust
-- boundary; email verification by itself is NOT ownership proof.

begin;
do $bootstrap$
declare
  v_owner uuid := '00000000-0000-0000-0000-000000000000';
  v_evidence text := 'evidence-ref/REPLACE_WITH_PRIVATE_OWNER_ATTESTATION';
  v_confirm text := 'REPLACE_WITH_EXACT_CONFIRMATION';
begin
  if v_confirm <> 'I_AUTHORISE_ONE_TIME_FIRST_PLATFORM_OWNER' or
     v_owner='00000000-0000-0000-0000-000000000000'::uuid or
     v_evidence !~ '^evidence-ref/[A-Za-z0-9._/-]{12,100}$' or
     v_evidence like '%REPLACE%' then
    raise exception 'Stage 3D.4 owner authorisation missing';
  end if;

  -- Serialise the bootstrap and reject any pre-existing activated principal.
  perform pg_advisory_xact_lock(346031,346034);
  if (select count(*) from auth.users) <> 1 or
     not exists(select 1 from auth.users u where u.id=v_owner
       and u.email_confirmed_at is not null and u.email is not null) or
     exists(select 1 from tm_private.accounts) or
     exists(select 1 from tm_private.platform_operator_grants) or
     exists(select 1 from tm_private.founder_bootstrap) or
     exists(select 1 from tm_private.role_grants) or
     exists(select 1 from tm_private.teams) then
    raise exception 'One-time owner bootstrap preflight refused: unknown or existing state';
  end if;

  -- Only the SQL administrator can create this record. A regular signed-in
  -- user and the Worker API cannot use this bootstrap for self-promotion.
  insert into tm_private.accounts(user_id,status)
    values(v_owner,'active');
  insert into tm_private.founder_bootstrap(
    id,user_id,evidence_ref,adult_attested)
    values(1,v_owner,v_evidence,true);
  insert into tm_private.platform_operator_grants(
    user_id,status,approved_at,founder_bootstrap_id)
    values(v_owner,'active',now(),1);
  insert into tm_private.audit_events(
    user_id,team_id,action,resource_id,decision,reason_code)
    values(v_owner,null,'platform.initial-owner.bootstrap',
      'initial-owner-bootstrap','ALLOW','owner-authorised-admin-session');
  raise notice 'PASS: exact first Platform Owner granted, no team/Coach/player data created; replay prohibited';
end;
$bootstrap$;
commit;
