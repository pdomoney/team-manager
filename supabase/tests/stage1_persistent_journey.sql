-- Stage 1D: disposable PostgreSQL proof only. ALL IDs are invented.
-- Applied in a transaction and rolled back; NEVER use on a linked Supabase project.
begin;
insert into auth.users(id) values
('11111111-1111-4111-8111-111111111111'),
('22222222-2222-4222-8222-222222222222'),
('33333333-3333-4333-8333-333333333333'),
('44444444-4444-4444-8444-444444444444'),
('55555555-5555-4555-8555-555555555555'),
('66666666-6666-4666-8666-666666666666');
insert into tm_private.accounts(user_id,status)
select id,'active' from auth.users;
insert into tm_private.teams(team_id,club_ref,sport_ref,season_ref,status) values
('comets-qa-u16','Fictional Comets','oztag','2026','active'),
('rangers-qa-u16','Fictional Rangers','oztag','2026','active');
insert into tm_private.persons(person_id,lifecycle) values
('fictional-player-1','active'),('fictional-volunteer-1','active');
insert into tm_private.account_person_links(
  user_id,person_id,status,verified_by,verified_at) values
('33333333-3333-4333-8333-333333333333','fictional-player-1',
  'verified','66666666-6666-4666-8666-666666666666',now()),
('44444444-4444-4444-8444-444444444444','fictional-volunteer-1',
  'verified','66666666-6666-4666-8666-666666666666',now());
insert into tm_private.participations(
  team_id,person_id,status,verified_by,verified_at) values
('comets-qa-u16','fictional-player-1','active',
 '66666666-6666-4666-8666-666666666666',now());
insert into tm_private.role_grants(
  grant_id,user_id,team_id,role,status,approved_by,approved_at) values
('g-coach','11111111-1111-4111-8111-111111111111','comets-qa-u16',
 'team_coach','active','66666666-6666-4666-8666-666666666666',now()),
('g-manager','22222222-2222-4222-8222-222222222222','comets-qa-u16',
 'team_manager','active','66666666-6666-4666-8666-666666666666',now()),
('g-player','33333333-3333-4333-8333-333333333333','comets-qa-u16',
 'team_player','active','66666666-6666-4666-8666-666666666666',now()),
('g-volunteer','44444444-4444-4444-8444-444444444444','comets-qa-u16',
 'team_volunteer','active','66666666-6666-4666-8666-666666666666',now()),
('g-foreign','55555555-5555-4555-8555-555555555555','rangers-qa-u16',
 'team_coach','active','66666666-6666-4666-8666-666666666666',now());

do $$
declare
  coach uuid := '11111111-1111-4111-8111-111111111111';
  manager uuid := '22222222-2222-4222-8222-222222222222';
  player uuid := '33333333-3333-4333-8333-333333333333';
  volunteer uuid := '44444444-4444-4444-8444-444444444444';
  other uuid := '55555555-5555-4555-8555-555555555555';
  team text := 'comets-qa-u16';
  r jsonb;
  first jsonb;
  v_session_id text;
  duty_id text;
  before_receipts bigint;
  before_audits bigint;
begin
  if has_function_privilege('anon',
       'public.tm_stage1_operation(uuid,text,text,text,text,jsonb,text)','EXECUTE')
     or has_function_privilege('authenticated',
       'public.tm_stage1_operation(uuid,text,text,text,text,jsonb,text)','EXECUTE')
     or not has_function_privilege('service_role',
       'public.tm_stage1_operation(uuid,text,text,text,text,jsonb,text)','EXECUTE')
  then raise exception 'Stage 1 RPC permissions are unsafe'; end if;
  if has_table_privilege('authenticated','tm_private.sessions','SELECT')
  then raise exception 'Stage 1 private sessions exposed'; end if;
  if exists(select 1 from pg_policies where schemaname='tm_private')
  then raise exception 'private table policy unexpectedly enabled'; end if;

  -- Client A (Coach) creates training.
  first:=public.tm_stage1_operation(coach,team,'team_coach','schedule.edit',team,
    '{"mutationId":"synthetic-create-000001","expectedVersion":0,"command":{"op":"create","kind":"training","title":"Fictional training","startsAt":"2026-11-22T07:00:00Z"}}'::jsonb,
    repeat('a',64));
  if first->>'code'<>'committed' or (first->>'version')::integer<>0
  then raise exception 'training creation failed: %',first; end if;
  v_session_id:=first->>'resourceId';
  if v_session_id is null then raise exception 'missing training resource'; end if;

  -- Client B (Manager) sees the identical committed server row.
  r:=public.tm_stage1_operation(manager,team,'team_manager','schedule.read',team,'{}'::jsonb,null);
  if r->>'code'<>'permitted' or jsonb_array_length(r->'data')<>1 or
     r->'data'->0->>'sessionId'<>v_session_id
  then raise exception 'two-client persistence failed: %',r; end if;

  -- Exact retry returns the SAME receipt, no additional row or audit.
  select count(*) into before_receipts from tm_private.mutation_receipts;
  select count(*) into before_audits from tm_private.audit_events;
  r:=public.tm_stage1_operation(coach,team,'team_coach','schedule.edit',team,
    '{"mutationId":"synthetic-create-000001","expectedVersion":0,"command":{"op":"create","kind":"training","title":"Fictional training","startsAt":"2026-11-22T07:00:00Z"}}'::jsonb,
    repeat('a',64));
  if r<>first or (select count(*) from tm_private.mutation_receipts)<>before_receipts
      or (select count(*) from tm_private.audit_events)<>before_audits
  then raise exception 'idempotent retry generated side effects'; end if;
  r:=public.tm_stage1_operation(coach,team,'team_coach','schedule.edit',team,
    '{"mutationId":"synthetic-create-000001","expectedVersion":0,"command":{"op":"create","kind":"training","title":"Tampered","startsAt":"2026-11-22T07:00:00Z"}}'::jsonb,
    repeat('b',64));
  if r->>'code'<>'mutation-id-reused' then raise exception 'reuse not rejected'; end if;

  -- Manager changes training; Coach's stale version is rejected.
  r:=public.tm_stage1_operation(manager,team,'team_manager','schedule.edit',v_session_id,
    '{"mutationId":"synthetic-update-000001","expectedVersion":0,"command":{"op":"update","title":"Manager changed practice"}}'::jsonb,
    repeat('c',64));
  if r->>'code'<>'committed' or (r->>'version')::integer<>1
  then raise exception 'manager training update failed: %',r; end if;
  r:=public.tm_stage1_operation(coach,team,'team_coach','schedule.edit',v_session_id,
    '{"mutationId":"synthetic-stale-000001","expectedVersion":0,"command":{"op":"update","title":"Stale overwrite"}}'::jsonb,
    repeat('d',64));
  if r->>'code'<>'stale-or-protected-session' then raise exception 'stale write committed'; end if;
  if (select title from tm_private.sessions where session_id=v_session_id)='Stale overwrite'
  then raise exception 'stale write changed persistence'; end if;

  -- An already verified active player cannot be silently re-nominated;
  -- registrar evidence and active participation must remain intact.
  r:=public.tm_stage1_operation(coach,team,'team_coach','roster.edit',team,
    '{"mutationId":"synthetic-existing-0001","expectedVersion":0,"command":{"op":"nominate","personId":"fictional-player-1"}}'::jsonb,
    repeat('7',64));
  if r->>'code'<>'stale-roster' or
     (select status from tm_private.participations where team_id=team
       and person_id='fictional-player-1')<>'active' or
     (select verified_by from tm_private.participations where team_id=team
       and person_id='fictional-player-1') is null
  then raise exception 'existing verified participation was overwritten'; end if;

  -- Team-scoped nomination is pending; never verified registration.
  r:=public.tm_stage1_operation(coach,team,'team_coach','roster.edit',team,
    '{"mutationId":"synthetic-roster-000001","expectedVersion":0,"command":{"op":"nominate","personId":"fictional-roster-proposal"}}'::jsonb,
    repeat('e',64));
  if r->>'code'<>'committed' or
     (select status from tm_private.participations
      where team_id=team and person_id='fictional-roster-proposal')<>'pending'
  then raise exception 'roster nomination incorrectly approved or absent'; end if;
  r:=public.tm_stage1_operation(manager,team,'team_manager','roster.read',team,'{}'::jsonb,null);
  if r->>'code'<>'permitted' or jsonb_array_length(r->'data')<>2
  then raise exception 'manager cannot read scoped participation'; end if;

  -- A verified player can submit only their own availability; no person ID supplied.
  r:=public.tm_stage1_operation(player,team,'team_player','availability.reply',v_session_id,
    '{"mutationId":"synthetic-player-000001","expectedVersion":0,"response":"yes"}'::jsonb,
    repeat('f',64));
  if r->>'code'<>'committed' or
     (select response from tm_private.availability where session_id=v_session_id
       and person_id='fictional-player-1')<>'yes'
  then raise exception 'player RSVP failed'; end if;
  r:=public.tm_stage1_operation(player,team,'team_player','schedule.read',team,'{}'::jsonb,null);
  if r->'data'->0->>'myAvailability'<>'yes'
  then raise exception 'player read does not include own reply'; end if;
  r:=public.tm_stage1_operation(player,team,'team_player','roster.read',team,'{}'::jsonb,null);
  if r->>'code'<>'role-denied' then raise exception 'player can browse roster'; end if;
  r:=public.tm_stage1_operation(player,'rangers-qa-u16','team_player','schedule.read',
    'rangers-qa-u16','{}'::jsonb,null);
  if r->>'code'<>'scope-denied' then raise exception 'foreign team exposed'; end if;
  r:=public.tm_stage1_operation(other,team,'team_coach','schedule.read',team,'{}'::jsonb,null);
  if r->>'code'<>'scope-denied' then raise exception 'other team Coach was authorised'; end if;

  -- Manager assigns a separately verified volunteer, who can see and respond.
  r:=public.tm_stage1_operation(manager,team,'team_manager','duty.assign',team,
    jsonb_build_object('mutationId','synthetic-duty-000001','expectedVersion',0,
      'command',jsonb_build_object('op','assign','sessionId',v_session_id,
        'personId','fictional-volunteer-1')),repeat('1',64));
  if r->>'code'<>'committed' then raise exception 'duty assignment failed: %',r; end if;
  duty_id:=r->>'resourceId';
  r:=public.tm_stage1_operation(volunteer,team,'team_volunteer','duty.read',team,'{}'::jsonb,null);
  if r->>'code'<>'permitted' or jsonb_array_length(r->'data')<>1
  then raise exception 'volunteer cannot see own assigned duty'; end if;
  r:=public.tm_stage1_operation(volunteer,team,'team_volunteer','duty.reply',duty_id,
    '{"mutationId":"synthetic-duty-reply-01","expectedVersion":0,"response":"yes"}'::jsonb,
    repeat('2',64));
  if r->>'code'<>'committed' or (r->>'version')::int<>1
  then raise exception 'volunteer acceptance failed: %',r; end if;
  r:=public.tm_stage1_operation(volunteer,team,'team_volunteer','duty.reply',duty_id,
    '{"mutationId":"synthetic-duty-reply-02","expectedVersion":1,"response":"done"}'::jsonb,
    repeat('3',64));
  if r->>'code'<>'committed' or (r->>'version')::int<>2
  then raise exception 'volunteer duty closure failed: %',r; end if;
  r:=public.tm_stage1_operation(volunteer,team,'team_volunteer','roster.edit',team,
    '{"mutationId":"synthetic-bypass-00001","expectedVersion":0,"command":{"op":"nominate","personId":"unauthorised"}}'::jsonb,
    repeat('4',64));
  if r->>'code'<>'role-denied' then raise exception 'volunteer could edit roster'; end if;

  -- Official fixture is not mutable through training permission.
  insert into tm_private.sessions(session_id,team_id,kind,status,title)
    values('official-match-qa',team,'match','planned','Fictional fixture');
  r:=public.tm_stage1_operation(coach,team,'team_coach','schedule.edit','official-match-qa',
    '{"mutationId":"synthetic-fixture-001","expectedVersion":0,"command":{"op":"update","title":"Forbidden official edit"}}'::jsonb,
    repeat('5',64));
  if r->>'code'<>'stale-or-protected-session'
  then raise exception 'official fixture authorisation bypassed'; end if;

  -- Revocation prevents access on the NEXT read, independent of session.
  update tm_private.role_grants set status='revoked' where grant_id='g-player';
  r:=public.tm_stage1_operation(player,team,'team_player','schedule.read',team,'{}'::jsonb,null);
  if r->>'code'<>'scope-denied' then raise exception 'revoked player still authorised'; end if;
  raise notice 'PASS: independent-client persistence, exact-team/role, RSVP, volunteer, replay, stale conflict, fixture and revocation';
end
$$;

-- Simulate a mid-transaction audit failure. The DML and receipt must all
-- roll back with the failed call, not leave a partial training session.
create function tm_private.stage1_test_fail_audit()
returns trigger language plpgsql set search_path='' as $$
begin raise exception 'synthetic audit failure'; end;
$$;
create trigger stage1_test_audit_failure
before insert on tm_private.audit_events
for each row execute function tm_private.stage1_test_fail_audit();

do $$
declare
  before_sessions integer;
  before_receipts integer;
  failed boolean := false;
  r jsonb;
begin
  select count(*) into before_sessions from tm_private.sessions;
  select count(*) into before_receipts from tm_private.mutation_receipts;
  begin
    r:=public.tm_stage1_operation(
      '11111111-1111-4111-8111-111111111111','comets-qa-u16',
      'team_coach','schedule.edit','comets-qa-u16',
      '{"mutationId":"synthetic-failure-0001","expectedVersion":0,"command":{"op":"create","kind":"training","title":"Must roll back","startsAt":"2026-11-28T07:00:00Z"}}'::jsonb,
      repeat('9',64));
  exception when others then failed:=true; end;
  if not failed or before_sessions<>(select count(*) from tm_private.sessions)
     or before_receipts<>(select count(*) from tm_private.mutation_receipts)
  then raise exception 'audit failure did not roll back all state'; end if;
  raise notice 'PASS: injected audit failure atomically rolls back session and receipt';
end
$$;
drop trigger stage1_test_audit_failure on tm_private.audit_events;
drop function tm_private.stage1_test_fail_audit();
rollback;
