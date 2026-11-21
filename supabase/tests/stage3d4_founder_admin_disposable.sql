-- Stage 3D.4 synthetic end-to-end initial Owner + exact-team admin approval.
-- Disposable PostgreSQL only. All data is invented; nothing persists.
begin;

do $$
declare
  owner uuid:='55555555-5555-4555-8555-555555555555';
  target uuid:='66666666-6666-4666-8666-666666666666';
  r jsonb; invitation text;
  n integer;
begin
  if exists(select 1 from tm_private.founder_bootstrap) or
     has_table_privilege('authenticated','tm_private.founder_bootstrap','SELECT')
     or has_function_privilege('authenticated',
       'public.tm_stage3d4_owner(uuid,text,jsonb)','EXECUTE')
     or not has_function_privilege('service_role',
       'public.tm_stage3d4_owner(uuid,text,jsonb)','EXECUTE') then
    raise exception 'Migration seeded founder or exposed privileged RPC';
  end if;
  insert into auth.users(id,email,email_confirmed_at) values
    (owner,'founder@fictional.test',now()),
    (target,'manager@fictional.test',now());
  insert into tm_private.accounts(user_id,status) values(owner,'active');
  insert into tm_private.founder_bootstrap(
    id,user_id,evidence_ref,adult_attested) values
    (1,owner,'evidence-ref/synthetic-founder-attestation',true);
  insert into tm_private.platform_operator_grants(
    user_id,status,approved_at,founder_bootstrap_id) values
    (owner,'active',now(),1);

  r:=public.tm_stage3d4_owner(target,'status','{}'::jsonb);
  if r->>'code'<>'scope-denied' then
    raise exception 'Non-founder accessed restricted setup'; end if;
  r:=public.tm_stage3d4_owner(owner,'status','{}'::jsonb);
  if r->>'code'<>'ready' or r->>'policyReady'<>'false' then
    raise exception 'Owner restricted setup unavailable: %',r; end if;
  r:=public.tm_stage3d4_owner(owner,'invite.issue',
    '{"email":"member@fictional.test","role":"team_manager"}'::jsonb);
  if r->>'code'<>'registration-required' then
    raise exception 'Invitation bypassed absent policy'; end if;
  r:=public.tm_stage3d4_owner(owner,'team.create',jsonb_build_object(
    'teamId','stgeorge-mixed20','clubRef','St George Oztag',
    'sportRef','oztag','seasonRef','2026'));
  if r->>'code'<>'team-created' then raise exception 'First team setup: %',r; end if;
  r:=public.tm_stage3d4_owner(owner,'team.create',jsonb_build_object(
    'teamId','another','clubRef','Fictional Another',
    'sportRef','oztag','seasonRef','2026'));
  if r->>'code'<>'team-preflight-denied' then
    raise exception 'Founder could create a second unrestricted team'; end if;
  r:=public.tm_stage3d4_owner(owner,'coach.assign','{}'::jsonb);
  if r->>'code'<>'coach-assigned' then raise exception 'Initial Coach: %',r; end if;
  r:=public.tm_stage3d4_owner(owner,'coach.assign','{}'::jsonb);
  if r->>'code'<>'coach-preflight-denied' then
    raise exception 'Founder Coach bootstrap was replayable'; end if;
  if (select count(*) from tm_private.role_grants g
    where g.user_id=owner and g.team_id='stgeorge-mixed20'
      and g.role='team_coach' and g.status='active'
      and g.approved_by is null and g.founder_bootstrap_id=1)<>1 then
    raise exception 'Founder Coach must have distinct audited grant'; end if;
end $$;

-- No approved policy: neither the founder Coach nor Owner can read via
-- authenticated context RPCs. Setup doesn't bypass real registration.
select set_config('request.jwt.claim.sub',
 '55555555-5555-4555-8555-555555555555',true);
set local role authenticated;
do $$
declare r jsonb;
begin
 if (select count(*) from public.tm_my_team_context())<>0 then
  raise exception 'Unaccepted founder opened private Coach context'; end if;
 r:=public.tm_my_operator_context();
 if r->>'isOwner'<>'false' then raise exception 'Unaccepted owner context leaked'; end if;
end $$;
reset role;

-- Synthetic policy is reviewed/activated only inside rolled-back CI.
insert into tm_private.registration_policy_versions(
 policy_id,terms_version,terms_sha256,terms_url,
 privacy_version,privacy_sha256,privacy_url,status,reviewed_by,
 approved_at,approval_ref) values(
 'synthetic-founder-policy','terms-v1',repeat('a',64),
 'https://policies.example.test/terms-v1',
 'privacy-v1',repeat('b',64),'https://policies.example.test/privacy-v1',
 'active','55555555-5555-4555-8555-555555555555',now(),
 'evidence-ref/synthetic-external-policy-review');
do $$
declare owner uuid:='55555555-5555-4555-8555-555555555555';r jsonb;
begin
 r:=public.tm_stage3d3_registration(owner,'status',null,false,false,false);
 if r->>'code'<>'acceptance-required' then
   raise exception 'Founder could not see reviewed policy: %',r;end if;
 r:=public.tm_stage3d3_registration(owner,'accept',
   'synthetic-founder-policy',true,true,false);
 if r->>'code'<>'accepted' then raise exception 'Founder acknowledgement: %',r; end if;
end $$;

set local role authenticated;
do $$
declare r jsonb;
begin
 if (select count(*) from public.tm_my_team_context())<>1 then
  raise exception 'Accepted initial Coach grant not recognised';end if;
 r:=public.tm_my_operator_context();
 if r->>'isOwner'<>'true' then raise exception 'Owner context absent';end if;
end $$;
reset role;

-- One approved administrator can invite a different adult. Invitation does
-- not itself grant a team role and a claimant must accept the current policy.
do $$
declare owner uuid:='55555555-5555-4555-8555-555555555555';
 target uuid:='66666666-6666-4666-8666-666666666666';
 r jsonb; invite text;
begin
 r:=public.tm_stage3d4_owner(owner,'invite.issue',
   '{"email":"founder@fictional.test","role":"team_manager"}'::jsonb);
 if r->>'code'<>'invite-preflight-denied' then
  raise exception 'Owner could invite own identity through normal path';end if;
 r:=public.tm_stage3d4_owner(owner,'invite.issue',
   '{"email":"manager@fictional.test","role":"team_manager"}'::jsonb);
 if r->>'code'<>'approved' then raise exception 'Admin invitation failed: %',r;end if;
 invite:=r->>'invitationId';
 if exists(select 1 from tm_private.role_grants where user_id=target) then
  raise exception 'Invitation granted access without review';end if;
 r:=public.tm_stage3d4_owner(owner,'invite.review-adult',jsonb_build_object(
   'invitationId',invite,'evidenceRef',
   'evidence-ref/synthetic-manager-adult-review'));
 if r->>'code'<>'adult-reviewed' then
  raise exception 'Approved adult review failed: %',r;end if;
 if not exists(select 1 from tm_private.accounts
   where user_id=target and status='active') then
  raise exception 'Accepted invited adult account missing';end if;
 r:=public.tm_stage3d3_registration(target,'accept',
   'synthetic-founder-policy',true,true,false);
 if r->>'code'<>'accepted' then
  raise exception 'Invitation recipient cannot acknowledge policy: %',r;end if;
 r:=public.tm_stage3_onboarding(target,'manager@fictional.test','','',
   'claim',invite,null,null);
 if r->>'code'<>'claimed' then
  raise exception 'Approved invited adult cannot claim: %',r;end if;
 r:=public.tm_stage3d4_owner(owner,'invite.activate',
   jsonb_build_object('invitationId',invite));
 if r->>'code'<>'activated' then
  raise exception 'Owner could not activate independently reviewed role: %',r;end if;
 if not exists(select 1 from tm_private.role_grants g
   where g.user_id=target and g.team_id='stgeorge-mixed20'
    and g.role='team_manager' and g.status='active'
    and g.approved_by=owner) then
  raise exception 'Approved exact-team Manager role missing';end if;
 perform set_config('stage3d4.synthetic_invite',invite,true);
end $$;

select set_config('request.jwt.claim.sub',
 '66666666-6666-4666-8666-666666666666',true);
set local role authenticated;
do $$
begin
 if (select count(*) from public.tm_my_team_context())<>1 then
  raise exception 'Recipient cannot access approved exact team';end if;
 if (public.tm_my_operator_context()->>'isOwner')<>'false' then
  raise exception 'Team Manager became Platform Owner';end if;
end $$;
reset role;

do $$
declare r jsonb; invite text;
begin
 invite:=current_setting('stage3d4.synthetic_invite');
 r:=public.tm_stage3d4_owner('55555555-5555-4555-8555-555555555555',
 'invite.revoke',jsonb_build_object('invitationId',invite));
 if r->>'code'<>'revoked' then raise exception 'Revocation failed';end if;
end $$;
set local role authenticated;
do $$
begin
 if (select count(*) from public.tm_my_team_context())<>0 then
  raise exception 'Revoked Manager retained access';end if;
end $$;
reset role;
do $$
begin
 if (select count(*) from tm_private.founder_bootstrap)<>1 or
    (select count(*) from tm_private.audit_events
      where action in ('platform.first-team.create',
        'platform.first-coach.assign','onboarding.administrator.approve',
        'onboarding.administrator.activate'))<>4 then
    raise exception 'Founder/admin audit provenance incomplete';
 end if;
 raise notice 'PASS: founder setup, separate Coach, policy gating, admin invited adult, claim, exact-role activation and revocation';
end $$;
rollback;
