-- Stage 3D.4: one-time owner bootstrap and scoped first-team administration.
-- SOURCE ONLY. No real account, grant, team, policy or email is seeded here.
-- The live database requires an exact-schema/backup preflight and explicit install.
-- Initial founder authorisation is OPERATOR-ATTESTED, never presented as an
-- independent human approval. Other accounts keep independent role approval.

create table tm_private.founder_bootstrap (
  id smallint primary key default 1 check (id=1),
  user_id uuid not null unique references auth.users(id) on delete restrict,
  evidence_ref text not null
    check (evidence_ref ~ '^evidence-ref/[A-Za-z0-9._/-]{12,100}$'),
  adult_attested boolean not null check (adult_attested=true),
  authorised_at timestamptz not null default now(),
  first_team_id text references tm_private.teams(team_id) on delete restrict,
  first_coach_grant_id text
);
alter table tm_private.founder_bootstrap enable row level security;
alter table tm_private.founder_bootstrap force row level security;
revoke all on tm_private.founder_bootstrap from public,anon,authenticated,service_role;

alter table tm_private.platform_operator_grants
  add column founder_bootstrap_id smallint references tm_private.founder_bootstrap(id);
alter table tm_private.platform_operator_grants
  drop constraint operator_grant_approval_required;
alter table tm_private.platform_operator_grants
  add constraint operator_grant_approval_required check (
    status <> 'active' or (approved_at is not null and
      ((approved_by is not null and founder_bootstrap_id is null) or
       (approved_by is null and founder_bootstrap_id=1)))
  );

alter table tm_private.role_grants
  add column founder_bootstrap_id smallint references tm_private.founder_bootstrap(id);
alter table tm_private.role_grants drop constraint grant_approval_complete;
alter table tm_private.role_grants add constraint grant_approval_complete check (
    status <> 'active' or (approved_at is not null and
      ((approved_by is not null and founder_bootstrap_id is null) or
       (approved_by is null and founder_bootstrap_id=1 and role='team_coach')))
  );

-- This is an authenticated database-admin provenance exception for exactly
-- one founder. Nobody can create it through a browser/RPC/service-role table
-- mutation. Revocation of a grant still takes effect immediately.
create function tm_private.stage3d4_founder_owner(p_user uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(
  select 1 from tm_private.founder_bootstrap f
   join tm_private.platform_operator_grants g on g.user_id=f.user_id
  where f.id=1 and f.user_id=p_user and f.adult_attested=true
    and g.status='active' and g.founder_bootstrap_id=1
    and g.approved_by is null and g.approved_at is not null
    and (g.expires_at is null or now()<g.expires_at)
 );
$$;
create function tm_private.stage3d4_founder_coach(
  p_user uuid,p_team text,p_grant text)
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(
  select 1 from tm_private.founder_bootstrap f
   join tm_private.role_grants g on g.grant_id=f.first_coach_grant_id
  where f.id=1 and f.user_id=p_user and f.first_team_id=p_team
    and g.user_id=p_user and g.team_id=p_team and g.grant_id=p_grant
    and g.role='team_coach' and g.status='active'
    and g.founder_bootstrap_id=1 and g.approved_by is null
    and g.approved_at is not null
    and (g.valid_from is null or g.valid_from<=now())
    and (g.expires_at is null or now()<g.expires_at)
 );
$$;
revoke all on function tm_private.stage3d4_founder_owner(uuid)
 from public,anon,authenticated;
revoke all on function tm_private.stage3d4_founder_coach(uuid,text,text)
 from public,anon,authenticated;
grant execute on function tm_private.stage3d4_founder_owner(uuid) to service_role;
grant execute on function tm_private.stage3d4_founder_coach(uuid,text,text) to service_role;

-- A single authorised administrator may issue an invitation. A user may NOT
-- approve their own invitation, and no approved invitation is itself a grant.
alter table tm_private.team_invitations
  add column administrator_approved boolean not null default false;
alter table tm_private.team_invitations
  drop constraint team_invitation_not_self_approved;
alter table tm_private.team_invitations
  add constraint team_invitation_approval_path check (
    approved_by is null or approved_by<>proposed_by or administrator_approved
  );

-- Owner administration requires an accepted active policy for user-facing
-- invitations. The two restricted setup actions do not touch member data.
create function tm_private.stage3d4_owner_policy_ready(p_user uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(select 1 from tm_private.registration_policy_versions p
  join tm_private.registration_acceptances a on a.policy_id=p.policy_id
  where p.status='active' and a.user_id=p_user
    and a.terms_accepted=true and a.privacy_acknowledged=true)
  and tm_private.stage3d4_founder_owner(p_user);
$$;
revoke all on function tm_private.stage3d4_owner_policy_ready(uuid)
 from public,anon,authenticated;
grant execute on function tm_private.stage3d4_owner_policy_ready(uuid) to service_role;

create function public.tm_stage3d4_owner(p_actor uuid,p_action text,p_input jsonb)
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare
 f tm_private.founder_bootstrap%rowtype;
 inv tm_private.team_invitations%rowtype;
 v_id text; v_club text; v_sport text; v_season text;
 v_email text; v_role text; v_ref text; v_invite text; v_grant text;
 v_target uuid; v_ready boolean;
 v_invites jsonb; v_team jsonb;
begin
 if p_actor is null or p_action is null or p_input is null
   or jsonb_typeof(p_input)<>'object'
   or not tm_private.stage3d4_founder_owner(p_actor) then
  return jsonb_build_object('ok',false,'code','scope-denied');
 end if;
 select * into f from tm_private.founder_bootstrap
  where id=1 and user_id=p_actor for update;
 if not found then return jsonb_build_object('ok',false,'code','scope-denied'); end if;
 v_ready:=tm_private.stage3d4_owner_policy_ready(p_actor);

 if p_action='status' then
  select jsonb_build_object('teamId',t.team_id,'clubRef',t.club_ref,
    'sportRef',t.sport_ref,'seasonRef',t.season_ref)
    into v_team from tm_private.teams t where t.team_id=f.first_team_id;
  select coalesce(jsonb_agg(jsonb_build_object(
     'invitationId',i.invitation_id,'email',i.email,'role',i.team_role,
     'status',i.status,'delivery',i.delivery_status,
     'expiresAt',i.expires_at) order by i.created_at desc),'[]'::jsonb)
    into v_invites from tm_private.team_invitations i
    where i.team_id=f.first_team_id and i.administrator_approved=true
      and i.created_at>now()-interval '30 days';
  return jsonb_build_object('ok',true,'code','ready','team',v_team,
    'coachAssigned',f.first_coach_grant_id is not null,
    'policyReady',v_ready,'invitations',v_invites);
 end if;

 if p_action='team.create' then
  v_id:=p_input->>'teamId';v_club:=p_input->>'clubRef';
  v_sport:=p_input->>'sportRef';v_season:=p_input->>'seasonRef';
  if f.first_team_id is not null or exists(select 1 from tm_private.teams)
    or v_id is null or v_id !~ '^[a-z][a-z0-9-]{2,63}$'
    or v_club is null or length(btrim(v_club)) not between 3 and 100
    or v_club<>btrim(v_club) or v_club ~ '[[:cntrl:]]'
    or v_sport is null or v_sport !~ '^[a-z][a-z0-9-]{1,30}$'
    or v_season is null or v_season !~ '^20[0-9]{2}$' then
   return jsonb_build_object('ok',false,'code','team-preflight-denied');
  end if;
  insert into tm_private.teams(team_id,club_ref,sport_ref,season_ref,status)
   values(v_id,v_club,v_sport,v_season,'active');
  update tm_private.founder_bootstrap set first_team_id=v_id where id=1;
  insert into tm_private.audit_events(user_id,team_id,action,resource_id,decision,reason_code)
   values(p_actor,v_id,'platform.first-team.create',v_id,'ALLOW','founder-controlled-setup');
  return jsonb_build_object('ok',true,'code','team-created');
 end if;

 if p_action='coach.assign' then
  if f.first_team_id is null or f.first_coach_grant_id is not null
    or exists(select 1 from tm_private.role_grants g
       where g.user_id=p_actor and g.role='team_coach' and g.status='active') then
   return jsonb_build_object('ok',false,'code','coach-preflight-denied');
  end if;
  v_grant:='grant-'||replace(gen_random_uuid()::text,'-','');
  insert into tm_private.role_grants(
    grant_id,user_id,team_id,role,status,approved_at,founder_bootstrap_id)
    values(v_grant,p_actor,f.first_team_id,'team_coach','active',now(),1);
  update tm_private.founder_bootstrap
    set first_coach_grant_id=v_grant where id=1;
  insert into tm_private.audit_events(user_id,team_id,action,resource_id,decision,reason_code)
   values(p_actor,f.first_team_id,'platform.first-coach.assign',v_grant,
    'ALLOW','founder-single-account-dual-role');
  return jsonb_build_object('ok',true,'code','coach-assigned');
 end if;

 -- All other actions require the CURRENT accepted policy. An owner login
 -- cannot route around the adult-only gate to invite people or read rosters.
 if not v_ready or f.first_team_id is null then
  return jsonb_build_object('ok',false,'code','registration-required');
 end if;

 if p_action in ('invite.issue','invite.approve') then
  if p_action='invite.issue' then
   v_email:=lower(btrim(p_input->>'email'));
   v_role:=p_input->>'role';
   if v_email is null or length(v_email)>254
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
     or v_role not in ('team_coach','team_manager','team_assistant',
        'team_player','team_volunteer')
     or exists(select 1 from auth.users u where u.id=p_actor
          and lower(u.email)=v_email)
     or exists(select 1 from tm_private.team_invitations i
          where i.team_id=f.first_team_id and i.email=v_email
          and i.team_role=v_role and i.status in ('proposed','approved','claimed')
          and i.expires_at>now()) then
    return jsonb_build_object('ok',false,'code','invite-preflight-denied');
   end if;
   v_invite:='invite-'||replace(gen_random_uuid()::text,'-','');
   insert into tm_private.team_invitations(
     invitation_id,team_id,email,team_role,status,proposed_by,approved_by,
     approved_at,administrator_approved)
     values(v_invite,f.first_team_id,v_email,v_role,'approved',
       p_actor,p_actor,now(),true);
  else
   v_invite:=p_input->>'invitationId';
   select * into inv from tm_private.team_invitations
    where invitation_id=v_invite and team_id=f.first_team_id for update;
   if not found or inv.status<>'proposed' or inv.proposed_by=p_actor
     or exists(select 1 from auth.users u where u.id=p_actor
       and lower(u.email)=inv.email) then
    return jsonb_build_object('ok',false,'code','invite-preflight-denied');
   end if;
   update tm_private.team_invitations set status='approved',
     approved_by=p_actor,approved_at=now(),administrator_approved=true,
     updated_at=now() where invitation_id=v_invite;
   v_email:=inv.email;
  end if;
  insert into tm_private.audit_events(user_id,team_id,action,resource_id,decision,reason_code)
   values(p_actor,f.first_team_id,'onboarding.administrator.approve',
      v_invite,'ALLOW','approved-scope-administrator');
  return jsonb_build_object('ok',true,'code','approved',
    'invitationId',v_invite,'internalEmail',v_email);
 end if;

 v_invite:=p_input->>'invitationId';
 if v_invite is null or v_invite !~ '^invite-[0-9a-f]{32}$' then
  return jsonb_build_object('ok',false,'code','invalid-request');
 end if;
 select * into inv from tm_private.team_invitations
  where invitation_id=v_invite and team_id=f.first_team_id
    and administrator_approved=true for update;
 if not found or inv.approved_by<>p_actor or inv.expires_at<=now() then
  return jsonb_build_object('ok',false,'code','invite-unavailable');
 end if;

 if p_action='invite.review-adult' then
  if inv.status not in ('approved','claimed') then
   return jsonb_build_object('ok',false,'code','invite-unavailable'); end if;
  v_ref:=p_input->>'evidenceRef';
  if v_ref is null or v_ref !~ '^evidence-ref/[A-Za-z0-9._/-]{12,100}$' then
   return jsonb_build_object('ok',false,'code','review-required'); end if;
  select u.id into v_target from auth.users u
   where lower(u.email)=inv.email and u.email_confirmed_at is not null
   order by u.created_at desc limit 1;
  if v_target is null or v_target=p_actor then
   return jsonb_build_object('ok',false,'code','verified-identity-required'); end if;
  if exists(select 1 from tm_private.accounts a where a.user_id=v_target
     and a.status in ('disabled','archived')) or
     exists(select 1 from tm_private.registration_adult_reviews r
       where r.user_id=v_target and r.state='revoked') then
   return jsonb_build_object('ok',false,'code','review-revoked');
  end if;
  insert into tm_private.accounts(user_id,status) values(v_target,'active')
   on conflict(user_id) do nothing;
  insert into tm_private.registration_adult_reviews(
   user_id,reviewed_by,reviewed_at,evidence_ref,state)
   values(v_target,p_actor,now(),v_ref,'approved')
   on conflict(user_id) do nothing;
  insert into tm_private.audit_events(user_id,team_id,action,resource_id,decision,reason_code)
   values(p_actor,f.first_team_id,'onboarding.adult.review',v_invite,
     'ALLOW','individually-verified-adult-only');
  return jsonb_build_object('ok',true,'code','adult-reviewed');
 end if;

 if p_action='invite.activate' then
  if inv.status<>'claimed' or inv.claimed_by is null or inv.claimed_by=p_actor
    or inv.grant_id is null or inv.person_id is null
    or not exists(select 1 from tm_private.registration_adult_reviews r
      where r.user_id=inv.claimed_by and r.state='approved'
        and r.reviewed_by=p_actor)
    or not exists(select 1 from tm_private.accounts a
      where a.user_id=inv.claimed_by and a.status='active')
    or not exists(select 1 from tm_private.registration_acceptances a
      join tm_private.registration_policy_versions p on p.policy_id=a.policy_id
      where a.user_id=inv.claimed_by and p.status='active'
        and a.terms_accepted=true and a.privacy_acknowledged=true)
    or exists(select 1 from tm_private.role_grants g
      where g.user_id=inv.claimed_by and g.team_id=f.first_team_id
        and g.role=inv.team_role and g.status='active') then
   return jsonb_build_object('ok',false,'code','activation-preflight-denied');
  end if;
  update tm_private.account_person_links set
    status='verified',verified_by=p_actor,verified_at=now()
    where user_id=inv.claimed_by and person_id=inv.person_id and status='pending';
  if not found and not exists(
    select 1 from tm_private.account_person_links l
    where l.user_id=inv.claimed_by and l.person_id=inv.person_id
      and l.status='verified' and l.verified_by is not null
      and l.verified_by<>inv.claimed_by) then
   return jsonb_build_object('ok',false,'code','person-not-verified'); end if;
  if inv.team_role='team_player' then
   insert into tm_private.participations(
     team_id,person_id,kind,status,verified_by,verified_at)
     values(f.first_team_id,inv.person_id,'player','active',p_actor,now())
   on conflict(team_id,person_id) do update
    set status='active',verified_by=excluded.verified_by,
        verified_at=excluded.verified_at;
  end if;
  update tm_private.role_grants set status='active',
     approved_by=p_actor,approved_at=now()
    where grant_id=inv.grant_id and user_id=inv.claimed_by
      and team_id=f.first_team_id and role=inv.team_role
      and status='proposed';
  if not found then return jsonb_build_object('ok',false,'code','grant-unavailable'); end if;
  update tm_private.team_invitations set status='activated',
    updated_at=now() where invitation_id=v_invite;
  insert into tm_private.audit_events(user_id,team_id,action,resource_id,decision,reason_code)
   values(p_actor,f.first_team_id,'onboarding.administrator.activate',v_invite,
    'ALLOW','admin-verified-person-and-role');
  return jsonb_build_object('ok',true,'code','activated');
 end if;

 if p_action in ('invite.cancel','invite.revoke') then
  if (p_action='invite.cancel' and inv.status not in ('approved','claimed'))
     or (p_action='invite.revoke' and inv.status<>'activated') then
   return jsonb_build_object('ok',false,'code','invite-unavailable'); end if;
  if inv.grant_id is not null then
   update tm_private.role_grants set status='revoked'
    where grant_id=inv.grant_id and team_id=f.first_team_id
      and status in ('proposed','active');
  end if;
  update tm_private.team_invitations set status='revoked',updated_at=now()
   where invitation_id=v_invite;
  insert into tm_private.audit_events(user_id,team_id,action,resource_id,decision,reason_code)
   values(p_actor,f.first_team_id,'onboarding.administrator.revoke',v_invite,
     'ALLOW','team-access-withdrawn');
  return jsonb_build_object('ok',true,'code','revoked');
 end if;
 return jsonb_build_object('ok',false,'code','invalid-request');
end;
$$;
revoke all on function public.tm_stage3d4_owner(uuid,text,jsonb)
 from public,anon,authenticated;
grant execute on function public.tm_stage3d4_owner(uuid,text,jsonb) to service_role;

-- Re-evaluate the existing, accepted grant checks for the ONLY founder Coach
-- while preserving all current policy gates, exact-team tests and deny paths.

-- Updated tm_private.stage3d3_registration_ready (based on supabase/migrations/20261120020000_stage3d3_direct_rpc_registration_gate.sql)
create or replace function tm_private.stage3d3_registration_ready()
returns boolean language sql stable security definer set search_path=''
as $$
  select auth.uid() is not null
    and (exists (
      select 1
      from tm_private.accounts a
      join tm_private.registration_adult_reviews r
        on r.user_id=a.user_id and r.state='approved'
       and r.reviewed_by<>a.user_id and r.reviewed_at is not null
      join tm_private.accounts reviewer
        on reviewer.user_id=r.reviewed_by and reviewer.status='active'
      where a.user_id=auth.uid() and a.status='active'
    ) or tm_private.stage3d4_founder_owner(auth.uid())
    )
    and exists (
      select 1
      from tm_private.registration_policy_versions p
      join tm_private.registration_acceptances x on x.policy_id=p.policy_id
      where p.status='active' and x.user_id=auth.uid()
        and x.terms_accepted=true and x.privacy_acknowledged=true
    );
$$;

-- Updated public.tm_stage3d3_registration (based on supabase/migrations/20261120010000_stage3d3_registration_policy.sql)
create or replace function public.tm_stage3d3_registration(
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
  ) and not tm_private.stage3d4_founder_owner(p_actor) then
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

-- Updated public.tm_my_operator_context (based on supabase/migrations/20261120020000_stage3d3_direct_rpc_registration_gate.sql)
create or replace function public.tm_my_operator_context()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select pg_catalog.jsonb_build_object('isOwner',exists(
    select 1 from tm_private.platform_operator_grants g
      join tm_private.accounts a on a.user_id=g.user_id
    where auth.uid() is not null and tm_private.stage3d3_registration_ready()
      and g.user_id=auth.uid()
      and a.status='active' and g.status='active'
      and ((g.approved_by is not null and g.approved_by<>g.user_id)
        or tm_private.stage3d4_founder_owner(g.user_id))
      and g.approved_at is not null
      and (g.expires_at is null or now()<g.expires_at)
  ));
$$;

-- Updated public.tm_my_team_context (based on supabase/migrations/20261120020000_stage3d3_direct_rpc_registration_gate.sql)
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
    and tm_private.stage3d3_registration_ready()
    and g.user_id = auth.uid()
    and a.status = 'active'
    and t.status = 'active'
    and g.status = 'active'
    and g.policy_version = 1
    and ((g.approved_by is not null
    and g.approved_by <> g.user_id) or tm_private.stage3d4_founder_coach(g.user_id,g.team_id,g.grant_id))
    and g.approved_at is not null
    and (g.valid_from is null or g.valid_from <= pg_catalog.now())
    and (g.expires_at is null or pg_catalog.now() < g.expires_at)
    and (
      g.role in ('team_coach','team_assistant','team_manager','team_play_viewer')
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

-- Updated public.tm_stage1_operation (based on supabase/migrations/20261118030000_stage1_team_operations.sql)
create or replace function public.tm_stage1_operation(
  p_account uuid, p_team text, p_role text, p_action text,
  p_resource text, p_payload jsonb, p_digest text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_person text;
  v_granted boolean;
  v_mutation text;
  v_expected integer;
  v_existing tm_private.mutation_receipts%rowtype;
  v_command jsonb;
  v_response text;
  v_version integer;
  v_resource text := p_resource;
  v_kind text;
  v_status text;
  v_data jsonb;
  v_result jsonb;
  v_write boolean;
begin
  if p_team is null or p_team !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$'
     or p_resource is null or p_resource !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$'
     or p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or p_role not in ('team_coach','team_assistant','team_manager','team_player','team_volunteer')
     or p_action not in ('schedule.read','schedule.edit','roster.read',
       'roster.edit','availability.reply','duty.read','duty.reply','duty.assign')
  then return jsonb_build_object('ok',false,'code','invalid-command'); end if;

  v_write := p_action not in ('schedule.read','roster.read','duty.read');
  if v_write then
    if p_digest is null or p_digest !~ '^[0-9a-f]{64}$'
       or coalesce(p_payload->>'mutationId','') !~ '^[A-Za-z0-9][A-Za-z0-9_-]{15,79}$'
       or jsonb_typeof(p_payload->'expectedVersion') <> 'number'
       or coalesce(p_payload->>'expectedVersion','') !~ '^(0|[1-9][0-9]{0,9})$'
    then return jsonb_build_object('ok',false,'code','invalid-mutation'); end if;
    v_mutation := p_payload->>'mutationId';
    if (p_payload->>'expectedVersion')::bigint > 2147483647
    then return jsonb_build_object('ok',false,'code','invalid-mutation'); end if;
    v_expected := (p_payload->>'expectedVersion')::integer;
    if (p_payload - 'mutationId' - 'expectedVersion') ?| array[
       'accountId','personId','roleGrant','approvedBy','teamId','verified','isAdmin']
    then return jsonb_build_object('ok',false,'code','forged-field'); end if;
  else
    if p_payload <> '{}'::jsonb or p_digest is not null
    then return jsonb_build_object('ok',false,'code','invalid-read'); end if;
  end if;

  -- Team row lock serialises concurrent Stage 1 mutations, including duplicate
  -- mutation IDs, and covers the complete command from grant check to receipt.
  if v_write then
    perform 1 from tm_private.teams t
      where t.team_id=p_team and t.status='active' for update;
  else
    perform 1 from tm_private.teams t
      where t.team_id=p_team and t.status='active';
  end if;
  if not found then
    return jsonb_build_object('ok',false,'code','scope-denied');
  end if;
  perform 1 from tm_private.accounts a
    where a.user_id=p_account and a.status='active' for share;
  if not found then
    return jsonb_build_object('ok',false,'code','account-inactive');
  end if;
  select exists(
    select 1 from tm_private.role_grants g
      where g.user_id=p_account and g.team_id=p_team
        and g.role=p_role and g.status='active' and g.policy_version=1
        and ((g.approved_by is not null and g.approved_by<>p_account) or tm_private.stage3d4_founder_coach(g.user_id,g.team_id,g.grant_id))
        and (g.valid_from is null or g.valid_from<=v_now)
        and (g.expires_at is null or v_now<g.expires_at)
  ) into v_granted;
  if not v_granted then
    return jsonb_build_object('ok',false,'code','scope-denied');
  end if;
  if (p_action in ('schedule.edit','roster.edit','roster.read')
      and p_role not in ('team_coach','team_manager','team_assistant'))
     or (p_action='schedule.edit' and p_role not in ('team_coach','team_manager','team_assistant'))
     or (p_action='roster.edit' and p_role not in ('team_coach','team_manager'))
     or (p_action='roster.read' and p_role not in ('team_coach','team_manager'))
     or (p_action='schedule.read' and p_role not in ('team_coach','team_manager','team_assistant','team_player'))
     or (p_action='availability.reply' and p_role<>'team_player')
     or (p_action in ('duty.read','duty.reply') and p_role<>'team_volunteer')
     or (p_action='duty.assign' and p_role<>'team_manager')
  then return jsonb_build_object('ok',false,'code','role-denied'); end if;

  if p_role in ('team_player','team_volunteer') then
    select l.person_id into v_person
      from tm_private.account_person_links l
      where l.user_id=p_account and l.status='verified'
        and l.verified_by is not null and l.verified_by<>p_account
        and l.verified_at is not null limit 1;
    if v_person is null then
      return jsonb_build_object('ok',false,'code','person-not-verified');
    end if;
    if p_role='team_player' then
      perform 1 from tm_private.participations x
        where x.team_id=p_team and x.person_id=v_person
          and x.status='active' and x.verified_by is not null
          and x.verified_at is not null;
      if not found then
        return jsonb_build_object('ok',false,'code','participation-not-verified');
      end if;
    end if;
  end if;

  if not v_write then
    if p_resource<>p_team then
      return jsonb_build_object('ok',false,'code','resource-out-of-scope');
    end if;
    if p_action='schedule.read' then
      select coalesce(jsonb_agg(jsonb_build_object(
        'sessionId',s.session_id,'kind',s.kind,'startsAt',s.starts_at,
        'title',s.title,'locationLabel',s.location_label,
        'status',s.status,'version',s.resource_version,
        'myAvailability',case when p_role='team_player' then (
          select a.response from tm_private.availability a
            where a.session_id=s.session_id and a.person_id=v_person
        ) else null end,
        'myAvailabilityVersion',case when p_role='team_player' then (
          select a.resource_version from tm_private.availability a
            where a.session_id=s.session_id and a.person_id=v_person
        ) else null end
      ) order by s.starts_at,s.session_id),'[]'::jsonb)
      into v_data from tm_private.sessions s
      where s.team_id=p_team and s.status<>'cancelled';
    elsif p_action='roster.read' then
      select coalesce(jsonb_agg(jsonb_build_object(
        'personId',x.person_id,'status',x.status,'version',x.resource_version)
        order by x.person_id),'[]'::jsonb)
      into v_data from tm_private.participations x where x.team_id=p_team;
    elsif p_action='duty.read' then
      select coalesce(jsonb_agg(jsonb_build_object(
        'dutyId',d.duty_id,'sessionId',d.session_id,'status',d.status,
        'response',d.response,'version',d.resource_version)
        order by d.duty_id),'[]'::jsonb)
      into v_data from tm_private.duties d
      where d.team_id=p_team and d.person_id=v_person
        and d.status in ('assigned','confirmed','completed');
    end if;
    return jsonb_build_object('ok',true,'code','permitted','data',v_data);
  end if;

  select * into v_existing from tm_private.mutation_receipts r
    where r.user_id=p_account and r.team_id=p_team and r.mutation_id=v_mutation
    for update;
  if found then
    if v_existing.request_sha256=p_digest and v_existing.committed_result is not null
    then return v_existing.committed_result; end if;
    return jsonb_build_object('ok',false,'code','mutation-id-reused');
  end if;

  v_command := p_payload->'command';
  if p_action='schedule.edit' then
    if jsonb_typeof(v_command)<>'object'
       or exists(select 1 from jsonb_object_keys(v_command) k
         where k not in ('op','title','locationLabel','startsAt','kind'))
    then return jsonb_build_object('ok',false,'code','invalid-training'); end if;
    if v_command->>'op'='create' and p_resource=p_team
       and v_expected=0 and v_command->>'kind'='training'
       and char_length(coalesce(v_command->>'title','')) between 1 and 120
       and char_length(coalesce(v_command->>'locationLabel',''))<=120
       and v_command->>'startsAt' is not null
    then
      v_resource := 'training-' || replace(gen_random_uuid()::text,'-','');
      insert into tm_private.sessions(session_id,team_id,kind,starts_at,title,location_label)
        values(v_resource,p_team,'training',(v_command->>'startsAt')::timestamptz,
          v_command->>'title',coalesce(v_command->>'locationLabel',''));
      v_version := 0;
    elsif v_command->>'op' in ('update','cancel')
      and not (v_command ? 'kind') and p_resource<>p_team
    then
      if v_command->>'op'='update' and
         (char_length(coalesce(v_command->>'title','x')) not between 1 and 120
           or char_length(coalesce(v_command->>'locationLabel',''))>120
           or not (v_command ? 'title' or v_command ? 'startsAt' or v_command ? 'locationLabel'))
      then return jsonb_build_object('ok',false,'code','invalid-training'); end if;
      if v_command->>'op'='cancel' and (v_command - 'op')<>'{}'::jsonb
      then return jsonb_build_object('ok',false,'code','invalid-training'); end if;
      update tm_private.sessions set
        title=case when v_command ? 'title' then v_command->>'title' else title end,
        starts_at=case when v_command ? 'startsAt' then
          (v_command->>'startsAt')::timestamptz else starts_at end,
        location_label=case when v_command ? 'locationLabel'
          then v_command->>'locationLabel' else location_label end,
        status=case when v_command->>'op'='cancel' then 'cancelled' else status end,
        resource_version=resource_version+1
        where session_id=p_resource and team_id=p_team and kind='training'
          and status='planned' and resource_version=v_expected
        returning resource_version into v_version;
      if v_version is null then
        return jsonb_build_object('ok',false,'code','stale-or-protected-session');
      end if;
    else return jsonb_build_object('ok',false,'code','invalid-training'); end if;

  elsif p_action='roster.edit' then
    if jsonb_typeof(v_command)<>'object'
       or exists(select 1 from jsonb_object_keys(v_command) k
          where k not in ('op','personId'))
       or v_command->>'personId' is null
       or v_command->>'personId' !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$'
       or p_resource<>p_team or v_command->>'op' not in ('nominate','withdraw')
    then return jsonb_build_object('ok',false,'code','invalid-roster'); end if;
    select x.resource_version into v_version from tm_private.participations x
      where x.team_id=p_team and x.person_id=v_command->>'personId';
    if not found and v_command->>'op'='nominate' and v_expected=0 then
      insert into tm_private.persons(person_id) values(v_command->>'personId')
        on conflict do nothing;
      insert into tm_private.participations(team_id,person_id,kind,status)
        values(p_team,v_command->>'personId','player','pending');
      v_version:=0;
    elsif found and v_command->>'op'='withdraw' and v_version=v_expected then
      -- Withdrawing from the team cannot erase previous club registrar
      -- verification evidence. Nomination must never reset an active player.
      update tm_private.participations set
        status='inactive',resource_version=resource_version+1
        where team_id=p_team and person_id=v_command->>'personId'
          and status <> 'inactive'
        returning resource_version into v_version;
      if v_version is null then
        return jsonb_build_object('ok',false,'code','stale-roster');
      end if;
    else return jsonb_build_object('ok',false,'code','stale-roster'); end if;
    v_resource:=v_command->>'personId';

  elsif p_action='availability.reply' then
    if p_payload->>'response' not in ('yes','no','maybe') or
       (p_payload - 'mutationId' - 'expectedVersion' - 'response')<>'{}'::jsonb
    then return jsonb_build_object('ok',false,'code','invalid-response'); end if;
    perform 1 from tm_private.sessions s where s.session_id=p_resource
      and s.team_id=p_team and s.status='planned';
    if not found then return jsonb_build_object('ok',false,'code','session-unavailable'); end if;
    select a.resource_version into v_version from tm_private.availability a
      where a.session_id=p_resource and a.team_id=p_team and a.person_id=v_person;
    if not found and v_expected=0 then
      insert into tm_private.availability(
        availability_id,session_id,team_id,person_id,response)
      values('availability-' || replace(gen_random_uuid()::text,'-',''),
        p_resource,p_team,v_person,p_payload->>'response');
      v_version:=0;
    elsif v_version=v_expected then
      update tm_private.availability set response=p_payload->>'response',
        resource_version=resource_version+1
      where session_id=p_resource and team_id=p_team and person_id=v_person
      returning resource_version into v_version;
    else return jsonb_build_object('ok',false,'code','stale-availability'); end if;

  elsif p_action='duty.assign' then
    if p_role<>'team_manager' or p_resource<>p_team or v_expected<>0
       or jsonb_typeof(v_command)<>'object'
       or exists(select 1 from jsonb_object_keys(v_command) k
          where k not in ('op','sessionId','personId'))
       or v_command->>'op'<>'assign'
       or v_command->>'sessionId' is null or v_command->>'personId' is null
    then return jsonb_build_object('ok',false,'code','invalid-duty'); end if;
    perform 1 from tm_private.sessions s where s.team_id=p_team
      and s.session_id=v_command->>'sessionId' and s.status='planned';
    if not found then return jsonb_build_object('ok',false,'code','session-unavailable'); end if;
    -- Independently verified link and active volunteer grant; duty is not a role.
    perform 1 from tm_private.role_grants g
      join tm_private.account_person_links l on l.user_id=g.user_id
      join tm_private.accounts volunteer_account on volunteer_account.user_id=g.user_id
      where volunteer_account.status='active' and g.team_id=p_team and g.role='team_volunteer' and g.status='active'
        and g.policy_version=1 and ((g.approved_by is not null
        and g.approved_by<>g.user_id) or tm_private.stage3d4_founder_coach(g.user_id,g.team_id,g.grant_id))
        and (g.valid_from is null or g.valid_from<=v_now)
        and (g.expires_at is null or v_now<g.expires_at)
        and l.person_id=v_command->>'personId' and l.status='verified'
        and l.verified_by is not null and l.verified_by<>l.user_id;
    if not found then return jsonb_build_object('ok',false,'code','volunteer-not-verified'); end if;
    v_resource:='duty-' || replace(gen_random_uuid()::text,'-','');
    insert into tm_private.duties(
      duty_id,session_id,team_id,person_id,status,approved_by,approved_at)
      values(v_resource,v_command->>'sessionId',p_team,
        v_command->>'personId','assigned',p_account,v_now);
    v_version:=0;

  elsif p_action='duty.reply' then
    if p_payload->>'response' not in ('yes','no','done') or
       (p_payload - 'mutationId' - 'expectedVersion' - 'response')<>'{}'::jsonb
    then return jsonb_build_object('ok',false,'code','invalid-response'); end if;
    select d.status,d.resource_version into v_status,v_version
      from tm_private.duties d where d.duty_id=p_resource
        and d.team_id=p_team and d.person_id=v_person;
    if not found then return jsonb_build_object('ok',false,'code','duty-not-assigned'); end if;
    if v_version<>v_expected or
      (v_status not in ('assigned','confirmed')) or
      (p_payload->>'response'='done' and v_status<>'confirmed')
    then return jsonb_build_object('ok',false,'code','stale-or-invalid-duty'); end if;
    update tm_private.duties set response=p_payload->>'response',
      status=case p_payload->>'response' when 'yes' then 'confirmed'
        when 'no' then 'revoked' else 'completed' end,
      resource_version=resource_version+1
      where duty_id=p_resource and team_id=p_team and person_id=v_person
        and resource_version=v_expected
      returning resource_version into v_version;
  else return jsonb_build_object('ok',false,'code','invalid-command'); end if;

  v_result:=jsonb_build_object('ok',true,'code','committed',
    'resourceId',v_resource,'version',v_version);
  insert into tm_private.audit_events(at,user_id,team_id,action,resource_id,
    decision,mutation_id,reason_code)
  values(v_now,p_account,p_team,p_action,v_resource,'ALLOW',v_mutation,'committed');
  insert into tm_private.mutation_receipts(
    user_id,team_id,mutation_id,action,request_sha256,resource_id,
    expected_version,committed_result)
  values(p_account,p_team,v_mutation,p_action,p_digest,
    v_resource,v_expected,v_result);
  return v_result;
end;
$$;

-- Updated public.tm_stage2_play_operation (based on supabase/migrations/20261119020000_stage2_play_revisions.sql)
create or replace function public.tm_stage2_play_operation(
  p_account uuid, p_team text, p_role text, p_action text,
  p_resource text, p_payload jsonb, p_digest text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_person text;
  v_command jsonb;
  v_play jsonb;
  v_existing tm_private.mutation_receipts%rowtype;
  v_mutation text;
  v_expected integer;
  v_version integer;
  v_play_id text := p_resource;
  v_revision text;
  v_latest text;
  v_result jsonb;
  v_data jsonb;
  v_write boolean;
begin
  if p_account is null or p_team is null or
    p_team !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$'
    or p_resource is null or p_resource !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$'
    or p_payload is null or jsonb_typeof(p_payload)<>'object'
    or p_role not in ('team_coach','team_assistant','team_manager',
      'team_player','team_play_viewer')
    or p_action not in ('play.published.read','play.draft.read',
      'play.draft.edit','play.publish')
  then return jsonb_build_object('ok',false,'code','invalid-command'); end if;
  v_write:=p_action in ('play.draft.edit','play.publish');
  if v_write then
    if p_digest is null or p_digest !~ '^[0-9a-f]{64}$'
      or coalesce(p_payload->>'mutationId','') !~ '^[A-Za-z0-9][A-Za-z0-9_-]{15,79}$'
      or coalesce(p_payload->>'expectedVersion','') !~ '^(0|[1-9][0-9]{0,9})$'
      or (p_payload->>'expectedVersion')::bigint>2147483647
    then return jsonb_build_object('ok',false,'code','invalid-mutation'); end if;
    v_mutation:=p_payload->>'mutationId';
    v_expected:=(p_payload->>'expectedVersion')::integer;
    if p_payload ?| array['accountId','personId','approvedBy','roleGrant','teamId','verified']
    then return jsonb_build_object('ok',false,'code','forged-field'); end if;
  elsif p_payload<>'{}'::jsonb or p_digest is not null then
    return jsonb_build_object('ok',false,'code','invalid-read');
  end if;

  -- Serialise modifications across both published and draft revisions.
  if v_write then
    perform 1 from tm_private.teams t where t.team_id=p_team
      and t.status='active' for update;
  else
    perform 1 from tm_private.teams t where t.team_id=p_team
      and t.status='active';
  end if;
  if not found then return jsonb_build_object('ok',false,'code','scope-denied'); end if;
  perform 1 from tm_private.accounts a where a.user_id=p_account
    and a.status='active' for share;
  if not found then return jsonb_build_object('ok',false,'code','account-inactive'); end if;
  perform 1 from tm_private.role_grants g
    where g.user_id=p_account and g.team_id=p_team
      and g.role=p_role and g.status='active' and g.policy_version=1
      and ((g.approved_by is not null and g.approved_by<>p_account) or tm_private.stage3d4_founder_coach(g.user_id,g.team_id,g.grant_id))
      and (g.valid_from is null or g.valid_from<=v_now)
      and (g.expires_at is null or v_now<g.expires_at);
  if not found then return jsonb_build_object('ok',false,'code','scope-denied'); end if;
  if (p_action='play.draft.read' and p_role not in ('team_coach','team_assistant'))
     or (p_action='play.draft.edit' and p_role not in ('team_coach','team_assistant'))
     or (p_action='play.publish' and p_role<>'team_coach')
     or (p_action='play.published.read' and p_role not in
       ('team_coach','team_assistant','team_manager','team_player','team_play_viewer'))
  then return jsonb_build_object('ok',false,'code','role-denied'); end if;

  if p_role='team_player' then
    select l.person_id into v_person from tm_private.account_person_links l
      join tm_private.persons pe on pe.person_id=l.person_id
      where l.user_id=p_account and l.status='verified'
        and l.verified_by is not null and l.verified_by<>p_account
        and l.verified_at is not null and pe.lifecycle='active' limit 1;
    if v_person is null then
      return jsonb_build_object('ok',false,'code','person-not-verified'); end if;
    perform 1 from tm_private.participations p
      where p.team_id=p_team and p.person_id=v_person
        and p.status='active' and p.verified_by is not null
        and p.verified_at is not null;
    if not found then
      return jsonb_build_object('ok',false,'code','participation-not-verified'); end if;
  end if;

  if not v_write then
    if p_resource<>p_team then
      return jsonb_build_object('ok',false,'code','resource-out-of-scope'); end if;
    if p_action='play.published.read' then
      select coalesce(jsonb_agg(jsonb_build_object(
        'playId',p.play_id,'version',p.resource_version,
        'revisionId',r.revision_id,'play',(
          -- The original E5 player export uses this exact top-level allowlist.
          -- Keep coach-only or future fields in the private draft source.
          select coalesce(jsonb_object_agg(e.key,e.value),'{}'::jsonb)
          from jsonb_each(r.e5_payload) e
          where e.key=any(array[
            'id','name','sport','category','headline','when','steps',
            'side','builtin','rev','edited','players','defence','moves',
            'focus','ghost','view','tags','notes','labels','title',
            'phases','set','who','study','rules','eventTimeline'
          ])
        ))
        order by p.play_id),'[]'::jsonb)
      into v_data from tm_private.plays p
        join tm_private.play_revisions r
          on r.play_id=p.play_id and r.revision_id=p.published_revision_id
      where p.team_id=p_team and p.publication_state='published'
        and r.status='published';
    else
      select coalesce(jsonb_agg(jsonb_build_object(
        'playId',p.play_id,'version',p.resource_version,
        'revisionId',r.revision_id,'revisionStatus',r.status,
        'publishedRevisionId',p.published_revision_id,'play',r.e5_payload)
        order by p.play_id),'[]'::jsonb)
      into v_data from tm_private.plays p
        join lateral (
          select * from tm_private.play_revisions rev
          where rev.play_id=p.play_id order by rev.revision_number desc limit 1
        ) r on true
      where p.team_id=p_team and p.publication_state<>'archived';
    end if;
    return jsonb_build_object('ok',true,'code','permitted','data',v_data);
  end if;

  select * into v_existing from tm_private.mutation_receipts r
    where r.user_id=p_account and r.team_id=p_team and r.mutation_id=v_mutation
    for update;
  if found then
    if v_existing.request_sha256=p_digest and v_existing.committed_result is not null
    then return v_existing.committed_result; end if;
    return jsonb_build_object('ok',false,'code','mutation-id-reused');
  end if;

  if p_action='play.draft.edit' then
    if (p_payload-'mutationId'-'expectedVersion'-'command')<>'{}'::jsonb
      or jsonb_typeof(p_payload->'command')<>'object'
    then return jsonb_build_object('ok',false,'code','invalid-play'); end if;
    v_command:=p_payload->'command';
    v_play:=v_command->'play';
    if (v_command-'op'-'play')<>'{}'::jsonb
      or v_command->>'op' not in ('create','save')
      or jsonb_typeof(v_play)<>'object'
      or pg_catalog.octet_length(v_play::text)>65536
      or jsonb_typeof(v_play->'name')<>'string'
      or char_length(v_play->>'name') not between 1 and 120
      or jsonb_typeof(v_play->'moves')<>'array'
      or jsonb_typeof(v_play->'players') not in ('object','array')
      or (v_play ? 'phases' and jsonb_typeof(v_play->'phases')<>'array')
      or (v_play ? 'eventTimeline' and jsonb_typeof(v_play->'eventTimeline')<>'object')
      or v_play ?| array['password','token','phone','email','medical','guardian',
        'accountId','personId','privateContacts']
    then return jsonb_build_object('ok',false,'code','invalid-play'); end if;
    if v_command->>'op'='create' and p_resource=p_team and v_expected=0 then
      v_play_id:='play-'||replace(gen_random_uuid()::text,'-','');
      insert into tm_private.plays(play_id,team_id,publication_state)
        values(v_play_id,p_team,'draft');
      v_version:=0;
      v_latest:=null;
    elsif v_command->>'op'='save' and p_resource<>p_team then
      select p.resource_version into v_version from tm_private.plays p
        where p.play_id=p_resource and p.team_id=p_team
          and p.publication_state<>'archived';
      if not found or v_version<>v_expected then
        return jsonb_build_object('ok',false,'code','stale-play'); end if;
      update tm_private.plays p set resource_version=resource_version+1
        where p.play_id=p_resource and p.team_id=p_team
          and p.resource_version=v_expected returning resource_version into v_version;
      if v_version is null then
        return jsonb_build_object('ok',false,'code','stale-play'); end if;
      update tm_private.play_revisions set status='superseded'
        where play_id=v_play_id and status='draft';
    else return jsonb_build_object('ok',false,'code','invalid-play'); end if;
    v_revision:='rev-'||replace(gen_random_uuid()::text,'-','');
    insert into tm_private.play_revisions(
      revision_id,play_id,revision_number,status,e5_payload,created_by)
    values(v_revision,v_play_id,
      (select coalesce(max(revision_number),0)+1 from tm_private.play_revisions
        where play_id=v_play_id),'draft',v_play,p_account);
  elsif p_action='play.publish' then
    if (p_payload-'mutationId'-'expectedVersion'-'revisionId')<>'{}'::jsonb
      or coalesce(p_payload->>'revisionId','') !~
        '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$'
      or p_resource=p_team
    then return jsonb_build_object('ok',false,'code','invalid-play'); end if;
    select p.resource_version into v_version from tm_private.plays p
      where p.play_id=p_resource and p.team_id=p_team
        and p.publication_state<>'archived';
    if not found or v_version<>v_expected then
      return jsonb_build_object('ok',false,'code','stale-play'); end if;
    select r.revision_id into v_latest from tm_private.play_revisions r
      where r.play_id=p_resource order by r.revision_number desc limit 1;
    if v_latest is null or v_latest<>p_payload->>'revisionId' or
      not exists(select 1 from tm_private.play_revisions
        where revision_id=v_latest and play_id=p_resource and status='draft')
    then return jsonb_build_object('ok',false,'code','revision-not-draft'); end if;
    update tm_private.play_revisions set status='superseded'
      where play_id=p_resource and status='published';
    update tm_private.play_revisions set status='published'
      where revision_id=v_latest and play_id=p_resource and status='draft';
    update tm_private.plays set published_revision_id=v_latest,
      publication_state='published',resource_version=resource_version+1
      where play_id=p_resource and team_id=p_team
        and resource_version=v_expected returning resource_version into v_version;
    v_revision:=v_latest;
  else return jsonb_build_object('ok',false,'code','invalid-command'); end if;

  v_result:=jsonb_build_object('ok',true,'code','committed',
    'resourceId',v_play_id,'version',v_version,'revisionId',v_revision);
  insert into tm_private.audit_events(at,user_id,team_id,action,resource_id,
    decision,mutation_id,reason_code)
  values(v_now,p_account,p_team,p_action,v_play_id,'ALLOW',v_mutation,'committed');
  insert into tm_private.mutation_receipts(
    user_id,team_id,mutation_id,action,request_sha256,resource_id,
    expected_version,committed_result)
  values(p_account,p_team,v_mutation,p_action,p_digest,
    v_play_id,v_expected,v_result);
  return v_result;
end;
$$;

-- Updated public.tm_stage3_onboarding (based on supabase/migrations/20261119040000_stage3a_onboarding.sql)
create or replace function public.tm_stage3_onboarding(
  p_actor uuid, p_actor_email text, p_team text, p_role text,
  p_action text, p_invitation text, p_email text, p_target_role text
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  now_at timestamptz:=pg_catalog.now();
  actor_email text:=pg_catalog.lower(pg_catalog.btrim(coalesce(p_actor_email,'')));
  target_email text:=pg_catalog.lower(pg_catalog.btrim(coalesce(p_email,'')));
  invite tm_private.team_invitations%rowtype;
  own_person text;
  new_id text;
  new_grant text;
  entries jsonb;
begin
  if p_actor is null or actor_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
     or length(actor_email)>254
     or p_action not in ('list.mine','list.team','propose','approve','deliver',
                         'claim','activate','revoke','cancel')
  then return pg_catalog.jsonb_build_object('ok',false,'code','invalid-request'); end if;

  -- Before granting any role, an invited account can see only invitations
  -- for its verified email, with no other person's email or private records.
  if p_action='list.mine' then
    select coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('invitationId',i.invitation_id,
        'teamId',i.team_id,'teamRole',i.team_role,
        'status',i.status,'expiresAt',i.expires_at)
      order by i.created_at desc),'[]'::jsonb) into entries
    from tm_private.team_invitations i
    where i.email=actor_email and i.status in ('approved','claimed','activated')
      and i.expires_at>now_at;
    return pg_catalog.jsonb_build_object('ok',true,'code','permitted','data',entries);
  end if;

  if p_action='claim' then
    if p_invitation is null then
      return pg_catalog.jsonb_build_object('ok',false,'code','invalid-request'); end if;
    select * into invite from tm_private.team_invitations i
      where i.invitation_id=p_invitation for update;
    if not found or invite.email<>actor_email then
      return pg_catalog.jsonb_build_object('ok',false,'code','invitation-unavailable'); end if;
    if invite.status<>'approved' or invite.expires_at<=now_at then
      return pg_catalog.jsonb_build_object('ok',false,'code','invitation-unavailable'); end if;
    if exists(select 1 from tm_private.accounts a
      where a.user_id=p_actor and a.status in ('disabled','archived')) then
      return pg_catalog.jsonb_build_object('ok',false,'code','account-inactive'); end if;
    if exists(select 1 from tm_private.role_grants g where
       g.user_id=p_actor and g.team_id=invite.team_id and
       g.role=invite.team_role and g.status='active') then
      return pg_catalog.jsonb_build_object('ok',false,'code','already-active'); end if;
    insert into tm_private.accounts(user_id,status) values(p_actor,'active')
      on conflict(user_id) do nothing;
    select l.person_id into own_person from tm_private.account_person_links l
      where l.user_id=p_actor and l.status in ('verified','pending')
      order by case when l.status='verified' then 0 else 1 end limit 1 for update;
    if own_person is null then
      own_person:='person-'||pg_catalog.replace(gen_random_uuid()::text,'-','');
      insert into tm_private.persons(person_id,lifecycle) values(own_person,'active');
      insert into tm_private.account_person_links(user_id,person_id,status)
        values(p_actor,own_person,'pending');
    end if;
    new_grant:='grant-'||pg_catalog.replace(gen_random_uuid()::text,'-','');
    insert into tm_private.role_grants(grant_id,user_id,team_id,role,status)
      values(new_grant,p_actor,invite.team_id,invite.team_role,'proposed');
    update tm_private.team_invitations set
      status='claimed',claimed_by=p_actor,person_id=own_person,
      grant_id=new_grant,claimed_at=now_at,updated_at=now_at
      where invitation_id=invite.invitation_id;
    insert into tm_private.audit_events(user_id,team_id,action,resource_id,
      decision,reason_code) values(p_actor,invite.team_id,
      'onboarding.claim',invite.invitation_id,'ALLOW','pending-independent-review');
    return pg_catalog.jsonb_build_object('ok',true,'code','claimed',
      'invitationId',invite.invitation_id);
  end if;

  -- Reviewers must already have a separately approved active exact-team
  -- Coach or Manager grant. Platform Owner alone confers no review authority.
  if p_team is null or p_team !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$'
     or p_role not in ('team_coach','team_manager')
     or not exists (
       select 1 from tm_private.accounts a
       join tm_private.role_grants g on g.user_id=a.user_id
       join tm_private.teams t on t.team_id=g.team_id
       where a.user_id=p_actor and a.status='active'
         and g.team_id=p_team and t.status='active'
         and g.role=p_role and g.status='active'
         and g.policy_version=1 and ((g.approved_by is not null
         and g.approved_by<>p_actor) or tm_private.stage3d4_founder_coach(g.user_id,g.team_id,g.grant_id)) and g.approved_at is not null
         and (g.valid_from is null or g.valid_from<=now_at)
         and (g.expires_at is null or now_at<g.expires_at)
     )
  then return pg_catalog.jsonb_build_object('ok',false,'code','scope-denied'); end if;

  -- Serialise state transitions for each team and prevent concurrent
  -- reviewers issuing contradictory grants or duplicate pending invitations.
  perform 1 from tm_private.teams t where t.team_id=p_team for update;
  if p_action='list.team' then
    select coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('invitationId',i.invitation_id,
        'email',i.email,'teamRole',i.team_role,'status',i.status,
        'delivery',i.delivery_status,'expiresAt',i.expires_at,
        'proposedByMe',i.proposed_by=p_actor,
        'canReview',i.proposed_by<>p_actor and
          (i.claimed_by is null or i.claimed_by<>p_actor))
        order by i.created_at desc),'[]'::jsonb) into entries
    from tm_private.team_invitations i where i.team_id=p_team
      and i.status<>'revoked' and i.created_at>now_at-interval '30 days';
    return pg_catalog.jsonb_build_object('ok',true,'code','permitted','data',entries);
  end if;

  if p_action='propose' then
    if p_invitation is not null
       or target_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
       or length(target_email)>254 or target_email=actor_email
       or p_target_role not in ('team_coach','team_manager','team_assistant',
                                'team_player','team_volunteer')
    then return pg_catalog.jsonb_build_object('ok',false,'code','invalid-request'); end if;
    if exists(select 1 from tm_private.team_invitations i where i.team_id=p_team
      and i.email=target_email and i.team_role=p_target_role and
      i.status in ('proposed','approved','claimed') and i.expires_at>now_at)
    then return pg_catalog.jsonb_build_object('ok',false,'code','already-pending'); end if;
    new_id:='invite-'||pg_catalog.replace(gen_random_uuid()::text,'-','');
    insert into tm_private.team_invitations(
      invitation_id,team_id,email,team_role,proposed_by)
    values(new_id,p_team,target_email,p_target_role,p_actor);
    insert into tm_private.audit_events(user_id,team_id,action,resource_id,
      decision,reason_code) values(p_actor,p_team,'onboarding.propose',
        new_id,'ALLOW','requires-independent-review');
    return pg_catalog.jsonb_build_object('ok',true,'code','proposed',
      'invitationId',new_id);
  end if;

  if p_invitation is null or p_invitation !~ '^invite-[0-9a-f]{32}$' then
    return pg_catalog.jsonb_build_object('ok',false,'code','invalid-request'); end if;
  select * into invite from tm_private.team_invitations i
    where i.invitation_id=p_invitation and i.team_id=p_team for update;
  if not found then
    return pg_catalog.jsonb_build_object('ok',false,'code','invitation-unavailable'); end if;
  if invite.proposed_by=p_actor or invite.email=actor_email or
    invite.claimed_by=p_actor then
    return pg_catalog.jsonb_build_object('ok',false,'code','self-approval-denied'); end if;

  if p_action='approve' then
    if invite.status<>'proposed' or invite.expires_at<=now_at then
      return pg_catalog.jsonb_build_object('ok',false,'code','invitation-unavailable'); end if;
    update tm_private.team_invitations set status='approved',approved_by=p_actor,
      approved_at=now_at,updated_at=now_at where invitation_id=p_invitation;
    insert into tm_private.audit_events(user_id,team_id,action,resource_id,
      decision,reason_code) values(p_actor,p_team,'onboarding.approve',
        p_invitation,'ALLOW','approved-independent-review');
    -- Internal-only email is stripped by the Worker. Never return to browser.
    return pg_catalog.jsonb_build_object('ok',true,'code','approved',
      'invitationId',p_invitation,'internalEmail',invite.email);
  end if;

  if p_action='deliver' then
    if invite.status<>'approved' or invite.expires_at<=now_at then
      return pg_catalog.jsonb_build_object('ok',false,'code','invitation-unavailable'); end if;
    return pg_catalog.jsonb_build_object('ok',true,'code','approved',
      'invitationId',p_invitation,'internalEmail',invite.email);
  end if;

  if p_action='activate' then
    if invite.status<>'claimed' or invite.expires_at<=now_at
       or invite.claimed_by is null
       or invite.grant_id is null or invite.person_id is null then
      return pg_catalog.jsonb_build_object('ok',false,'code','invitation-unavailable'); end if;
    if invite.approved_by is null or invite.approved_by=invite.proposed_by
       or invite.approved_by=invite.claimed_by then
      return pg_catalog.jsonb_build_object('ok',false,'code','self-approval-denied'); end if;
    perform 1 from tm_private.accounts a
      where a.user_id=invite.claimed_by and a.status='active' for share;
    if not found then
      return pg_catalog.jsonb_build_object('ok',false,'code','account-inactive'); end if;
    -- Review is an explicit human confirmation of the account-to-person
    -- relationship. It does not verify registration, payment or eligibility.
    update tm_private.account_person_links set
      status='verified',verified_by=p_actor,verified_at=now_at
      where user_id=invite.claimed_by and person_id=invite.person_id
        and status='pending';
    if not found and not exists(select 1 from tm_private.account_person_links l
      where l.user_id=invite.claimed_by and l.person_id=invite.person_id
        and l.status='verified' and l.verified_by is not null
        and l.verified_by<>invite.claimed_by) then
      return pg_catalog.jsonb_build_object('ok',false,'code','person-not-verified'); end if;
    if invite.team_role='team_player' then
      insert into tm_private.participations(team_id,person_id,kind,status,
        verified_by,verified_at) values(p_team,invite.person_id,'player','active',
        p_actor,now_at)
      on conflict(team_id,person_id) do update set status='active',
        verified_by=excluded.verified_by,verified_at=excluded.verified_at;
    end if;
    update tm_private.role_grants set status='active',approved_by=p_actor,
      approved_at=now_at where grant_id=invite.grant_id
      and user_id=invite.claimed_by and team_id=p_team
      and role=invite.team_role and status='proposed';
    if not found then
      return pg_catalog.jsonb_build_object('ok',false,'code','invitation-unavailable'); end if;
    update tm_private.team_invitations set status='activated',updated_at=now_at
      where invitation_id=p_invitation;
    insert into tm_private.audit_events(user_id,team_id,action,resource_id,
      decision,reason_code) values(p_actor,p_team,'onboarding.activate',
        p_invitation,'ALLOW','human-review-team-role');
    return pg_catalog.jsonb_build_object('ok',true,'code','activated',
      'invitationId',p_invitation);
  end if;

  if p_action in ('revoke','cancel') then
    if p_action='revoke' and invite.status<>'activated' then
      return pg_catalog.jsonb_build_object('ok',false,'code','invitation-unavailable'); end if;
    if p_action='cancel' and invite.status not in ('proposed','approved','claimed') then
      return pg_catalog.jsonb_build_object('ok',false,'code','invitation-unavailable'); end if;
    if invite.grant_id is not null then
      update tm_private.role_grants set status='revoked'
        where grant_id=invite.grant_id and team_id=p_team and
          user_id=invite.claimed_by and status in ('active','proposed');
    end if;
    update tm_private.team_invitations set status='revoked',updated_at=now_at
      where invitation_id=p_invitation;
    insert into tm_private.audit_events(user_id,team_id,action,resource_id,
      decision,reason_code) values(p_actor,p_team,'onboarding.'||p_action,
        p_invitation,'ALLOW','exact-team-access-withdrawn');
    return pg_catalog.jsonb_build_object('ok',true,'code','revoked',
      'invitationId',p_invitation);
  end if;
  return pg_catalog.jsonb_build_object('ok',false,'code','invalid-request');
end;
$$;

-- Updated public.tm_stage3b_operation (based on supabase/migrations/20261119050000_stage3b_management.sql)
create or replace function public.tm_stage3b_operation(
  p_account uuid,p_team text,p_role text,p_action text,p_resource text,
  p_payload jsonb,p_digest text
) returns jsonb
language plpgsql volatile security definer set search_path=''
as $$
declare
 v_now timestamptz:=now();
 v_write boolean;
 v_person text;
 v_granted boolean;
 v_mutation text;
 v_expected integer;
 v_version integer;
 v_resource text:=p_resource;
 v_command jsonb;
 v_existing tm_private.mutation_receipts%rowtype;
 v_data jsonb;
 v_result jsonb;
 v_status text;
 v_type text;
begin
 if p_team is null or p_team !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$'
   or p_resource is null or p_resource !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$'
   or p_payload is null or pg_catalog.jsonb_typeof(p_payload)<>'object'
   or p_role not in ('team_coach','team_manager','team_assistant',
                     'team_player','team_volunteer')
   or p_action not in (
     'attendance.read','availability.board','duty.board','notices.read',
     'report.summary','roster.approve','event.create','event.change',
     'attendance.record','availability.transcribe','duty.label',
     'duty.withdraw','notice.create','notice.publish','notice.archive')
 then return pg_catalog.jsonb_build_object('ok',false,'code','invalid-command'); end if;

 v_write:=p_action not in ('attendance.read','availability.board',
    'duty.board','notices.read','report.summary');
 if v_write then
   if p_digest is null or p_digest !~ '^[0-9a-f]{64}$'
     or coalesce(p_payload->>'mutationId','') !~ '^[A-Za-z0-9][A-Za-z0-9_-]{15,79}$'
     or pg_catalog.jsonb_typeof(p_payload->'expectedVersion')<>'number'
     or coalesce(p_payload->>'expectedVersion','') !~ '^(0|[1-9][0-9]{0,9})$'
     or (p_payload->>'expectedVersion')::bigint>2147483647
     or pg_catalog.jsonb_typeof(p_payload->'command')<>'object'
     or (p_payload-'mutationId'-'expectedVersion'-'command')<>'{}'::jsonb
   then return pg_catalog.jsonb_build_object('ok',false,'code','invalid-mutation'); end if;
   v_mutation:=p_payload->>'mutationId';
   v_expected:=(p_payload->>'expectedVersion')::integer;
   v_command:=p_payload->'command';
   if v_command ?| array['accountId','teamId','approvedBy','verified','isAdmin',
        'roleGrant','userId','registered','eligible','accredited']
   then return pg_catalog.jsonb_build_object('ok',false,'code','forged-field'); end if;
 else
   if p_payload<>'{}'::jsonb or p_digest is not null
   then return pg_catalog.jsonb_build_object('ok',false,'code','invalid-read'); end if;
 end if;

 if v_write then
   perform 1 from tm_private.teams t
     where t.team_id=p_team and t.status='active' for update;
 else
   perform 1 from tm_private.teams t
     where t.team_id=p_team and t.status='active';
 end if;
 if not found then return pg_catalog.jsonb_build_object('ok',false,'code','scope-denied'); end if;
 perform 1 from tm_private.accounts a
   where a.user_id=p_account and a.status='active' for share;
 if not found then return pg_catalog.jsonb_build_object('ok',false,'code','account-inactive'); end if;
 select exists(select 1 from tm_private.role_grants g
   where g.user_id=p_account and g.team_id=p_team and g.role=p_role
    and g.status='active' and g.policy_version=1
    and ((g.approved_by is not null and g.approved_by<>p_account) or tm_private.stage3d4_founder_coach(g.user_id,g.team_id,g.grant_id))
    and g.approved_at is not null
    and (g.valid_from is null or g.valid_from<=v_now)
    and (g.expires_at is null or v_now<g.expires_at)) into v_granted;
 if not v_granted
 then return pg_catalog.jsonb_build_object('ok',false,'code','scope-denied'); end if;

 if (p_action in ('attendance.read','availability.board','duty.board',
                 'report.summary','roster.approve','event.create','event.change',
                 'attendance.record','notice.create','notice.publish','notice.archive')
       and p_role not in ('team_coach','team_manager'))
    or (p_action in ('availability.transcribe','duty.label','duty.withdraw')
       and p_role<>'team_manager')
    or (p_action='notices.read' and p_role not in
      ('team_coach','team_manager','team_assistant','team_player','team_volunteer'))
 then return pg_catalog.jsonb_build_object('ok',false,'code','role-denied'); end if;

 if p_role in ('team_player','team_volunteer') then
   select l.person_id into v_person from tm_private.account_person_links l
     join tm_private.persons person on person.person_id=l.person_id
     where l.user_id=p_account and l.status='verified'
       and l.verified_by is not null and l.verified_by<>l.user_id
       and l.verified_at is not null and person.lifecycle='active'
     limit 1;
   if v_person is null
   then return pg_catalog.jsonb_build_object('ok',false,'code','person-not-verified'); end if;
   if p_role='team_player' and not exists (
     select 1 from tm_private.participations p where p.team_id=p_team
       and p.person_id=v_person and p.status='active'
       and p.verified_by is not null and p.verified_at is not null)
   then return pg_catalog.jsonb_build_object('ok',false,'code','participation-not-verified'); end if;
 end if;

 if not v_write then
   if p_action in ('duty.board','notices.read','report.summary')
     and p_resource<>p_team then
     return pg_catalog.jsonb_build_object('ok',false,'code','resource-out-of-scope'); end if;
   if p_action in ('attendance.read','availability.board') and not exists (
     select 1 from tm_private.sessions s
       where s.team_id=p_team and s.session_id=p_resource and s.kind='training')
   then return pg_catalog.jsonb_build_object('ok',false,'code','resource-out-of-scope'); end if;
   if p_action='attendance.read' then
     select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
       'personId',p.person_id,'status',a.attendance_status,
       'version',coalesce(a.resource_version,0)) order by p.person_id),'[]'::jsonb)
       into v_data from tm_private.participations p
       left join tm_private.team_attendance a on a.team_id=p.team_id
         and a.person_id=p.person_id and a.session_id=p_resource
       where p.team_id=p_team and p.status='active';
   elsif p_action='availability.board' then
     select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
       'personId',p.person_id,'response',a.response,
       'source',coalesce(a.recorded_source,'none'),
       'version',coalesce(a.resource_version,0)) order by p.person_id),'[]'::jsonb)
       into v_data from tm_private.participations p
       left join tm_private.availability a on a.team_id=p.team_id
         and a.person_id=p.person_id and a.session_id=p_resource
       where p.team_id=p_team and p.status='active';
   elsif p_action='duty.board' then
     select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
       'dutyId',d.duty_id,'sessionId',d.session_id,
       'personId',d.person_id,'type',d.duty_type,
       'status',d.status,'response',d.response,
       'version',d.resource_version) order by d.duty_id),'[]'::jsonb)
       into v_data from (
         select * from tm_private.duties where team_id=p_team
           order by duty_id desc limit 100
       ) d;
   elsif p_action='notices.read' then
     select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
       'noticeId',n.notice_id,'title',n.title,'body',n.body,
       'audience',n.audience,'status',n.status,'version',n.resource_version,
       'createdAt',n.created_at)
       order by n.created_at desc,n.notice_id desc),'[]'::jsonb) into v_data
     from (select * from tm_private.team_notices n
       where n.team_id=p_team and n.status<>'archived'
       and (p_role in ('team_coach','team_manager') or
         (n.status='published' and (n.audience='all'
           or (n.audience='players' and p_role='team_player')
           or (n.audience='volunteers' and p_role='team_volunteer')
           or (n.audience='coaches' and p_role='team_assistant'))))
       order by n.created_at desc,n.notice_id desc limit 50) n;
   elsif p_action='report.summary' then
     select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
       'sessionId',s.session_id,'kind',s.kind,'title',s.title,
       'startsAt',s.starts_at,
       'activeRoster',case when x.roster_count between 1 and 4 then null else x.roster_count end,
       'availabilityYes',case when x.yes_count between 1 and 4 then null else x.yes_count end,
       'attendancePresent',case when x.present_count between 1 and 4 then null else x.present_count end,
       'volunteerAccepted',case when x.volunteer_count between 1 and 4 then null else x.volunteer_count end)
       order by s.starts_at desc,s.session_id),'[]'::jsonb) into v_data
     from (select * from tm_private.sessions where team_id=p_team
       and status<>'cancelled' order by starts_at desc nulls last limit 30) s,
     lateral (select
       (select count(*) from tm_private.participations p
         where p.team_id=p_team and p.status='active') as roster_count,
       (select count(*) from tm_private.availability a
         where a.team_id=p_team and a.session_id=s.session_id
           and a.response='yes') as yes_count,
       (select count(*) from tm_private.team_attendance a
         where a.team_id=p_team and a.session_id=s.session_id
           and a.attendance_status in ('present','late')) as present_count,
       (select count(*) from tm_private.duties d
         where d.team_id=p_team and d.session_id=s.session_id
           and d.status in ('confirmed','completed')) as volunteer_count
     ) x;
   end if;
   return pg_catalog.jsonb_build_object('ok',true,'code','permitted','data',v_data);
 end if;

 select * into v_existing from tm_private.mutation_receipts m
   where m.user_id=p_account and m.team_id=p_team and m.mutation_id=v_mutation
   for update;
 if found then
   if v_existing.request_sha256=p_digest and v_existing.committed_result is not null
   then return v_existing.committed_result; end if;
   return pg_catalog.jsonb_build_object('ok',false,'code','mutation-id-reused');
 end if;

 if p_action='roster.approve' then
   if p_resource=p_team or v_command<>'{"op":"approve"}'::jsonb
   then return pg_catalog.jsonb_build_object('ok',false,'code','invalid-roster'); end if;
   update tm_private.participations set
     status='active',verified_by=p_account,verified_at=v_now,
     resource_version=resource_version+1
     where team_id=p_team and person_id=p_resource and status='pending'
       and resource_version=v_expected
     returning resource_version into v_version;
   if v_version is null then
     return pg_catalog.jsonb_build_object('ok',false,'code','stale-roster'); end if;
 elsif p_action='event.create' then
   if p_resource<>p_team or v_expected<>0
     or v_command->>'kind' not in ('friendly','activity')
     or exists(select 1 from pg_catalog.jsonb_object_keys(v_command) k
       where k not in ('kind','title','locationLabel','startsAt'))
     or coalesce(length(pg_catalog.btrim(v_command->>'title')),0) not between 1 and 120
     or coalesce(length(v_command->>'locationLabel'),0)>120
     or (v_command->>'startsAt') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T'
   then return pg_catalog.jsonb_build_object('ok',false,'code','invalid-event'); end if;
   v_type:=v_command->>'kind';
   v_resource:='event-'||pg_catalog.replace(gen_random_uuid()::text,'-','');
   insert into tm_private.sessions(session_id,team_id,kind,starts_at,title,
       location_label,management_origin)
     values(v_resource,p_team,case when v_type='friendly' then 'match' else 'other' end,
       (v_command->>'startsAt')::timestamptz,
       pg_catalog.btrim(v_command->>'title'),
       coalesce(pg_catalog.btrim(v_command->>'locationLabel'),''),
       case when v_type='friendly' then 'team-friendly' else 'team-activity' end);
   v_version:=0;
 elsif p_action='event.change' then
   if v_command->>'op' not in ('reschedule','cancel')
      or (v_command->>'op'='cancel' and v_command<>'{"op":"cancel"}'::jsonb)
      or (v_command->>'op'='reschedule' and
        (v_command->>'startsAt' is null or
         (v_command->>'startsAt') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T'
         or exists(select 1 from pg_catalog.jsonb_object_keys(v_command) k
           where k not in ('op','startsAt','title','locationLabel'))
         or coalesce(length(pg_catalog.btrim(v_command->>'title')),1) not between 1 and 120
         or coalesce(length(v_command->>'locationLabel'),0)>120))
   then return pg_catalog.jsonb_build_object('ok',false,'code','invalid-event'); end if;
   update tm_private.sessions set
     status=case when v_command->>'op'='cancel' then 'cancelled' else status end,
     starts_at=case when v_command->>'op'='reschedule'
       then (v_command->>'startsAt')::timestamptz else starts_at end,
     title=case when v_command ? 'title' then pg_catalog.btrim(v_command->>'title') else title end,
     location_label=case when v_command ? 'locationLabel'
       then pg_catalog.btrim(v_command->>'locationLabel') else location_label end,
     resource_version=resource_version+1
     where session_id=p_resource and team_id=p_team
       and management_origin in ('team-friendly','team-activity')
       and status='planned' and resource_version=v_expected
     returning resource_version into v_version;
   if v_version is null then
     return pg_catalog.jsonb_build_object('ok',false,'code','stale-or-external-event'); end if;
 elsif p_action='attendance.record' then
   if v_command->>'status' not in ('present','absent','late','excused')
      or coalesce(v_command->>'personId','') !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$'
      or exists(select 1 from pg_catalog.jsonb_object_keys(v_command) k
        where k not in ('personId','status'))
      or not exists(select 1 from tm_private.sessions s
        where s.team_id=p_team and s.session_id=p_resource
          and s.kind='training' and s.status<>'cancelled')
      or not exists(select 1 from tm_private.participations p
        where p.team_id=p_team and p.person_id=v_command->>'personId'
          and p.status='active' and p.verified_by is not null)
   then return pg_catalog.jsonb_build_object('ok',false,'code','invalid-attendance'); end if;
   select a.resource_version into v_version from tm_private.team_attendance a
     where a.session_id=p_resource and a.person_id=v_command->>'personId'
     for update;
   if not found and v_expected=0 then
     insert into tm_private.team_attendance(
       session_id,team_id,person_id,attendance_status,recorded_by)
       values(p_resource,p_team,v_command->>'personId',v_command->>'status',p_account);
     v_version:=0;
   elsif v_version=v_expected then
     update tm_private.team_attendance set attendance_status=v_command->>'status',
       recorded_by=p_account,recorded_at=v_now,
       resource_version=resource_version+1
       where session_id=p_resource and team_id=p_team
         and person_id=v_command->>'personId' and resource_version=v_expected
       returning resource_version into v_version;
   else return pg_catalog.jsonb_build_object('ok',false,'code','stale-attendance'); end if;
 elsif p_action='availability.transcribe' then
   if p_role<>'team_manager' or
      v_command->>'response' not in ('yes','no','maybe')
      or v_command->>'source' not in ('phone','in_person','email')
      or coalesce(v_command->>'personId','') !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$'
      or exists(select 1 from pg_catalog.jsonb_object_keys(v_command) k
        where k not in ('personId','response','source'))
      or not exists(select 1 from tm_private.sessions s
        where s.team_id=p_team and s.session_id=p_resource and s.status='planned')
      or not exists(select 1 from tm_private.participations p
        where p.team_id=p_team and p.person_id=v_command->>'personId'
          and p.status='active')
   then return pg_catalog.jsonb_build_object('ok',false,'code','invalid-availability'); end if;
   select a.resource_version into v_version from tm_private.availability a
     where a.session_id=p_resource and a.person_id=v_command->>'personId' for update;
   if not found and v_expected=0 then
     insert into tm_private.availability(availability_id,session_id,team_id,
       person_id,response,recorded_source,recorded_by,recorded_at)
       values('availability-'||pg_catalog.replace(gen_random_uuid()::text,'-',''),
         p_resource,p_team,v_command->>'personId',v_command->>'response',
         v_command->>'source',p_account,v_now);
     v_version:=0;
   elsif v_version=v_expected then
     update tm_private.availability set response=v_command->>'response',
       recorded_source=v_command->>'source',recorded_by=p_account,
       recorded_at=v_now,resource_version=resource_version+1
       where session_id=p_resource and team_id=p_team
         and person_id=v_command->>'personId' and resource_version=v_expected
       returning resource_version into v_version;
   else return pg_catalog.jsonb_build_object('ok',false,'code','stale-availability'); end if;
 elsif p_action='duty.label' then
   if p_role<>'team_manager' or v_command->>'type' not in
       ('general_help','setup','equipment','scorer_support')
      or (v_command-'type')<>'{}'::jsonb
   then return pg_catalog.jsonb_build_object('ok',false,'code','invalid-duty'); end if;
   update tm_private.duties set duty_type=v_command->>'type',
     resource_version=resource_version+1
     where duty_id=p_resource and team_id=p_team and
       status in ('assigned','confirmed') and resource_version=v_expected
     returning resource_version into v_version;
   if v_version is null then
     return pg_catalog.jsonb_build_object('ok',false,'code','stale-or-invalid-duty'); end if;
 elsif p_action='duty.withdraw' then
   if p_role<>'team_manager' or v_command<>'{"op":"withdraw"}'::jsonb
   then return pg_catalog.jsonb_build_object('ok',false,'code','invalid-duty'); end if;
   update tm_private.duties set status='revoked',
     resource_version=resource_version+1
     where duty_id=p_resource and team_id=p_team and
       status in ('assigned','confirmed') and resource_version=v_expected
     returning resource_version into v_version;
   if v_version is null then
     return pg_catalog.jsonb_build_object('ok',false,'code','stale-or-invalid-duty'); end if;
 elsif p_action='notice.create' then
   if p_resource<>p_team or v_expected<>0 or
      v_command->>'audience' not in ('all','players','volunteers','coaches')
      or coalesce(length(pg_catalog.btrim(v_command->>'title')),0) not between 1 and 100
      or coalesce(length(pg_catalog.btrim(v_command->>'body')),0) not between 1 and 1000
      or (v_command->>'title') ~ '[[:cntrl:]]'
      or (v_command->>'body') ~ '[[:cntrl:]]'
      or exists(select 1 from pg_catalog.jsonb_object_keys(v_command) k
        where k not in ('title','body','audience'))
   then return pg_catalog.jsonb_build_object('ok',false,'code','invalid-notice'); end if;
   v_resource:='notice-'||pg_catalog.replace(gen_random_uuid()::text,'-','');
   insert into tm_private.team_notices(notice_id,team_id,author_id,
     title,body,audience)
     values(v_resource,p_team,p_account,pg_catalog.btrim(v_command->>'title'),
       pg_catalog.btrim(v_command->>'body'),v_command->>'audience');
   v_version:=0;
 elsif p_action in ('notice.publish','notice.archive') then
   if (p_action='notice.publish' and v_command<>'{"op":"publish"}'::jsonb)
      or (p_action='notice.archive' and v_command<>'{"op":"archive"}'::jsonb)
   then return pg_catalog.jsonb_build_object('ok',false,'code','invalid-notice'); end if;
   update tm_private.team_notices set
      status=case when p_action='notice.publish' then 'published' else 'archived' end,
      published_at=case when p_action='notice.publish' then v_now else published_at end,
      resource_version=resource_version+1
     where notice_id=p_resource and team_id=p_team and
       ((p_action='notice.publish' and status='draft')
         or (p_action='notice.archive' and status in ('draft','published')))
       and resource_version=v_expected
     returning resource_version into v_version;
   if v_version is null then
     return pg_catalog.jsonb_build_object('ok',false,'code','stale-notice'); end if;
 else
   return pg_catalog.jsonb_build_object('ok',false,'code','invalid-command');
 end if;

 v_result:=pg_catalog.jsonb_build_object(
   'ok',true,'code','committed','resourceId',v_resource,'version',v_version);
 insert into tm_private.audit_events(at,user_id,team_id,action,resource_id,
   decision,mutation_id,reason_code)
 values(v_now,p_account,p_team,p_action,v_resource,'ALLOW',v_mutation,'committed');
 insert into tm_private.mutation_receipts(
    user_id,team_id,mutation_id,action,request_sha256,resource_id,
    expected_version,committed_result)
 values(p_account,p_team,v_mutation,p_action,p_digest,
   v_resource,v_expected,v_result);
 return v_result;
end;
$$;

-- All original RPC caller privileges remain unchanged by CREATE OR REPLACE.
