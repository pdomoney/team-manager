-- Isolated PostgreSQL CI bootstrap only. Do not apply to a Supabase project.
-- Recreates only the Supabase role/auth objects needed by versioned migrations.
do $$
begin
  if current_database()<>'postgres' or current_user<>'postgres' then
    raise exception 'not the expected disposable postgres database';
  end if;
  if exists(select 1 from pg_namespace where nspname='tm_private') then
    raise exception 'refusing to reuse an existing team schema';
  end if;
end
$$;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable
set search_path=''
as $$
  select nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
grant usage on schema auth to authenticated, service_role;
grant execute on function auth.uid() to authenticated, service_role;
