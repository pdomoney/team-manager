-- Stage 3D.3 Activation | disposable PostgreSQL direct REST RPC contract.
-- Must be run after the new gate migration; no persistent synthetic records.
begin;
do $$
declare coach uuid:='33333333-3333-4333-8333-333333333333';
begin
  if not has_function_privilege('authenticated','public.tm_my_team_context()','EXECUTE')
     or not has_function_privilege('authenticated','public.tm_my_operator_context()','EXECUTE')
     or not has_function_privilege('authenticated','public.tm_my_profile()','EXECUTE')
     or not has_function_privilege('authenticated','public.tm_save_my_profile(text,integer)','EXECUTE')
     or has_function_privilege('anon','public.tm_my_profile()','EXECUTE')
     or has_function_privilege('authenticated','tm_private.stage3d3_registration_ready()','EXECUTE')
     or has_schema_privilege('authenticated','tm_private','USAGE') then
    raise exception 'Direct RPC/helper privileges changed unexpectedly';
  end if;
  if (select count(*) from tm_private.registration_policy_versions)<>0 then
    raise exception 'Migration silently seeded policy';
  end if;
  if not exists(select 1 from tm_private.role_grants
    where user_id=coach and team_id='stgeorge-mixed20'
      and role='team_coach' and status='active') then
    raise exception 'First-team Coach fixture was lost';
  end if;
end
$$;

-- A valid login with an approved Coach and Platform Owner grant does not
-- bypass registration via the public Supabase REST RPCs.
select pg_catalog.set_config('request.jwt.claim.sub',
  '33333333-3333-4333-8333-333333333333',true);
set local role authenticated;
do $$
declare v jsonb; n integer;
begin
  select count(*) into n from public.tm_my_team_context();
  if n<>0 then raise exception 'Direct team RPC leaked unreviewed grant'; end if;
  v:=public.tm_my_operator_context();
  if v->>'isOwner'<>'false' then
    raise exception 'Direct owner RPC leaked unreviewed platform grant';
  end if;
  if public.tm_my_profile() is not null then
    raise exception 'Direct profile RPC leaked unreviewed account';
  end if;
  v:=public.tm_save_my_profile('Must not be saved',0);
  if v->>'code'<>'registration-required' then
    raise exception 'Direct profile write lacked registration gate: %',v;
  end if;
end
$$;
reset role;

-- A reviewed published policy and reviewed adult status alone cannot grant
-- operations until the CURRENT policy is individually acknowledged.
insert into tm_private.registration_policy_versions(
  policy_id,terms_version,terms_sha256,terms_url,
  privacy_version,privacy_sha256,privacy_url,status,
  reviewed_by,approved_at,approval_ref)
values('mixed20-policy-for-direct-rpc-test','terms-v1',repeat('a',64),
  'https://policies.example.test/terms-v1','privacy-v1',repeat('b',64),
  'https://policies.example.test/privacy-v1','active',
  '44444444-4444-4444-8444-444444444444',now(),
  'evidence-ref/synthetic-independent-policy-review');
insert into tm_private.registration_adult_reviews(
  user_id,reviewed_by,reviewed_at,evidence_ref,state)
values('33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',now(),
  'evidence-ref/synthetic-independent-adult-review','approved');

set local role authenticated;
do $$
declare v jsonb; n integer;
begin
  select count(*) into n from public.tm_my_team_context();
  if n<>0 or public.tm_my_profile() is not null then
    raise exception 'Reviewed adult without latest acceptance bypassed direct RPC';
  end if;
  v:=public.tm_save_my_profile('Not accepted yet',0);
  if v->>'code'<>'registration-required' then
    raise exception 'Direct profile update allowed before acceptance: %',v;
  end if;
end
$$;
reset role;

-- This synthetic acceptance is not a real document or personal record.
do $$
declare v jsonb;
begin
  v:=public.tm_stage3d3_registration(
    '33333333-3333-4333-8333-333333333333',
    'accept','mixed20-policy-for-direct-rpc-test',true,true,false);
  if v->>'code'<>'accepted' then raise exception 'Test acceptance failed'; end if;
end
$$;

set local role authenticated;
do $$
declare v jsonb; n integer;
begin
  select count(*) into n from public.tm_my_team_context();
  if n<>1 then raise exception 'Accepted Coach grant lost: %',n; end if;
  v:=public.tm_my_operator_context();
  if v->>'isOwner'<>'true' then
    raise exception 'Accepted platform owner lost distinct grant';
  end if;
  v:=public.tm_my_profile();
  if v->>'accountStatus'<>'active' then
    raise exception 'Accepted adult minimal account profile missing';
  end if;
  v:=public.tm_save_my_profile('Synthetic First Coach',0);
  if v->>'ok'<>'true' then
    raise exception 'Accepted adult direct profile write unexpectedly denied: %',v;
  end if;
end
$$;
reset role;

-- A replaced policy immediately invalidates existing acceptance and grants
-- at BOTH direct RPC and Worker paths.
update tm_private.registration_policy_versions
 set status='retired' where policy_id='mixed20-policy-for-direct-rpc-test';
insert into tm_private.registration_policy_versions(
  policy_id,terms_version,terms_sha256,terms_url,
  privacy_version,privacy_sha256,privacy_url,status,
  reviewed_by,approved_at,approval_ref)
values('mixed20-policy-for-direct-rpc-v2','terms-v2',repeat('c',64),
  'https://policies.example.test/terms-v2','privacy-v2',repeat('d',64),
  'https://policies.example.test/privacy-v2','active',
  '44444444-4444-4444-8444-444444444444',now(),
  'evidence-ref/synthetic-independent-new-policy');
set local role authenticated;
do $$
declare v jsonb; n integer;
begin
  select count(*) into n from public.tm_my_team_context();
  if n<>0 or public.tm_my_profile() is not null then
    raise exception 'Old policy receipt bypassed a new version';
  end if;
  v:=public.tm_save_my_profile('Must not overwrite',1);
  if v->>'code'<>'registration-required' then
    raise exception 'Old policy overwrote stored profile: %',v;
  end if;
end
$$;
reset role;

-- Review revocation denies access even after acceptance of the new version.
do $$
declare v jsonb;
begin
  v:=public.tm_stage3d3_registration(
    '33333333-3333-4333-8333-333333333333',
    'accept','mixed20-policy-for-direct-rpc-v2',true,true,false);
  if v->>'code'<>'accepted' then raise exception 'New policy acceptance failed'; end if;
end
$$;
update tm_private.registration_adult_reviews set state='revoked'
 where user_id='33333333-3333-4333-8333-333333333333';
set local role authenticated;
do $$
declare n integer; v jsonb;
begin
  select count(*) into n from public.tm_my_team_context();
  if n<>0 or public.tm_my_profile() is not null then
    raise exception 'Revoked adult review still permitted direct RPC';
  end if;
  v:=public.tm_save_my_profile('Must not modify after revocation',1);
  if v->>'code'<>'registration-required' then
    raise exception 'Revoked adult still updated profile: %',v;
  end if;
end
$$;
reset role;

do $$
declare n integer; saved text;
begin
  select count(*) into n from tm_private.account_profiles
    where user_id='33333333-3333-4333-8333-333333333333';
  select display_name into saved from tm_private.account_profiles
    where user_id='33333333-3333-4333-8333-333333333333';
  if n<>1 or saved<>'Synthetic First Coach' then
    raise exception 'Denied requests changed profile or erased existing data';
  end if;
  if (select count(*) from tm_private.participations)<>0 then
    raise exception 'Synthetic activation accidentally imported player data';
  end if;
  raise notice 'PASS: direct authenticated team, owner, profile read/write obey registration; policy rotation and adult revocation are immediate';
end
$$;
rollback;
