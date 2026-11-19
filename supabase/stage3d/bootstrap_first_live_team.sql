-- Stage 3D real first-team activation, source-only until separately authorised.
-- St George Oztag / Mixed 20. NO real people, credentials or rosters in Git.
-- This is NOT the fictional Stage 3C reviewer bootstrap.
--
-- Run ONLY against the approved empty FIRST-TEAM production project after
-- exact-source, region, controller/privacy, email, schema, backup/restore,
-- reviewer authority and independent installation checks have passed.
--
-- Required private psql variables:
--   -v coach_uuid=<confirmed-authorised-user-uuid>
--   -v reviewer_uuid=<different-confirmed-independent-reviewer-uuid>
--   -v season_ref=<owner-verified-four-digit-season>
--   -v approval_ref=evidence-ref/<protected-external-approval-reference>
--   -v activation_authorised=approved-first-live-team-activation
--
-- Do not assume the team name 'Mixed 20' establishes any participant age.
-- Do not seed a Coach's real display name, player, guardian, medical, or
-- competition-eligibility records. No role is granted by email matching.
begin;
select pg_catalog.set_config('stage3d.coach_uuid', :'coach_uuid',true) as coach_id,
  pg_catalog.set_config('stage3d.reviewer_uuid', :'reviewer_uuid',true) as reviewer_id,
  pg_catalog.set_config('stage3d.season_ref', :'season_ref',true) as season,
  pg_catalog.set_config('stage3d.approval_ref', :'approval_ref',true) as approval,
  pg_catalog.set_config('stage3d.activation_authorised', :'activation_authorised',true) as confirmation \gset

do $$
declare
  actor uuid := pg_catalog.current_setting('stage3d.coach_uuid')::uuid;
  reviewer uuid := pg_catalog.current_setting('stage3d.reviewer_uuid')::uuid;
  season text := pg_catalog.current_setting('stage3d.season_ref');
  approval text := pg_catalog.current_setting('stage3d.approval_ref');
  confirmation text := pg_catalog.current_setting('stage3d.activation_authorised');
begin
  if actor=reviewer or confirmation<>'approved-first-live-team-activation'
     or season !~ '^20[0-9]{2}$'
     or approval !~ '^evidence-ref/[A-Za-z0-9._/-]{12,100}$' then
    raise exception 'First-live-team approval, reviewer or season preflight failed';
  end if;
  if (select count(*) from auth.users
       where id in (actor,reviewer) and email_confirmed_at is not null)<>2 then
    raise exception 'Both independent real adult identities need confirmed email and external human attestation';
  end if;
  if exists(select 1 from tm_private.teams)
     or exists(select 1 from tm_private.role_grants where user_id=actor)
     or exists(select 1 from tm_private.platform_operator_grants where user_id=actor)
     or exists(select 1 from tm_private.account_person_links where user_id=actor)
     or exists(select 1 from tm_private.accounts where user_id=actor) then
    raise exception 'First-live-team activation requires an unused account and an empty team database';
  end if;
  if exists(select 1 from tm_private.accounts where user_id=reviewer and status<>'active')
     or exists(select 1 from tm_private.role_grants where user_id=reviewer)
     or exists(select 1 from tm_private.platform_operator_grants where user_id=reviewer) then
    raise exception 'Independent reviewer account status or grants require manual review';
  end if;

  -- Reviewer has a verified individual account but receives NO team or
  -- platform privileges simply for approving the initial user.
  insert into tm_private.accounts(user_id,status) values(reviewer,'active')
    on conflict(user_id) do nothing;
  insert into tm_private.accounts(user_id,status) values(actor,'active');
  insert into tm_private.teams(team_id,club_ref,sport_ref,season_ref,status)
    values('stgeorge-mixed20','St George Oztag','oztag',season,'active');
  insert into tm_private.persons(person_id,lifecycle)
    values('stgeorge-mixed20-initial-coach','active');
  insert into tm_private.account_person_links(
    user_id,person_id,status,verified_by,verified_at)
    values(actor,'stgeorge-mixed20-initial-coach','verified',reviewer,now());

  -- Same authenticated account, independently approved roles. The platform
  -- grant does not authorise a team read/write; Coach grants exact-team only.
  insert into tm_private.platform_operator_grants(
    user_id,status,approved_by,approved_at)
    values(actor,'active',reviewer,now());
  insert into tm_private.role_grants(
    grant_id,user_id,team_id,role,status,approved_by,approved_at)
    values('stgeorge-mixed20-initial-coach-grant',actor,'stgeorge-mixed20',
      'team_coach','active',reviewer,now());

  insert into tm_private.audit_events(
    user_id,team_id,action,resource_id,decision,reason_code)
    values
      (reviewer,'stgeorge-mixed20','first-team.coach.approve',
        'stgeorge-mixed20-initial-coach-grant','ALLOW','independently-attested'),
      (reviewer,null,'platform-owner.approve',
        'platform-owner-initial','ALLOW','independently-attested');
  raise notice 'PASS: first-team St George Oztag / Mixed 20 exact Coach plus distinct Platform Owner grants; no roster imported';
end;
$$;
commit;
