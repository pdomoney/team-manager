-- PR292: administrative match squad only. No on-field positions, bench
-- rules, sporting eligibility, official draw edits or scorekeeping authority.
begin;
create table tm_private.team_match_selections (
 session_id text primary key,
 team_id text not null,
 fixture_version integer not null check(fixture_version>=0),
 person_ids text[] not null check(cardinality(person_ids)<=30),
 state text not null check(state in ('draft','published','withdrawn')),
 version integer not null check(version>0),
 changed_by uuid not null references tm_private.accounts(user_id) on delete restrict,
 changed_at timestamptz not null default now(),
 foreign key(session_id,team_id) references tm_private.sessions(session_id,team_id) on delete restrict
);
alter table tm_private.team_match_selections enable row level security;
alter table tm_private.team_match_selections force row level security;
revoke all on tm_private.team_match_selections from public,anon,authenticated;
grant select,insert,update on tm_private.team_match_selections to service_role;

-- Use the existing independent adult review, current exact-team Player grant,
-- active participation and verified person link, not guessed roster identity.
create function tm_private.stage3d5_match_candidates(p_team text,p_session text)
returns table(person_id text,display_name text,response text)
language sql stable security definer set search_path=''
as $$
 select p.person_id,n.display_name,a.response
 from tm_private.participations p
 join tm_private.persons person on person.person_id=p.person_id and person.lifecycle='active'
 join lateral (
   select ap.display_name
   from tm_private.account_person_links l
   join tm_private.accounts ac on ac.user_id=l.user_id and ac.status='active'
   join tm_private.account_profiles ap on ap.user_id=ac.user_id
   join tm_private.registration_adult_reviews r on r.user_id=ac.user_id
   where l.person_id=p.person_id and l.status='verified'
     and l.verified_by is not null and l.verified_by<>l.user_id and l.verified_at is not null
     and r.state='approved' and r.reviewed_by<>ac.user_id
     and length(trim(ap.display_name))>0
     and exists(select 1 from tm_private.role_grants g where g.user_id=ac.user_id
       and g.team_id=p_team and g.role='team_player' and g.status='active'
       and g.policy_version=1 and g.approved_by is not null and g.approved_by<>ac.user_id
       and g.approved_at is not null and (g.valid_from is null or g.valid_from<=now())
       and (g.expires_at is null or now()<g.expires_at))
     and exists(select 1 from tm_private.registration_acceptances x
       join tm_private.registration_policy_versions v on v.policy_id=x.policy_id and v.status='active'
       where x.user_id=ac.user_id and x.terms_accepted and x.privacy_acknowledged)
   order by l.verified_at desc,ac.user_id limit 1
 ) n on true
 left join tm_private.availability a on a.team_id=p_team and a.session_id=p_session and a.person_id=p.person_id
 where p.team_id=p_team and p.status='active'
   and p.verified_by is not null and p.verified_at is not null
 order by p.person_id;
$$;
revoke all on function tm_private.stage3d5_match_candidates(text,text) from public,anon,authenticated;
grant execute on function tm_private.stage3d5_match_candidates(text,text) to service_role;

create function public.tm_stage3d5_match(p_actor uuid,p_team text,p_role text,p_action text,p_input jsonb)
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare
 s tm_private.sessions%rowtype;
 existing tm_private.team_match_selections%rowtype;
 ids text[];
 v_version integer;
 v_current boolean;
 v_state text;
 v_candidates jsonb;
 v_names jsonb;
 v_eligible integer;
 v_shown integer;
 v_result jsonb;
begin
 if p_actor is null or p_team is null or p_role is null or p_action is null
   or p_input is null or jsonb_typeof(p_input)<>'object'
   or p_action not in ('match.selection.read','match.selection.save','match.selection.publish','match.selection.withdraw','player.match.selection.read')
   or coalesce(p_input->>'sessionId','') !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$'
   or length(p_input::text)>5000 then
   return jsonb_build_object('ok',false,'code','invalid-request');
 end if;
 if p_action='player.match.selection.read' then
   if p_role<>'team_player' then return jsonb_build_object('ok',false,'code','role-denied'); end if;
   v_result:=public.tm_stage3d5_player_team(p_actor,p_team,p_role,'player.team.read','{}'::jsonb);
   if v_result->>'ok'<>'true' then return jsonb_build_object('ok',false,'code','scope-denied'); end if;
 elsif not tm_private.stage3d5_staff(p_actor,p_team,p_role) then
   return jsonb_build_object('ok',false,'code','scope-denied');
 end if;
 if p_action in ('match.selection.read','player.match.selection.read') then
   if (p_input-'sessionId')<>'{}'::jsonb then return jsonb_build_object('ok',false,'code','invalid-request'); end if;
 else
   if p_role<>'team_coach' then return jsonb_build_object('ok',false,'code','role-denied'); end if;
   if coalesce(p_input->>'expectedVersion','') !~ '^(0|[1-9][0-9]{0,8})$'
      or coalesce(p_input->>'fixtureVersion','') !~ '^(0|[1-9][0-9]{0,8})$'
      or (p_action='match.selection.save' and (p_input-'sessionId'-'expectedVersion'-'fixtureVersion'-'personIds')<>'{}'::jsonb)
      or (p_action<>'match.selection.save' and (p_input-'sessionId'-'expectedVersion'-'fixtureVersion')<>'{}'::jsonb)
   then return jsonb_build_object('ok',false,'code','invalid-request'); end if;
   -- Match edit operations lock the team; follow the same order.
   perform 1 from tm_private.teams where team_id=p_team and status='active' for update;
   if not found or not tm_private.stage3d5_staff(p_actor,p_team,p_role)
   then return jsonb_build_object('ok',false,'code','scope-denied'); end if;
 end if;
 select * into s from tm_private.sessions
  where team_id=p_team and session_id=p_input->>'sessionId' and kind='match';
 if not found then return jsonb_build_object('ok',false,'code','scope-denied'); end if;
 select * into existing from tm_private.team_match_selections
  where team_id=p_team and session_id=s.session_id;
 ids:=coalesce(existing.person_ids,array[]::text[]);
 v_version:=coalesce(existing.version,0);
 v_state:=coalesce(existing.state,'none');
 select count(*) into v_eligible from tm_private.participations p
  join tm_private.persons person on person.person_id=p.person_id and person.lifecycle='active'
  where p.team_id=p_team and p.status='active' and p.verified_by is not null and p.verified_at is not null;
 select coalesce(jsonb_agg(jsonb_build_object('personId',c.person_id,'displayName',c.display_name,'response',c.response)
        order by c.display_name,c.person_id),'[]'::jsonb),count(*)
 into v_candidates,v_shown from tm_private.stage3d5_match_candidates(p_team,s.session_id) c;
 select coalesce(jsonb_agg(jsonb_build_object('displayName',c.display_name) order by c.display_name,c.person_id),'[]'::jsonb)
 into v_names from tm_private.stage3d5_match_candidates(p_team,s.session_id) c
 where c.person_id=any(ids);
 v_current:=v_state='published' and existing.fixture_version=s.resource_version
   and s.status<>'cancelled' and jsonb_array_length(v_names)=cardinality(ids)
   and cardinality(ids)>0;
 if p_action='player.match.selection.read' then
   return jsonb_build_object('ok',true,'code','permitted','data',jsonb_build_object(
     'state',case when v_current then 'published' else 'unavailable' end,
     'players',case when v_current then v_names else '[]'::jsonb end));
 elsif p_action='match.selection.read' then
   return jsonb_build_object('ok',true,'code','permitted','data',jsonb_build_object(
     'state',v_state,'version',v_version,'fixtureVersion',s.resource_version,
     'current',coalesce(v_current,false),'selectedIds',to_jsonb(ids),
     'candidates',v_candidates,'eligible',v_eligible,'shown',v_shown,
     'publishedPlayers',case when v_current then v_names else '[]'::jsonb end));
 end if;
 if (p_input->>'expectedVersion')::integer<>v_version
   or (p_input->>'fixtureVersion')::integer<>s.resource_version
 then return jsonb_build_object('ok',false,'code','stale-version'); end if;
 if p_action='match.selection.withdraw' then
   if v_state not in ('draft','published') then return jsonb_build_object('ok',false,'code','invalid-request'); end if;
   v_state:='withdrawn';
 else
   if s.status<>'planned' then return jsonb_build_object('ok',false,'code','invalid-request'); end if;
   if p_action='match.selection.save' then
     if coalesce(jsonb_typeof(p_input->'personIds'),'')<>'array' then return jsonb_build_object('ok',false,'code','invalid-request'); end if;
     if jsonb_array_length(p_input->'personIds')>30
       or exists(select 1 from jsonb_array_elements(p_input->'personIds') x
          where jsonb_typeof(x)<>'string' or (x#>>'{}') !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$')
     then return jsonb_build_object('ok',false,'code','invalid-request'); end if;
     select coalesce(array_agg(x order by x),array[]::text[]) into ids
       from jsonb_array_elements_text(p_input->'personIds') x;
     v_state:='draft';
   else
     if v_state<>'draft' or existing.fixture_version<>s.resource_version or cardinality(ids)=0
     then return jsonb_build_object('ok',false,'code','stale-version'); end if;
     v_state:='published';
   end if;
   if cardinality(ids)<>(select count(distinct x) from unnest(ids) x)
     or exists(select 1 from unnest(ids) x where not exists(
       select 1 from tm_private.stage3d5_match_candidates(p_team,s.session_id) c where c.person_id=x))
   then return jsonb_build_object('ok',false,'code','participation-not-verified'); end if;
 end if;
 insert into tm_private.team_match_selections(session_id,team_id,fixture_version,person_ids,state,version,changed_by)
 values(s.session_id,p_team,s.resource_version,ids,v_state,v_version+1,p_actor)
 on conflict(session_id) do update set fixture_version=excluded.fixture_version,person_ids=excluded.person_ids,
   state=excluded.state,version=excluded.version,changed_by=excluded.changed_by,changed_at=now()
 where team_match_selections.team_id=p_team and team_match_selections.version=v_version;
 if not found then return jsonb_build_object('ok',false,'code','stale-version'); end if;
 insert into tm_private.audit_events(user_id,team_id,action,resource_id,decision,reason_code)
 values(p_actor,p_team,'stage3d5.'||p_action,s.session_id,'ALLOW','match-squad-only');
 return jsonb_build_object('ok',true,'code','committed','data',jsonb_build_object('version',v_version+1,'state',v_state));
end;
$$;
revoke all on function public.tm_stage3d5_match(uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.tm_stage3d5_match(uuid,text,text,text,jsonb) to service_role;
commit;
