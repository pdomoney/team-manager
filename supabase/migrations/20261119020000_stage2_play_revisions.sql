-- Stage 2D: independently scoped E5 play draft/revision/publish operations.
-- SOURCE ONLY. This does not deploy a Supabase migration or enrol users.
-- The e5_payload is a complete JSON object; no phase, movement, timing or
-- instruction migration takes place. Publication is an explicit coach action.
create function public.tm_stage2_play_operation(
  p_account uuid, p_team text, p_role text, p_action text,
  p_resource text, p_payload jsonb, p_digest text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_person text;
  v_command jsonb;
  v_play jsonb;
  v_existing tm_private.mutation_receipts%rowtype;
  v_mutation text;
  v_expected integer;
  v_version integer;
  v_play_id text := p_resource;
  v_revision text;
  v_latest text;
  v_result jsonb;
  v_data jsonb;
  v_write boolean;
begin
  if p_account is null or p_team is null or
    p_team !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$'
    or p_resource is null or p_resource !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$'
    or p_payload is null or jsonb_typeof(p_payload)<>'object'
    or p_role not in ('team_coach','team_assistant','team_manager',
      'team_player','team_play_viewer')
    or p_action not in ('play.published.read','play.draft.read',
      'play.draft.edit','play.publish')
  then return jsonb_build_object('ok',false,'code','invalid-command'); end if;
  v_write:=p_action in ('play.draft.edit','play.publish');
  if v_write then
    if p_digest is null or p_digest !~ '^[0-9a-f]{64}$'
      or coalesce(p_payload->>'mutationId','') !~ '^[A-Za-z0-9][A-Za-z0-9_-]{15,79}$'
      or coalesce(p_payload->>'expectedVersion','') !~ '^(0|[1-9][0-9]{0,9})$'
      or (p_payload->>'expectedVersion')::bigint>2147483647
    then return jsonb_build_object('ok',false,'code','invalid-mutation'); end if;
    v_mutation:=p_payload->>'mutationId';
    v_expected:=(p_payload->>'expectedVersion')::integer;
    if p_payload ?| array['accountId','personId','approvedBy','roleGrant','teamId','verified']
    then return jsonb_build_object('ok',false,'code','forged-field'); end if;
  elsif p_payload<>'{}'::jsonb or p_digest is not null then
    return jsonb_build_object('ok',false,'code','invalid-read');
  end if;

  -- Serialise modifications across both published and draft revisions.
  if v_write then
    perform 1 from tm_private.teams t where t.team_id=p_team
      and t.status='active' for update;
  else
    perform 1 from tm_private.teams t where t.team_id=p_team
      and t.status='active';
  end if;
  if not found then return jsonb_build_object('ok',false,'code','scope-denied'); end if;
  perform 1 from tm_private.accounts a where a.user_id=p_account
    and a.status='active' for share;
  if not found then return jsonb_build_object('ok',false,'code','account-inactive'); end if;
  perform 1 from tm_private.role_grants g
    where g.user_id=p_account and g.team_id=p_team
      and g.role=p_role and g.status='active' and g.policy_version=1
      and g.approved_by is not null and g.approved_by<>p_account
      and (g.valid_from is null or g.valid_from<=v_now)
      and (g.expires_at is null or v_now<g.expires_at);
  if not found then return jsonb_build_object('ok',false,'code','scope-denied'); end if;
  if (p_action='play.draft.read' and p_role not in ('team_coach','team_assistant'))
     or (p_action='play.draft.edit' and p_role not in ('team_coach','team_assistant'))
     or (p_action='play.publish' and p_role<>'team_coach')
     or (p_action='play.published.read' and p_role not in
       ('team_coach','team_assistant','team_manager','team_player','team_play_viewer'))
  then return jsonb_build_object('ok',false,'code','role-denied'); end if;

  if p_role='team_player' then
    select l.person_id into v_person from tm_private.account_person_links l
      join tm_private.persons pe on pe.person_id=l.person_id
      where l.user_id=p_account and l.status='verified'
        and l.verified_by is not null and l.verified_by<>p_account
        and l.verified_at is not null and pe.lifecycle='active' limit 1;
    if v_person is null then
      return jsonb_build_object('ok',false,'code','person-not-verified'); end if;
    perform 1 from tm_private.participations p
      where p.team_id=p_team and p.person_id=v_person
        and p.status='active' and p.verified_by is not null
        and p.verified_at is not null;
    if not found then
      return jsonb_build_object('ok',false,'code','participation-not-verified'); end if;
  end if;

  if not v_write then
    if p_resource<>p_team then
      return jsonb_build_object('ok',false,'code','resource-out-of-scope'); end if;
    if p_action='play.published.read' then
      select coalesce(jsonb_agg(jsonb_build_object(
        'playId',p.play_id,'version',p.resource_version,
        'revisionId',r.revision_id,'play',r.e5_payload)
        order by p.play_id),'[]'::jsonb)
      into v_data from tm_private.plays p
        join tm_private.play_revisions r
          on r.play_id=p.play_id and r.revision_id=p.published_revision_id
      where p.team_id=p_team and p.publication_state='published'
        and r.status='published';
    else
      select coalesce(jsonb_agg(jsonb_build_object(
        'playId',p.play_id,'version',p.resource_version,
        'revisionId',r.revision_id,'revisionStatus',r.status,
        'publishedRevisionId',p.published_revision_id,'play',r.e5_payload)
        order by p.play_id),'[]'::jsonb)
      into v_data from tm_private.plays p
        join lateral (
          select * from tm_private.play_revisions rev
          where rev.play_id=p.play_id order by rev.revision_number desc limit 1
        ) r on true
      where p.team_id=p_team and p.publication_state<>'archived';
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

  if p_action='play.draft.edit' then
    if (p_payload-'mutationId'-'expectedVersion'-'command')<>'{}'::jsonb
      or jsonb_typeof(p_payload->'command')<>'object'
    then return jsonb_build_object('ok',false,'code','invalid-play'); end if;
    v_command:=p_payload->'command';
    v_play:=v_command->'play';
    if (v_command-'op'-'play')<>'{}'::jsonb
      or v_command->>'op' not in ('create','save')
      or jsonb_typeof(v_play)<>'object'
      or pg_catalog.octet_length(v_play::text)>65536
      or jsonb_typeof(v_play->'name')<>'string'
      or char_length(v_play->>'name') not between 1 and 120
      or jsonb_typeof(v_play->'moves')<>'array'
      or jsonb_typeof(v_play->'players') not in ('object','array')
      or (v_play ? 'phases' and jsonb_typeof(v_play->'phases')<>'array')
      or (v_play ? 'eventTimeline' and jsonb_typeof(v_play->'eventTimeline')<>'object')
      or v_play ?| array['password','token','phone','email','medical','guardian',
        'accountId','personId','privateContacts']
    then return jsonb_build_object('ok',false,'code','invalid-play'); end if;
    if v_command->>'op'='create' and p_resource=p_team and v_expected=0 then
      v_play_id:='play-'||replace(gen_random_uuid()::text,'-','');
      insert into tm_private.plays(play_id,team_id,publication_state)
        values(v_play_id,p_team,'draft');
      v_version:=0;
      v_latest:=null;
    elsif v_command->>'op'='save' and p_resource<>p_team then
      select p.resource_version into v_version from tm_private.plays p
        where p.play_id=p_resource and p.team_id=p_team
          and p.publication_state<>'archived';
      if not found or v_version<>v_expected then
        return jsonb_build_object('ok',false,'code','stale-play'); end if;
      update tm_private.plays p set resource_version=resource_version+1
        where p.play_id=p_resource and p.team_id=p_team
          and p.resource_version=v_expected returning resource_version into v_version;
      if v_version is null then
        return jsonb_build_object('ok',false,'code','stale-play'); end if;
      update tm_private.play_revisions set status='superseded'
        where play_id=v_play_id and status='draft';
    else return jsonb_build_object('ok',false,'code','invalid-play'); end if;
    v_revision:='rev-'||replace(gen_random_uuid()::text,'-','');
    insert into tm_private.play_revisions(
      revision_id,play_id,revision_number,status,e5_payload,created_by)
    values(v_revision,v_play_id,
      (select coalesce(max(revision_number),0)+1 from tm_private.play_revisions
        where play_id=v_play_id),'draft',v_play,p_account);
  elsif p_action='play.publish' then
    if (p_payload-'mutationId'-'expectedVersion'-'revisionId')<>'{}'::jsonb
      or coalesce(p_payload->>'revisionId','') !~
        '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$'
      or p_resource=p_team
    then return jsonb_build_object('ok',false,'code','invalid-play'); end if;
    select p.resource_version into v_version from tm_private.plays p
      where p.play_id=p_resource and p.team_id=p_team
        and p.publication_state<>'archived';
    if not found or v_version<>v_expected then
      return jsonb_build_object('ok',false,'code','stale-play'); end if;
    select r.revision_id into v_latest from tm_private.play_revisions r
      where r.play_id=p_resource order by r.revision_number desc limit 1;
    if v_latest is null or v_latest<>p_payload->>'revisionId' or
      not exists(select 1 from tm_private.play_revisions
        where revision_id=v_latest and play_id=p_resource and status='draft')
    then return jsonb_build_object('ok',false,'code','revision-not-draft'); end if;
    update tm_private.play_revisions set status='superseded'
      where play_id=p_resource and status='published';
    update tm_private.play_revisions set status='published'
      where revision_id=v_latest and play_id=p_resource and status='draft';
    update tm_private.plays set published_revision_id=v_latest,
      publication_state='published',resource_version=resource_version+1
      where play_id=p_resource and team_id=p_team
        and resource_version=v_expected returning resource_version into v_version;
    v_revision:=v_latest;
  else return jsonb_build_object('ok',false,'code','invalid-command'); end if;

  v_result:=jsonb_build_object('ok',true,'code','committed',
    'resourceId',v_play_id,'version',v_version,'revisionId',v_revision);
  insert into tm_private.audit_events(at,user_id,team_id,action,resource_id,
    decision,mutation_id,reason_code)
  values(v_now,p_account,p_team,p_action,v_play_id,'ALLOW',v_mutation,'committed');
  insert into tm_private.mutation_receipts(
    user_id,team_id,mutation_id,action,request_sha256,resource_id,
    expected_version,committed_result)
  values(p_account,p_team,v_mutation,p_action,p_digest,
    v_play_id,v_expected,v_result);
  return v_result;
end;
$$;
revoke all on function public.tm_stage2_play_operation(
  uuid,text,text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.tm_stage2_play_operation(
  uuid,text,text,text,text,jsonb,text) to service_role;
revoke all on all tables in schema tm_private from public,anon,authenticated;
