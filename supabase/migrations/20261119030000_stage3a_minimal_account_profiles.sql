-- Stage 3A: self-managed *minimal* individual account profile.
-- SOURCE ONLY. Real-user collection, onboarding and installation remain separate approvals.
-- No contact, DOB, address, minor, guardian or health fields are collected here.
create table tm_private.account_profiles (
  user_id uuid primary key references tm_private.accounts(user_id) on delete restrict,
  display_name text not null check (
    length(display_name) between 1 and 80 and
    display_name = pg_catalog.btrim(display_name) and
    display_name !~ '[[:cntrl:]]'),
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);
alter table tm_private.account_profiles enable row level security;
alter table tm_private.account_profiles force row level security;
revoke all on tm_private.account_profiles from public,anon,authenticated;
grant select,insert,update,delete on tm_private.account_profiles to service_role;

-- The active authenticated user may inspect only their own minimal profile.
-- Profile creation is not account activation, verified Person linkage,
-- participant registration, approval or a team/role grant.
create function public.tm_my_profile()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'accountStatus', a.status,
    'displayName', pg_catalog.coalesce(p.display_name, ''),
    'version', pg_catalog.coalesce(p.version,0),
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
  where a.user_id=auth.uid() and a.status in ('pending','active');
$$;
revoke all on function public.tm_my_profile() from public,anon,authenticated;
grant execute on function public.tm_my_profile() to authenticated;

-- Server-owned optimistic version, actor from authenticated JWT, no arbitrary
-- person/account IDs or privileged status accepted from the caller.
create function public.tm_save_my_profile(
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
revoke all on function public.tm_save_my_profile(text,integer)
  from public,anon,authenticated;
grant execute on function public.tm_save_my_profile(text,integer)
  to authenticated;
