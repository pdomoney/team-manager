-- Stage 3D.3 disposable migration qualification, SYNTHETIC adults only.
-- Executed after the existing Stage 3D first-team disposable bootstrap.
begin;
do $$
declare result jsonb;
  coach uuid:='33333333-3333-4333-8333-333333333333';
  reviewer uuid:='44444444-4444-4444-8444-444444444444';
begin
  if (select count(*) from tm_private.registration_policy_versions)<>0 or
     (select count(*) from tm_private.registration_acceptances)<>0 or
     (select count(*) from tm_private.registration_adult_reviews)<>0 then
    raise exception 'Migration invented real policy, age verification or consent';
  end if;
  if has_table_privilege('authenticated','tm_private.registration_acceptances','SELECT')
     or has_table_privilege('anon','tm_private.registration_policy_versions','SELECT')
     or has_function_privilege('authenticated',
       'public.tm_stage3d3_registration(uuid,text,text,boolean,boolean,boolean)','EXECUTE')
     or not has_function_privilege('service_role',
       'public.tm_stage3d3_registration(uuid,text,text,boolean,boolean,boolean)','EXECUTE')
  then raise exception 'Registration privilege boundary opened'; end if;

  result:=public.tm_stage3d3_registration(coach,'status',null,false,false,false);
  if result->>'code'<>'policy-unavailable' then
    raise exception 'Policy must be blocked before human approval: %',result;
  end if;
  begin
    insert into tm_private.registration_adult_reviews
      (user_id,reviewed_by,reviewed_at,evidence_ref,state)
      values(coach,coach,now(),'evidence-ref/synthetic-invalid-self-review','approved');
    raise exception 'Self-reviewed adult account incorrectly accepted';
  exception when check_violation then null;
  end;

  insert into tm_private.registration_policy_versions(
    policy_id,terms_version,terms_sha256,terms_url,
    privacy_version,privacy_sha256,privacy_url,status,reviewed_by,approved_at,approval_ref)
  values('mixed20-policy-v1','terms-v1',repeat('a',64),
    'https://policies.example.test/terms-v1',
    'privacy-v1',repeat('b',64),'https://policies.example.test/privacy-v1',
    'active',reviewer,now(),'evidence-ref/synthetic-external-independent-review');
  insert into tm_private.registration_adult_reviews(
    user_id,reviewed_by,reviewed_at,evidence_ref,state)
    values(coach,reviewer,now(),
    'evidence-ref/synthetic-independent-adult-review','approved');
  result:=public.tm_stage3d3_registration(coach,'status',null,false,false,false);
  if result->>'code'<>'acceptance-required' or result->>'canProceed'<>'false'
     or result->>'termsVersion'<>'terms-v1' then
    raise exception 'Unacknowledged approved policy incorrectly permitted: %',result;
  end if;
  result:=public.tm_stage3d3_registration(coach,'accept','mixed20-policy-v1',
    true,false,false);
  if result->>'code'<>'acceptance-invalid' then
    raise exception 'Privacy acknowledgement missing but permitted: %',result;
  end if;
  result:=public.tm_stage3d3_registration(coach,'accept','wrong-policy',
    true,true,false);
  if result->>'code'<>'acceptance-invalid' then
    raise exception 'Policy mismatch wrongly accepted: %',result;
  end if;
  result:=public.tm_stage3d3_registration(reviewer,'status',null,false,false,false);
  if result->>'code'<>'adult-review-required' then
    raise exception 'Adult reviewer implicitly granted own acceptance: %',result;
  end if;
  result:=public.tm_stage3d3_registration(coach,'accept','mixed20-policy-v1',
    true,true,false);
  if result->>'code'<>'accepted' or result->>'canProceed'<>'true' then
    raise exception 'Verified adult acceptance failed: %',result;
  end if;
  if (select count(*) from tm_private.registration_acceptances
      where user_id=coach and policy_id='mixed20-policy-v1'
        and marketing_opt_in=false and terms_accepted=true
        and privacy_acknowledged=true)<>1 then
    raise exception 'Default-off optional marketing not preserved';
  end if;
  result:=public.tm_stage3d3_registration(coach,'accept','mixed20-policy-v1',
    true,true,true);
  if (select count(*) from tm_private.registration_acceptances
      where user_id=coach and marketing_opt_in=false)<>1 then
    raise exception 'Replay silently turned marketing on';
  end if;
  result:=public.tm_stage3d3_registration(coach,'status',null,false,false,false);
  if result->>'code'<>'accepted' then
    raise exception 'Recorded acceptance not recognised';
  end if;
  update tm_private.registration_policy_versions set status='retired'
    where policy_id='mixed20-policy-v1';
  insert into tm_private.registration_policy_versions(
    policy_id,terms_version,terms_sha256,terms_url,
    privacy_version,privacy_sha256,privacy_url,status,reviewed_by,approved_at,approval_ref)
  values('mixed20-policy-v2','terms-v2',repeat('c',64),
    'https://policies.example.test/terms-v2',
    'privacy-v2',repeat('d',64),'https://policies.example.test/privacy-v2',
    'active',reviewer,now(),'evidence-ref/synthetic-external-second-policy-review');
  result:=public.tm_stage3d3_registration(coach,'status',null,false,false,false);
  if result->>'code'<>'acceptance-required' or result->>'canProceed'<>'false' then
    raise exception 'Outdated policy acceptance reused: %',result;
  end if;
  begin
    insert into tm_private.registration_policy_versions(
      policy_id,terms_version,terms_sha256,terms_url,
      privacy_version,privacy_sha256,privacy_url,status,reviewed_by,approved_at,approval_ref)
    values('mixed20-policy-v3','terms-v3',repeat('c',64),
      'https://policies.example.test/terms-v3',
      'privacy-v3',repeat('d',64),'https://policies.example.test/privacy-v3',
      'active',reviewer,now(),'evidence-ref/synthetic-third-policy-review');
    raise exception 'Two active policies permitted';
  exception when unique_violation then null;
  end;
  raise notice 'PASS: no seeded consent, independently attested adults only, both terms, marketing off, immutable acceptance and reaccept on policy change';
end;
$$;
rollback;
