-- PR300: approved, immutable competition rules and team-recorded match events.
-- NO rule profile is seeded. A separate reviewed source migration must bind the
-- actual organiser evidence and owner approval to the exact competition version.
-- A generic or historical rulebook is not activation authority.
begin;
create table tm_private.matchday_rules_profiles (
 rule_id text primary key check(rule_id ~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$'),
 team_id text not null references tm_private.teams(team_id) on delete restrict,
 competition_id text not null references tm_private.team_competitions(competition_id) on delete restrict,
 competition_version integer not null check(competition_version>=0),
 sport_ref text not null,
 season_ref text not null check(season_ref ~ '^20[0-9]{2}$'),
 division text not null check(length(division) between 1 and 100),
 edition text not null check(length(edition) between 1 and 120),
 source_url text not null check(source_url ~ '^https://' and length(source_url)<=500),
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 approval_ref text not null check(approval_ref ~ '^[A-Za-z0-9][A-Za-z0-9:_/-]{5,150}$'),
 approved_by uuid not null references tm_private.accounts(user_id) on delete restrict,
 approved_at timestamptz not null,
 -- Only this explicitly supported match format may be activated. Unknown bonus
 -- scoring, forfeits, overtime, ladder and playoff rules must be resolved first.
 format_contract text not null check(format_contract='standard-try-periods-v1'),
 squad_max integer not null check(squad_max between 1 and 30),
 field_min integer not null check(field_min between 1 and 15),
 field_max integer not null check(field_max between field_min and squad_max and field_max<=15),
 category_a_max integer not null check(category_a_max between 0 and field_max),
 category_b_min integer not null check(category_b_min between 0 and field_max),
 category_a_label text not null check(length(trim(category_a_label)) between 1 and 50),
 category_b_label text not null check(length(trim(category_b_label)) between 1 and 50 and category_b_label<>category_a_label),
 try_a integer not null check(try_a between 1 and 10),
 try_b integer not null check(try_b between 1 and 10),
 period_count integer not null check(period_count between 1 and 8),
 period_seconds integer not null check(period_seconds between 1 and 7200),
 interchange_limit integer check(interchange_limit between 0 and 500),
 allow_draw boolean not null,
 unique(team_id,competition_id,competition_version)
);
create table tm_private.matchday_records (
 session_id text not null,
 team_id text not null,
 fixture_version integer not null check(fixture_version>=0),
 rule_id text not null references tm_private.matchday_rules_profiles(rule_id) on delete restrict,
 squad_version integer not null check(squad_version>0),
 version integer not null check(version>0),
 state text not null check(state in ('draft','ready','playing','finished','approved','published')),
 categories jsonb not null check(jsonb_typeof(categories)='object'),
 starting_ids text[] not null,
 field_ids text[] not null,
 period integer not null check(period>=1),
 elapsed_ms integer not null check(elapsed_ms>=0),
 running_since timestamptz,
 played_ms jsonb not null check(jsonb_typeof(played_ms)='object'),
 home_score integer not null check(home_score>=0),
 away_score integer not null check(away_score>=0),
 interchanges integer not null check(interchanges>=0),
 changed_by uuid not null references tm_private.accounts(user_id) on delete restrict,
 changed_at timestamptz not null default now(),
 primary key(session_id,fixture_version),
 foreign key(session_id,team_id) references tm_private.sessions(session_id,team_id) on delete restrict
);
create table tm_private.matchday_events (
 session_id text not null,
 team_id text not null,
 fixture_version integer not null,
 version integer not null,
 action text not null,
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 actor uuid not null references tm_private.accounts(user_id) on delete restrict,
 role text not null check(role in ('team_coach','team_manager','team_assistant')),
 period integer not null,
 elapsed_ms integer not null,
 home_delta integer not null default 0,
 away_delta integer not null default 0,
 voids_version integer,
 recorded_at timestamptz not null default now(),
 primary key(session_id,fixture_version,version),
 foreign key(session_id,fixture_version) references tm_private.matchday_records(session_id,fixture_version) on delete restrict,
 foreign key(session_id,team_id) references tm_private.sessions(session_id,team_id) on delete restrict
);
create unique index matchday_event_one_void on tm_private.matchday_events(session_id,fixture_version,voids_version) where voids_version is not null;
do $$
declare t text;
begin
 foreach t in array array['matchday_rules_profiles','matchday_records','matchday_events'] loop
  execute format('alter table tm_private.%I enable row level security',t);
  execute format('alter table tm_private.%I force row level security',t);
  execute format('revoke all on tm_private.%I from public,anon,authenticated',t);
 end loop;
end;
$$;
grant select on tm_private.matchday_rules_profiles to service_role;
grant select,insert,update on tm_private.matchday_records to service_role;
grant select,insert on tm_private.matchday_events to service_role;
create trigger matchday_rules_immutable before update or delete on tm_private.matchday_rules_profiles for each row execute function tm_private.reject_audit_mutation();
create trigger matchday_events_immutable before update or delete on tm_private.matchday_events for each row execute function tm_private.reject_audit_mutation();

create function tm_private.matchday_valid_field(p_ids text[],p_categories jsonb,p_rules tm_private.matchday_rules_profiles)
returns boolean language sql immutable set search_path='' as $$
 select coalesce(cardinality(p_ids) between p_rules.field_min and p_rules.field_max
   and cardinality(p_ids)=(select count(distinct x) from unnest(p_ids) x)
   and not exists(select 1 from unnest(p_ids) x where coalesce(p_categories->>x,'') not in ('a','b'))
   and (select count(*) from unnest(p_ids) x where p_categories->>x='a')<=p_rules.category_a_max
   and (select count(*) from unnest(p_ids) x where p_categories->>x='b')>=p_rules.category_b_min,false);
$$;
revoke all on function tm_private.matchday_valid_field(text[],jsonb,tm_private.matchday_rules_profiles) from public,anon,authenticated;
grant execute on function tm_private.matchday_valid_field(text[],jsonb,tm_private.matchday_rules_profiles) to service_role;

create function public.tm_stage3d5_matchday(p_actor uuid,p_team text,p_role text,p_action text,p_input jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
 s tm_private.sessions%rowtype; rule tm_private.matchday_rules_profiles%rowtype;
 squad tm_private.team_match_selections%rowtype; m tm_private.matchday_records%rowtype;
 e tm_private.matchday_events%rowtype; gate jsonb; v_ids text[]; v_fields text[];
 v_categories jsonb; v_players jsonb; v_events jsonb; v_player text; v_cat text;
 v_version integer; v_rules_count integer; v_count integer; v_delta integer:=0;
 v_home integer:=0; v_away integer:=0; v_void integer; v_now timestamptz:=clock_timestamp();
 v_ready boolean:=false; v_current boolean:=false; v_reason text; v_payload jsonb;
 v_read boolean; v_staff boolean; v_period_end integer; v_names jsonb; v_result_current boolean;
begin
 if p_actor is null or p_team is null or p_role is null or p_action is null or p_input is null
 or jsonb_typeof(p_input)<>'object' or length(p_input::text)>5000
 or (p_action<>'matchday.competition.read' and coalesce(p_input->>'sessionId','') !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$')
 or p_action not in ('matchday.competition.read','matchday.read','player.matchday.read','matchday.lineup.save','matchday.lineup.approve',
 'matchday.clock.start','matchday.clock.pause','matchday.period.next','matchday.interchange',
 'matchday.score.record','matchday.score.void','matchday.finish','matchday.result.approve',
 'matchday.result.publish','matchday.result.reopen') then
 return jsonb_build_object('ok',false,'code','invalid-request');end if;
 v_read:=p_action in ('matchday.competition.read','matchday.read','player.matchday.read');
 v_staff:=p_role in ('team_coach','team_manager','team_assistant');
 if not ((p_role='team_player' and p_action='player.matchday.read') or (v_staff and p_action<>'player.matchday.read'))
 then return jsonb_build_object('ok',false,'code','role-denied');end if;
 if not v_read then
   perform 1 from tm_private.teams where team_id=p_team and status='active' for update;
   if not found then return jsonb_build_object('ok',false,'code','scope-denied');end if;
 end if;
 if p_role in ('team_coach','team_manager') then
   if not tm_private.stage3d5_staff(p_actor,p_team,p_role) then return jsonb_build_object('ok',false,'code','scope-denied');end if;
 elsif p_role='team_assistant' then
   gate:=public.tm_stage3b_operation(p_actor,p_team,p_role,'notices.read',p_team,'{}'::jsonb,null);
   if gate->>'ok' is distinct from 'true' then return jsonb_build_object('ok',false,'code','scope-denied');end if;
 else
   gate:=public.tm_stage3d5_player_team(p_actor,p_team,p_role,'player.team.read','{}'::jsonb);
   if gate->>'ok' is distinct from 'true' then return jsonb_build_object('ok',false,'code','scope-denied');end if;
 end if;
 if p_action='matchday.competition.read' then
  if p_role not in ('team_coach','team_manager') or p_input-'competitionId'<>'{}'::jsonb
    or coalesce(p_input->>'competitionId','') !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$'
  then return jsonb_build_object('ok',false,'code','role-denied');end if;
  if not exists(select 1 from tm_private.team_competitions c where c.team_id=p_team and c.competition_id=p_input->>'competitionId')
  then return jsonb_build_object('ok',false,'code','scope-denied');end if;
  select count(*) into v_count from tm_private.team_competition_fixtures f where f.team_id=p_team and f.competition_id=p_input->>'competitionId';
  if v_count>100 then return jsonb_build_object('ok',false,'code','scope-denied');end if;
  with fixtures as (
    select f.session_id,ss.title,ss.starts_at,ss.status,mm.home_score,mm.away_score,
      case when ss.status='cancelled' then 'cancelled'
      when (select count(*) from tm_private.team_competition_fixtures f2 where f2.team_id=p_team and f2.session_id=f.session_id)<>1 then 'ambiguous-link'
      when mm.state='published' and rp.competition_id=f.competition_id then 'published'
      else 'not-published' end as outcome
    from tm_private.team_competition_fixtures f join tm_private.sessions ss on ss.session_id=f.session_id and ss.team_id=f.team_id
    left join tm_private.matchday_records mm on mm.session_id=ss.session_id and mm.team_id=ss.team_id and mm.fixture_version=ss.resource_version
    left join tm_private.matchday_rules_profiles rp on rp.rule_id=mm.rule_id and rp.team_id=f.team_id
    where f.team_id=p_team and f.competition_id=p_input->>'competitionId' and ss.kind='match'
  )
  select jsonb_build_object('eligible',v_count,'shown',count(*),'published',count(*) filter(where outcome='published'),
   'wins',count(*) filter(where outcome='published' and home_score>away_score),
   'draws',count(*) filter(where outcome='published' and home_score=away_score),
   'losses',count(*) filter(where outcome='published' and home_score<away_score),
   'pointsFor',coalesce(sum(home_score) filter(where outcome='published'),0),
   'pointsAgainst',coalesce(sum(away_score) filter(where outcome='published'),0),
   'fixtures',coalesce(jsonb_agg(jsonb_build_object('sessionId',session_id,'title',title,'status',status,'outcome',outcome,
     'homeScore',case when outcome='published' then home_score end,'awayScore',case when outcome='published' then away_score end)
     order by starts_at,session_id),'[]'::jsonb)) into v_events from fixtures;
  return jsonb_build_object('ok',true,'code','permitted','data',v_events);
 end if;
 select * into s from tm_private.sessions where team_id=p_team and session_id=p_input->>'sessionId' and kind='match';
 if not found then return jsonb_build_object('ok',false,'code','scope-denied');end if;
 -- Exactly one linked competition, and its exact current version, season and
 -- division must match a separately approved immutable profile.
 select count(*) into v_rules_count from tm_private.team_competition_fixtures f where f.team_id=p_team and f.session_id=s.session_id;
 if v_rules_count=1 then
  select r.* into rule from tm_private.team_competition_fixtures f
  join tm_private.team_competitions c on c.competition_id=f.competition_id and c.team_id=p_team
  join tm_private.teams t on t.team_id=p_team and t.status='active'
  join tm_private.matchday_rules_profiles r on r.team_id=p_team and r.competition_id=c.competition_id
     and r.competition_version=c.version and r.sport_ref=t.sport_ref and r.season_ref=t.season_ref
     and r.season_ref=c.season_ref and r.division=c.division
  where f.team_id=p_team and f.session_id=s.session_id and c.entry_status in ('entered','completed')
    and s.starts_at is not null
    and (c.begins_on is null or (s.starts_at at time zone 'Australia/Sydney')::date>=c.begins_on)
    and (c.ends_on is null or (s.starts_at at time zone 'Australia/Sydney')::date<=c.ends_on);
 end if;
 select * into squad from tm_private.team_match_selections where team_id=p_team and session_id=s.session_id;
 v_ready:=coalesce(squad.state='published' and squad.fixture_version=s.resource_version
   and cardinality(squad.person_ids)>0 and rule.rule_id is not null and cardinality(squad.person_ids)<=rule.squad_max
   and (select count(*) from tm_private.stage3d5_match_candidates(p_team,s.session_id) c where c.person_id=any(squad.person_ids))=cardinality(squad.person_ids),false);
 select * into m from tm_private.matchday_records where team_id=p_team and session_id=s.session_id and fixture_version=s.resource_version;
 v_version:=coalesce(m.version,0);
 v_current:=coalesce(v_ready and s.status<>'cancelled' and (m.version is null or (m.rule_id=rule.rule_id and m.squad_version=squad.version)),false);
 if v_read then
  if p_input-'sessionId'<>'{}'::jsonb then return jsonb_build_object('ok',false,'code','invalid-request');end if;
  if p_role='team_player' then
   -- Historical published aggregate is independent of later squad/access changes.
   -- Names are shown only while the current squad and fixture remain valid.
   v_result_current:=coalesce(m.state='published' and s.status<>'cancelled' and v_rules_count=1 and exists(
    select 1 from tm_private.matchday_rules_profiles rp
    join tm_private.team_competition_fixtures cf on cf.competition_id=rp.competition_id and cf.team_id=rp.team_id
    where rp.rule_id=m.rule_id and rp.team_id=p_team and cf.session_id=s.session_id),false);
   v_names:='[]'::jsonb;
   if v_current and m.state in ('ready','playing','finished','approved','published') then
    select coalesce(jsonb_agg(jsonb_build_object('displayName',c.display_name) order by c.display_name,c.person_id),'[]'::jsonb)
    into v_names from tm_private.stage3d5_match_candidates(p_team,s.session_id) c where c.person_id=any(m.starting_ids);
   end if;
   return jsonb_build_object('ok',true,'code','permitted','data',
    jsonb_build_object('state',case when v_result_current then 'published' when jsonb_array_length(v_names)>0 then 'lineup-published' else 'unavailable' end,
     'startingPlayers',v_names,'teamRecorded',true) ||
    case when v_result_current then jsonb_build_object('homeScore',m.home_score,'awayScore',m.away_score,'version',m.version) else '{}'::jsonb end);
  end if;
  if not v_current and m.state='published' and s.status<>'cancelled' and v_rules_count=1 and exists(
    select 1 from tm_private.matchday_rules_profiles rp join tm_private.team_competition_fixtures cf
    on cf.competition_id=rp.competition_id and cf.team_id=rp.team_id
    where rp.rule_id=m.rule_id and rp.team_id=p_team and cf.session_id=s.session_id)
  then return jsonb_build_object('ok',true,'code','permitted','data',jsonb_build_object('state','historical-published',
   'homeScore',m.home_score,'awayScore',m.away_score,'version',m.version,'fixtureVersion',s.resource_version,'teamRecorded',true));end if;
  if not v_current then return jsonb_build_object('ok',true,'code','permitted','data',jsonb_build_object('state','blocked',
    'reason',case when rule.rule_id is null then 'rules-unapproved' when not v_ready then 'squad-unavailable' else 'fixture-or-record-stale' end,
    'fixtureVersion',s.resource_version,'version',v_version));end if;
  select coalesce(jsonb_agg(jsonb_build_object('personId',c.person_id,'displayName',c.display_name) order by c.display_name,c.person_id),'[]'::jsonb)
    into v_players from tm_private.stage3d5_match_candidates(p_team,s.session_id) c where c.person_id=any(squad.person_ids);
  select coalesce(jsonb_agg(jsonb_build_object('version',a.version,'action',a.action,'payload',case when a.action='matchday.lineup.save' then '{}'::jsonb else a.payload end,
    'role',a.role,'period',a.period,'elapsedMs',a.elapsed_ms,'homeDelta',a.home_delta,'awayDelta',a.away_delta,
    'voided',exists(select 1 from tm_private.matchday_events z where z.session_id=a.session_id and z.fixture_version=a.fixture_version and z.voids_version=a.version))
    order by a.version),'[]'::jsonb) into v_events
  from (select * from tm_private.matchday_events where session_id=s.session_id and fixture_version=s.resource_version order by version desc limit 40) a;
  v_delta:=case when m.running_since is null then 0 else greatest(0,least(rule.period_seconds*1000-m.elapsed_ms,
     floor(extract(epoch from (v_now-m.running_since))*1000)::bigint))::integer end;
  if v_delta>0 then
   foreach v_player in array m.field_ids loop
    m.played_ms:=jsonb_set(m.played_ms,array[v_player],to_jsonb(coalesce((m.played_ms->>v_player)::integer,0)+v_delta),true);
   end loop;
  end if;
  return jsonb_build_object('ok',true,'code','permitted','data',jsonb_build_object(
   'state',coalesce(m.state,'none'),'version',v_version,'fixtureVersion',s.resource_version,
   'canEdit',s.status='planned','canStart',s.status='planned' and (s.starts_at at time zone 'Australia/Sydney')::date=(v_now at time zone 'Australia/Sydney')::date,'rules',jsonb_build_object('id',rule.rule_id,'edition',rule.edition,'fieldMin',rule.field_min,
    'fieldMax',rule.field_max,'categoryAMax',rule.category_a_max,'categoryBMin',rule.category_b_min,'periodCount',rule.period_count,
    'periodSeconds',rule.period_seconds,'tryA',rule.try_a,'tryB',rule.try_b,'interchangeLimit',rule.interchange_limit,
    'categoryALabel',rule.category_a_label,'categoryBLabel',rule.category_b_label),
   'players',v_players,'categories',coalesce(m.categories,'{}'::jsonb),'startingIds',coalesce(to_jsonb(m.starting_ids),'[]'::jsonb),
   'fieldIds',coalesce(to_jsonb(m.field_ids),'[]'::jsonb),'period',coalesce(m.period,1),
   'elapsedMs',coalesce(m.elapsed_ms,0)+v_delta,'running',m.running_since is not null,
   'playedMs',coalesce(m.played_ms,'{}'::jsonb),'homeScore',coalesce(m.home_score,0),
   'awayScore',coalesce(m.away_score,0),'interchanges',coalesce(m.interchanges,0),'events',v_events,'teamRecorded',true));
 end if;
 if not v_current or s.status<>'planned' then return jsonb_build_object('ok',false,'code','scope-denied');end if;
 if coalesce(p_input->>'expectedVersion','') !~ '^(0|[1-9][0-9]{0,8})$'
 or coalesce(p_input->>'fixtureVersion','') !~ '^(0|[1-9][0-9]{0,8})$'
 or (p_input->>'fixtureVersion')::integer<>s.resource_version
 or (p_input->>'expectedVersion')::integer<>v_version
 or p_input->>'ruleId' is distinct from rule.rule_id then return jsonb_build_object('ok',false,'code','stale-version');end if;
 v_payload:=p_input-'sessionId'-'expectedVersion'-'fixtureVersion'-'ruleId';
 if p_action in ('matchday.lineup.approve','matchday.finish','matchday.result.approve','matchday.result.reopen') and p_role<>'team_coach'
 or p_action='matchday.lineup.save' and p_role not in ('team_coach','team_assistant')
 or p_action='matchday.result.publish' and p_role not in ('team_coach','team_manager')
 then return jsonb_build_object('ok',false,'code','role-denied');end if;
 if p_action='matchday.lineup.save' then
  if coalesce(m.state,'none') not in ('none','draft','ready') or m.running_since is not null
  or v_payload-'lineup'<>'{}'::jsonb or jsonb_typeof(v_payload->'lineup') is distinct from 'array'
  then return jsonb_build_object('ok',false,'code','invalid-request');end if;
  if jsonb_array_length(v_payload->'lineup')<>cardinality(squad.person_ids)
  or exists(select 1 from jsonb_array_elements(v_payload->'lineup') x where jsonb_typeof(x)<>'object'
    or x-'personId'-'category'-'onField'<>'{}'::jsonb or coalesce(x->>'category','') not in ('a','b')
    or jsonb_typeof(x->'onField') is distinct from 'boolean' or coalesce(x->>'personId','') !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$')
  then return jsonb_build_object('ok',false,'code','invalid-request');end if;
  select array_agg(x->>'personId' order by x->>'personId'),
    coalesce(array_agg(x->>'personId' order by x->>'personId') filter(where (x->>'onField')::boolean),array[]::text[]),
    jsonb_object_agg(x->>'personId',x->>'category')
    into v_ids,v_fields,v_categories from jsonb_array_elements(v_payload->'lineup') x;
  if v_ids is distinct from (select array_agg(id order by id) from unnest(squad.person_ids) id)
    or not tm_private.matchday_valid_field(v_fields,v_categories,rule)
  then return jsonb_build_object('ok',false,'code','invalid-request');end if;
  m.rule_id:=rule.rule_id;m.squad_version:=squad.version;m.state:='draft';m.categories:=v_categories;
  m.starting_ids:=v_fields;m.field_ids:=v_fields;m.period:=1;m.elapsed_ms:=0;m.running_since:=null;
  m.played_ms:='{}'::jsonb;m.home_score:=0;m.away_score:=0;m.interchanges:=0;
 else
  if m.version is null then return jsonb_build_object('ok',false,'code','invalid-request');end if;
  v_period_end:=rule.period_seconds*1000;
  if m.running_since is not null then
   v_delta:=greatest(0,least(v_period_end-m.elapsed_ms,floor(extract(epoch from (v_now-m.running_since))*1000)::bigint))::integer;
   m.elapsed_ms:=m.elapsed_ms+v_delta;
   foreach v_player in array m.field_ids loop
    m.played_ms:=jsonb_set(m.played_ms,array[v_player],to_jsonb(coalesce((m.played_ms->>v_player)::integer,0)+v_delta),true);
   end loop;
   m.running_since:=v_now;
  end if;
  case p_action
  when 'matchday.lineup.approve' then
   if v_payload-'confirmed'<>'{}'::jsonb or v_payload->'confirmed' is distinct from 'true'::jsonb or m.state<>'draft' then return jsonb_build_object('ok',false,'code','invalid-request');end if;
   m.state:='ready';
  when 'matchday.clock.start' then
   if v_payload<>'{}'::jsonb or m.state not in ('ready','playing') or m.running_since is not null or m.elapsed_ms>=v_period_end
    or (s.starts_at at time zone 'Australia/Sydney')::date<>(v_now at time zone 'Australia/Sydney')::date
   then return jsonb_build_object('ok',false,'code','invalid-request');end if;
   m.state:='playing';m.running_since:=v_now;
  when 'matchday.clock.pause' then
   if v_payload<>'{}'::jsonb or m.state<>'playing' or m.running_since is null then return jsonb_build_object('ok',false,'code','invalid-request');end if;
   m.running_since:=null;
  when 'matchday.period.next' then
   if v_payload<>'{}'::jsonb or m.state<>'playing' or m.running_since is not null or m.elapsed_ms<>v_period_end or m.period>=rule.period_count
   then return jsonb_build_object('ok',false,'code','invalid-request');end if;
   m.period:=m.period+1;m.elapsed_ms:=0;
  when 'matchday.interchange' then
   if m.state<>'playing' or m.elapsed_ms>=v_period_end or v_payload-'outId'-'inId'<>'{}'::jsonb
    or coalesce(v_payload->>'outId','')<>all(m.field_ids) or not (m.categories ? coalesce(v_payload->>'inId',''))
    or coalesce(v_payload->>'inId','')=any(m.field_ids)
    or (rule.interchange_limit is not null and m.interchanges>=rule.interchange_limit)
   then return jsonb_build_object('ok',false,'code','invalid-request');end if;
   v_fields:=array_append(array_remove(m.field_ids,v_payload->>'outId'),v_payload->>'inId');
   if not tm_private.matchday_valid_field(v_fields,m.categories,rule) then return jsonb_build_object('ok',false,'code','invalid-request');end if;
   m.field_ids:=v_fields;m.interchanges:=m.interchanges+1;
  when 'matchday.score.record' then
   if m.state not in ('playing','finished') or v_payload-'side'-'personId'-'category'-'reason'<>'{}'::jsonb
    or coalesce(v_payload->>'side','') not in ('home','away')
    or (m.state='finished' and (length(trim(coalesce(v_payload->>'reason',''))) not between 1 and 200))
    or (m.state='playing' and m.elapsed_ms>=v_period_end)
   then return jsonb_build_object('ok',false,'code','invalid-request');end if;
   if v_payload->>'side'='home' then
    v_player:=v_payload->>'personId';
    if v_player is null or not (m.categories ? v_player) or v_payload ? 'category'
     or (m.state='playing' and not v_player=any(m.field_ids))
    then return jsonb_build_object('ok',false,'code','invalid-request');end if;
    v_cat:=m.categories->>v_player;
    v_home:=case when v_cat='a' then rule.try_a else rule.try_b end;
   else
    v_cat:=v_payload->>'category';
    if coalesce(v_cat,'') not in ('a','b') or v_payload ? 'personId' then return jsonb_build_object('ok',false,'code','invalid-request');end if;
    v_away:=case when v_cat='a' then rule.try_a else rule.try_b end;
   end if;
  when 'matchday.score.void' then
   if m.state not in ('playing','finished') or v_payload-'targetVersion'-'reason'<>'{}'::jsonb
   or coalesce(v_payload->>'targetVersion','') !~ '^[1-9][0-9]{0,8}$'
   or length(trim(coalesce(v_payload->>'reason',''))) not between 1 and 200
   then return jsonb_build_object('ok',false,'code','invalid-request');end if;
   v_void:=(v_payload->>'targetVersion')::integer;
   select * into e from tm_private.matchday_events where session_id=s.session_id and fixture_version=s.resource_version and version=v_void and action='matchday.score.record';
   if not found or exists(select 1 from tm_private.matchday_events z where z.session_id=s.session_id and z.fixture_version=s.resource_version and z.voids_version=v_void)
   then return jsonb_build_object('ok',false,'code','invalid-request');end if;
   v_home:=-e.home_delta;v_away:=-e.away_delta;
  when 'matchday.finish' then
   if v_payload<>'{}'::jsonb or m.state<>'playing' or m.running_since is not null or m.elapsed_ms<>v_period_end or m.period<>rule.period_count
   then return jsonb_build_object('ok',false,'code','invalid-request');end if;
   m.state:='finished';
  when 'matchday.result.approve' then
   if v_payload-'confirmed'<>'{}'::jsonb or v_payload->'confirmed' is distinct from 'true'::jsonb or m.state<>'finished'
   or (not rule.allow_draw and m.home_score=m.away_score)
   then return jsonb_build_object('ok',false,'code','invalid-request');end if;
   m.state:='approved';
  when 'matchday.result.publish' then
   if v_payload<>'{}'::jsonb or m.state<>'approved' then return jsonb_build_object('ok',false,'code','invalid-request');end if;
   m.state:='published';
  when 'matchday.result.reopen' then
   if v_payload-'reason'<>'{}'::jsonb or m.state not in ('approved','published')
   or length(trim(coalesce(v_payload->>'reason',''))) not between 1 and 200
   then return jsonb_build_object('ok',false,'code','invalid-request');end if;
   m.state:='finished';
  else return jsonb_build_object('ok',false,'code','invalid-request');
  end case;
  m.home_score:=m.home_score+v_home;m.away_score:=m.away_score+v_away;
  if m.home_score not between 0 and 9999 or m.away_score not between 0 and 9999 then return jsonb_build_object('ok',false,'code','invalid-request');end if;
 end if;
 insert into tm_private.matchday_records(session_id,team_id,fixture_version,rule_id,squad_version,version,state,categories,starting_ids,field_ids,
 period,elapsed_ms,running_since,played_ms,home_score,away_score,interchanges,changed_by)
 values(s.session_id,p_team,s.resource_version,m.rule_id,m.squad_version,v_version+1,m.state,m.categories,m.starting_ids,m.field_ids,
 m.period,m.elapsed_ms,m.running_since,m.played_ms,m.home_score,m.away_score,m.interchanges,p_actor)
 on conflict(session_id,fixture_version) do update set version=excluded.version,state=excluded.state,categories=excluded.categories,
 starting_ids=excluded.starting_ids,field_ids=excluded.field_ids,period=excluded.period,elapsed_ms=excluded.elapsed_ms,
 running_since=excluded.running_since,played_ms=excluded.played_ms,home_score=excluded.home_score,away_score=excluded.away_score,
 interchanges=excluded.interchanges,changed_by=p_actor,changed_at=now();
 insert into tm_private.matchday_events(session_id,team_id,fixture_version,version,action,payload,actor,role,period,elapsed_ms,home_delta,away_delta,voids_version)
 values(s.session_id,p_team,s.resource_version,v_version+1,p_action,v_payload,p_actor,p_role,m.period,m.elapsed_ms,v_home,v_away,v_void);
 return jsonb_build_object('ok',true,'code','committed','data',jsonb_build_object('version',v_version+1,'state',m.state));
end;
$$;
revoke all on function public.tm_stage3d5_matchday(uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.tm_stage3d5_matchday(uuid,text,text,text,jsonb) to service_role;
commit;
