-- PR300: independent match-date attendance, not eligibility or scoring.
-- Existing team/fixture/squad records and old migrations are untouched.
begin;
create table tm_private.matchday_arrivals (
 session_id text not null,
 team_id text not null,
 person_id text not null references tm_private.persons(person_id) on delete restrict,
 fixture_version integer not null check(fixture_version>=0),
 arrived boolean not null,
 version integer not null check(version>0),
 changed_by uuid not null references tm_private.accounts(user_id) on delete restrict,
 changed_at timestamptz not null default now(),
 primary key(session_id,person_id,fixture_version),
 foreign key(session_id,team_id) references tm_private.sessions(session_id,team_id) on delete restrict
);
create table tm_private.matchday_arrival_events (
 session_id text not null,
 team_id text not null,
 person_id text not null,
 fixture_version integer not null,
 version integer not null,
 arrived boolean not null,
 actor uuid not null references tm_private.accounts(user_id) on delete restrict,
 role text not null check(role in ('team_coach','team_manager','team_assistant','team_player')),
 recorded_at timestamptz not null default now(),
 primary key(session_id,person_id,fixture_version,version),
 foreign key(session_id,person_id,fixture_version) references tm_private.matchday_arrivals(session_id,person_id,fixture_version) on delete restrict,
 foreign key(session_id,team_id) references tm_private.sessions(session_id,team_id) on delete restrict
);
alter table tm_private.matchday_arrivals enable row level security;
alter table tm_private.matchday_arrivals force row level security;
alter table tm_private.matchday_arrival_events enable row level security;
alter table tm_private.matchday_arrival_events force row level security;
revoke all on tm_private.matchday_arrivals,tm_private.matchday_arrival_events from public,anon,authenticated;
grant select,insert,update on tm_private.matchday_arrivals to service_role;
grant select,insert on tm_private.matchday_arrival_events to service_role;
create trigger matchday_arrival_events_append_only before update or delete on tm_private.matchday_arrival_events
 for each row execute function tm_private.reject_audit_mutation();

create function public.tm_stage3d5_matchday_arrivals(p_actor uuid,p_team text,p_role text,p_action text,p_input jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
 s tm_private.sessions%rowtype;
 a tm_private.matchday_arrivals%rowtype;
 v_person text;
 v_rows jsonb;
 v_can_record boolean;
 v_gate jsonb;
 v_version integer;
begin
 if p_actor is null or p_team is null or p_role is null or p_action is null
 or p_input is null or jsonb_typeof(p_input)<>'object' or length(p_input::text)>3000
 or p_action not in ('matchday.arrivals.read','matchday.arrivals.record','player.matchday.arrivals.read','player.matchday.arrivals.record')
 or p_role not in ('team_coach','team_manager','team_assistant','team_player')
 or coalesce(p_input->>'sessionId','') !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$'
 or ((p_role='team_player') is distinct from (p_action like 'player.%'))
 then return jsonb_build_object('ok',false,'code','invalid-request');end if;
 -- Same team serialization as the existing match selection and schedule mutations.
 if p_action like '%.record' then
   perform 1 from tm_private.teams where team_id=p_team and status='active' for update;
   if not found then return jsonb_build_object('ok',false,'code','scope-denied');end if;
 end if;
 if p_role in ('team_coach','team_manager') then
   if not tm_private.stage3d5_staff(p_actor,p_team,p_role) then
     return jsonb_build_object('ok',false,'code','scope-denied');end if;
 elsif p_role='team_assistant' then
   -- Reuse the existing registered staff scope gate. No notice content returned.
   v_gate:=public.tm_stage3b_operation(p_actor,p_team,p_role,'notices.read',p_team,'{}'::jsonb,null);
   if v_gate->>'ok' is distinct from 'true' then return jsonb_build_object('ok',false,'code','scope-denied');end if;
 else
   v_gate:=public.tm_stage3d5_player_team(p_actor,p_team,p_role,'player.team.read','{}'::jsonb);
   if v_gate->>'ok' is distinct from 'true' then return jsonb_build_object('ok',false,'code','scope-denied');end if;
   select l.person_id into v_person from tm_private.account_person_links l
   where l.user_id=p_actor and l.status='verified';
   if v_person is null then return jsonb_build_object('ok',false,'code','scope-denied');end if;
 end if;
 select * into s from tm_private.sessions where session_id=p_input->>'sessionId' and team_id=p_team and kind='match';
 if not found then return jsonb_build_object('ok',false,'code','scope-denied');end if;
 v_can_record:=coalesce(s.status='planned' and
  (s.starts_at at time zone 'Australia/Sydney')::date=(now() at time zone 'Australia/Sydney')::date,false);
 if p_action like '%.read' then
   if p_input-'sessionId'<>'{}'::jsonb then return jsonb_build_object('ok',false,'code','invalid-request');end if;
   select coalesce(jsonb_agg(
    jsonb_build_object('personId',c.person_id,'displayName',c.display_name,'response',c.response,
       'arrived',a1.arrived,'version',coalesce(a1.version,0)) order by c.display_name,c.person_id),'[]'::jsonb)
    into v_rows from tm_private.stage3d5_match_candidates(p_team,s.session_id) c
    left join tm_private.matchday_arrivals a1 on a1.session_id=s.session_id and a1.team_id=p_team
      and a1.fixture_version=s.resource_version and a1.person_id=c.person_id
    where p_role<>'team_player' or c.person_id=v_person;
   if p_role='team_player' then
     return jsonb_build_object('ok',true,'code','permitted','data',jsonb_build_object(
      'fixtureVersion',s.resource_version,'canRecord',v_can_record and jsonb_array_length(v_rows)=1,
      'rows',coalesce((select jsonb_agg(x-'personId'-'displayName'-'response') from jsonb_array_elements(v_rows) x),'[]'::jsonb)));
   end if;
   if jsonb_array_length(v_rows)>200 then return jsonb_build_object('ok',false,'code','scope-denied');end if;
   return jsonb_build_object('ok',true,'code','permitted','data',jsonb_build_object(
     'fixtureVersion',s.resource_version,'canRecord',v_can_record,'rows',v_rows));
 end if;
 if (p_input-'sessionId'-'fixtureVersion'-'expectedVersion'-'arrived'-'personId')<>'{}'::jsonb
 or coalesce(p_input->>'fixtureVersion','') !~ '^(0|[1-9][0-9]{0,8})$'
 or coalesce(p_input->>'expectedVersion','') !~ '^(0|[1-9][0-9]{0,8})$'
 or jsonb_typeof(p_input->'arrived') is distinct from 'boolean'
 or (p_role='team_player' and p_input ? 'personId')
 then return jsonb_build_object('ok',false,'code','invalid-request');end if;
 if p_role<>'team_player' then v_person:=p_input->>'personId';end if;
 if v_person is null or not exists(select 1 from tm_private.stage3d5_match_candidates(p_team,s.session_id) c where c.person_id=v_person)
 then return jsonb_build_object('ok',false,'code','participation-not-verified');end if;
 if (p_input->>'fixtureVersion')::integer<>s.resource_version or not v_can_record
 then return jsonb_build_object('ok',false,'code','stale-version');end if;
 select * into a from tm_private.matchday_arrivals where session_id=s.session_id and team_id=p_team
  and person_id=v_person and fixture_version=s.resource_version;
 v_version:=coalesce(a.version,0);
 if (p_input->>'expectedVersion')::integer<>v_version then return jsonb_build_object('ok',false,'code','stale-version');end if;
 insert into tm_private.matchday_arrivals(session_id,team_id,person_id,fixture_version,arrived,version,changed_by)
 values(s.session_id,p_team,v_person,s.resource_version,(p_input->>'arrived')::boolean,v_version+1,p_actor)
 on conflict(session_id,person_id,fixture_version) do update set arrived=excluded.arrived,
  version=excluded.version,changed_by=excluded.changed_by,changed_at=now();
 insert into tm_private.matchday_arrival_events(session_id,team_id,person_id,fixture_version,version,arrived,actor,role)
 values(s.session_id,p_team,v_person,s.resource_version,v_version+1,(p_input->>'arrived')::boolean,p_actor,p_role);
 return jsonb_build_object('ok',true,'code','committed','data',jsonb_build_object('version',v_version+1));
end;
$$;
revoke all on function public.tm_stage3d5_matchday_arrivals(uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.tm_stage3d5_matchday_arrivals(uuid,text,text,text,jsonb) to service_role;
commit;
