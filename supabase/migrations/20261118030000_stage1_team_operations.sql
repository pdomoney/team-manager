-- Stage 1A-C candidate. SOURCE ONLY. Apply to a disposable Supabase-compatible
-- PostgreSQL instance after foundation + team-context migrations.
-- No new browser table grants. The Worker is the only intended RPC caller.
alter table tm_private.sessions
  add column title text not null default '' check (char_length(title) <= 120);
alter table tm_private.sessions
  add column location_label text not null default '' check (char_length(location_label) <= 120);
alter table tm_private.participations
  add column resource_version integer not null default 0 check (resource_version >= 0);
alter table tm_private.mutation_receipts
  add column committed_result jsonb;

-- Everything is within one SQL transaction, including the optimistic version
-- check, resource update, replay receipt, and audit event.
create function public.tm_stage1_operation(
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
       or coalesce(p_payload->>'mutationId','') !~ '^[A-Za-z0-9][A-Za-z0-9_-]{15,79}       or jsonb_typeof(p_payload->'expectedVersion') <> 'number'
       or coalesce(p_payload->>'expectedVersion','') !~ '^(0|[1-9][0-9]{0,9})    then return jsonb_build_object('ok',false,'code','invalid-mutation'); end if;
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
        and g.approved_by is not null and g.approved_by<>p_account
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
      where s.team_id=p_team and s.status<>'cancelled';
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
    elsif v_version=v_expected then
      update tm_private.participations set
        status=case when v_command->>'op'='withdraw' then 'inactive' else 'pending' end,
        verified_by=null,verified_at=null,resource_version=resource_version+1
        where team_id=p_team and person_id=v_command->>'personId'
        returning resource_version into v_version;
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
        and g.policy_version=1 and g.approved_by is not null
        and g.approved_by<>g.user_id
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

revoke all on function public.tm_stage1_operation(
  uuid,text,text,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.tm_stage1_operation(
  uuid,text,text,text,text,jsonb,text) to service_role;

-- Keep new fields private and don't open PostgREST table access.
revoke all on all tables in schema tm_private from public, anon, authenticated;

       or jsonb_typeof(p_payload->'expectedVersion') <> 'number'
       or p_payload->>'expectedVersion' !~ '^(0|[1-9][0-9]{0,9})$'
    then return jsonb_build_object('ok',false,'code','invalid-mutation'); end if;
    v_mutation := p_payload->>'mutationId';
    v_expected := (p_payload->>'expectedVersion')::bigint;
    if v_expected > 2147483647
    then return jsonb_build_object('ok',false,'code','invalid-mutation'); end if;
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
    return jsonb_build_object('ok',false,'code','team-unavailable');
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
        and g.approved_by is not null and g.approved_by<>p_account
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
      where s.team_id=p_team and s.status<>'cancelled';
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
    elsif v_version=v_expected then
      update tm_private.participations set
        status=case when v_command->>'op'='withdraw' then 'inactive' else 'pending' end,
        verified_by=null,verified_at=null,resource_version=resource_version+1
        where team_id=p_team and person_id=v_command->>'personId'
        returning resource_version into v_version;
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
        and g.policy_version=1 and g.approved_by is not null
        and g.approved_by<>g.user_id
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

revoke all on function public.tm_stage1_operation(
  uuid,text,text,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.tm_stage1_operation(
  uuid,text,text,text,text,jsonb,text) to service_role;

-- Keep new fields private and don't open PostgREST table access.
revoke all on all tables in schema tm_private from public, anon, authenticated;

    then return jsonb_build_object('ok',false,'code','invalid-mutation'); end if;
    v_mutation := p_payload->>'mutationId';
    v_expected := (p_payload->>'expectedVersion')::bigint;
    if v_expected > 2147483647
    then return jsonb_build_object('ok',false,'code','invalid-mutation'); end if;
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
    return jsonb_build_object('ok',false,'code','team-unavailable');
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
        and g.approved_by is not null and g.approved_by<>p_account
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
      where s.team_id=p_team and s.status<>'cancelled';
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
    elsif v_version=v_expected then
      update tm_private.participations set
        status=case when v_command->>'op'='withdraw' then 'inactive' else 'pending' end,
        verified_by=null,verified_at=null,resource_version=resource_version+1
        where team_id=p_team and person_id=v_command->>'personId'
        returning resource_version into v_version;
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
        and g.policy_version=1 and g.approved_by is not null
        and g.approved_by<>g.user_id
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

revoke all on function public.tm_stage1_operation(
  uuid,text,text,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.tm_stage1_operation(
  uuid,text,text,text,text,jsonb,text) to service_role;

-- Keep new fields private and don't open PostgREST table access.
revoke all on all tables in schema tm_private from public, anon, authenticated;

       or jsonb_typeof(p_payload->'expectedVersion') <> 'number'
       or p_payload->>'expectedVersion' !~ '^(0|[1-9][0-9]{0,9})$'
    then return jsonb_build_object('ok',false,'code','invalid-mutation'); end if;
    v_mutation := p_payload->>'mutationId';
    v_expected := (p_payload->>'expectedVersion')::bigint;
    if v_expected > 2147483647
    then return jsonb_build_object('ok',false,'code','invalid-mutation'); end if;
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
    return jsonb_build_object('ok',false,'code','team-unavailable');
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
        and g.approved_by is not null and g.approved_by<>p_account
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
      where s.team_id=p_team and s.status<>'cancelled';
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
    elsif v_version=v_expected then
      update tm_private.participations set
        status=case when v_command->>'op'='withdraw' then 'inactive' else 'pending' end,
        verified_by=null,verified_at=null,resource_version=resource_version+1
        where team_id=p_team and person_id=v_command->>'personId'
        returning resource_version into v_version;
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
        and g.policy_version=1 and g.approved_by is not null
        and g.approved_by<>g.user_id
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

revoke all on function public.tm_stage1_operation(
  uuid,text,text,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.tm_stage1_operation(
  uuid,text,text,text,text,jsonb,text) to service_role;

-- Keep new fields private and don't open PostgREST table access.
revoke all on all tables in schema tm_private from public, anon, authenticated;

       or jsonb_typeof(p_payload->'expectedVersion') <> 'number'
       or coalesce(p_payload->>'expectedVersion','') !~ '^(0|[1-9][0-9]{0,9})
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
    return jsonb_build_object('ok',false,'code','team-unavailable');
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
        and g.approved_by is not null and g.approved_by<>p_account
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
      where s.team_id=p_team and s.status<>'cancelled';
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
    elsif v_version=v_expected then
      update tm_private.participations set
        status=case when v_command->>'op'='withdraw' then 'inactive' else 'pending' end,
        verified_by=null,verified_at=null,resource_version=resource_version+1
        where team_id=p_team and person_id=v_command->>'personId'
        returning resource_version into v_version;
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
        and g.policy_version=1 and g.approved_by is not null
        and g.approved_by<>g.user_id
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

revoke all on function public.tm_stage1_operation(
  uuid,text,text,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.tm_stage1_operation(
  uuid,text,text,text,text,jsonb,text) to service_role;

-- Keep new fields private and don't open PostgREST table access.
revoke all on all tables in schema tm_private from public, anon, authenticated;

       or jsonb_typeof(p_payload->'expectedVersion') <> 'number'
       or p_payload->>'expectedVersion' !~ '^(0|[1-9][0-9]{0,9})$'
    then return jsonb_build_object('ok',false,'code','invalid-mutation'); end if;
    v_mutation := p_payload->>'mutationId';
    v_expected := (p_payload->>'expectedVersion')::bigint;
    if v_expected > 2147483647
    then return jsonb_build_object('ok',false,'code','invalid-mutation'); end if;
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
    return jsonb_build_object('ok',false,'code','team-unavailable');
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
        and g.approved_by is not null and g.approved_by<>p_account
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
      where s.team_id=p_team and s.status<>'cancelled';
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
    elsif v_version=v_expected then
      update tm_private.participations set
        status=case when v_command->>'op'='withdraw' then 'inactive' else 'pending' end,
        verified_by=null,verified_at=null,resource_version=resource_version+1
        where team_id=p_team and person_id=v_command->>'personId'
        returning resource_version into v_version;
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
        and g.policy_version=1 and g.approved_by is not null
        and g.approved_by<>g.user_id
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

revoke all on function public.tm_stage1_operation(
  uuid,text,text,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.tm_stage1_operation(
  uuid,text,text,text,text,jsonb,text) to service_role;

-- Keep new fields private and don't open PostgREST table access.
revoke all on all tables in schema tm_private from public, anon, authenticated;

    then return jsonb_build_object('ok',false,'code','invalid-mutation'); end if;
    v_mutation := p_payload->>'mutationId';
    v_expected := (p_payload->>'expectedVersion')::bigint;
    if v_expected > 2147483647
    then return jsonb_build_object('ok',false,'code','invalid-mutation'); end if;
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
    return jsonb_build_object('ok',false,'code','team-unavailable');
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
        and g.approved_by is not null and g.approved_by<>p_account
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
      where s.team_id=p_team and s.status<>'cancelled';
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
    elsif v_version=v_expected then
      update tm_private.participations set
        status=case when v_command->>'op'='withdraw' then 'inactive' else 'pending' end,
        verified_by=null,verified_at=null,resource_version=resource_version+1
        where team_id=p_team and person_id=v_command->>'personId'
        returning resource_version into v_version;
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
        and g.policy_version=1 and g.approved_by is not null
        and g.approved_by<>g.user_id
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

revoke all on function public.tm_stage1_operation(
  uuid,text,text,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.tm_stage1_operation(
  uuid,text,text,text,text,jsonb,text) to service_role;

-- Keep new fields private and don't open PostgREST table access.
revoke all on all tables in schema tm_private from public, anon, authenticated;

       or jsonb_typeof(p_payload->'expectedVersion') <> 'number'
       or p_payload->>'expectedVersion' !~ '^(0|[1-9][0-9]{0,9})$'
    then return jsonb_build_object('ok',false,'code','invalid-mutation'); end if;
    v_mutation := p_payload->>'mutationId';
    v_expected := (p_payload->>'expectedVersion')::bigint;
    if v_expected > 2147483647
    then return jsonb_build_object('ok',false,'code','invalid-mutation'); end if;
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
    return jsonb_build_object('ok',false,'code','team-unavailable');
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
        and g.approved_by is not null and g.approved_by<>p_account
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
      where s.team_id=p_team and s.status<>'cancelled';
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
    elsif v_version=v_expected then
      update tm_private.participations set
        status=case when v_command->>'op'='withdraw' then 'inactive' else 'pending' end,
        verified_by=null,verified_at=null,resource_version=resource_version+1
        where team_id=p_team and person_id=v_command->>'personId'
        returning resource_version into v_version;
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
        and g.policy_version=1 and g.approved_by is not null
        and g.approved_by<>g.user_id
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

revoke all on function public.tm_stage1_operation(
  uuid,text,text,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.tm_stage1_operation(
  uuid,text,text,text,text,jsonb,text) to service_role;

-- Keep new fields private and don't open PostgREST table access.
revoke all on all tables in schema tm_private from public, anon, authenticated;

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
    return jsonb_build_object('ok',false,'code','team-unavailable');
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
        and g.approved_by is not null and g.approved_by<>p_account
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
      where s.team_id=p_team and s.status<>'cancelled';
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
    elsif v_version=v_expected then
      update tm_private.participations set
        status=case when v_command->>'op'='withdraw' then 'inactive' else 'pending' end,
        verified_by=null,verified_at=null,resource_version=resource_version+1
        where team_id=p_team and person_id=v_command->>'personId'
        returning resource_version into v_version;
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
        and g.policy_version=1 and g.approved_by is not null
        and g.approved_by<>g.user_id
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

revoke all on function public.tm_stage1_operation(
  uuid,text,text,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.tm_stage1_operation(
  uuid,text,text,text,text,jsonb,text) to service_role;

-- Keep new fields private and don't open PostgREST table access.
revoke all on all tables in schema tm_private from public, anon, authenticated;

       or jsonb_typeof(p_payload->'expectedVersion') <> 'number'
       or p_payload->>'expectedVersion' !~ '^(0|[1-9][0-9]{0,9})$'
    then return jsonb_build_object('ok',false,'code','invalid-mutation'); end if;
    v_mutation := p_payload->>'mutationId';
    v_expected := (p_payload->>'expectedVersion')::bigint;
    if v_expected > 2147483647
    then return jsonb_build_object('ok',false,'code','invalid-mutation'); end if;
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
    return jsonb_build_object('ok',false,'code','team-unavailable');
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
        and g.approved_by is not null and g.approved_by<>p_account
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
      where s.team_id=p_team and s.status<>'cancelled';
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
    elsif v_version=v_expected then
      update tm_private.participations set
        status=case when v_command->>'op'='withdraw' then 'inactive' else 'pending' end,
        verified_by=null,verified_at=null,resource_version=resource_version+1
        where team_id=p_team and person_id=v_command->>'personId'
        returning resource_version into v_version;
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
        and g.policy_version=1 and g.approved_by is not null
        and g.approved_by<>g.user_id
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

revoke all on function public.tm_stage1_operation(
  uuid,text,text,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.tm_stage1_operation(
  uuid,text,text,text,text,jsonb,text) to service_role;

-- Keep new fields private and don't open PostgREST table access.
revoke all on all tables in schema tm_private from public, anon, authenticated;

    then return jsonb_build_object('ok',false,'code','invalid-mutation'); end if;
    v_mutation := p_payload->>'mutationId';
    v_expected := (p_payload->>'expectedVersion')::bigint;
    if v_expected > 2147483647
    then return jsonb_build_object('ok',false,'code','invalid-mutation'); end if;
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
    return jsonb_build_object('ok',false,'code','team-unavailable');
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
        and g.approved_by is not null and g.approved_by<>p_account
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
      where s.team_id=p_team and s.status<>'cancelled';
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
    elsif v_version=v_expected then
      update tm_private.participations set
        status=case when v_command->>'op'='withdraw' then 'inactive' else 'pending' end,
        verified_by=null,verified_at=null,resource_version=resource_version+1
        where team_id=p_team and person_id=v_command->>'personId'
        returning resource_version into v_version;
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
        and g.policy_version=1 and g.approved_by is not null
        and g.approved_by<>g.user_id
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

revoke all on function public.tm_stage1_operation(
  uuid,text,text,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.tm_stage1_operation(
  uuid,text,text,text,text,jsonb,text) to service_role;

-- Keep new fields private and don't open PostgREST table access.
revoke all on all tables in schema tm_private from public, anon, authenticated;

       or jsonb_typeof(p_payload->'expectedVersion') <> 'number'
       or p_payload->>'expectedVersion' !~ '^(0|[1-9][0-9]{0,9})$'
    then return jsonb_build_object('ok',false,'code','invalid-mutation'); end if;
    v_mutation := p_payload->>'mutationId';
    v_expected := (p_payload->>'expectedVersion')::bigint;
    if v_expected > 2147483647
    then return jsonb_build_object('ok',false,'code','invalid-mutation'); end if;
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
    return jsonb_build_object('ok',false,'code','team-unavailable');
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
        and g.approved_by is not null and g.approved_by<>p_account
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
      where s.team_id=p_team and s.status<>'cancelled';
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
    elsif v_version=v_expected then
      update tm_private.participations set
        status=case when v_command->>'op'='withdraw' then 'inactive' else 'pending' end,
        verified_by=null,verified_at=null,resource_version=resource_version+1
        where team_id=p_team and person_id=v_command->>'personId'
        returning resource_version into v_version;
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
        and g.policy_version=1 and g.approved_by is not null
        and g.approved_by<>g.user_id
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

revoke all on function public.tm_stage1_operation(
  uuid,text,text,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.tm_stage1_operation(
  uuid,text,text,text,text,jsonb,text) to service_role;

-- Keep new fields private and don't open PostgREST table access.
revoke all on all tables in schema tm_private from public, anon, authenticated;

       or jsonb_typeof(p_payload->'expectedVersion') <> 'number'
       or coalesce(p_payload->>'expectedVersion','') !~ '^(0|[1-9][0-9]{0,9})
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
    return jsonb_build_object('ok',false,'code','team-unavailable');
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
        and g.approved_by is not null and g.approved_by<>p_account
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
      where s.team_id=p_team and s.status<>'cancelled';
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
    elsif v_version=v_expected then
      update tm_private.participations set
        status=case when v_command->>'op'='withdraw' then 'inactive' else 'pending' end,
        verified_by=null,verified_at=null,resource_version=resource_version+1
        where team_id=p_team and person_id=v_command->>'personId'
        returning resource_version into v_version;
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
        and g.policy_version=1 and g.approved_by is not null
        and g.approved_by<>g.user_id
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

revoke all on function public.tm_stage1_operation(
  uuid,text,text,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.tm_stage1_operation(
  uuid,text,text,text,text,jsonb,text) to service_role;

-- Keep new fields private and don't open PostgREST table access.
revoke all on all tables in schema tm_private from public, anon, authenticated;

       or jsonb_typeof(p_payload->'expectedVersion') <> 'number'
       or p_payload->>'expectedVersion' !~ '^(0|[1-9][0-9]{0,9})$'
    then return jsonb_build_object('ok',false,'code','invalid-mutation'); end if;
    v_mutation := p_payload->>'mutationId';
    v_expected := (p_payload->>'expectedVersion')::bigint;
    if v_expected > 2147483647
    then return jsonb_build_object('ok',false,'code','invalid-mutation'); end if;
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
    return jsonb_build_object('ok',false,'code','team-unavailable');
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
        and g.approved_by is not null and g.approved_by<>p_account
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
      where s.team_id=p_team and s.status<>'cancelled';
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
    elsif v_version=v_expected then
      update tm_private.participations set
        status=case when v_command->>'op'='withdraw' then 'inactive' else 'pending' end,
        verified_by=null,verified_at=null,resource_version=resource_version+1
        where team_id=p_team and person_id=v_command->>'personId'
        returning resource_version into v_version;
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
        and g.policy_version=1 and g.approved_by is not null
        and g.approved_by<>g.user_id
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

revoke all on function public.tm_stage1_operation(
  uuid,text,text,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.tm_stage1_operation(
  uuid,text,text,text,text,jsonb,text) to service_role;

-- Keep new fields private and don't open PostgREST table access.
revoke all on all tables in schema tm_private from public, anon, authenticated;

    then return jsonb_build_object('ok',false,'code','invalid-mutation'); end if;
    v_mutation := p_payload->>'mutationId';
    v_expected := (p_payload->>'expectedVersion')::bigint;
    if v_expected > 2147483647
    then return jsonb_build_object('ok',false,'code','invalid-mutation'); end if;
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
    return jsonb_build_object('ok',false,'code','team-unavailable');
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
        and g.approved_by is not null and g.approved_by<>p_account
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
      where s.team_id=p_team and s.status<>'cancelled';
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
    elsif v_version=v_expected then
      update tm_private.participations set
        status=case when v_command->>'op'='withdraw' then 'inactive' else 'pending' end,
        verified_by=null,verified_at=null,resource_version=resource_version+1
        where team_id=p_team and person_id=v_command->>'personId'
        returning resource_version into v_version;
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
        and g.policy_version=1 and g.approved_by is not null
        and g.approved_by<>g.user_id
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

revoke all on function public.tm_stage1_operation(
  uuid,text,text,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.tm_stage1_operation(
  uuid,text,text,text,text,jsonb,text) to service_role;

-- Keep new fields private and don't open PostgREST table access.
revoke all on all tables in schema tm_private from public, anon, authenticated;

       or jsonb_typeof(p_payload->'expectedVersion') <> 'number'
       or p_payload->>'expectedVersion' !~ '^(0|[1-9][0-9]{0,9})$'
    then return jsonb_build_object('ok',false,'code','invalid-mutation'); end if;
    v_mutation := p_payload->>'mutationId';
    v_expected := (p_payload->>'expectedVersion')::bigint;
    if v_expected > 2147483647
    then return jsonb_build_object('ok',false,'code','invalid-mutation'); end if;
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
    return jsonb_build_object('ok',false,'code','team-unavailable');
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
        and g.approved_by is not null and g.approved_by<>p_account
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
      where s.team_id=p_team and s.status<>'cancelled';
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
    elsif v_version=v_expected then
      update tm_private.participations set
        status=case when v_command->>'op'='withdraw' then 'inactive' else 'pending' end,
        verified_by=null,verified_at=null,resource_version=resource_version+1
        where team_id=p_team and person_id=v_command->>'personId'
        returning resource_version into v_version;
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
        and g.policy_version=1 and g.approved_by is not null
        and g.approved_by<>g.user_id
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

revoke all on function public.tm_stage1_operation(
  uuid,text,text,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.tm_stage1_operation(
  uuid,text,text,text,text,jsonb,text) to service_role;

-- Keep new fields private and don't open PostgREST table access.
revoke all on all tables in schema tm_private from public, anon, authenticated;
