-- RUN ONLY against a disposable Supabase-compatible PostgreSQL database.
-- Never run these assertions on the live linked trial project as a substitute
-- for a separately authorised migration / real-server security qualification.
begin;

do $$
declare
  row record;
  table_count integer := 0;
begin
  if has_schema_privilege('anon', 'tm_private', 'USAGE')
     or has_schema_privilege('authenticated', 'tm_private', 'USAGE') then
    raise exception 'browser roles unexpectedly have tm_private schema access';
  end if;

  for row in
    select c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'tm_private' and c.relkind = 'r'
  loop
    table_count := table_count + 1;
    if not row.relrowsecurity or not row.relforcerowsecurity then
      raise exception 'RLS not enabled/forced for %', row.relname;
    end if;
    if has_table_privilege('anon', row.oid, 'SELECT')
       or has_table_privilege('anon', row.oid, 'INSERT')
       or has_table_privilege('anon', row.oid, 'UPDATE')
       or has_table_privilege('anon', row.oid, 'DELETE')
       or has_table_privilege('authenticated', row.oid, 'SELECT')
       or has_table_privilege('authenticated', row.oid, 'INSERT')
       or has_table_privilege('authenticated', row.oid, 'UPDATE')
       or has_table_privilege('authenticated', row.oid, 'DELETE') then
      raise exception 'browser role has direct table privilege on %', row.relname;
    end if;
  end loop;
  if table_count <> 13 then
    raise exception 'unexpected private table count: %', table_count;
  end if;

  if exists(select 1 from pg_policies where schemaname = 'tm_private') then
    raise exception 'unexpected browser-facing RLS policy in private schema';
  end if;
  if to_regclass('tm_private.mutation_receipts') is null
     or to_regclass('tm_private.audit_events') is null then
    raise exception 'idempotency/audit foundation absent';
  end if;
  raise notice 'PASS: private schema denies browser access, with RLS on all 13 tables';
end
$$;

rollback;
