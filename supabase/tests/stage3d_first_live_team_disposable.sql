-- DISPOSABLE PostgreSQL CI ONLY. Never run against real Supabase.
-- Stage 3C fixtures were qualified in the preceding migration test. Clear
-- this disposable database to rehearse a genuinely empty first-team install.
truncate table tm_private.accounts,tm_private.teams,tm_private.persons cascade;
insert into auth.users(id,email_confirmed_at) values
('33333333-3333-4333-8333-333333333333',now()),
('44444444-4444-4444-8444-444444444444',now());
\set coach_uuid 33333333-3333-4333-8333-333333333333
\set reviewer_uuid 44444444-4444-4444-8444-444444444444
\set season_ref 2026
\set approval_ref evidence-ref/disposable-independent-reviewer-attestation
\set activation_authorised approved-first-live-team-activation
\ir ../stage3d/bootstrap_first_live_team.sql

do $$
declare
  actor uuid := '33333333-3333-4333-8333-333333333333'::uuid;
  reviewer uuid := '44444444-4444-4444-8444-444444444444'::uuid;
begin
  if (select count(*) from tm_private.teams where team_id='stgeorge-mixed20'
     and club_ref='St George Oztag' and sport_ref='oztag'
     and season_ref='2026' and status='active')<>1
    or (select count(*) from tm_private.teams)<>1
    or (select count(*) from tm_private.participations)<>0
    or (select count(*) from tm_private.platform_operator_grants
        where user_id=actor and status='active' and approved_by=reviewer)<>1
    or (select count(*) from tm_private.role_grants
        where user_id=actor and team_id='stgeorge-mixed20'
        and role='team_coach' and status='active' and approved_by=reviewer)<>1
    or (select count(*) from tm_private.role_grants where user_id=reviewer)<>0
    or (select count(*) from tm_private.platform_operator_grants
        where user_id=reviewer)<>0
    or (select count(*) from tm_private.account_person_links
        where user_id=actor and status='verified' and verified_by=reviewer)<>1 then
    raise exception 'First-team actor, dual-role or no-roster assertions failed';
  end if;
  -- Database itself must reject an attempt to convert the two reviewed
  -- grants to self-approved grants.
  begin
    update tm_private.role_grants set approved_by=actor
      where user_id=actor and team_id='stgeorge-mixed20';
    raise exception 'Self-approved Coach grant incorrectly accepted';
  exception when check_violation then null;
  end;
  begin
    update tm_private.platform_operator_grants set approved_by=actor
      where user_id=actor;
    raise exception 'Self-approved Platform Owner grant incorrectly accepted';
  exception when check_violation then null;
  end;
  raise notice 'PASS: one real-designated team, separately approved dual role, reviewer denied grants, zero participant records';
end;
$$;

-- A second Manager is not inherited from acting as the reviewer.
-- It requires a DIFFERENT explicit activation after the first Coach is active.
\set coach_uuid 33333333-3333-4333-8333-333333333333
\set manager_uuid 44444444-4444-4444-8444-444444444444
\set approval_ref evidence-ref/disposable-separate-manager-attestation
\set manager_authorised approved-first-manager-activation
\ir ../stage3d/bootstrap_first_manager.sql
do $$
declare
  coach uuid := '33333333-3333-4333-8333-333333333333'::uuid;
  manager uuid := '44444444-4444-4444-8444-444444444444'::uuid;
begin
  if (select count(*) from tm_private.role_grants
      where team_id='stgeorge-mixed20' and role='team_manager'
        and user_id=manager and status='active' and approved_by=coach)<>1
     or (select count(*) from tm_private.role_grants
        where team_id='stgeorge-mixed20' and role='team_coach'
          and user_id=coach and status='active')<>1
     or (select count(*) from tm_private.platform_operator_grants
        where user_id=manager)<>0
     or (select count(*) from tm_private.account_person_links
        where user_id=manager and status='verified' and verified_by=coach)<>1
     or (select count(*) from tm_private.participations)<>0 then
    raise exception 'Explicit Manager activation or separated platform scope failed';
  end if;
  raise notice 'PASS: first Coach and separately authorised Manager can independently review team invitations';
end;
$$;
