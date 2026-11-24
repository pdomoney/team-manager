-- Additive source candidate; not an installation authorisation.
-- Extend the latest founder-aware operations from 20261121010000 and the
-- fixture-aware management operation from 20261124020000, NOT older RPCs.
-- Existing data, service-only privileges, founder provenance, exact-team locks,
-- receipts, version checks and audit paths are preserved. Apply only after
-- comparing actual installed definitions and qualifying the restored database.
begin;
create or replace function public.tm_stage1_operation(
  p_account uuid, p_team text, p_role text, p_action text,
  p_resource text, p_payload jsonb, p_digest text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_person text;
  v_granted boolean;
  v_mutation text;
  v_expected integer;
  v_existing tm_private.mutation_receipts%rowtype;
  v_command jsonb;
  v_response text;
  v_version integer;
  v_resource text := p_resource;
  v_kind text;
  v_status text;
  v_data jsonb;
  v_result jsonb;
  v_write boolean;
begin
  if p_team is null or p_team !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$'
     or p_resource is null or p_resource !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$'
     or p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or p_role not in ('team_coach','team_assistant','team_manager','team_player','team_volunteer')
     or p_action not in ('schedule.read','schedule.edit','roster.read',
       'roster.edit','availability.reply','duty.read','duty.reply','duty.assign')
  then return jsonb_build_object('ok',false,'code','invalid-command'); end if;

  v_write := p_action not in ('schedule.read','roster.read','duty.read');
  if v_write then
    if p_digest is null or p_digest !~ '^[0-9a-f]{64}$'
       or coalesce(p_payload->>'mutationId','') !~ '^[A-Za-z0-9][A-Za-z0-9_-]{15,79}$'
       or jsonb_typeof(p_payload->'expectedVersion') <> 'number'
       or coalesce(p_payload->>'expectedVersion','') !~ '^(0|[1-9][0-9]{0,9})$'
    then return jsonb_build_object('ok',false,'code','invalid-mutation'); end if;
    v_mutation := p_payload->>'mutationId';
    if (p_payload->>'expectedVersion')::bigint > 2147483647
    then return jsonb_build_object('ok',false,'code','invalid-mutation'); end if;
    v_expected := (p_payload->>'expectedVersion')::integer;
    if (p_payload - 'mutationId' - 'expectedVersion') ?| array[
       'accountId','personId','roleGrant','approvedBy','teamId','verified','isAdmin']
    then return jsonb_build_object('ok',false,'code','forged-field'); end if;
  else
    if p_payload <> '{}'::jsonb or p_digest is not null
    then return jsonb_build_object('ok',false,'code','invalid-read'); end if;
  end if;

  -- Team row lock serialises concurrent Stage 1 mutations, including duplicate
  -- mutation IDs, and covers the complete command from grant check to receipt.
  if v_write then
    perform 1 from tm_private.teams t
      where t.team_id=p_team and t.status='active' for update;
  else
    perform 1 from tm_private.teams t
      where t.team_id=p_team and t.status='active';
  end if;
  if not found then
    return jsonb_build_object('ok',false,'code','scope-denied');
  end if;
  perform 1 from tm_private.accounts a
    where a.user_id=p_account and a.status='active' for share;
  if not found then
    return jsonb_build_object('ok',false,'code','account-inactive');
  end if;
  select exists(
    select 1 from tm_private.role_grants g
      where g.user_id=p_account and g.team_id=p_team
        and g.role=p_role and g.status='active' and g.policy_version=1
        and ((g.approved_by is not null and g.approved_by<>p_account) or tm_private.stage3d4_founder_coach(g.user_id,g.team_id,g.grant_id))
        and (g.valid_from is null or g.valid_from<=v_now)
        and (g.expires_at is null or v_now<g.expires_at)
  ) into v_granted;
  if not v_granted then
    return jsonb_build_object('ok',false,'code','scope-denied');
  end if;
  if (p_action in ('schedule.edit','roster.edit','roster.read')
      and p_role not in ('team_coach','team_manager','team_assistant'))
     or (p_action='schedule.edit' and p_role not in ('team_coach','team_manager','team_assistant'))
     or (p_action='roster.edit' and p_role not in ('team_coach','team_manager'))
     or (p_action='roster.read' and p_role not in ('team_coach','team_manager'))
     or (p_action='schedule.read' and p_role not in ('team_coach','team_manager','team_assistant','team_player'))
     or (p_action='availability.reply' and p_role<>'team_player')
     or (p_action in ('duty.read','duty.reply') and p_role<>'team_volunteer')
     or (p_action='duty.assign' and p_role<>'team_manager')
  then return jsonb_build_object('ok',false,'code','role-denied'); end if;

  if p_role in ('team_player','team_volunteer') then
    select l.person_id into v_person
      from tm_private.account_person_links l
      where l.user_id=p_account and l.status='verified'
        and l.verified_by is not null and l.verified_by<>p_account
        and l.verified_at is not null limit 1;
    if v_person is null then
      return jsonb_build_object('ok',false,'code','person-not-verified');
    end if;
    if p_role='team_player' then
      perform 1 from tm_private.participations x
        where x.team_id=p_team and x.person_id=v_person
          and x.status='active' and x.verified_by is not null
          and x.verified_at is not null;
      if not found then
        return jsonb_build_object('ok',false,'code','participation-not-verified');
      end if;
    end if;
  end if;

  if not v_write then
    if p_resource<>p_team then
      return jsonb_build_object('ok',false,'code','resource-out-of-scope');
    end if;
    if p_action='schedule.read' then
      select coalesce(jsonb_agg(jsonb_build_object(
        'sessionId',s.session_id,'kind',s.kind,'startsAt',s.starts_at,
        'title',s.title,'locationLabel',s.location_label,
        'status',s.status,'version',s.resource_version,
        'managementOrigin',s.management_origin,
        'myAvailability',case when p_role='team_player' then (
          select a.response from tm_private.availability a
            where a.session_id=s.session_id and a.person_id=v_person
        ) else null end,
        'myAvailabilityVersion',case when p_role='team_player' then (
          select a.resource_version from tm_private.availability a
            where a.session_id=s.session_id and a.person_id=v_person
        ) else null end
      ) order by s.starts_at,s.session_id),'[]'::jsonb)
      into v_data from tm_private.sessions s
      where s.team_id=p_team;
    elsif p_action='roster.read' then
      select coalesce(jsonb_agg(jsonb_build_object(
        'personId',x.person_id,'status',x.status,'version',x.resource_version)
        order by x.person_id),'[]'::jsonb)
      into v_data from tm_private.participations x where x.team_id=p_team;
    elsif p_action='duty.read' then
      select coalesce(jsonb_agg(jsonb_build_object(
        'dutyId',d.duty_id,'sessionId',d.session_id,'status',d.status,
        'response',d.response,'version',d.resource_version)
        order by d.duty_id),'[]'::jsonb)
      into v_data from tm_private.duties d
      where d.team_id=p_team and d.person_id=v_person
        and d.status in ('assigned','confirmed','completed');
    end if;
    return jsonb_build_object('ok',true,'code','permitted','data',v_data);
  end if;

  select * into v_existing from tm_private.mutation_receipts r
    where r.user_id=p_account and r.team_id=p_team and r.mutation_id=v_mutation
    for update;
  if found then
    if v_existing.request_sha256=p_digest and v_existing.committed_result is not null
    then return v_existing.committed_result; end if;
    return jsonb_build_object('ok',false,'code','mutation-id-reused');
  end if;

  v_command := p_payload->'command';
  if p_action='schedule.edit' then
    if jsonb_typeof(v_command)<>'object'
       or exists(select 1 from jsonb_object_keys(v_command) k
         where k not in ('op','title','locationLabel','startsAt','kind'))
    then return jsonb_build_object('ok',false,'code','invalid-training'); end if;
    if v_command->>'op'='create' and p_resource=p_team
       and v_expected=0 and v_command->>'kind'='training'
       and char_length(coalesce(v_command->>'title','')) between 1 and 120
       and char_length(coalesce(v_command->>'locationLabel',''))<=120
       and v_command->>'startsAt' is not null
    then
      v_resource := 'training-' || replace(gen_random_uuid()::text,'-','');
      insert into tm_private.sessions(session_id,team_id,kind,starts_at,title,location_label)
        values(v_resource,p_team,'training',(v_command->>'startsAt')::timestamptz,
          v_command->>'title',coalesce(v_command->>'locationLabel',''));
      v_version := 0;
    elsif v_command->>'op' in ('update','cancel')
      and not (v_command ? 'kind') and p_resource<>p_team
    then
      if v_command->>'op'='update' and
         (char_length(coalesce(v_command->>'title','x')) not between 1 and 120
           or char_length(coalesce(v_command->>'locationLabel',''))>120
           or not (v_command ? 'title' or v_command ? 'startsAt' or v_command ? 'locationLabel'))
      then return jsonb_build_object('ok',false,'code','invalid-training'); end if;
      if v_command->>'op'='cancel' and (v_command - 'op')<>'{}'::jsonb
      then return jsonb_build_object('ok',false,'code','invalid-training'); end if;
      update tm_private.sessions set
        title=case when v_command ? 'title' then v_command->>'title' else title end,
        starts_at=case when v_command ? 'startsAt' then
          (v_command->>'startsAt')::timestamptz else starts_at end,
        location_label=case when v_command ? 'locationLabel'
          then v_command->>'locationLabel' else location_label end,
        status=case when v_command->>'op'='cancel' then 'cancelled' else status end,
        resource_version=resource_version+1
        where session_id=p_resource and team_id=p_team and kind='training'
          and status='planned' and resource_version=v_expected
        returning resource_version into v_version;
      if v_version is null then
        return jsonb_build_object('ok',false,'code','stale-or-protected-session');
      end if;
    else return jsonb_build_object('ok',false,'code','invalid-training'); end if;

  elsif p_action='roster.edit' then
    if jsonb_typeof(v_command)<>'object'
       or exists(select 1 from jsonb_object_keys(v_command) k
          where k not in ('op','personId'))
       or v_command->>'personId' is null
       or v_command->>'personId' !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$'
       or p_resource<>p_team or v_command->>'op' not in ('nominate','withdraw')
    then return jsonb_build_object('ok',false,'code','invalid-roster'); end if;
    select x.resource_version into v_version from tm_private.participations x
      where x.team_id=p_team and x.person_id=v_command->>'personId';
    if not found and v_command->>'op'='nominate' and v_expected=0 then
      insert into tm_private.persons(person_id) values(v_command->>'personId')
        on conflict do nothing;
      insert into tm_private.participations(team_id,person_id,kind,status)
        values(p_team,v_command->>'personId','player','pending');
      v_version:=0;
    elsif found and v_command->>'op'='withdraw' and v_version=v_expected then
      -- Withdrawing from the team cannot erase previous club registrar
      -- verification evidence. Nomination must never reset an active player.
      update tm_private.participations set
        status='inactive',resource_version=resource_version+1
        where team_id=p_team and person_id=v_command->>'personId'
          and status <> 'inactive'
        returning resource_version into v_version;
      if v_version is null then
        return jsonb_build_object('ok',false,'code','stale-roster');
      end if;
    else return jsonb_build_object('ok',false,'code','stale-roster'); end if;
    v_resource:=v_command->>'personId';

  elsif p_action='availability.reply' then
    if p_payload->>'response' not in ('yes','no','maybe') or
       (p_payload - 'mutationId' - 'expectedVersion' - 'response')<>'{}'::jsonb
    then return jsonb_build_object('ok',false,'code','invalid-response'); end if;
    perform 1 from tm_private.sessions s where s.session_id=p_resource
      and s.team_id=p_team and s.status='planned';
    if not found then return jsonb_build_object('ok',false,'code','session-unavailable'); end if;
    select a.resource_version into v_version from tm_private.availability a
      where a.session_id=p_resource and a.team_id=p_team and a.person_id=v_person;
    if not found and v_expected=0 then
      insert into tm_private.availability(
        availability_id,session_id,team_id,person_id,response)
      values('availability-' || replace(gen_random_uuid()::text,'-',''),
        p_resource,p_team,v_person,p_payload->>'response');
      v_version:=0;
    elsif v_version=v_expected then
      update tm_private.availability set response=p_payload->>'response',
        resource_version=resource_version+1
      where session_id=p_resource and team_id=p_team and person_id=v_person
      returning resource_version into v_version;
    else return jsonb_build_object('ok',false,'code','stale-availability'); end if;

  elsif p_action='duty.assign' then
    if p_role<>'team_manager' or p_resource<>p_team or v_expected<>0
       or jsonb_typeof(v_command)<>'object'
       or exists(select 1 from jsonb_object_keys(v_command) k
          where k not in ('op','sessionId','personId'))
       or v_command->>'op'<>'assign'
       or v_command->>'sessionId' is null or v_command->>'personId' is null
    then return jsonb_build_object('ok',false,'code','invalid-duty'); end if;
    perform 1 from tm_private.sessions s where s.team_id=p_team
      and s.session_id=v_command->>'sessionId' and s.status='planned';
    if not found then return jsonb_build_object('ok',false,'code','session-unavailable'); end if;
    -- Independently verified link and active volunteer grant; duty is not a role.
    perform 1 from tm_private.role_grants g
      join tm_private.account_person_links l on l.user_id=g.user_id
      join tm_private.accounts volunteer_account on volunteer_account.user_id=g.user_id
      where volunteer_account.status='active' and g.team_id=p_team and g.role='team_volunteer' and g.status='active'
        and g.policy_version=1 and ((g.approved_by is not null
        and g.approved_by<>g.user_id) or tm_private.stage3d4_founder_coach(g.user_id,g.team_id,g.grant_id))
        and (g.valid_from is null or g.valid_from<=v_now)
        and (g.expires_at is null or v_now<g.expires_at)
        and l.person_id=v_command->>'personId' and l.status='verified'
        and l.verified_by is not null and l.verified_by<>l.user_id;
    if not found then return jsonb_build_object('ok',false,'code','volunteer-not-verified'); end if;
    v_resource:='duty-' || replace(gen_random_uuid()::text,'-','');
    insert into tm_private.duties(
      duty_id,session_id,team_id,person_id,status,approved_by,approved_at)
      values(v_resource,v_command->>'sessionId',p_team,
        v_command->>'personId','assigned',p_account,v_now);
    v_version:=0;

  elsif p_action='duty.reply' then
    if p_payload->>'response' not in ('yes','no','done') or
       (p_payload - 'mutationId' - 'expectedVersion' - 'response')<>'{}'::jsonb
    then return jsonb_build_object('ok',false,'code','invalid-response'); end if;
    select d.status,d.resource_version into v_status,v_version
      from tm_private.duties d where d.duty_id=p_resource
        and d.team_id=p_team and d.person_id=v_person;
    if not found then return jsonb_build_object('ok',false,'code','duty-not-assigned'); end if;
    if v_version<>v_expected or
      (v_status not in ('assigned','confirmed')) or
      (p_payload->>'response'='done' and v_status<>'confirmed')
    then return jsonb_build_object('ok',false,'code','stale-or-invalid-duty'); end if;
    update tm_private.duties set response=p_payload->>'response',
      status=case p_payload->>'response' when 'yes' then 'confirmed'
        when 'no' then 'revoked' else 'completed' end,
      resource_version=resource_version+1
      where duty_id=p_resource and team_id=p_team and person_id=v_person
        and resource_version=v_expected
      returning resource_version into v_version;
  else return jsonb_build_object('ok',false,'code','invalid-command'); end if;

  v_result:=jsonb_build_object('ok',true,'code','committed',
    'resourceId',v_resource,'version',v_version);
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
create or replace function public.tm_stage3b_operation(
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
    and ((g.approved_by is not null and g.approved_by<>p_account) or tm_private.stage3d4_founder_coach(g.user_id,g.team_id,g.grant_id))
    and g.approved_at is not null
    and (g.valid_from is null or g.valid_from<=v_now)
    and (g.expires_at is null or v_now<g.expires_at)) into v_granted;
 if not v_granted
 then return pg_catalog.jsonb_build_object('ok',false,'code','scope-denied'); end if;

 if (p_action in ('attendance.read','availability.board','duty.board',
                 'report.summary','roster.approve','event.create','event.change',
                 'attendance.record','notice.create','notice.publish','notice.archive')
       and p_role not in ('team_coach','team_manager'))
    or (p_action='availability.transcribe'
       and not tm_private.stage3d5_team_admin(p_account,p_team,p_role))
    or (p_action in ('duty.label','duty.withdraw')
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
       where s.team_id=p_team and s.session_id=p_resource
         and (s.kind='training' or (p_action='availability.board' and s.kind='match')))
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
   if not tm_private.stage3d5_team_admin(p_account,p_team,p_role) or
      coalesce(v_command->>'response','') not in ('yes','no','maybe')
      or coalesce(v_command->>'source','') not in ('phone','in_person','email')
      or coalesce(v_command->>'personId','') !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$'
      or exists(select 1 from pg_catalog.jsonb_object_keys(v_command) k
        where k not in ('personId','response','source'))
      or not exists(select 1 from tm_private.sessions s
        where s.team_id=p_team and s.session_id=p_resource and s.status='planned')
      or not exists(select 1 from tm_private.participations p
        where p.team_id=p_team and p.person_id=v_command->>'personId'
          and p.status='active' and p.verified_by is not null and p.verified_at is not null)
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
create or replace function public.tm_stage3d5_team(
 p_actor uuid,p_team text,p_role text,p_action text,p_input jsonb
) returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare
 now_at timestamptz:=now();
 allowed boolean;
 admin_ok boolean;
 obj jsonb:=coalesce(p_input,'{}'::jsonb);
 records jsonb;
 row_version integer;
 ref text;
 v_email text;
 v_role text;
 v_inv tm_private.team_invitations%rowtype;
 v_user uuid;
 v_evidence text;
 v_label text;
begin
 if p_actor is null or p_team is null or p_team !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$'
   or p_role not in ('team_coach','team_manager') or
   p_action not in ('settings.read','settings.save','jerseys.read','jerseys.issue',
     'jerseys.return','competitions.read','competitions.create','competitions.update',
     'competitions.fixture','competitions.fixtures','messages.read','messages.prepare','messages.confirm',
     'team.members','volunteers.list','admin.status','duties.board','duties.assign','duties.withdraw','invite.list','invite.issue','invite.review-adult',
     'invite.activate','invite.revoke') or jsonb_typeof(obj)<>'object'
   or pg_catalog.length(obj::text)>5000
 then return jsonb_build_object('ok',false,'code','invalid-request'); end if;
 allowed:=tm_private.stage3d5_staff(p_actor,p_team,p_role);
 if not allowed then return jsonb_build_object('ok',false,'code','scope-denied'); end if;
 admin_ok:=tm_private.stage3d5_team_admin(p_actor,p_team,p_role);
 if p_action in ('settings.read','jerseys.read','competitions.read','competitions.fixtures','messages.read',
                'team.members','volunteers.list','admin.status','duties.board','invite.list') then
   if obj<>'{}'::jsonb then return jsonb_build_object('ok',false,'code','invalid-request'); end if;
 else
   -- Stop forged approval, role, account or eligibility claims.
   if obj ?| array['userId','accountId','isAdmin','approvedBy','verified',
      'registered','eligible','accredited','officialVerified','teamId']
   then return jsonb_build_object('ok',false,'code','invalid-request'); end if;
   perform 1 from tm_private.teams t where t.team_id=p_team and t.status='active' for update;
   if not found then return jsonb_build_object('ok',false,'code','scope-denied'); end if;
 end if;

 if p_action='settings.read' then
  select jsonb_build_object('teamLabel',coalesce(s.team_label,''),
    'trainingVenue',coalesce(s.training_venue,''),
    'trainingStart',coalesce(s.training_start,''),
    'trainingEnd',coalesce(s.training_end,''),
    'contactName',coalesce(s.contact_name,''),
    'contactEmail',coalesce(s.contact_email,''),
    'jerseyLoan',coalesce(s.jersey_loan,false),'version',coalesce(s.version,0))
   into records from tm_private.teams t left join tm_private.team_preferences s
     on s.team_id=t.team_id where t.team_id=p_team;
 elsif p_action='settings.save' then
  if not admin_ok or (obj-'teamLabel'-'trainingVenue'-'trainingStart'-'trainingEnd'-
      'contactName'-'contactEmail'-'jerseyLoan'-'expectedVersion')<>'{}'::jsonb or
      jsonb_typeof(obj->'expectedVersion')<>'number'
      or coalesce((obj->>'expectedVersion')::text,'') !~ '^(0|[1-9][0-9]{0,8})$'
      or jsonb_typeof(obj->'jerseyLoan')<>'boolean'
      or coalesce(length(obj->>'teamLabel'),0)>100
      or coalesce(length(obj->>'trainingVenue'),0)>120
      or coalesce(length(obj->>'contactName'),0)>80
      or coalesce(length(obj->>'contactEmail'),0)>254
      or (obj->>'trainingStart') !~ '^$|^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or (obj->>'trainingEnd') !~ '^$|^([01][0-9]|2[0-3]):[0-5][0-9]$'
   then return jsonb_build_object('ok',false,'code','invalid-request'); end if;
   insert into tm_private.team_preferences(team_id) values(p_team) on conflict do nothing;
   update tm_private.team_preferences set
    team_label=coalesce(obj->>'teamLabel',''),training_venue=coalesce(obj->>'trainingVenue',''),
    training_start=coalesce(obj->>'trainingStart',''),
    training_end=coalesce(obj->>'trainingEnd',''),
    contact_name=coalesce(obj->>'contactName',''),
    contact_email=coalesce(obj->>'contactEmail',''),
    jersey_loan=(obj->>'jerseyLoan')::boolean,version=version+1
    where team_id=p_team and version=(obj->>'expectedVersion')::integer
    returning version into row_version;
   if row_version is null then return jsonb_build_object('ok',false,'code','stale-version'); end if;
   records:=jsonb_build_object('version',row_version);
 elsif p_action='jerseys.read' then
  select coalesce(jsonb_agg(jsonb_build_object('issueId',j.issue_id,
    'personId',j.person_id,'jerseyNo',j.jersey_no,'season',j.season_ref,
    'issuedAt',j.issued_at,'returnedAt',j.returned_at,'version',j.version)
    order by j.issued_at desc),'[]'::jsonb) into records
    from tm_private.team_jerseys j where j.team_id=p_team;
 elsif p_action='jerseys.issue' then
  if not admin_ok or (obj-'personId'-'jerseyNo')<>'{}'::jsonb
     or coalesce(obj->>'personId','') !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$'
     or coalesce(obj->>'jerseyNo','') !~ '^[0-9]{1,3}$'
     or not exists(select 1 from tm_private.participations p
       where p.team_id=p_team and p.person_id=obj->>'personId' and p.status='active')
  then return jsonb_build_object('ok',false,'code','invalid-request'); end if;
  ref:='jersey-'||replace(gen_random_uuid()::text,'-','');
  if exists(select 1 from tm_private.team_jerseys j where j.team_id=p_team
     and j.season_ref=(select season_ref from tm_private.teams where team_id=p_team)
     and j.returned_at is null and
     (j.jersey_no=obj->>'jerseyNo' or j.person_id=obj->>'personId'))
  then return jsonb_build_object('ok',false,'code','already-assigned'); end if;
  insert into tm_private.team_jerseys(issue_id,team_id,person_id,season_ref,jersey_no,recorded_by)
   select ref,p_team,obj->>'personId',t.season_ref,obj->>'jerseyNo',p_actor
   from tm_private.teams t where t.team_id=p_team;
  records:=jsonb_build_object('issueId',ref);
 elsif p_action='jerseys.return' then
  if not admin_ok or (obj-'issueId'-'expectedVersion')<>'{}'::jsonb
    or coalesce(obj->>'issueId','') !~ '^jersey-[0-9a-f]{32}$'
    or coalesce(obj->>'expectedVersion','') !~ '^(0|[1-9][0-9]{0,8})$'
  then return jsonb_build_object('ok',false,'code','invalid-request'); end if;
  update tm_private.team_jerseys set returned_at=now_at,version=version+1
    where issue_id=obj->>'issueId' and team_id=p_team and returned_at is null
     and version=(obj->>'expectedVersion')::integer returning version into row_version;
  if row_version is null then return jsonb_build_object('ok',false,'code','stale-version'); end if;
  records:=jsonb_build_object('version',row_version);
 elsif p_action='competitions.read' then
  select coalesce(jsonb_agg(jsonb_build_object('competitionId',c.competition_id,
   'name',c.name,'format',c.format,'season',c.season_ref,'division',c.division,
   'organiser',c.organiser,'venue',c.venue,'beginsOn',c.begins_on,
   'endsOn',c.ends_on,'status',c.entry_status,'version',c.version)
   order by c.created_at desc),'[]'::jsonb) into records
   from tm_private.team_competitions c where c.team_id=p_team;
 elsif p_action='competitions.fixtures' then
   -- Read only existing team-recorded matches. No official draw claims,
   -- no competitor person records, and no inferred scores.
   select coalesce(jsonb_agg(jsonb_build_object(
      'competitionId',f.competition_id,'sessionId',f.session_id,
      'title',s.title,'startsAt',s.starts_at,'locationLabel',s.location_label,
      'status',s.status,'official',false,'version',s.resource_version)
      order by s.starts_at,s.session_id),'[]'::jsonb) into records
     from tm_private.team_competition_fixtures f
     join tm_private.sessions s on s.session_id=f.session_id
       and s.team_id=f.team_id
     join tm_private.team_competitions c on c.competition_id=f.competition_id
       and c.team_id=f.team_id
     where f.team_id=p_team and s.management_origin='team-activity'
       and s.kind='match';
 elsif p_action in ('competitions.create','competitions.update') then
  if not admin_ok or (obj-'competitionId'-'name'-'format'-'division'-
       'organiser'-'venue'-'beginsOn'-'endsOn'-'status'-'expectedVersion')<>'{}'::jsonb
    or coalesce(length(trim(obj->>'name')),0) not between 1 and 120
    or obj->>'format' not in ('league','tournament','carnival','friendly-series')
    or coalesce(length(obj->>'division'),0)>100
    or coalesce(length(obj->>'organiser'),0)>120
    or coalesce(length(obj->>'venue'),0)>120
    or coalesce(obj->>'status','planned') not in ('planned','entered','withdrawn','completed')
    or (nullif(obj->>'beginsOn','') is not null and obj->>'beginsOn' !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$')
    or (nullif(obj->>'endsOn','') is not null and obj->>'endsOn' !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$')
  then return jsonb_build_object('ok',false,'code','invalid-request'); end if;
  if p_action='competitions.create' then
   if obj ? 'competitionId' or obj ? 'expectedVersion'
   then return jsonb_build_object('ok',false,'code','invalid-request'); end if;
   ref:='competition-'||replace(gen_random_uuid()::text,'-','');
   insert into tm_private.team_competitions(
     competition_id,team_id,name,format,season_ref,division,organiser,venue,
     begins_on,ends_on,entry_status,created_by)
   select ref,p_team,trim(obj->>'name'),obj->>'format',t.season_ref,
     coalesce(obj->>'division',''),coalesce(obj->>'organiser',''),
     coalesce(obj->>'venue',''),nullif(obj->>'beginsOn','')::date,
     nullif(obj->>'endsOn','')::date,coalesce(obj->>'status','planned'),p_actor
   from tm_private.teams t where t.team_id=p_team;
   records:=jsonb_build_object('competitionId',ref,'version',0);
  else
   if coalesce(obj->>'competitionId','') !~ '^competition-[0-9a-f]{32}$'
      or coalesce(obj->>'expectedVersion','') !~ '^(0|[1-9][0-9]{0,8})$'
   then return jsonb_build_object('ok',false,'code','invalid-request'); end if;
   update tm_private.team_competitions set
    name=trim(obj->>'name'),format=obj->>'format',
    division=coalesce(obj->>'division',''),organiser=coalesce(obj->>'organiser',''),
    venue=coalesce(obj->>'venue',''),begins_on=nullif(obj->>'beginsOn','')::date,
    ends_on=nullif(obj->>'endsOn','')::date,entry_status=coalesce(obj->>'status','planned'),
    version=version+1
   where competition_id=obj->>'competitionId' and team_id=p_team
     and version=(obj->>'expectedVersion')::integer returning version into row_version;
   if row_version is null then return jsonb_build_object('ok',false,'code','stale-version'); end if;
   records:=jsonb_build_object('competitionId',obj->>'competitionId','version',row_version);
  end if;
 elsif p_action='competitions.fixture' then
   if not admin_ok or (obj-'competitionId'-'opponent'-'startsAt')<>'{}'::jsonb
     or coalesce(obj->>'competitionId','') !~ '^competition-[0-9a-f]{32}$'
     or coalesce(length(trim(obj->>'opponent')),0) not between 1 and 120
     or coalesce(obj->>'startsAt','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T'
     or not exists(select 1 from tm_private.team_competitions c
       where c.competition_id=obj->>'competitionId' and c.team_id=p_team
         and c.entry_status in ('planned','entered'))
   then return jsonb_build_object('ok',false,'code','invalid-request'); end if;
   ref:='event-'||replace(gen_random_uuid()::text,'-','');
   insert into tm_private.sessions(session_id,team_id,kind,starts_at,title,management_origin)
   values(ref,p_team,'match',(obj->>'startsAt')::timestamptz,
     'vs '||trim(obj->>'opponent'),'team-activity');
   insert into tm_private.team_competition_fixtures(competition_id,team_id,session_id)
   values(obj->>'competitionId',p_team,ref);
   records:=jsonb_build_object('sessionId',ref,'official',false);
 elsif p_action='messages.read' then
   select coalesce(jsonb_agg(jsonb_build_object('messageId',m.message_id,
     'audience',m.audience,'channel',m.channel,'body',m.content,
     'status',m.status,'canConfirm',(m.author_id=p_actor),
     'createdAt',m.created_at,'version',m.version)
     order by m.created_at desc),'[]'::jsonb) into records
   from tm_private.team_message_log m where m.team_id=p_team;
 elsif p_action='messages.prepare' then
   if not allowed or (obj-'audience'-'channel'-'body')<>'{}'::jsonb
     or obj->>'audience' not in ('players','volunteers','all')
     or obj->>'channel' not in ('whatsapp','share','copy')
     or coalesce(length(trim(obj->>'body')),0) not between 1 and 1500
   then return jsonb_build_object('ok',false,'code','invalid-request'); end if;
   ref:='message-'||replace(gen_random_uuid()::text,'-','');
   insert into tm_private.team_message_log(message_id,team_id,author_id,
      audience,channel,content) values(
      ref,p_team,p_actor,obj->>'audience',obj->>'channel',trim(obj->>'body'));
   records:=jsonb_build_object('messageId',ref,'status','prepared');
 elsif p_action='messages.confirm' then
   if not allowed or (obj-'messageId'-'status'-'expectedVersion')<>'{}'::jsonb
     or coalesce(obj->>'messageId','') !~ '^message-[0-9a-f]{32}$'
     or obj->>'status' not in ('sent','not-sent')
     or coalesce(obj->>'expectedVersion','') !~ '^(0|[1-9][0-9]{0,8})$'
   then return jsonb_build_object('ok',false,'code','invalid-request'); end if;
   update tm_private.team_message_log set status=obj->>'status',
     confirmed_at=now_at,version=version+1
    where message_id=obj->>'messageId' and team_id=p_team and author_id=p_actor
      and version=(obj->>'expectedVersion')::integer returning version into row_version;
   if row_version is null then return jsonb_build_object('ok',false,'code','stale-version'); end if;
   records:=jsonb_build_object('version',row_version);
 elsif p_action='duties.board' then
   select coalesce(jsonb_agg(jsonb_build_object(
    'dutyId',d.duty_id,'sessionId',d.session_id,'personId',d.person_id,
    'status',d.status,'type',d.duty_type,'version',d.resource_version)
    order by d.duty_id),'[]'::jsonb) into records
    from tm_private.duties d where d.team_id=p_team and d.status<>'revoked';
 elsif p_action='duties.assign' then
  if not admin_ok or (obj-'sessionId'-'personId'-'type')<>'{}'::jsonb
   or coalesce(obj->>'sessionId','') !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$'
   or coalesce(obj->>'personId','') !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$'
   or obj->>'type' not in ('general_help','setup','equipment','scorer_support')
   or not exists(select 1 from tm_private.sessions ss where ss.team_id=p_team
    and ss.session_id=obj->>'sessionId' and ss.status='planned')
   or not exists(select 1 from tm_private.role_grants g
    join tm_private.accounts ac on ac.user_id=g.user_id
    join tm_private.account_person_links l on l.user_id=g.user_id
    where g.team_id=p_team and g.role='team_volunteer' and g.status='active'
    and ac.status='active' and g.approved_by is not null and g.approved_by<>g.user_id
    and l.person_id=obj->>'personId' and l.status='verified' and l.verified_by<>l.user_id)
  then return jsonb_build_object('ok',false,'code','volunteer-not-verified'); end if;
  ref:='duty-'||replace(gen_random_uuid()::text,'-','');
  insert into tm_private.duties(duty_id,session_id,team_id,person_id,status,
    approved_by,approved_at,duty_type)
   values(ref,obj->>'sessionId',p_team,obj->>'personId','assigned',
    p_actor,now_at,obj->>'type');
  records:=jsonb_build_object('dutyId',ref);
 elsif p_action='duties.withdraw' then
  if not admin_ok or (obj-'dutyId'-'expectedVersion')<>'{}'::jsonb
   or coalesce(obj->>'dutyId','') !~ '^duty-[0-9a-f]{32}$'
   or coalesce(obj->>'expectedVersion','') !~ '^(0|[1-9][0-9]{0,8})$'
  then return jsonb_build_object('ok',false,'code','invalid-request');end if;
  update tm_private.duties set status='revoked',resource_version=resource_version+1
   where duty_id=obj->>'dutyId' and team_id=p_team
   and status in ('assigned','confirmed')
   and resource_version=(obj->>'expectedVersion')::integer
   returning resource_version into row_version;
  if row_version is null then return jsonb_build_object('ok',false,'code','stale-version');end if;
  records:=jsonb_build_object('version',row_version);
 elsif p_action='admin.status' then
  records:=jsonb_build_object('canAdmin',admin_ok,'role',p_role);
 elsif p_action='volunteers.list' then
  select coalesce(jsonb_agg(jsonb_build_object('personId',l.person_id,
    'name',coalesce(prof.display_name,l.person_id)) order by l.person_id),
    '[]'::jsonb) into records
  from tm_private.role_grants g
   join tm_private.account_person_links l on l.user_id=g.user_id
   left join tm_private.account_profiles prof on prof.user_id=g.user_id
  where g.team_id=p_team and g.role='team_volunteer' and g.status='active'
   and g.approved_by is not null and g.approved_by<>g.user_id
   and l.status='verified' and l.verified_by<>l.user_id
   and (g.expires_at is null or now_at<g.expires_at);
 elsif p_action='team.members' then
  select coalesce(jsonb_agg(jsonb_build_object('personId',p.person_id,
    'name',coalesce(prof.display_name,''),'status',p.status)
    order by p.person_id),'[]'::jsonb) into records
  from tm_private.participations p
   left join tm_private.account_person_links l on l.person_id=p.person_id
    and l.status='verified' and l.verified_by<>l.user_id
   left join tm_private.account_profiles prof on prof.user_id=l.user_id
  where p.team_id=p_team;
 elsif p_action='invite.list' then
   if not admin_ok then return jsonb_build_object('ok',false,'code','role-denied'); end if;
   select coalesce(jsonb_agg(jsonb_build_object(
     'invitationId',i.invitation_id,'email',i.email,'role',i.team_role,
     'status',i.status,'delivery',i.delivery_status)
     order by i.created_at desc),'[]'::jsonb) into records
   from tm_private.team_invitations i where i.team_id=p_team
     and i.created_at>now_at-interval '30 days'
     and i.team_role in ('team_player','team_volunteer');
 elsif p_action='invite.issue' then
   v_email:=lower(trim(obj->>'email'));v_role:=obj->>'role';
   if not admin_ok or (obj-'email'-'role')<>'{}'::jsonb
     or v_role not in ('team_player','team_volunteer')
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
     or length(v_email)>254
     or exists(select 1 from auth.users u where u.id=p_actor and lower(u.email)=v_email)
     or exists(select 1 from tm_private.team_invitations i where i.team_id=p_team
       and i.email=v_email and i.team_role=v_role
       and i.status in ('approved','claimed','proposed') and i.expires_at>now_at)
   then return jsonb_build_object('ok',false,'code','invalid-request'); end if;
   ref:='invite-'||replace(gen_random_uuid()::text,'-','');
   insert into tm_private.team_invitations(
     invitation_id,team_id,email,team_role,status,proposed_by,approved_by,
     approved_at,administrator_approved)
    values(ref,p_team,v_email,v_role,'approved',p_actor,p_actor,now_at,true);
   records:=jsonb_build_object('invitationId',ref,'internalEmail',v_email);
 elsif p_action in ('invite.review-adult','invite.activate','invite.revoke') then
   ref:=obj->>'invitationId';
   if not admin_ok or coalesce(ref,'') !~ '^invite-[0-9a-f]{32}$'
     or obj- 'invitationId' - 'evidenceRef' <> '{}'::jsonb
   then return jsonb_build_object('ok',false,'code','invalid-request'); end if;
   select * into v_inv from tm_private.team_invitations i
     where i.invitation_id=ref and i.team_id=p_team
       and i.team_role in ('team_player','team_volunteer')
       and i.administrator_approved=true for update;
   if not found then return jsonb_build_object('ok',false,'code','invite-unavailable'); end if;
   if p_action='invite.review-adult' then
      v_evidence:=obj->>'evidenceRef';
      if v_inv.status not in ('approved','claimed')
        or coalesce(v_evidence,'') !~ '^evidence-ref/[A-Za-z0-9._/-]{12,100}$'
      then return jsonb_build_object('ok',false,'code','invalid-request'); end if;
      select u.id into v_user from auth.users u where lower(u.email)=v_inv.email
         and u.email_confirmed_at is not null limit 1;
      if v_user is null or v_user=p_actor then
        return jsonb_build_object('ok',false,'code','verified-identity-required'); end if;
      insert into tm_private.accounts(user_id,status) values(v_user,'active')
        on conflict(user_id) do nothing;
      insert into tm_private.registration_adult_reviews(
        user_id,reviewed_by,reviewed_at,evidence_ref,state)
        values(v_user,p_actor,now_at,v_evidence,'approved')
        on conflict(user_id) do nothing;
      records:=jsonb_build_object('invitationId',ref);
   elsif p_action='invite.activate' then
      if v_inv.status<>'claimed' or v_inv.claimed_by is null
         or v_inv.claimed_by=p_actor or v_inv.grant_id is null or v_inv.person_id is null
         or not exists(select 1 from tm_private.accounts ac
           where ac.user_id=v_inv.claimed_by and ac.status='active')
         or not exists(select 1 from tm_private.registration_adult_reviews r
           where r.user_id=v_inv.claimed_by and r.state='approved'
            and r.reviewed_by<>v_inv.claimed_by)
         or not exists(select 1 from tm_private.registration_acceptances a
           join tm_private.registration_policy_versions p on p.policy_id=a.policy_id
           where a.user_id=v_inv.claimed_by and p.status='active'
             and a.terms_accepted and a.privacy_acknowledged)
      then return jsonb_build_object('ok',false,'code','activation-preflight-denied'); end if;
      update tm_private.account_person_links set status='verified',
         verified_by=p_actor,verified_at=now_at
        where user_id=v_inv.claimed_by and person_id=v_inv.person_id and status='pending';
      if not found and not exists(select 1 from tm_private.account_person_links l
        where l.user_id=v_inv.claimed_by and l.person_id=v_inv.person_id
         and l.status='verified' and l.verified_by<>l.user_id) then
       return jsonb_build_object('ok',false,'code','person-not-verified'); end if;
      if v_inv.team_role='team_player' then
        insert into tm_private.participations(team_id,person_id,kind,status,
         verified_by,verified_at) values(p_team,v_inv.person_id,'player','active',p_actor,now_at)
         on conflict(team_id,person_id) do update set status='active',
           verified_by=excluded.verified_by,verified_at=excluded.verified_at;
      end if;
      update tm_private.role_grants set status='active',approved_by=p_actor,approved_at=now_at
       where grant_id=v_inv.grant_id and user_id=v_inv.claimed_by
         and team_id=p_team and role=v_inv.team_role and status='proposed';
      if not found then return jsonb_build_object('ok',false,'code','grant-unavailable'); end if;
      update tm_private.team_invitations set status='activated',updated_at=now_at
       where invitation_id=ref;
      records:=jsonb_build_object('invitationId',ref);
   else
      if v_inv.status not in ('approved','claimed','activated') then
       return jsonb_build_object('ok',false,'code','invite-unavailable'); end if;
      update tm_private.team_invitations set status='revoked',updated_at=now_at where invitation_id=ref;
      if v_inv.grant_id is not null then
        update tm_private.role_grants set status='revoked'
        where grant_id=v_inv.grant_id and team_id=p_team and status in ('proposed','active');
      end if;
      records:=jsonb_build_object('invitationId',ref);
   end if;
 end if;
 if p_action not in ('settings.read','jerseys.read','competitions.read','competitions.fixtures','messages.read',
                     'team.members','volunteers.list','admin.status','duties.board','invite.list') then
   insert into tm_private.audit_events(user_id,team_id,action,resource_id,decision,reason_code)
    values(p_actor,p_team,'stage3d5.'||p_action,
      coalesce(ref,p_team),'ALLOW','exact-team-adult-management');
 end if;
 return jsonb_build_object('ok',true,
   'code',case when p_action in ('settings.read','jerseys.read',
     'competitions.read','competitions.fixtures','messages.read','team.members','volunteers.list',
      'admin.status','duties.board','invite.list')
     then 'permitted' else 'committed' end,'data',records);
end;
$$;
revoke all on function public.tm_stage1_operation(uuid,text,text,text,text,jsonb,text)
 from public,anon,authenticated;
grant execute on function public.tm_stage1_operation(uuid,text,text,text,text,jsonb,text) to service_role;
revoke all on function public.tm_stage3b_operation(uuid,text,text,text,text,jsonb,text)
 from public,anon,authenticated;
grant execute on function public.tm_stage3b_operation(uuid,text,text,text,text,jsonb,text) to service_role;
revoke all on function public.tm_stage3d5_team(uuid,text,text,text,jsonb)
 from public,anon,authenticated;
grant execute on function public.tm_stage3d5_team(uuid,text,text,text,jsonb) to service_role;
commit;
