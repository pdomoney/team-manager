-- Optional, separately authorised Stage 3D first Manager activation.
-- Complete ONLY after an approved first-team Coach grant exists and the
-- independent Manager has been selected, informed, verified and approved.
-- This is NOT an automatic promotion of the original reviewer.
--
-- Required private psql variables: coach_uuid, manager_uuid, approval_ref,
--   manager_authorised=approved-first-manager-activation
-- Do not use for anonymous volunteers, participant registrations or imports.
begin;
select pg_catalog.set_config('stage3d.coach_uuid', :'coach_uuid',true) as coach_id,
  pg_catalog.set_config('stage3d.manager_uuid', :'manager_uuid',true) as manager_id,
  pg_catalog.set_config('stage3d.manager_approval_ref', :'approval_ref',true) as approval,
  pg_catalog.set_config('stage3d.manager_authorised', :'manager_authorised',true) as confirmation \gset
do $$
declare
  coach uuid := pg_catalog.current_setting('stage3d.coach_uuid')::uuid;
  manager uuid := pg_catalog.current_setting('stage3d.manager_uuid')::uuid;
  approval text := pg_catalog.current_setting('stage3d.manager_approval_ref');
  confirmation text := pg_catalog.current_setting('stage3d.manager_authorised');
begin
  if coach=manager or confirmation<>'approved-first-manager-activation'
     or approval !~ '^evidence-ref/[A-Za-z0-9._/-]{12,100}$' then
    raise exception 'First Manager requires explicit independent approval';
  end if;
  if not exists(select 1 from tm_private.teams t
      where t.team_id='stgeorge-mixed20'
        and t.club_ref='St George Oztag' and t.sport_ref='oztag'
        and t.status='active') then
    raise exception 'Approved St George Mixed 20 team is not active';
  end if;
  if not exists(select 1 from tm_private.role_grants g
      join tm_private.accounts a on a.user_id=g.user_id
      where g.user_id=coach and g.team_id='stgeorge-mixed20'
        and g.role='team_coach' and g.status='active'
        and g.approved_by is not null and g.approved_by<>coach
        and a.status='active') then
    raise exception 'Independently granted Coach must approve first Manager';
  end if;
  if not exists(select 1 from auth.users u
       where u.id=manager and u.email_confirmed_at is not null) then
    raise exception 'Manager email and external identity review are required';
  end if;
  if exists(select 1 from tm_private.accounts a
      where a.user_id=manager and a.status<>'active')
     or exists(select 1 from tm_private.account_person_links l
        where l.user_id=manager)
     or exists(select 1 from tm_private.role_grants g
        where g.user_id=manager)
     or exists(select 1 from tm_private.platform_operator_grants p
        where p.user_id=manager)
     or exists(select 1 from tm_private.role_grants g
        where g.team_id='stgeorge-mixed20' and g.role='team_manager'
          and g.status='active') then
    raise exception 'Existing Manager identity or grants require individual review';
  end if;
  insert into tm_private.accounts(user_id,status) values(manager,'active')
    on conflict(user_id) do nothing;
  insert into tm_private.persons(person_id,lifecycle)
    values('stgeorge-mixed20-initial-manager','active');
  insert into tm_private.account_person_links(
    user_id,person_id,status,verified_by,verified_at)
    values(manager,'stgeorge-mixed20-initial-manager','verified',coach,now());
  insert into tm_private.role_grants(
    grant_id,user_id,team_id,role,status,approved_by,approved_at)
    values('stgeorge-mixed20-first-manager-grant',manager,
      'stgeorge-mixed20','team_manager','active',coach,now());
  insert into tm_private.audit_events(
    user_id,team_id,action,resource_id,decision,reason_code)
    values(coach,'stgeorge-mixed20','first-team.manager.approve',
      'stgeorge-mixed20-first-manager-grant','ALLOW','independently-attested');
  raise notice 'PASS: separately authorised first Manager, exact-team only; no Platform Owner grant or roster imported';
end;
$$;
commit;
