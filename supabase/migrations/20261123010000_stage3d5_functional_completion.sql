-- Stage 3D.5 corrective: first-team management parity.
-- Uninstalled source. Exact-source + live DB backup/migration qualification required.
-- No account/team/policy is seeded. All operations are exact-team and server-authorised.
-- Do not infer sporting registration, payment, accreditation or official fixtures.

create table tm_private.team_preferences (
  team_id text primary key references tm_private.teams(team_id) on delete restrict,
  team_label text not null default '' check(length(team_label)<=100),
  training_venue text not null default '' check(length(training_venue)<=120),
  training_start text not null default '' check(training_start='' or training_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  training_end text not null default '' check(training_end='' or training_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  contact_name text not null default '' check(length(contact_name)<=80),
  contact_email text not null default '' check(length(contact_email)<=254),
  jersey_loan boolean not null default false,
  version integer not null default 0 check(version>=0)
);
create table tm_private.team_jerseys (
  issue_id text primary key,
  team_id text not null references tm_private.teams(team_id) on delete restrict,
  person_id text not null,
  season_ref text not null,
  jersey_no text not null check(jersey_no ~ '^[0-9]{1,3}$'),
  issued_at timestamptz not null default now(),
  returned_at timestamptz,
  recorded_by uuid not null references tm_private.accounts(user_id) on delete restrict,
  version integer not null default 0,
  foreign key(team_id,person_id) references tm_private.participations(team_id,person_id) on delete restrict
);
create unique index team_jersey_one_open_per_person_season
 on tm_private.team_jerseys(team_id,person_id,season_ref) where returned_at is null;
create unique index team_jersey_one_open_number_per_team_season
 on tm_private.team_jerseys(team_id,season_ref,jersey_no) where returned_at is null;
create table tm_private.team_competitions (
  competition_id text primary key,
  team_id text not null references tm_private.teams(team_id) on delete restrict,
  name text not null check(length(name) between 1 and 120),
  format text not null check(format in ('league','tournament','carnival','friendly-series')),
  season_ref text not null check(season_ref ~ '^20[0-9]{2}$'),
  division text not null default '' check(length(division)<=100),
  organiser text not null default '' check(length(organiser)<=120),
  venue text not null default '' check(length(venue)<=120),
  begins_on date,
  ends_on date,
  entry_status text not null default 'planned'
    check(entry_status in ('planned','entered','withdrawn','completed')),
  official_verified boolean not null default false
    check(official_verified=false),
  version integer not null default 0 check(version>=0),
  created_by uuid not null references tm_private.accounts(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  check(begins_on is null or ends_on is null or begins_on<=ends_on)
);
create table tm_private.team_competition_fixtures (
  competition_id text not null references tm_private.team_competitions(competition_id) on delete restrict,
  team_id text not null references tm_private.teams(team_id) on delete restrict,
  session_id text not null,
  primary key(competition_id,session_id),
  foreign key(session_id,team_id) references tm_private.sessions(session_id,team_id) on delete restrict
);
create table tm_private.team_message_log (
  message_id text primary key,
  team_id text not null references tm_private.teams(team_id) on delete restrict,
  author_id uuid not null references tm_private.accounts(user_id) on delete restrict,
  audience text not null check(audience in ('players','volunteers','all')),
  channel text not null check(channel in ('whatsapp','share','copy')),
  content text not null check(length(content) between 1 and 1500),
  status text not null default 'prepared' check(status in ('prepared','sent','not-sent')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  version integer not null default 0
);
create index team_competitions_scope on tm_private.team_competitions(team_id,season_ref);
create index team_messages_scope on tm_private.team_message_log(team_id,created_at desc);
do $$
declare t text;
begin
 foreach t in array array['team_preferences','team_jerseys','team_competitions',
     'team_competition_fixtures','team_message_log'] loop
  execute format('alter table tm_private.%I enable row level security',t);
  execute format('alter table tm_private.%I force row level security',t);
  execute format('revoke all on tm_private.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update,delete on tm_private.%I to service_role',t);
 end loop;
end $$;

-- Actor is supplied by trusted Worker after GoTrue verification, never by the UI.
-- Founder Coach is an explicitly pinned, first-team exception, not an owner-to-team grant.
create function tm_private.stage3d5_staff(p_actor uuid,p_team text,p_role text)
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(
  select 1 from tm_private.accounts a join tm_private.teams t on t.team_id=p_team
  join tm_private.role_grants g on g.user_id=a.user_id and g.team_id=t.team_id
  where a.user_id=p_actor and a.status='active' and t.status='active'
    and g.role=p_role and g.role in ('team_coach','team_manager')
    and g.status='active' and g.policy_version=1
    and (g.valid_from is null or g.valid_from<=now())
    and (g.expires_at is null or now()<g.expires_at)
    and ((g.approved_by is not null and g.approved_by<>p_actor and g.approved_at is not null)
      or tm_private.stage3d4_founder_coach(p_actor,p_team,g.grant_id))
    and exists(select 1 from tm_private.registration_acceptances x
      join tm_private.registration_policy_versions p on p.policy_id=x.policy_id
      where x.user_id=p_actor and p.status='active'
        and x.terms_accepted and x.privacy_acknowledged)
 );
$$;
revoke all on function tm_private.stage3d5_staff(uuid,text,text) from public,anon,authenticated;
grant execute on function tm_private.stage3d5_staff(uuid,text,text) to service_role;

-- Coach can cover administrative duties until a verified Team Manager is appointed.
-- Coach is never granted a fake Team Manager role or any cross-team permission.
create function tm_private.stage3d5_team_admin(p_actor uuid,p_team text,p_role text)
returns boolean language sql stable security definer set search_path=''
as $$
 select tm_private.stage3d5_staff(p_actor,p_team,p_role) and
 (p_role='team_manager' or
  (p_role='team_coach' and not exists(
   select 1 from tm_private.role_grants g join tm_private.accounts a on a.user_id=g.user_id
   where g.team_id=p_team and g.role='team_manager' and g.status='active'
     and g.approved_by is not null and g.approved_at is not null
     and a.status='active' and (g.expires_at is null or now()<g.expires_at)
  )));
$$;
revoke all on function tm_private.stage3d5_team_admin(uuid,text,text) from public,anon,authenticated;
grant execute on function tm_private.stage3d5_team_admin(uuid,text,text) to service_role;

