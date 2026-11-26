-- Stage 4: additive, version-bound training/match play assignments.
-- No live data seed, existing table/function replacement or competition rules.
begin;
create table tm_private.play_assignments (
 team_id text not null references tm_private.teams(team_id) on delete restrict,
 session_id text not null,
 play_id text not null references tm_private.plays(play_id) on delete restrict,
 revision_id text not null,
 session_version integer not null check(session_version>=0),
 version integer not null check(version>0),
 state text not null check(state in ('proposed','approved','withdrawn')),
 changed_by uuid not null references tm_private.accounts(user_id) on delete restrict,
 changed_at timestamptz not null default now(),
 primary key(session_id,play_id),
 foreign key(session_id,team_id) references tm_private.sessions(session_id,team_id) on delete restrict,
 foreign key(play_id,revision_id) references tm_private.play_revisions(play_id,revision_id) on delete restrict
);
alter table tm_private.play_assignments enable row level security;
alter table tm_private.play_assignments force row level security;
revoke all on tm_private.play_assignments from public,anon,authenticated;
grant select,insert,update on tm_private.play_assignments to service_role;

create function public.tm_stage4_play_assignments(p_actor uuid,p_team text,p_role text,p_action text,p_input jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
 s tm_private.sessions%rowtype;
 a tm_private.play_assignments%rowtype;
 gate jsonb; rows jsonb; ver integer; expected integer;
 v_session text; v_play text; v_revision text; v_next text; v_read boolean;
begin
 if p_actor is null or p_team is null or p_role is null or p_action is null or p_input is null
 or p_team !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$'
 or p_role not in ('team_coach','team_assistant','team_manager','team_player')
 or p_action not in ('play.assignment.read','play.assignment.propose','play.assignment.approve','play.assignment.withdraw')
 or jsonb_typeof(p_input)<>'object' or length(p_input::text)>3000
 or coalesce(p_input->>'sessionId','') !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$'
 then return jsonb_build_object('ok',false,'code','invalid-request');end if;
 v_read:=p_action='play.assignment.read';
 if (p_action='play.assignment.propose' and p_role not in ('team_coach','team_assistant'))
 or (p_action in ('play.assignment.approve','play.assignment.withdraw') and p_role<>'team_coach')
 then return jsonb_build_object('ok',false,'code','role-denied');end if;
 -- Adult/current terms gate is checked even on service-only RPC calls.
 gate:=public.tm_stage3d3_registration(p_actor,'status',null,false,false,false);
 if gate->>'canProceed' is distinct from 'true' then
  return jsonb_build_object('ok',false,'code','scope-denied');end if;
 -- Same serialization boundary used by session and play mutations.
 if not v_read then
  perform 1 from tm_private.teams where team_id=p_team and status='active' for update;
  if not found then return jsonb_build_object('ok',false,'code','scope-denied');end if;
 end if;
 -- Existing play authority includes exact active grant, founder Coach exception
 -- and verified Player participation. Never return its payload here.
 gate:=public.tm_stage2_play_operation(p_actor,p_team,p_role,'play.published.read',p_team,'{}'::jsonb,null);
 if gate->>'ok' is distinct from 'true' then
  return jsonb_build_object('ok',false,'code','scope-denied');end if;
 v_session:=p_input->>'sessionId';
 select * into s from tm_private.sessions where team_id=p_team and session_id=v_session and kind in ('training','match');
 if not found then return jsonb_build_object('ok',false,'code','scope-denied');end if;
 if v_read then
  if p_input-'sessionId'<>'{}'::jsonb then return jsonb_build_object('ok',false,'code','invalid-request');end if;
  with records as (
   select a1.play_id,a1.revision_id,a1.version,a1.state,a1.session_version,
    case when a1.state='withdrawn' then 'withdrawn'
     when s.status='cancelled' then 'session-cancelled'
     when a1.session_version<>s.resource_version then 'session-changed'
     when p.published_revision_id is distinct from a1.revision_id or p.publication_state<>'published' or r.status<>'published' then 'revision-changed'
     when a1.state='proposed' then 'awaiting-coach'
     else 'current' end as reason,
    case when p.published_revision_id=a1.revision_id and p.publication_state='published' and r.status='published'
     then left(r.e5_payload->>'name',120) else null end as name
   from tm_private.play_assignments a1
   join tm_private.plays p on p.play_id=a1.play_id and p.team_id=a1.team_id
   join tm_private.play_revisions r on r.play_id=a1.play_id and r.revision_id=a1.revision_id
   where a1.session_id=v_session and a1.team_id=p_team
  ), visible as (
   select * from records where p_role in ('team_coach','team_assistant') or reason='current'
  )
  select coalesce(jsonb_agg(jsonb_build_object('playId',play_id,'revisionId',revision_id,
    'version',version,'sessionVersion',session_version,'state',state,'reason',reason,'name',name)
    order by play_id),'[]'::jsonb) into rows from visible;
  if jsonb_array_length(rows)>100 then return jsonb_build_object('ok',false,'code','scope-denied');end if;
  return jsonb_build_object('ok',true,'code','permitted','data',jsonb_build_object(
   'sessionVersion',s.resource_version,'sessionStatus',s.status,'rows',rows));
 end if;
 if p_input-'sessionId'-'sessionVersion'-'playId'-'revisionId'-'expectedVersion'<>'{}'::jsonb
 or coalesce(p_input->>'sessionVersion','') !~ '^(0|[1-9][0-9]{0,8})$'
 or coalesce(p_input->>'expectedVersion','') !~ '^(0|[1-9][0-9]{0,8})$'
 or coalesce(p_input->>'playId','') !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$'
 or coalesce(p_input->>'revisionId','') !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$'
 then return jsonb_build_object('ok',false,'code','invalid-request');end if;
 if s.resource_version<>(p_input->>'sessionVersion')::integer then
  return jsonb_build_object('ok',false,'code','stale-version');end if;
 v_play:=p_input->>'playId';v_revision:=p_input->>'revisionId';
 expected:=(p_input->>'expectedVersion')::integer;
 select * into a from tm_private.play_assignments where session_id=v_session and play_id=v_play and team_id=p_team for update;
 if expected<>coalesce(a.version,0) then return jsonb_build_object('ok',false,'code','stale-version');end if;
 if p_action='play.assignment.withdraw' then
  if a.version is null or a.state='withdrawn' or a.revision_id<>v_revision then
   return jsonb_build_object('ok',false,'code','stale-version');end if;
  update tm_private.play_assignments set state='withdrawn',version=version+1,changed_by=p_actor,changed_at=now()
   where session_id=v_session and play_id=v_play and team_id=p_team returning version into ver;
 else
  if s.status<>'planned' or not exists(
    select 1 from tm_private.plays p join tm_private.play_revisions r
    on r.play_id=p.play_id and r.revision_id=p.published_revision_id
    where p.team_id=p_team and p.play_id=v_play and p.publication_state='published'
    and r.revision_id=v_revision and r.status='published')
  then return jsonb_build_object('ok',false,'code','stale-version');end if;
  if p_action='play.assignment.approve' then
   if a.version is null or a.state<>'proposed' or a.revision_id<>v_revision
      or a.session_version<>s.resource_version then
    return jsonb_build_object('ok',false,'code','stale-version');end if;
   update tm_private.play_assignments set state='approved',version=version+1,changed_by=p_actor,changed_at=now()
    where session_id=v_session and play_id=v_play and team_id=p_team returning version into ver;
  else
   if a.version is null and (select count(*) from tm_private.play_assignments where session_id=v_session and team_id=p_team)>=100 then
    return jsonb_build_object('ok',false,'code','invalid-request');end if;
   -- A fresh proposal cannot silently revoke a current approved assignment.
   if a.state='approved' and a.revision_id=v_revision and a.session_version=s.resource_version then
    return jsonb_build_object('ok',false,'code','already-assigned');end if;
   insert into tm_private.play_assignments(team_id,session_id,play_id,revision_id,session_version,version,state,changed_by)
    values(p_team,v_session,v_play,v_revision,s.resource_version,1,'proposed',p_actor)
    on conflict(session_id,play_id) do update set revision_id=excluded.revision_id,
    session_version=excluded.session_version,version=tm_private.play_assignments.version+1,
    state='proposed',changed_by=p_actor,changed_at=now()
    where tm_private.play_assignments.team_id=p_team returning version into ver;
  end if;
 end if;
 if ver is null then return jsonb_build_object('ok',false,'code','stale-version');end if;
 insert into tm_private.audit_events(user_id,team_id,action,resource_id,decision,reason_code)
 values(p_actor,p_team,'stage4.'||p_action,v_session,'ALLOW','exact-session-published-revision');
 return jsonb_build_object('ok',true,'code','committed','data',jsonb_build_object('version',ver));
end;
$$;
revoke all on function public.tm_stage4_play_assignments(uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.tm_stage4_play_assignments(uuid,text,text,text,jsonb) to service_role;
commit;
