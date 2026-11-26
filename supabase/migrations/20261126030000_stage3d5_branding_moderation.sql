-- Additive release: preserve all existing club/team branding rows.
begin;
create table tm_private.club_branding_moderation (
 club_ref text primary key,
 locked boolean not null,
 reason text not null check(reason in ('inappropriate-image','incorrect-branding','policy-review','owner-correction','resolved')),
 changed_by uuid not null references tm_private.accounts(user_id) on delete restrict,
 changed_at timestamptz not null default now()
);
alter table tm_private.club_branding_moderation enable row level security;
alter table tm_private.club_branding_moderation force row level security;
revoke all on tm_private.club_branding_moderation from public,anon,authenticated,service_role;

create or replace function public.tm_stage3d5_branding(p_actor uuid,p_team text,p_role text,p_action text,p_input jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
 v_club text; v_club_row tm_private.club_branding%rowtype;
 v_team_row tm_private.team_branding%rowtype;
 v_club_edit boolean; v_team_edit boolean; v_locked boolean; v_read jsonb; v_expected integer;
 v_style jsonb; v_logo text; v_version integer;
begin
 if p_actor is null or p_team is null or p_role is null or p_action is null
 or p_input is null or jsonb_typeof(p_input)<>'object' or length(p_input::text)>50000
 or p_action not in ('branding.read','branding.team.save','branding.club.save')
 or p_role not in ('team_coach','team_manager','team_assistant','team_player','team_volunteer','team_play_viewer')
 then return jsonb_build_object('ok',false,'code','invalid-request');end if;
 -- Reuse the existing exact-team read gate; no notice content is returned.
 if p_role='team_play_viewer' then
  if p_action<>'branding.read' then return jsonb_build_object('ok',false,'code','role-denied');end if;
  if not exists(select 1 from tm_private.role_grants g join tm_private.accounts a on a.user_id=g.user_id
   where g.user_id=p_actor and g.team_id=p_team and g.role=p_role and g.status='active' and a.status='active'
   and g.policy_version=1 and g.approved_by is not null and g.approved_by<>p_actor and g.approved_at is not null
   and (g.valid_from is null or g.valid_from<=now()) and (g.expires_at is null or now()<g.expires_at))
  then return jsonb_build_object('ok',false,'code','scope-denied');end if;
 else
  v_read:=public.tm_stage3b_operation(p_actor,p_team,p_role,'notices.read',p_team,'{}'::jsonb,null);
  if v_read->>'ok' is distinct from 'true' then return jsonb_build_object('ok',false,'code','scope-denied');end if;
 end if;
 select club_ref into v_club from tm_private.teams where team_id=p_team and status='active';
 if not found then return jsonb_build_object('ok',false,'code','scope-denied');end if;
 perform pg_advisory_xact_lock(hashtextextended(v_club,0));
 v_locked:=coalesce((select locked from tm_private.club_branding_moderation where club_ref=v_club),false);
 v_team_edit:=not v_locked and p_role in ('team_coach','team_manager') and tm_private.stage3d5_staff(p_actor,p_team,p_role);
 v_club_edit:=v_team_edit and exists(select 1 from tm_private.club_branding_grants g
  where g.club_ref=v_club and g.user_id=p_actor and g.active);
 select * into v_club_row from tm_private.club_branding where club_ref=v_club;
 select * into v_team_row from tm_private.team_branding where team_id=p_team;
 if p_action='branding.read' then
  if p_input<>'{}'::jsonb then return jsonb_build_object('ok',false,'code','invalid-request');end if;
  return jsonb_build_object('ok',true,'code','permitted','data',jsonb_build_object(
   'clubRef',v_club,'clubStyle',v_club_row.style,'teamStyle',v_team_row.style,
   'logo',coalesce(v_club_row.logo,''),'clubVersion',coalesce(v_club_row.version,0),
   'teamVersion',coalesce(v_team_row.version,0),'canEditClub',v_club_edit,'canEditTeam',v_team_edit,'locked',v_locked));
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

-- The existing founder-owner authority is required; no team role grants moderation.
create function public.tm_stage3d5_branding_moderation(p_actor uuid,p_action text,p_input jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
 c text; row_brand tm_private.club_branding%rowtype; lock_state boolean; expected integer;
 logo_value text; style_value jsonb; reason_value text; events jsonb; catalogue jsonb;
begin
 if p_actor is null or p_action is null or p_input is null or jsonb_typeof(p_input)<>'object'
 or length(p_input::text)>51000 or not tm_private.stage3d4_owner_policy_ready(p_actor)
 or not exists(select 1 from tm_private.accounts where user_id=p_actor and status='active')
 then return jsonb_build_object('ok',false,'code','scope-denied');end if;
 if p_action='branding.catalogue' then
  if p_input<>'{}'::jsonb then return jsonb_build_object('ok',false,'code','invalid-request');end if;
  select coalesce(jsonb_agg(jsonb_build_object('clubRef',clubs.club_ref,'style',b.style,
   'logo',coalesce(b.logo,''),'version',coalesce(b.version,0),'locked',coalesce(m.locked,false)) order by clubs.club_ref),'[]'::jsonb)
   into catalogue from (select distinct club_ref from tm_private.teams where status='active' order by club_ref limit 101) clubs
   left join tm_private.club_branding b using(club_ref) left join tm_private.club_branding_moderation m using(club_ref);
  if jsonb_array_length(catalogue)>100 then return jsonb_build_object('ok',false,'code','scope-denied');end if;
  return jsonb_build_object('ok',true,'code','ready','clubs',catalogue);
 end if;
 c:=p_input->>'clubRef';
 if c is null or length(c)>120 or not exists(select 1 from tm_private.teams where club_ref=c and status='active')
 then return jsonb_build_object('ok',false,'code','scope-denied');end if;
 if p_action='branding.history' then
  if (p_input-'clubRef')<>'{}'::jsonb then return jsonb_build_object('ok',false,'code','invalid-request');end if;
  select coalesce(jsonb_agg(jsonb_build_object('at',a.at,'actor',a.user_id,'action',a.action,'reason',a.reason_code) order by a.event_id desc),'[]'::jsonb)
  into events from (select e.event_id,e.at,e.user_id,e.action,e.reason_code from tm_private.audit_events e
   where ((e.action in ('stage3d5.branding.club.save','platform.branding.authorise','platform.branding.revoke') or e.action like 'platform.branding.moderation.%') and e.resource_id=c)
    or (e.action='stage3d5.branding.team.save' and exists(select 1 from tm_private.teams t where t.team_id=e.team_id and t.team_id=e.resource_id and t.club_ref=c))
   order by e.event_id desc limit 100) a;
  return jsonb_build_object('ok',true,'code','ready','events',events);
 end if;
 if p_action not in ('branding.moderation.save','branding.moderation.remove','branding.moderation.lock','branding.moderation.unlock','branding.moderation.revoke')
  or coalesce(p_input->>'expectedVersion','') !~ '^(0|[1-9][0-9]{0,8})$'
  or coalesce(p_input->>'reason','') not in ('inappropriate-image','incorrect-branding','policy-review','owner-correction','resolved')
 then return jsonb_build_object('ok',false,'code','invalid-request');end if;
 if p_action='branding.moderation.save' then
  if (p_input-'clubRef'-'expectedVersion'-'reason'-'style'-'logo'-'resetOverrides')<>'{}'::jsonb
  or not (p_input ? 'style') or not tm_private.valid_brand_style(p_input->'style')
  or jsonb_typeof(p_input->'logo') is distinct from 'string'
  or jsonb_typeof(p_input->'resetOverrides') is distinct from 'boolean'
  then return jsonb_build_object('ok',false,'code','invalid-request');end if;
  logo_value:=p_input->>'logo';style_value:=nullif(p_input->'style','null'::jsonb);
  if length(logo_value)>48000 or (logo_value<>'' and logo_value !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$')
  then return jsonb_build_object('ok',false,'code','invalid-request');end if;
 elsif (p_input-'clubRef'-'expectedVersion'-'reason')<>'{}'::jsonb
 then return jsonb_build_object('ok',false,'code','invalid-request');end if;
 perform pg_advisory_xact_lock(hashtextextended(c,0));
 select * into row_brand from tm_private.club_branding where club_ref=c;
 expected:=(p_input->>'expectedVersion')::integer;
 if expected<>coalesce(row_brand.version,0) then return jsonb_build_object('ok',false,'code','stale-version');end if;
 reason_value:=p_input->>'reason';
 lock_state:=coalesce((select locked from tm_private.club_branding_moderation where club_ref=c),false);
 if p_action<>'branding.moderation.save' then
  style_value:=row_brand.style;logo_value:=coalesce(row_brand.logo,'');
 end if;
 if p_action='branding.moderation.remove' then logo_value:='';lock_state:=true;end if;
 if p_action='branding.moderation.lock' then lock_state:=true;end if;
 if p_action='branding.moderation.unlock' then lock_state:=false;end if;
 if p_action='branding.moderation.revoke' then
  update tm_private.club_branding_grants set active=false,approved_by=p_actor,changed_at=now() where club_ref=c and active;
 end if;
 insert into tm_private.club_branding(club_ref,style,logo,version,changed_by)
 values(c,style_value,logo_value,expected+1,p_actor)
 on conflict(club_ref) do update set style=excluded.style,logo=excluded.logo,version=excluded.version,changed_by=p_actor,changed_at=now();
 if p_action='branding.moderation.save' and (p_input->>'resetOverrides')::boolean then
  update tm_private.team_branding b set style=null,version=b.version+1,changed_by=p_actor,changed_at=now()
   from tm_private.teams t where t.team_id=b.team_id and t.club_ref=c and b.style is not null;
 end if;
 insert into tm_private.club_branding_moderation(club_ref,locked,reason,changed_by)
 values(c,lock_state,reason_value,p_actor) on conflict(club_ref) do update
 set locked=excluded.locked,reason=excluded.reason,changed_by=p_actor,changed_at=now();
 insert into tm_private.audit_events(user_id,team_id,action,resource_id,decision,reason_code)
 values(p_actor,null,'platform.'||p_action,c,'ALLOW',reason_value);
 return jsonb_build_object('ok',true,'code','ready');
end;
$$;
revoke all on function public.tm_stage3d5_branding_moderation(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.tm_stage3d5_branding_moderation(uuid,text,jsonb) to service_role;
commit;
