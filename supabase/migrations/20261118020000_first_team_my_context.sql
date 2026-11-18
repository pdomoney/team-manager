-- RC1 source-only read endpoint, building on private foundation 20261118010000.
-- NOT a release approval. Apply ONLY after isolated SQL/ACL/security rehearsal.
-- No direct grants on tm_private tables and no credentials in this migration.
--
-- The definer is the trusted migration owner (postgres in Supabase). This
-- function returns ONLY verified active account/team/role context. It must
-- remain in the reviewed migration, not be copied blindly to SQL Editor.
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
      g.role in ('team_coach','team_assistant','team_manager')
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

-- Explicitly remove default PUBLIC function execution. The only browser
-- surface is this narrow, read-only RPC for signed-in identities.
revoke all on function public.tm_my_team_context() from public, anon, authenticated;
grant execute on function public.tm_my_team_context() to authenticated;
