-- Execute only against a disposable Supabase-compatible PostgreSQL DB
-- AFTER both versioned migrations are applied. Not a production preflight.
begin;
do $$
begin
  if not pg_catalog.has_function_privilege('authenticated',
      'public.tm_my_team_context()', 'EXECUTE') then
    raise exception 'authenticated missing narrow RPC execute';
  end if;
  if pg_catalog.has_function_privilege('anon',
      'public.tm_my_team_context()', 'EXECUTE') then
    raise exception 'anon unexpectedly has RPC execute';
  end if;
  if pg_catalog.has_schema_privilege('authenticated', 'tm_private', 'USAGE') then
    raise exception 'private schema has direct browser access';
  end if;
  if exists(select 1 from pg_catalog.pg_policies where schemaname='tm_private') then
    raise exception 'private RLS policies were widened';
  end if;
end
$$;
rollback;
