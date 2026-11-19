-- Stage 3B.1–3B.6: management-only source candidate.
-- Separate staging/provider/privacy approval required before installing.
-- Extends exact-team operations; does not change official competition fixtures,
-- registration/payment verification, E5 plays or stored participant contact fields.
alter table tm_private.sessions
  add column management_origin text not null default 'external'
  check (management_origin in ('external','team-friendly','team-activity'));

alter table tm_private.availability
  add column recorded_source text not null default 'self'
  check (recorded_source in ('self','phone','in_person','email'));
alter table tm_private.availability
  add column recorded_by uuid references tm_private.accounts(user_id) on delete restrict;
alter table tm_private.availability
  add column recorded_at timestamptz;

alter table tm_private.duties
  add column duty_type text not null default 'general_help'
  check (duty_type in ('general_help','setup','equipment','scorer_support'));
-- Certified trainer/first aider/match official roles are intentionally absent
-- until independent sport-specific accreditation and fixture delegation exist.

create table tm_private.team_attendance (
  session_id text not null,
  team_id text not null,
  person_id text not null,
  attendance_status text not null
    check (attendance_status in ('present','absent','late','excused')),
  recorded_by uuid not null references tm_private.accounts(user_id) on delete restrict,
  recorded_at timestamptz not null default now(),
  resource_version integer not null default 0 check (resource_version>=0),
  primary key(session_id,person_id),
  foreign key (session_id,team_id)
    references tm_private.sessions(session_id,team_id) on delete restrict,
  foreign key(team_id,person_id)
    references tm_private.participations(team_id,person_id) on delete restrict
);

create table tm_private.team_notices (
  notice_id text primary key,
  team_id text not null references tm_private.teams(team_id) on delete restrict,
  author_id uuid not null references tm_private.accounts(user_id) on delete restrict,
  title text not null check (length(title) between 1 and 100
    and title=pg_catalog.btrim(title) and title !~ '[[:cntrl:]]'),
  body text not null check (length(body) between 1 and 1000
    and body=pg_catalog.btrim(body) and body !~ '[[:cntrl:]]'),
  audience text not null check(audience in ('all','players','volunteers','coaches')),
  status text not null default 'draft'
    check(status in ('draft','published','archived')),
  resource_version integer not null default 0 check(resource_version>=0),
  created_at timestamptz not null default now(),
  published_at timestamptz
);
create index team_notices_visible on tm_private.team_notices(team_id,status,created_at desc);

alter table tm_private.team_attendance enable row level security;
alter table tm_private.team_attendance force row level security;
alter table tm_private.team_notices enable row level security;
alter table tm_private.team_notices force row level security;
revoke all on tm_private.team_attendance,tm_private.team_notices
  from public,anon,authenticated;
grant select,insert,update,delete on
  tm_private.team_attendance,tm_private.team_notices to service_role;

-- Management operations use the same trusted-server contract as Stage 1:
-- the Worker proves p_account with GoTrue, derives a request digest, and
-- commits every mutation with exact-team lock, optimistic version, audit and
-- idempotency receipt in one database transaction. No browser table grants.
create function public.tm_stage3b_operation(
  p_account uuid,p_team text,p_role text,p_action text,p_resource text,
  p_payload jsonb,p_digest text
) returns jsonb
language plpgsql volatile security definer set search_path=''
as $$
declare
 v_now timestamptz:=now();
 v_write boolean;
 v_person text;
 v_granted boolean;
 v_mutation text;
 v_expected integer;
 v_version integer;
 v_resource text:=p_resource;
 v_command jsonb;
 v_existing tm_private.mutation_receipts%rowtype;
 v_data jsonb;
 v_result jsonb;
 v_status text;
 v_type text;
begin
 if p_team is null or p_team !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$'
   or p_resource is null or p_resource !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$'
   or p_payload is null or pg_catalog.jsonb_typeof(p_payload)<>'object'
   or p_role not in ('team_coach','team_manager','team_assistant',
                     'team_player','team_volunteer')
   or p_action not in (
     'attendance.read','availability.board','duty.board','notices.read',
     'report.summary','roster.approve','event.create','event.change',
     'attendance.record','availability.transcribe','duty.label',
     'duty.withdraw','notice.create','notice.publish','notice.archive')
 then return pg_catalog.jsonb_build_object('ok',false,'code','invalid-command'); end if;

 v_write:=p_action not in ('attendance.read','availability.board',
    'duty.board','notices.read','report.summary');
 if v_write then
   if p_digest is null or p_digest !~ '^[0-9a-f]{64}$'
     or coalesce(p_payload->>'mutationId','') !~ '^[A-Za-z0-9][A-Za-z0-9_-]{15,79}$'
     or pg_catalog.jsonb_typeof(p_payload->'expectedVersion')<>'number'
     or coalesce(p_payload->>'expectedVersion','') !~ '^(0|[1-9][0-9]{0,9})$'
     or (p_payload->>'expectedVersion')::bigint>2147483647
     or pg_catalog.jsonb_typeof(p_payload->'command')<>'object'
     or (p_payload-'mutationId'-'expectedVersion'-'command')<>'{}'::jsonb
   then return pg_catalog.jsonb_build_object('ok',false,'code','invalid-mutation'); end if;
   v_mutation:=p_payload->>'mutationId';
   v_expected:=(p_payload->>'expectedVersion')::integer;
   v_command:=p_payload->'command';
   if v_command ?| array['accountId','teamId','approvedBy','verified','isAdmin',
        'roleGrant','userId','registered','eligible','accredited']
   then return pg_catalog.jsonb_build_object('ok',false,'code','forged-field'); end if;
 else
   if p_payload<>'{}'::jsonb or p_digest is not null
   then return pg_catalog.jsonb_build_object('ok',false,'code','invalid-read'); end if;
 end if;

 if v_write then
   perform 1 from tm_private.teams t
     where t.team_id=p_team and t.status='active' for update;
 else
   perform 1 from tm_private.teams t
     where t.team_id=p_team and t.status='active';
 end if;
 if not found then return pg_catalog.jsonb_build_object('ok',false,'code','scope-denied'); end if;
 perform 1 from tm_private.accounts a
   where a.user_id=p_account and a.status='active' for share;
 if not found then return pg_catalog.jsonb_build_object('ok',false,'code','account-inactive'); end if;
 select exists(select 1 from tm_private.role_grants g
   where g.user_id=p_account and g.team_id=p_team and g.role=p_role
    and g.status='active' and g.policy_version=1
    and g.approved_by is not null and g.approved_by<>p_account
    and g.approved_at is not null
    and (g.valid_from is null or g.valid_from<=v_now)
    and (g.expires_at is null or v_now<g.expires_at)) into v_granted;
 if not v_granted
 then return pg_catalog.jsonb_build_object('ok',false,'code','scope-denied'); end if;

 if (p_action in ('attendance.read','availability.board','duty.board',
                 'report.summary','roster.approve','event.create','event.change',
                 'attendance.record','notice.create','notice.publish','notice.archive')
       and p_role not in ('team_coach','team_manager'))
    or (p_action in ('availability.transcribe','duty.label','duty.withdraw')
       and p_role<>'team_manager')
    or (p_action='notices.read' and p_role not in
      ('team_coach','team_manager','team_assistant','team_player','team_volunteer'))
 then return pg_catalog.jsonb_build_object('ok',false,'code','role-denied'); end if;

 if p_role in ('team_player','team_volunteer') then
   select l.person_id into v_person from tm_private.account_person_links l
     join tm_private.persons person on person.person_id=l.person_id
     where l.user_id=p_account and l.status='verified'
       and l.verified_by is not null and l.verified_by<>l.user_id
       and l.verified_at is not null and person.lifecycle='active'
     limit 1;
   if v_person is null
   then return pg_catalog.jsonb_build_object('ok',false,'code','person-not-verified'); end if;
   if p_role='team_player' and not exists (
     select 1 from tm_private.participations p where p.team_id=p_team
       and p.person_id=v_person and p.status='active'
       and p.verified_by is not null and p.verified_at is not null)
   then return pg_catalog.jsonb_build_object('ok',false,'code','participation-not-verified'); end if;
 end if;

 if not v_write then
   if p_action in ('duty.board','notices.read','report.summary')
     and p_resource<>p_team then
     return pg_catalog.jsonb_build_object('ok',false,'code','resource-out-of-scope'); end if;
   if p_action in ('attendance.read','availability.board') and not exists (
     select 1 from tm_private.sessions s
       where s.team_id=p_team and s.session_id=p_resource and s.kind='training')
   then return pg_catalog.jsonb_build_object('ok',false,'code','resource-out-of-scope'); end if;
   if p_action='attendance.read' then
     select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
       'personId',p.person_id,'status',a.attendance_status,
       'version',coalesce(a.resource_version,0)) order by p.person_id),'[]'::jsonb)
       into v_data from tm_private.participations p
       left join tm_private.team_attendance a on a.team_id=p.team_id
         and a.person_id=p.person_id and a.session_id=p_resource
       where p.team_id=p_team and p.status='active';
   elsif p_action='availability.board' then
     select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
       'personId',p.person_id,'response',a.response,
       'source',coalesce(a.recorded_source,'none'),
       'version',coalesce(a.resource_version,0)) order by p.person_id),'[]'::jsonb)
       into v_data from tm_private.participations p
       left join tm_private.availability a on a.team_id=p.team_id
         and a.person_id=p.person_id and a.session_id=p_resource
       where p.team_id=p_team and p.status='active';
   elsif p_action='duty.board' then
     select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
       'dutyId',d.duty_id,'sessionId',d.session_id,
       'personId',d.person_id,'type',d.duty_type,
       'status',d.status,'response',d.response,
       'version',d.resource_version) order by d.duty_id),'[]'::jsonb)
       into v_data from (
         select * from tm_private.duties where team_id=p_team
           order by duty_id desc limit 100
       ) d;
   elsif p_action='notices.read' then
     select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
       'noticeId',n.notice_id,'title',n.title,'body',n.body,
       'audience',n.audience,'status',n.status,'version',n.resource_version,
       'createdAt',n.created_at)
       order by n.created_at desc,n.notice_id desc),'[]'::jsonb) into v_data
     from (select * from tm_private.team_notices n
       where n.team_id=p_team and n.status<>'archived'
       and (p_role in ('team_coach','team_manager') or
         (n.status='published' and (n.audience='all'
           or (n.audience='players' and p_role='team_player')
           or (n.audience='volunteers' and p_role='team_volunteer')
           or (n.audience='coaches' and p_role='team_assistant'))))
       order by n.created_at desc,n.notice_id desc limit 50) n;
   elsif p_action='report.summary' then
     select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
       'sessionId',s.session_id,'kind',s.kind,'title',s.title,
       'startsAt',s.starts_at,
       'activeRoster',case when x.roster_count between 1 and 4 then null else x.roster_count end,
       'availabilityYes',case when x.yes_count between 1 and 4 then null else x.yes_count end,
       'attendancePresent',case when x.present_count between 1 and 4 then null else x.present_count end,
       'volunteerAccepted',case when x.volunteer_count between 1 and 4 then null else x.volunteer_count end)
       order by s.starts_at desc,s.session_id),'[]'::jsonb) into v_data
     from (select * from tm_private.sessions where team_id=p_team
       and status<>'cancelled' order by starts_at desc nulls last limit 30) s,
     lateral (select
       (select count(*) from tm_private.participations p
         where p.team_id=p_team and p.status='active') as roster_count,
       (select count(*) from tm_private.availability a
         where a.team_id=p_team and a.session_id=s.session_id
           and a.response='yes') as yes_count,
       (select count(*) from tm_private.team_attendance a
         where a.team_id=p_team and a.session_id=s.session_id
           and a.attendance_status in ('present','late')) as present_count,
       (select count(*) from tm_private.duties d
         where d.team_id=p_team and d.session_id=s.session_id
           and d.status in ('confirmed','completed')) as volunteer_count
     ) x;
   end if;
   return pg_catalog.jsonb_build_object('ok',true,'code','permitted','data',v_data);
 end if;

 select * into v_existing from tm_private.mutation_receipts m
   where m.user_id=p_account and m.team_id=p_team and m.mutation_id=v_mutation
   for update;
 if found then
   if v_existing.request_sha256=p_digest and v_existing.committed_result is not null
   then return v_existing.committed_result; end if;
   return pg_catalog.jsonb_build_object('ok',false,'code','mutation-id-reused');
 end if;

 if p_action='roster.approve' then
   if p_resource=p_team or v_command<>'{"op":"approve"}'::jsonb
   then return pg_catalog.jsonb_build_object('ok',false,'code','invalid-roster'); end if;
   update tm_private.participations set
     status='active',verified_by=p_account,verified_at=v_now,
     resource_version=resource_version+1
     where team_id=p_team and person_id=p_resource and status='pending'
       and resource_version=v_expected
     returning resource_version into v_version;
   if v_version is null then
     return pg_catalog.jsonb_build_object('ok',false,'code','stale-roster'); end if;
 elsif p_action='event.create' then
   if p_resource<>p_team or v_expected<>0
     or v_command->>'kind' not in ('friendly','activity')
     or exists(select 1 from pg_catalog.jsonb_object_keys(v_command) k
       where k not in ('kind','title','locationLabel','startsAt'))
     or coalesce(length(pg_catalog.btrim(v_command->>'title')),0) not between 1 and 120
     or coalesce(length(v_command->>'locationLabel'),0)>120
     or (v_command->>'startsAt') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T'
   then return pg_catalog.jsonb_build_object('ok',false,'code','invalid-event'); end if;
   v_type:=v_command->>'kind';
   v_resource:='event-'||pg_catalog.replace(gen_random_uuid()::text,'-','');
   insert into tm_private.sessions(session_id,team_id,kind,starts_at,title,
       location_label,management_origin)
     values(v_resource,p_team,case when v_type='friendly' then 'match' else 'other' end,
       (v_command->>'startsAt')::timestamptz,
       pg_catalog.btrim(v_command->>'title'),
       coalesce(pg_catalog.btrim(v_command->>'locationLabel'),''),
       case when v_type='friendly' then 'team-friendly' else 'team-activity' end);
   v_version:=0;
 elsif p_action='event.change' then
   if v_command->>'op' not in ('reschedule','cancel')
      or (v_command->>'op'='cancel' and v_command<>'{"op":"cancel"}'::jsonb)
      or (v_command->>'op'='reschedule' and
        (v_command->>'startsAt' is null or
         (v_command->>'startsAt') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T'
         or exists(select 1 from pg_catalog.jsonb_object_keys(v_command) k
           where k not in ('op','startsAt','title','locationLabel'))
         or coalesce(length(pg_catalog.btrim(v_command->>'title')),1) not between 1 and 120
         or coalesce(length(v_command->>'locationLabel'),0)>120))
   then return pg_catalog.jsonb_build_object('ok',false,'code','invalid-event'); end if;
   update tm_private.sessions set
     status=case when v_command->>'op'='cancel' then 'cancelled' else status end,
     starts_at=case when v_command->>'op'='reschedule'
       then (v_command->>'startsAt')::timestamptz else starts_at end,
     title=case when v_command ? 'title' then pg_catalog.btrim(v_command->>'title') else title end,
     location_label=case when v_command ? 'locationLabel'
       then pg_catalog.btrim(v_command->>'locationLabel') else location_label end,
     resource_version=resource_version+1
     where session_id=p_resource and team_id=p_team
       and management_origin in ('team-friendly','team-activity')
       and status='planned' and resource_version=v_expected
     returning resource_version into v_version;
   if v_version is null then
     return pg_catalog.jsonb_build_object('ok',false,'code','stale-or-external-event'); end if;
 elsif p_action='attendance.record' then
   if v_command->>'status' not in ('present','absent','late','excused')
      or coalesce(v_command->>'personId','') !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$'
      or exists(select 1 from pg_catalog.jsonb_object_keys(v_command) k
        where k not in ('personId','status'))
      or not exists(select 1 from tm_private.sessions s
        where s.team_id=p_team and s.session_id=p_resource
          and s.kind='training' and s.status<>'cancelled')
      or not exists(select 1 from tm_private.participations p
        where p.team_id=p_team and p.person_id=v_command->>'personId'
          and p.status='active' and p.verified_by is not null)
   then return pg_catalog.jsonb_build_object('ok',false,'code','invalid-attendance'); end if;
   select a.resource_version into v_version from tm_private.team_attendance a
     where a.session_id=p_resource and a.person_id=v_command->>'personId'
     for update;
   if not found and v_expected=0 then
     insert into tm_private.team_attendance(
       session_id,team_id,person_id,attendance_status,recorded_by)
       values(p_resource,p_team,v_command->>'personId',v_command->>'status',p_account);
     v_version:=0;
   elsif v_version=v_expected then
     update tm_private.team_attendance set attendance_status=v_command->>'status',
       recorded_by=p_account,recorded_at=v_now,
       resource_version=resource_version+1
       where session_id=p_resource and team_id=p_team
         and person_id=v_command->>'personId' and resource_version=v_expected
       returning resource_version into v_version;
   else return pg_catalog.jsonb_build_object('ok',false,'code','stale-attendance'); end if;
 elsif p_action='availability.transcribe' then
   if p_role<>'team_manager' or
      v_command->>'response' not in ('yes','no','maybe')
      or v_command->>'source' not in ('phone','in_person','email')
      or coalesce(v_command->>'personId','') !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$'
      or exists(select 1 from pg_catalog.jsonb_object_keys(v_command) k
        where k not in ('personId','response','source'))
      or not exists(select 1 from tm_private.sessions s
        where s.team_id=p_team and s.session_id=p_resource and s.status='planned')
      or not exists(select 1 from tm_private.participations p
        where p.team_id=p_team and p.person_id=v_command->>'personId'
          and p.status='active')
   then return pg_catalog.jsonb_build_object('ok',false,'code','invalid-availability'); end if;
   select a.resource_version into v_version from tm_private.availability a
     where a.session_id=p_resource and a.person_id=v_command->>'personId' for update;
   if not found and v_expected=0 then
     insert into tm_private.availability(availability_id,session_id,team_id,
       person_id,response,recorded_source,recorded_by,recorded_at)
       values('availability-'||pg_catalog.replace(gen_random_uuid()::text,'-',''),
         p_resource,p_team,v_command->>'personId',v_command->>'response',
         v_command->>'source',p_account,v_now);
     v_version:=0;
   elsif v_version=v_expected then
     update tm_private.availability set response=v_command->>'response',
       recorded_source=v_command->>'source',recorded_by=p_account,
       recorded_at=v_now,resource_version=resource_version+1
       where session_id=p_resource and team_id=p_team
         and person_id=v_command->>'personId' and resource_version=v_expected
       returning resource_version into v_version;
   else return pg_catalog.jsonb_build_object('ok',false,'code','stale-availability'); end if;
 elsif p_action='duty.label' then
   if p_role<>'team_manager' or v_command->>'type' not in
       ('general_help','setup','equipment','scorer_support')
      or (v_command-'type')<>'{}'::jsonb
   then return pg_catalog.jsonb_build_object('ok',false,'code','invalid-duty'); end if;
   update tm_private.duties set duty_type=v_command->>'type',
     resource_version=resource_version+1
     where duty_id=p_resource and team_id=p_team and
       status in ('assigned','confirmed') and resource_version=v_expected
     returning resource_version into v_version;
   if v_version is null then
     return pg_catalog.jsonb_build_object('ok',false,'code','stale-or-invalid-duty'); end if;
 elsif p_action='duty.withdraw' then
   if p_role<>'team_manager' or v_command<>'{"op":"withdraw"}'::jsonb
   then return pg_catalog.jsonb_build_object('ok',false,'code','invalid-duty'); end if;
   update tm_private.duties set status='revoked',
     resource_version=resource_version+1
     where duty_id=p_resource and team_id=p_team and
       status in ('assigned','confirmed') and resource_version=v_expected
     returning resource_version into v_version;
   if v_version is null then
     return pg_catalog.jsonb_build_object('ok',false,'code','stale-or-invalid-duty'); end if;
 elsif p_action='notice.create' then
   if p_resource<>p_team or v_expected<>0 or
      v_command->>'audience' not in ('all','players','volunteers','coaches')
      or coalesce(length(pg_catalog.btrim(v_command->>'title')),0) not between 1 and 100
      or coalesce(length(pg_catalog.btrim(v_command->>'body')),0) not between 1 and 1000
      or (v_command->>'title') ~ '[[:cntrl:]]'
      or (v_command->>'body') ~ '[[:cntrl:]]'
      or exists(select 1 from pg_catalog.jsonb_object_keys(v_command) k
        where k not in ('title','body','audience'))
   then return pg_catalog.jsonb_build_object('ok',false,'code','invalid-notice'); end if;
   v_resource:='notice-'||pg_catalog.replace(gen_random_uuid()::text,'-','');
   insert into tm_private.team_notices(notice_id,team_id,author_id,
     title,body,audience)
     values(v_resource,p_team,p_account,pg_catalog.btrim(v_command->>'title'),
       pg_catalog.btrim(v_command->>'body'),v_command->>'audience');
   v_version:=0;
 elsif p_action in ('notice.publish','notice.archive') then
   if (p_action='notice.publish' and v_command<>'{"op":"publish"}'::jsonb)
      or (p_action='notice.archive' and v_command<>'{"op":"archive"}'::jsonb)
   then return pg_catalog.jsonb_build_object('ok',false,'code','invalid-notice'); end if;
   update tm_private.team_notices set
      status=case when p_action='notice.publish' then 'published' else 'archived' end,
      published_at=case when p_action='notice.publish' then v_now else published_at end,
      resource_version=resource_version+1
     where notice_id=p_resource and team_id=p_team and
       ((p_action='notice.publish' and status='draft')
         or (p_action='notice.archive' and status in ('draft','published')))
       and resource_version=v_expected
     returning resource_version into v_version;
   if v_version is null then
     return pg_catalog.jsonb_build_object('ok',false,'code','stale-notice'); end if;
 else
   return pg_catalog.jsonb_build_object('ok',false,'code','invalid-command');
 end if;

 v_result:=pg_catalog.jsonb_build_object(
   'ok',true,'code','committed','resourceId',v_resource,'version',v_version);
 insert into tm_private.audit_events(at,user_id,team_id,action,resource_id,
   decision,mutation_id,reason_code)
 values(v_now,p_account,p_team,p_action,v_resource,'ALLOW',v_mutation,'committed');
 insert into tm_private.mutation_receipts(
    user_id,team_id,mutation_id,action,request_sha256,resource_id,
    expected_version,committed_result)
 values(p_account,p_team,v_mutation,p_action,p_digest,
   v_resource,v_expected,v_result);
 return v_result;
end;
$$;
revoke all on function public.tm_stage3b_operation(
  uuid,text,text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.tm_stage3b_operation(
  uuid,text,text,text,text,jsonb,text) to service_role;

-- Stage 1 Player self-reply already uses a separately qualified transactional
-- update. A narrow BEFORE UPDATE trigger resets provenance when Stage 1 changes
-- the response/version without supplying new provenance. Stage 3B Manager writes
-- update source, recorder and recorded_at explicitly and therefore preserve
-- their external-source audit.
create function tm_private.stage3b_availability_self_reply_provenance()
returns trigger language plpgsql set search_path=''
as $
begin
 if new.resource_version=old.resource_version+1
   and new.recorded_source is not distinct from old.recorded_source
   and new.recorded_by is not distinct from old.recorded_by
   and new.recorded_at is not distinct from old.recorded_at
 then
   new.recorded_source:='self';
   new.recorded_by:=null;
   new.recorded_at:=pg_catalog.now();
 end if;
 return new;
end;
$;
create trigger stage3b_availability_reply_provenance
before update on tm_private.availability
for each row execute function tm_private.stage3b_availability_self_reply_provenance();
revoke execute on function tm_private.stage3b_availability_self_reply_provenance()
  from public,anon,authenticated;
