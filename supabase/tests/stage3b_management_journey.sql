-- Stage 3B.1–3B.6 full management journey with invented adults only.
-- Disposable PostgreSQL transaction; never connects to a real Supabase project.
begin;
insert into auth.users(id) values
('11111111-1111-4111-8111-111111111111'),
('22222222-2222-4222-8222-222222222222'),
('33333333-3333-4333-8333-333333333333'),
('44444444-4444-4444-8444-444444444444'),
('55555555-5555-4555-8555-555555555555');
insert into tm_private.accounts(user_id,status) values
('11111111-1111-4111-8111-111111111111','active'),
('22222222-2222-4222-8222-222222222222','active'),
('33333333-3333-4333-8333-333333333333','active'),
('44444444-4444-4444-8444-444444444444','active'),
('55555555-5555-4555-8555-555555555555','active');
insert into tm_private.teams(team_id,club_ref,sport_ref,season_ref,status) values
('comets-3b','Fictional Comets','oztag','2026','active'),
('rangers-3b','Fictional Rangers','oztag','2026','active');
insert into tm_private.role_grants(
 grant_id,user_id,team_id,role,status,approved_by,approved_at) values
('coach-3b','11111111-1111-4111-8111-111111111111','comets-3b',
 'team_coach','active','22222222-2222-4222-8222-222222222222',now()),
('manager-3b','22222222-2222-4222-8222-222222222222','comets-3b',
 'team_manager','active','11111111-1111-4111-8111-111111111111',now()),
('player-3b','33333333-3333-4333-8333-333333333333','comets-3b',
 'team_player','active','11111111-1111-4111-8111-111111111111',now()),
('volunteer-3b','44444444-4444-4444-8444-444444444444','comets-3b',
 'team_volunteer','active','11111111-1111-4111-8111-111111111111',now());
insert into tm_private.persons(person_id,lifecycle) values
('player-1','active'),('player-2','active'),('player-3','active'),
('player-4','active'),('player-5','active'),('player-pending','active'),
('volunteer-1','active'),('foreign-person','active');
insert into tm_private.participations(
 team_id,person_id,status,verified_by,verified_at) values
('comets-3b','player-1','active','22222222-2222-4222-8222-222222222222',now()),
('comets-3b','player-2','active','22222222-2222-4222-8222-222222222222',now()),
('comets-3b','player-3','active','22222222-2222-4222-8222-222222222222',now()),
('comets-3b','player-4','active','22222222-2222-4222-8222-222222222222',now()),
('comets-3b','player-5','active','22222222-2222-4222-8222-222222222222',now()),
('comets-3b','player-pending','pending',null,null),
('rangers-3b','foreign-person','active','22222222-2222-4222-8222-222222222222',now());
insert into tm_private.account_person_links(
 user_id,person_id,status,verified_by,verified_at) values
('33333333-3333-4333-8333-333333333333','player-1','verified',
 '11111111-1111-4111-8111-111111111111',now()),
('44444444-4444-4444-8444-444444444444','volunteer-1','verified',
 '11111111-1111-4111-8111-111111111111',now());
insert into tm_private.sessions(session_id,team_id,kind,starts_at,status,title) values
('training-3b','comets-3b','training',now()+interval '2 days','planned','Skills practice'),
('official-3b','comets-3b','match',now()+interval '3 days','planned','Official fixture');
insert into tm_private.duties(
 duty_id,team_id,session_id,person_id,status,approved_by,approved_at) values
('duty-3b','comets-3b','training-3b','volunteer-1','assigned',
 '22222222-2222-4222-8222-222222222222',now());
do $$
declare
 coach uuid:='11111111-1111-4111-8111-111111111111';
 manager uuid:='22222222-2222-4222-8222-222222222222';
 player uuid:='33333333-3333-4333-8333-333333333333';
 volunteer uuid:='44444444-4444-4444-8444-444444444444';
 stranger uuid:='55555555-5555-4555-8555-555555555555';
 t text:='comets-3b';
 digest text:=repeat('a',64);
 result jsonb;
 event_id text;
 notice_id text;
begin
 if has_table_privilege('authenticated','tm_private.team_attendance','SELECT')
    or has_table_privilege('authenticated','tm_private.team_notices','INSERT')
    or has_function_privilege('authenticated',
      'public.tm_stage3b_operation(uuid,text,text,text,text,jsonb,text)','EXECUTE')
 then raise exception 'Private management tables or RPC exposed to browser roles'; end if;
 result:=public.tm_stage3b_operation(stranger,t,'team_coach',
   'report.summary',t,'{}'::jsonb,null);
 if result->>'code'<>'scope-denied' then raise exception 'Foreign user read report'; end if;
 result:=public.tm_stage3b_operation(coach,'rangers-3b','team_coach',
   'notices.read','rangers-3b','{}'::jsonb,null);
 if result->>'code'<>'scope-denied' then raise exception 'Foreign team read'; end if;
 result:=public.tm_stage3b_operation(player,t,'team_player','report.summary',
   t,'{}'::jsonb,null);
 if result->>'code'<>'role-denied' then raise exception 'Player accessed management reports'; end if;
 result:=public.tm_stage3b_operation(coach,t,'team_coach','roster.approve',
   'player-pending','{"mutationId":"3brosterApprove00000001","expectedVersion":0,"command":{"op":"approve"}}'::jsonb,digest);
 if result->>'code'<>'committed' then raise exception 'Team placement failed: %',result; end if;
 if not exists(select 1 from tm_private.participations
   where team_id=t and person_id='player-pending' and status='active'
     and verified_by=coach)
 then raise exception 'Team placement did not save reviewed actor'; end if;
 result:=public.tm_stage3b_operation(coach,t,'team_coach','roster.approve',
   'player-pending','{"mutationId":"3brosterApprove00000002","expectedVersion":0,"command":{"op":"approve"}}'::jsonb,digest);
 if result->>'code'<>'stale-roster' then raise exception 'Stale team placement accepted'; end if;
 result:=public.tm_stage3b_operation(coach,t,'team_coach','event.create',
   t,'{"mutationId":"3beventCreate000000001","expectedVersion":0,"command":{"kind":"friendly","title":"Friendly match","locationLabel":"Community oval","startsAt":"2026-12-01T06:00:00.000Z"}}'::jsonb,digest);
 if result->>'code'<>'committed' then raise exception 'Team friendly create failed: %',result; end if;
 event_id:=result->>'resourceId';
 if not exists(select 1 from tm_private.sessions
   where session_id=event_id and team_id=t and kind='match'
     and management_origin='team-friendly')
 then raise exception 'Friendly incorrectly treated as official fixture'; end if;
 result:=public.tm_stage3b_operation(coach,t,'team_coach','event.create',
   t,'{"mutationId":"3beventCreate000000001","expectedVersion":0,"command":{"kind":"friendly","title":"Friendly match","locationLabel":"Community oval","startsAt":"2026-12-01T06:00:00.000Z"}}'::jsonb,digest);
 if result->>'resourceId'<>event_id then raise exception 'Idempotent replay duplicated friendly'; end if;
 result:=public.tm_stage3b_operation(coach,t,'team_coach','event.change',
   'official-3b','{"mutationId":"3beventOfficial00000001","expectedVersion":0,"command":{"op":"cancel"}}'::jsonb,digest);
 if result->>'code'<>'stale-or-external-event' then
   raise exception 'Official competition fixture was editable'; end if;
 result:=public.tm_stage3b_operation(coach,t,'team_coach','event.change',
   event_id,'{"mutationId":"3beventChange000000001","expectedVersion":0,"command":{"op":"reschedule","startsAt":"2026-12-02T06:00:00.000Z"}}'::jsonb,digest);
 if result->>'version'<>'1' then raise exception 'Team-managed event reschedule failed'; end if;
 result:=public.tm_stage3b_operation(coach,t,'team_coach','attendance.read',
   'training-3b','{}'::jsonb,null);
 if pg_catalog.jsonb_array_length(result->'data')<>6 then
    raise exception 'Team roll call missing eligible team participants'; end if;
 result:=public.tm_stage3b_operation(coach,t,'team_coach','attendance.record',
   'training-3b','{"mutationId":"3battendance000000001","expectedVersion":0,"command":{"personId":"player-1","status":"present"}}'::jsonb,digest);
 if result->>'code'<>'committed' then raise exception 'Attendance save failed: %',result; end if;
 result:=public.tm_stage3b_operation(coach,t,'team_coach','attendance.record',
   'training-3b','{"mutationId":"3battendance000000002","expectedVersion":0,"command":{"personId":"foreign-person","status":"present"}}'::jsonb,digest);
 if result->>'code'<>'invalid-attendance' then raise exception 'Foreign person marked attended'; end if;
 result:=public.tm_stage3b_operation(manager,t,'team_manager','availability.transcribe',
   'training-3b','{"mutationId":"3bavailability00000001","expectedVersion":0,"command":{"personId":"player-1","response":"no","source":"phone"}}'::jsonb,digest);
 if result->>'code'<>'committed' then raise exception 'Manager transcribed reply failed'; end if;
 if not exists(select 1 from tm_private.availability
   where session_id='training-3b' and person_id='player-1'
     and recorded_source='phone' and recorded_by=manager)
 then raise exception 'Source provenance missing'; end if;
 result:=public.tm_stage1_operation(player,t,'team_player','availability.reply',
   'training-3b','{"mutationId":"3bselfReply00000000001","expectedVersion":0,"response":"yes"}'::jsonb,repeat('b',64));
 if result->>'code'<>'committed' then raise exception 'Existing Player self reply regressed: %',result; end if;
 if not exists(select 1 from tm_private.availability
   where session_id='training-3b' and person_id='player-1'
     and response='yes' and recorded_source='self'
     and recorded_by is null and recorded_at is not null)
 then raise exception 'Player self-response failed to supersede external provenance'; end if;
 result:=public.tm_stage3b_operation(manager,t,'team_manager','duty.board',
   t,'{}'::jsonb,null);
 if pg_catalog.jsonb_array_length(result->'data')<>1 then
   raise exception 'Manager assigned duty board incomplete'; end if;
 result:=public.tm_stage3b_operation(manager,t,'team_manager','duty.label',
   'duty-3b','{"mutationId":"3bdutyType00000000001","expectedVersion":0,"command":{"type":"setup"}}'::jsonb,digest);
 if result->>'code'<>'committed' then raise exception 'Duty type assign failed'; end if;
 result:=public.tm_stage3b_operation(manager,t,'team_manager','duty.label',
   'duty-3b','{"mutationId":"3bdutyType00000000002","expectedVersion":1,"command":{"type":"first_aid"}}'::jsonb,digest);
 if result->>'code'<>'invalid-duty' then raise exception 'Unverified accredited duty granted'; end if;
 result:=public.tm_stage3b_operation(manager,t,'team_manager','duty.withdraw',
   'duty-3b','{"mutationId":"3bdutyWithdraw0000001","expectedVersion":1,"command":{"op":"withdraw"}}'::jsonb,digest);
 if result->>'code'<>'committed' then raise exception 'Manager duty withdrawal failed'; end if;
 result:=public.tm_stage3b_operation(coach,t,'team_coach','notice.create',
   t,'{"mutationId":"3bnoticeCreate00000001","expectedVersion":0,"command":{"title":"Training update","body":"Please check the schedule","audience":"players"}}'::jsonb,digest);
 if result->>'code'<>'committed' then raise exception 'Draft notice creation failed: %',result; end if;
 notice_id:=result->>'resourceId';
 result:=public.tm_stage3b_operation(player,t,'team_player','notices.read',
   t,'{}'::jsonb,null);
 if pg_catalog.jsonb_array_length(result->'data')<>0 then
   raise exception 'Unpublished Coach draft visible to Player'; end if;
 result:=public.tm_stage3b_operation(coach,t,'team_coach','notice.publish',
   notice_id,'{"mutationId":"3bnoticePublish0000001","expectedVersion":0,"command":{"op":"publish"}}'::jsonb,digest);
 if result->>'code'<>'committed' then raise exception 'Notice publish failed'; end if;
 result:=public.tm_stage3b_operation(player,t,'team_player','notices.read',
   t,'{}'::jsonb,null);
 if pg_catalog.jsonb_array_length(result->'data')<>1 then
   raise exception 'Approved audience cannot see published notice'; end if;
 result:=public.tm_stage3b_operation(volunteer,t,'team_volunteer','notices.read',
   t,'{}'::jsonb,null);
 if pg_catalog.jsonb_array_length(result->'data')<>0 then
   raise exception 'Volunteer viewed Player-only notice'; end if;
 result:=public.tm_stage3b_operation(manager,t,'team_manager','report.summary',
   t,'{}'::jsonb,null);
 if pg_catalog.jsonb_array_length(result->'data')<2 then
   raise exception 'Reports missing schedule sessions'; end if;
 if not exists(select 1 from pg_catalog.jsonb_array_elements(result->'data') row
   where row->>'sessionId'='training-3b'
     and row->>'activeRoster'='6'
     and row->'availabilityYes'='null'::jsonb
     and row->'attendancePresent'='null'::jsonb)
 then raise exception 'Aggregate report did not suppress small cohorts: %',result; end if;
 update tm_private.role_grants set status='revoked' where grant_id='manager-3b';
 result:=public.tm_stage3b_operation(manager,t,'team_manager','report.summary',
   t,'{}'::jsonb,null);
 if result->>'code'<>'scope-denied' then
   raise exception 'Revoked Manager viewed private reports'; end if;
 if not exists(select 1 from tm_private.audit_events where team_id=t
   and action='notice.publish') then raise exception 'Management audit incomplete'; end if;
 raise notice 'PASS: Stage 3B squad, friendly authority, attendance, provenance, duties, notices, aggregate reports, revocation';
end;
$$;
rollback;
