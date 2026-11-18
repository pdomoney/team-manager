-- Stage 2A: one individually verified account may hold independently approved
-- Platform Owner and exact-team Coach grants. SOURCE ONLY, not installed.
-- A platform grant confers NO private-team read/write access.
create table tm_private.platform_operator_grants (
  user_id uuid primary key references tm_private.accounts(user_id) on delete restrict,
  status text not null default 'proposed'
    check (status in ('proposed','active','revoked')),
  approved_by uuid references tm_private.accounts(user_id) on delete restrict,
  approved_at timestamptz,
  expires_at timestamptz,
  constraint operator_grant_not_self_approved
    check (approved_by is null or approved_by<>user_id),
  constraint operator_grant_approval_required
    check (status<>'active' or (approved_by is not null and approved_at is not null))
);
revoke all on tm_private.platform_operator_grants from public,anon,authenticated;
grant select,insert,update,delete on tm_private.platform_operator_grants to service_role;
alter table tm_private.platform_operator_grants enable row level security;
alter table tm_private.platform_operator_grants force row level security;

-- Only returns a boolean. No global/team data, account listing, support powers
-- or automatic owner creation. Manual reviewed bootstrap is a separate release gate.
create function public.tm_my_operator_context()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select pg_catalog.jsonb_build_object('isOwner',exists(
    select 1 from tm_private.platform_operator_grants g
      join tm_private.accounts a on a.user_id=g.user_id
    where auth.uid() is not null and g.user_id=auth.uid()
      and a.status='active' and g.status='active'
      and g.approved_by is not null and g.approved_by<>g.user_id
      and g.approved_at is not null
      and (g.expires_at is null or now()<g.expires_at)
  ));
$$;
revoke all on function public.tm_my_operator_context() from public,anon,authenticated;
grant execute on function public.tm_my_operator_context() to authenticated;
