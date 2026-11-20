-- Stage 3D.3: first-team versioned registration policy, source only.
-- NO policy text, personal data or consent is seeded by this migration.
-- The first real team may include minors. Until a separately approved
-- safeguarding path exists, this gateway permits only independently verified
-- adult accounts and denies every other cohort.
create table tm_private.registration_policy_versions (
  policy_id text primary key
    check (policy_id ~ '^[a-z0-9][a-z0-9._-]{4,63}$'),
  terms_version text not null
    check (terms_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$'),
  terms_sha256 text not null
    check (terms_sha256 ~ '^[a-f0-9]{64}$'),
  terms_url text not null
    check (terms_url ~ '^https://[A-Za-z0-9.-]+(/[A-Za-z0-9._~/%-]*)?$'
      and length(terms_url) between 18 and 500),
  privacy_version text not null
    check (privacy_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$'),
  privacy_sha256 text not null
    check (privacy_sha256 ~ '^[a-f0-9]{64}$'),
  privacy_url text not null
    check (privacy_url ~ '^https://[A-Za-z0-9.-]+(/[A-Za-z0-9._~/%-]*)?$'
      and length(privacy_url) between 18 and 500),
  status text not null default 'draft'
    check (status in ('draft','active','retired')),
  reviewed_by uuid references tm_private.accounts(user_id) on delete restrict,
  approved_at timestamptz,
  approval_ref text,
  constraint policy_activation_requires_external_review check (
    status <> 'active' or
    (reviewed_by is not null and approved_at is not null and
     approval_ref ~ '^evidence-ref/[A-Za-z0-9._/-]{12,100}$'))
);
create unique index only_one_active_registration_policy
  on tm_private.registration_policy_versions(status)
  where status = 'active';

-- Age category is not inferred from a team label, self-declaration,
-- OAuth provider, email address or account metadata.
-- Human-reviewed adulthood attestation records no DOB or guardian data.
create table tm_private.registration_adult_reviews (
  user_id uuid primary key references tm_private.accounts(user_id)
    on delete restrict,
  reviewed_by uuid not null references tm_private.accounts(user_id)
    on delete restrict,
  reviewed_at timestamptz not null,
  evidence_ref text not null
    check (evidence_ref ~ '^evidence-ref/[A-Za-z0-9._/-]{12,100}$'),
  state text not null check (state in ('approved','revoked')),
  constraint adult_review_cannot_be_self_approved
    check (user_id <> reviewed_by)
);

-- One immutable acceptance event per account and policy version. A different
-- version requires a new independent acceptance; marketing is opt-in only.
create table tm_private.registration_acceptances (
  user_id uuid not null references tm_private.accounts(user_id)
    on delete restrict,
  policy_id text not null references tm_private.registration_policy_versions(policy_id)
    on delete restrict,
  terms_accepted boolean not null check (terms_accepted = true),
  privacy_acknowledged boolean not null check (privacy_acknowledged = true),
  marketing_opt_in boolean not null default false,
  accepted_at timestamptz not null default now(),
  primary key (user_id, policy_id)
);
create index registration_acceptances_user
  on tm_private.registration_acceptances(user_id, accepted_at desc);

-- No direct browser table access, even with a valid account JWT.
alter table tm_private.registration_policy_versions enable row level security;
alter table tm_private.registration_policy_versions force row level security;
alter table tm_private.registration_adult_reviews enable row level security;
alter table tm_private.registration_adult_reviews force row level security;
alter table tm_private.registration_acceptances enable row level security;
alter table tm_private.registration_acceptances force row level security;
revoke all on tm_private.registration_policy_versions from public,anon,authenticated;
revoke all on tm_private.registration_adult_reviews from public,anon,authenticated;
revoke all on tm_private.registration_acceptances from public,anon,authenticated;
grant select,insert,update,delete on tm_private.registration_policy_versions to service_role;
grant select,insert,update,delete on tm_private.registration_adult_reviews to service_role;
grant select,insert on tm_private.registration_acceptances to service_role;

-- Only the trusted Worker, after GoTrue /auth/v1/user verification,
-- may pass a user ID. The RPC is never executable by an end-user JWT.
create function public.tm_stage3d3_registration(
  p_actor uuid, p_action text, p_policy_id text,
  p_terms_accepted boolean, p_privacy_acknowledged boolean,
  p_marketing_opt_in boolean
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  policy tm_private.registration_policy_versions%rowtype;
  receipt boolean := false;
begin
  if p_actor is null or p_action not in ('status','accept') then
    return pg_catalog.jsonb_build_object('ok',false,'code','invalid-request');
  end if;
  select * into policy from tm_private.registration_policy_versions
    where status='active' limit 1;
  if not found then
    return pg_catalog.jsonb_build_object('ok',false,'code','policy-unavailable',
      'canProceed',false);
  end if;
  if not exists(select 1 from tm_private.accounts a
       where a.user_id=p_actor and a.status='active') then
    return pg_catalog.jsonb_build_object('ok',false,'code','account-unavailable',
      'canProceed',false);
  end if;
  if not exists (
    select 1 from tm_private.registration_adult_reviews adult
      join tm_private.accounts reviewer on reviewer.user_id=adult.reviewed_by
    where adult.user_id=p_actor and adult.state='approved'
      and adult.reviewed_by<>p_actor and reviewer.status='active'
      and adult.reviewed_at is not null
  ) then
    return pg_catalog.jsonb_build_object('ok',false,'code','adult-review-required',
      'canProceed',false);
  end if;
  select exists(
    select 1 from tm_private.registration_acceptances a
    where a.user_id=p_actor and a.policy_id=policy.policy_id
      and a.terms_accepted=true and a.privacy_acknowledged=true
  ) into receipt;
  if p_action='status' then
    -- Policy metadata is safe to show ONLY to a verified adult account.
    return pg_catalog.jsonb_build_object(
      'ok',true,'code',case when receipt then 'accepted' else 'acceptance-required' end,
      'canProceed',receipt,'policyId',policy.policy_id,
      'termsVersion',policy.terms_version,
      'termsSha256',policy.terms_sha256,
      'termsUrl',policy.terms_url,
      'privacyVersion',policy.privacy_version,
      'privacySha256',policy.privacy_sha256,
      'privacyUrl',policy.privacy_url);
  end if;
  if p_policy_id is distinct from policy.policy_id or
     p_terms_accepted is distinct from true or
     p_privacy_acknowledged is distinct from true or
     p_marketing_opt_in is null then
    return pg_catalog.jsonb_build_object('ok',false,'code','acceptance-invalid',
      'canProceed',false);
  end if;
  -- Do not silently update a prior acceptance or turn on marketing by replay.
  if not receipt then
    insert into tm_private.registration_acceptances(
      user_id,policy_id,terms_accepted,privacy_acknowledged,marketing_opt_in
    ) values(p_actor,policy.policy_id,true,true,p_marketing_opt_in)
    on conflict (user_id,policy_id) do nothing;
    insert into tm_private.audit_events(
      user_id,team_id,action,resource_id,decision,reason_code)
      values(p_actor,null,'registration.policy.accept',policy.policy_id,
        'ALLOW','individually-reviewed-adult-policy');
  end if;
  return pg_catalog.jsonb_build_object(
    'ok',true,'code','accepted','canProceed',true,'policyId',policy.policy_id);
end;
$$;
revoke all on function public.tm_stage3d3_registration(uuid,text,text,boolean,boolean,boolean)
  from public,anon,authenticated;
grant execute on function public.tm_stage3d3_registration(uuid,text,text,boolean,boolean,boolean)
  to service_role;
