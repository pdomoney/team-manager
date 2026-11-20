-- Stage 3D.3 Activation | existing direct Supabase authenticated RPCs.
-- Apply AFTER 20261120010000_stage3d3_registration_policy.sql.
-- Live migration is NOT authorised by source merge. All accepted old V1 data,
-- signed-in role grants and E5 encrypted demo objects are left unchanged.
--
-- The original Worker already checks registration on management paths, but
-- the public authenticated RPCs below can also be called directly at the
-- Supabase REST API. The check MUST execute in the database for those paths.
--
-- Unapproved or missing policy, absent adult review, revoked/inactive adult,
-- missing latest acceptance, or inactive account => never return context or
-- profile, and never write an account profile through the direct endpoint.
create function tm_private.stage3d3_registration_ready()
returns boolean language sql stable security definer set search_path=''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from tm_private.accounts a
      join tm_private.registration_adult_reviews r
        on r.user_id=a.user_id and r.state='approved'
       and r.reviewed_by<>a.user_id and r.reviewed_at is not null
      join tm_private.accounts reviewer
        on reviewer.user_id=r.reviewed_by and reviewer.status='active'
      where a.user_id=auth.uid() and a.status='active'
    )
    and exists (
      select 1
      from tm_private.registration_policy_versions p
      join tm_private.registration_acceptances x on x.policy_id=p.policy_id
      where p.status='active' and x.user_id=auth.uid()
        and x.terms_accepted=true and x.privacy_acknowledged=true
    );
$$;
-- No authenticated client can call this private helper directly.
revoke all on function tm_private.stage3d3_registration_ready()
  from public,anon,authenticated;
grant execute on function tm_private.stage3d3_registration_ready()
  to service_role;

-- Reuse accepted grant, expiry, scope and Person linkage logic verbatim,
-- adding the independent registration check before any details are returned.
create or replace function public.tm_my_operator_context()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select pg_catalog.jsonb_build_object('isOwner',exists(
    select 1 from tm_private.platform_operator_grants g
      join tm_private.accounts a on a.user_id=g.user_id
    where auth.uid() is not null and tm_private.stage3d3_registration_ready()
      and g.user_id=auth.uid()
      and a.status='active' and g.status='active'
      and g.approved_by is not null and g.approved_by<>g.user_id
      and g.approved_at is not null
      and (g.expires_at is null or now()<g.expires_at)
  ));
$$;

create or replace function public.tm_my_team_context()
returns table (
  team_id text, club_ref text, sport_ref text,
  season_ref text, team_role text
)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct t.team_id, t.club_ref, t.sport_ref, t.season_ref, g.role
  from tm_private.role_grants g
  join tm_private.accounts a on a.user_id = g.user_id
  join tm_private.teams t on t.team_id = g.team_id
  where auth.uid() is not null
    and tm_private.stage3d3_registration_ready()
    and g.user_id = auth.uid()
    and a.status = 'active'
    and t.status = 'active'
    and g.status = 'active'
    and g.policy_version = 1
    and g.approved_by is not null
    and g.approved_by <> g.user_id
    and g.approved_at is not null
    and (g.valid_from is null or g.valid_from <= pg_catalog.now())
    and (g.expires_at is null or pg_catalog.now() < g.expires_at)
    and (
      g.role in ('team_coach','team_assistant','team_manager','team_play_viewer')
      or exists (
        select 1
        from tm_private.account_person_links l
        join tm_private.persons p on p.person_id = l.person_id
        where l.user_id = g.user_id and l.status = 'verified'
          and l.verified_by is not null and l.verified_at is not null
          and p.lifecycle = 'active'
          and (
            g.role <> 'team_player'
            or exists (
              select 1 from tm_private.participations part
              where part.person_id = l.person_id and part.team_id = g.team_id
                and part.status = 'active'
                and part.verified_by is not null and part.verified_at is not null
            )
          )
      )
    );
$$;

create or replace function public.tm_my_profile()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'accountStatus', a.status,
    'displayName', coalesce(p.display_name, ''),
    'version', coalesce(p.version,0),
    'linkStatus', case
      when exists (
        select 1 from tm_private.account_person_links l
        join tm_private.persons person on person.person_id=l.person_id
        where l.user_id=a.user_id and l.status='verified'
          and l.verified_by is not null and l.verified_by<>l.user_id
          and l.verified_at is not null and person.lifecycle='active'
      ) then 'verified'
      when exists (
        select 1 from tm_private.account_person_links l
        where l.user_id=a.user_id and l.status='pending'
      ) then 'pending'
      else 'none' end
  )
  from tm_private.accounts a
  left join tm_private.account_profiles p on p.user_id=a.user_id
  where a.user_id=auth.uid() and a.status in ('pending','active')
    and tm_private.stage3d3_registration_ready();
$$;

create or replace function public.tm_save_my_profile(
  p_display_name text, p_expected_version integer)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  clean_name text;
  new_version integer;
begin
  if actor is null or not exists (
    select 1 from tm_private.accounts a
    where a.user_id=actor and a.status in ('pending','active')
  ) then
    return pg_catalog.jsonb_build_object('ok',false,'code','account-unavailable');
  end if;
  if not tm_private.stage3d3_registration_ready() then
    return pg_catalog.jsonb_build_object('ok',false,'code','registration-required');
  end if;
  if p_expected_version is null or p_expected_version < 0 or
     p_display_name is null then
    return pg_catalog.jsonb_build_object('ok',false,'code','invalid-profile');
  end if;
  clean_name:=pg_catalog.btrim(p_display_name);
  if length(clean_name) < 1 or length(clean_name) > 80 or
     clean_name ~ '[[:cntrl:]]' then
    return pg_catalog.jsonb_build_object('ok',false,'code','invalid-profile');
  end if;
  -- An absent profile has version 0. A caller cannot insert with version N>0.
  if p_expected_version <> 0 and not exists (
      select 1 from tm_private.account_profiles p where p.user_id=actor) then
    return pg_catalog.jsonb_build_object('ok',false,'code','stale-profile');
  end if;
  insert into tm_private.account_profiles(user_id,display_name,version)
    values(actor,clean_name,1)
    on conflict(user_id) do update
      set display_name=excluded.display_name,
          version=tm_private.account_profiles.version+1,
          updated_at=pg_catalog.now()
      where tm_private.account_profiles.version=p_expected_version
    returning version into new_version;
  if new_version is null then
    return pg_catalog.jsonb_build_object('ok',false,'code','stale-profile');
  end if;
  insert into tm_private.audit_events(
    user_id,action,decision,reason_code
  ) values(actor,'account.profile.update','ALLOW','self-profile-updated');
  return pg_catalog.jsonb_build_object(
    'ok',true,'version',new_version,'displayName',clean_name);
end;
$$;

-- Keep the original narrowly scoped authenticated RPC execution grants.
-- No new REST schema, table grant or open registration method is introduced.
revoke all on function public.tm_my_operator_context() from public,anon,authenticated;
revoke all on function public.tm_my_team_context() from public,anon,authenticated;
revoke all on function public.tm_my_profile() from public,anon,authenticated;
revoke all on function public.tm_save_my_profile(text,integer) from public,anon,authenticated;
grant execute on function public.tm_my_operator_context() to authenticated;
grant execute on function public.tm_my_team_context() to authenticated;
grant execute on function public.tm_my_profile() to authenticated;
grant execute on function public.tm_save_my_profile(text,integer) to authenticated;
