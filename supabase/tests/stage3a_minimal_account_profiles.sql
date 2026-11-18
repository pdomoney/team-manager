-- Stage 3A minimal profile: disposable account-level behaviour only.
-- No actual personal data or live Supabase connection. Source SQL transaction rolls back.
begin;
insert into auth.users(id) values
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222'),
 ('33333333-3333-4333-8333-333333333333');
insert into tm_private.accounts(user_id,status) values
 ('11111111-1111-4111-8111-111111111111','active'),
 ('22222222-2222-4222-8222-222222222222','active'),
 ('33333333-3333-4333-8333-333333333333','disabled');
insert into tm_private.persons(person_id,lifecycle)
 values('invented-review-person','active');
insert into tm_private.account_person_links(user_id,person_id,status,verified_by,verified_at)
 values('11111111-1111-4111-8111-111111111111','invented-review-person',
 'verified','22222222-2222-4222-8222-222222222222',now());
do $$
declare r jsonb; count_after integer;
begin
  if has_table_privilege('authenticated','tm_private.account_profiles','SELECT')
    or has_table_privilege('authenticated','tm_private.account_profiles','UPDATE')
    or has_function_privilege('anon','public.tm_my_profile()','EXECUTE')
    or has_function_privilege('anon','public.tm_save_my_profile(text,integer)','EXECUTE')
    or not has_function_privilege('authenticated','public.tm_my_profile()','EXECUTE')
    or not has_function_privilege('authenticated','public.tm_save_my_profile(text,integer)','EXECUTE')
  then raise exception 'Stage3A profile privilege boundary failed'; end if;
  perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
  r:=public.tm_my_profile();
  if r->>'version'<>'0' or r->>'linkStatus'<>'verified'
    or r->>'accountStatus'<>'active' then
    raise exception 'verified self-profile state incorrect: %',r; end if;
  r:=public.tm_save_my_profile('  Fictional Coach  ',0);
  if r->>'ok'<>'true' or r->>'displayName'<>'Fictional Coach' or r->>'version'<>'1'
  then raise exception 'self-profile creation failed: %',r; end if;
  r:=public.tm_save_my_profile('Stale overwrite',0);
  if r->>'code'<>'stale-profile' then raise exception 'stale profile write accepted'; end if;
  r:=public.tm_save_my_profile('Updated Coach',1);
  if r->>'version'<>'2' then raise exception 'versioned profile update failed'; end if;
  r:=public.tm_save_my_profile('  ',2);
  if r->>'code'<>'invalid-profile' then raise exception 'blank name accepted'; end if;
  r:=public.tm_save_my_profile('Has' || chr(10) || 'newline',2);
  if r->>'code'<>'invalid-profile' then raise exception 'control characters accepted'; end if;
  perform set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
  r:=public.tm_my_profile();
  if r->>'version'<>'0' or r->>'displayName'<>''
    or r->>'linkStatus'<>'none'
  then raise exception 'foreign account read another profile: %',r; end if;
  r:=public.tm_save_my_profile('Fictional Manager',0);
  if r->>'ok'<>'true' then raise exception 'second account cannot edit own profile'; end if;
  perform set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
  r:=public.tm_my_profile();
  if r is not null then raise exception 'disabled account read profile'; end if;
  r:=public.tm_save_my_profile('Disabled',0);
  if r->>'code'<>'account-unavailable' then
    raise exception 'disabled account wrote profile'; end if;
  perform set_config('request.jwt.claim.sub','',true);
  r:=public.tm_save_my_profile('Anonymous',0);
  if r->>'code'<>'account-unavailable' then raise exception 'anonymous write permitted'; end if;
  select count(*) into count_after from tm_private.account_profiles;
  if count_after<>2 then raise exception 'unexpected profile number: %',count_after; end if;
  raise notice 'PASS: isolated self-profile read/write, verified link view, stale, deny, audit';
end;
$$;
rollback;
