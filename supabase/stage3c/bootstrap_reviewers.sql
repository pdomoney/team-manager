-- Stage 3C reviewer bootstrap, for an OWNER-APPROVED isolated staging
-- installation ONLY, after verified adult GoTrue accounts exist.
-- Requires: psql -X -v ON_ERROR_STOP=1 -v coach_uuid=... -v manager_uuid=...
--   -v approval_ref=evidence-ref/stage3c-reviewed-operators -f this-file
-- Never paste UUIDs or participant information into Git or CI logs.
-- Operator attests a real independent identity review outside this script.
begin;
select pg_catalog.set_config('stage3c.coach_uuid', :'coach_uuid',true) as c,
  pg_catalog.set_config('stage3c.manager_uuid', :'manager_uuid',true) as m,
  pg_catalog.set_config('stage3c.approval_ref', :'approval_ref',true) as r \gset
do $$
declare
  coach uuid;
  manager uuid;
  approval text;
begin
  coach:=pg_catalog.current_setting('stage3c.coach_uuid')::uuid;
  manager:=pg_catalog.current_setting('stage3c.manager_uuid')::uuid;
  approval:=pg_catalog.current_setting('stage3c.approval_ref');
  if coach=manager or approval !~ '^evidence-ref/[A-Za-z0-9._/-]{12,100}$' then
    raise exception 'Stage 3C independent reviewer bootstrap preflight failed'; end if;
  if (select count(*) from auth.users
      where id in (coach,manager) and email_confirmed_at is not null)<>2 then
    raise exception 'Both independent adult staging accounts must have confirmed email'; end if;
  if exists(select 1 from tm_private.accounts where user_id in (coach,manager))
    or exists(select 1 from tm_private.account_person_links where user_id in (coach,manager))
    or exists(select 1 from tm_private.role_grants where user_id in (coach,manager)) then
    raise exception 'Staging bootstrap cannot change existing identities or grants'; end if;
  if exists(select 1 from tm_private.teams
    where team_id in ('stage3c-comets','stage3c-denial')) then
    raise exception 'Staging fixture team already exists; bootstrap is not repeatable'; end if;
  insert into tm_private.teams(team_id,club_ref,sport_ref,season_ref,status)
  values
    ('stage3c-comets','Fictional Comets','oztag','2026','active'),
    ('stage3c-denial','Fictional Rangers','oztag','2026','active');
  insert into tm_private.accounts(user_id,status)
    values(coach,'active'),(manager,'active');
  insert into tm_private.persons(person_id,lifecycle) values
    ('stage3c-person-coach','active'),('stage3c-person-manager','active');
  insert into tm_private.account_person_links(
    user_id,person_id,status,verified_by,verified_at) values
    (coach,'stage3c-person-coach','verified',manager,now()),
    (manager,'stage3c-person-manager','verified',coach,now());
  insert into tm_private.role_grants(
    grant_id,user_id,team_id,role,status,approved_by,approved_at)
    values
    ('stage3c-coach-grant',coach,'stage3c-comets','team_coach',
      'active',manager,now()),
    ('stage3c-manager-grant',manager,'stage3c-comets','team_manager',
      'active',coach,now());
  insert into tm_private.audit_events(
    user_id,team_id,action,resource_id,decision,reason_code)
    values
    (manager,'stage3c-comets','staging.bootstrap.approve',
      'stage3c-coach-grant','ALLOW','human-reviewed-external-attestation'),
    (coach,'stage3c-comets','staging.bootstrap.approve',
      'stage3c-manager-grant','ALLOW','human-reviewed-external-attestation');
  raise notice 'PASS: two independently attested reviewer grants, one active fictional team, one denial team';
end;
$$;
commit;
