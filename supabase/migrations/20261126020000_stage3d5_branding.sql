-- PR295: restore original club logo/palette inheritance without automatic grants.
begin;
create function tm_private.valid_brand_style(s jsonb)
returns boolean language sql immutable set search_path='' as $$
 select case when s is null or s='null'::jsonb then true
 when jsonb_typeof(s)<>'object' then false
 when s ? 'palette' then (s-'palette')='{}'::jsonb and jsonb_typeof(s->'palette')='string'
   and s->>'palette' in ('pitch','redwhite','maroon','skynavy','blackwhite','greengold','purple','bluegold','redblack','navyred','lime','teal','orange','claret','brown','ocean','blackgold','bluewhite','greenwhite','navywhite','redgold','purplewhite','redbluewhite','royalskyred')
 when s ? 'custom' then (s-'custom')='{}'::jsonb and jsonb_typeof(s->'custom')='object'
   and ((s->'custom')-'dark'-'action'-'accent')='{}'::jsonb
   and coalesce(s->'custom'->>'dark','') ~ '^#[0-9A-Fa-f]{6}$'
   and coalesce(s->'custom'->>'action','') ~ '^#[0-9A-Fa-f]{6}$'
   and coalesce(s->'custom'->>'accent','') ~ '^#[0-9A-Fa-f]{6}$'
 else false end
$$;
revoke all on function tm_private.valid_brand_style(jsonb) from public,anon,authenticated;
grant execute on function tm_private.valid_brand_style(jsonb) to service_role;
create table tm_private.club_branding (
 club_ref text primary key,
 style jsonb check(tm_private.valid_brand_style(style)),
 logo text not null default '' check(length(logo)<=48000 and (logo='' or logo ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$')),
 version integer not null check(version>0),
 changed_by uuid not null references tm_private.accounts(user_id) on delete restrict,
 changed_at timestamptz not null default now()
);
create table tm_private.team_branding (
 team_id text primary key references tm_private.teams(team_id) on delete restrict,
 style jsonb check(tm_private.valid_brand_style(style)),
 version integer not null check(version>0),
 changed_by uuid not null references tm_private.accounts(user_id) on delete restrict,
 changed_at timestamptz not null default now()
);
-- Branding-only delegation; not a general Club Admin role or team grant.
create table tm_private.club_branding_grants (
 club_ref text not null,
 user_id uuid not null references tm_private.accounts(user_id) on delete restrict,
 active boolean not null,
 approved_by uuid not null references tm_private.accounts(user_id) on delete restrict,
 changed_at timestamptz not null default now(),
 primary key(club_ref,user_id)
);
do $$
declare t text;
begin
 foreach t in array array['club_branding','team_branding','club_branding_grants'] loop
  execute format('alter table tm_private.%I enable row level security',t);
  execute format('alter table tm_private.%I force row level security',t);
  execute format('revoke all on tm_private.%I from public,anon,authenticated,service_role',t);
 end loop;
end;
$$;

-- Explicit, revocable founder-attested first-club branding permission.
-- No automatic permission on migration, sign-in or team selection.
create function public.tm_stage3d5_branding_owner(p_actor uuid,p_action text,p_input jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare f tm_private.founder_bootstrap%rowtype; v_club text; v_active boolean;
begin
 if p_actor is null or p_input is distinct from '{}'::jsonb
 or p_action is null or p_action not in ('branding.status','branding.authorise','branding.revoke')
 or not tm_private.stage3d4_owner_policy_ready(p_actor)
 then return jsonb_build_object('ok',false,'code','scope-denied');end if;
 select * into f from tm_private.founder_bootstrap where id=1 and user_id=p_actor for update;
 if not found or f.first_team_id is null then return jsonb_build_object('ok',false,'code','scope-denied');end if;
 select club_ref into v_club from tm_private.teams where team_id=f.first_team_id and status='active';
 if not found then return jsonb_build_object('ok',false,'code','scope-denied');end if;
 perform pg_advisory_xact_lock(hashtextextended(v_club,0));
 if p_action<>'branding.status' then
  if p_action='branding.authorise' and not tm_private.stage3d5_staff(p_actor,f.first_team_id,'team_coach')
   then return jsonb_build_object('ok',false,'code','scope-denied');end if;
  insert into tm_private.club_branding_grants(club_ref,user_id,active,approved_by)
   values(v_club,p_actor,p_action='branding.authorise',p_actor)
   on conflict(club_ref,user_id) do update set active=excluded.active,
    approved_by=excluded.approved_by,changed_at=now();
  insert into tm_private.audit_events(user_id,team_id,action,resource_id,decision,reason_code)
   values(p_actor,f.first_team_id,'platform.'||p_action,v_club,'ALLOW','explicit-first-club-branding-only');
 end if;
 select active into v_active from tm_private.club_branding_grants where club_ref=v_club and user_id=p_actor;
 return jsonb_build_object('ok',true,'code','ready','clubRef',v_club,'brandingAuthorised',coalesce(v_active,false));
end;
$$;
revoke all on function public.tm_stage3d5_branding_owner(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.tm_stage3d5_branding_owner(uuid,text,jsonb) to service_role;

create function public.tm_stage3d5_branding(p_actor uuid,p_team text,p_role text,p_action text,p_input jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
 v_club text; v_club_row tm_private.club_branding%rowtype;
 v_team_row tm_private.team_branding%rowtype;
 v_club_edit boolean; v_team_edit boolean; v_read jsonb; v_expected integer;
 v_style jsonb; v_logo text; v_version integer;
begin
 if p_actor is null or p_team is null or p_role is null or p_action is null
 or p_input is null or jsonb_typeof(p_input)<>'object' or length(p_input::text)>50000
 or p_action not in ('branding.read','branding.team.save','branding.club.save')
 or p_role not in ('team_coach','team_manager','team_assistant','team_player','team_volunteer')
 then return jsonb_build_object('ok',false,'code','invalid-request');end if;
 -- Reuse the existing exact-team read gate; no notice content is returned.
 v_read:=public.tm_stage3b_operation(p_actor,p_team,p_role,'notices.read',p_team,'{}'::jsonb,null);
 if v_read->>'ok' is distinct from 'true' then return jsonb_build_object('ok',false,'code','scope-denied');end if;
 select club_ref into v_club from tm_private.teams where team_id=p_team and status='active';
 if not found then return jsonb_build_object('ok',false,'code','scope-denied');end if;
 perform pg_advisory_xact_lock(hashtextextended(v_club,0));
 v_team_edit:=p_role in ('team_coach','team_manager') and tm_private.stage3d5_staff(p_actor,p_team,p_role);
 v_club_edit:=v_team_edit and exists(select 1 from tm_private.club_branding_grants g
  where g.club_ref=v_club and g.user_id=p_actor and g.active);
 select * into v_club_row from tm_private.club_branding where club_ref=v_club;
 select * into v_team_row from tm_private.team_branding where team_id=p_team;
 if p_action='branding.read' then
  if p_input<>'{}'::jsonb then return jsonb_build_object('ok',false,'code','invalid-request');end if;
  return jsonb_build_object('ok',true,'code','permitted','data',jsonb_build_object(
   'clubRef',v_club,'clubStyle',v_club_row.style,'teamStyle',v_team_row.style,
   'logo',coalesce(v_club_row.logo,''),'clubVersion',coalesce(v_club_row.version,0),
   'teamVersion',coalesce(v_team_row.version,0),'canEditClub',v_club_edit,'canEditTeam',v_team_edit));
 end if;
 if not v_team_edit or (p_action='branding.club.save' and not v_club_edit)
 then return jsonb_build_object('ok',false,'code','role-denied');end if;
 if not (p_input ? 'style') or not tm_private.valid_brand_style(p_input->'style')
 or coalesce(p_input->>'expectedVersion','') !~ '^(0|[1-9][0-9]{0,8})$'
 then return jsonb_build_object('ok',false,'code','invalid-request');end if;
 v_style:=nullif(p_input->'style','null'::jsonb);
 v_expected:=(p_input->>'expectedVersion')::integer;
 if p_action='branding.team.save' then
  if (p_input-'style'-'expectedVersion')<>'{}'::jsonb then return jsonb_build_object('ok',false,'code','invalid-request');end if;
  if v_expected<>coalesce(v_team_row.version,0) then return jsonb_build_object('ok',false,'code','stale-version');end if;
  v_version:=v_expected+1;
  insert into tm_private.team_branding(team_id,style,version,changed_by) values(p_team,v_style,v_version,p_actor)
   on conflict(team_id) do update set style=excluded.style,version=excluded.version,changed_by=p_actor,changed_at=now();
 else
  if (p_input-'style'-'expectedVersion'-'logo'-'resetOverrides')<>'{}'::jsonb
   or jsonb_typeof(p_input->'logo') is distinct from 'string'
   or jsonb_typeof(p_input->'resetOverrides') is distinct from 'boolean'
   then return jsonb_build_object('ok',false,'code','invalid-request');end if;
  v_logo:=p_input->>'logo';
  if length(v_logo)>48000 or (v_logo<>'' and v_logo !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$')
   then return jsonb_build_object('ok',false,'code','invalid-request');end if;
  if v_expected<>coalesce(v_club_row.version,0) then return jsonb_build_object('ok',false,'code','stale-version');end if;
  v_version:=v_expected+1;
  insert into tm_private.club_branding(club_ref,style,logo,version,changed_by)
   values(v_club,v_style,v_logo,v_version,p_actor)
   on conflict(club_ref) do update set style=excluded.style,logo=excluded.logo,version=excluded.version,
    changed_by=p_actor,changed_at=now();
  if (p_input->>'resetOverrides')::boolean then
   update tm_private.team_branding b set style=null,version=b.version+1,changed_by=p_actor,changed_at=now()
    from tm_private.teams t where t.team_id=b.team_id and t.club_ref=v_club and b.style is not null;
  end if;
 end if;
 insert into tm_private.audit_events(user_id,team_id,action,resource_id,decision,reason_code)
   values(p_actor,p_team,'stage3d5.'||p_action,case when p_action='branding.club.save' then v_club else p_team end,
    'ALLOW','scoped-branding-update');
 return jsonb_build_object('ok',true,'code','committed','data',jsonb_build_object('version',v_version));
end;
$$;
revoke all on function public.tm_stage3d5_branding(uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.tm_stage3d5_branding(uuid,text,text,text,jsonb) to service_role;
commit;
