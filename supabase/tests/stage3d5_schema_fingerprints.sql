-- Read-only metadata for comparing versioned source with owner-held preflight.
-- No account, person, token, team or message data is returned.
select current_setting('server_version') as postgres_version;
select n.nspname as schema,p.proname as name,
       pg_get_function_identity_arguments(p.oid) as args,
       md5(pg_get_functiondef(p.oid)) as definition_md5,
       p.prosecdef as security_definer,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
       has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','tm_private')
  and (p.proname in ('tm_stage1_operation','tm_stage3b_operation','tm_stage3d5_team',
       'tm_stage3d5_player_team','stage3d5_staff','stage3d5_team_admin'))
order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid);
