-- Stage 3A.2–3A.5, source-only adult onboarding and independent exact-team approval.
-- Installation, real participant details and provider Auth delivery require separate authority.
-- A verified email is not a Person link, membership or software role.
create table tm_private.team_invitations (
  invitation_id text primary key,
  team_id text not null references tm_private.teams(team_id) on delete restrict,
  email text not null check (length(email) between 5 and 254),
  team_role text not null check (team_role in
    ('team_coach','team_manager','team_assistant','team_player','team_volunteer')),
  status text not null default 'proposed' check
    (status in ('proposed','approved','claimed','activated','revoked')),
  proposed_by uuid not null references tm_private.accounts(user_id) on delete restrict,
  approved_by uuid references tm_private.accounts(user_id) on delete restrict,
  claimed_by uuid references tm_private.accounts(user_id) on delete restrict,
  person_id text references tm_private.persons(person_id) on delete restrict,
  grant_id text references tm_private.role_grants(grant_id) on delete restrict,
  delivery_status text not null default 'not-sent'
    check (delivery_status in ('not-sent','sent','existing-account','failed')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  claimed_at timestamptz,
  expires_at timestamptz not null default (now()+interval '7 days'),
  updated_at timestamptz not null default now(),
  constraint team_invitation_not_self_approved
    check (approved_by is null or approved_by<>proposed_by),
  constraint team_invitation_claimed_complete
    check (status not in ('claimed','activated') or
      (claimed_by is not null and person_id is not null))
);
create index team_invitation_scope on tm_private.team_invitations(team_id,status);
create index team_invitation_email on tm_private.team_invitations(email,status);
alter table tm_private.team_invitations enable row level security;
alter table tm_private.team_invitations force row level security;
revoke all on tm_private.team_invitations from public,anon,authenticated;
grant select,insert,update,delete on tm_private.team_invitations to service_role;

-- Called only by the trusted Worker after verification against GoTrue /auth/v1/user.
-- The email and user UUID here come from that verification, not the browser body.
-- Every decision is scoped to the one active team role selected by the user.
create function public.tm_stage3_onboarding(
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
         and g.policy_version=1 and g.approved_by is not null
         and g.approved_by<>p_actor and g.approved_at is not null
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
revoke all on function public.tm_stage3_onboarding(
  uuid,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.tm_stage3_onboarding(
  uuid,text,text,text,text,text,text,text) to service_role;

-- Trusted-Worker-only delivery record, not a browser callable endpoint.
create function public.tm_stage3_delivery_result(
  p_invitation text, p_result text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
begin
  if p_result not in ('sent','existing-account','failed') then
    return pg_catalog.jsonb_build_object('ok',false); end if;
  update tm_private.team_invitations set delivery_status=p_result,
    updated_at=pg_catalog.now()
  where invitation_id=p_invitation and status='approved';
  return pg_catalog.jsonb_build_object('ok',found);
end;
$$;
revoke all on function public.tm_stage3_delivery_result(text,text)
  from public,anon,authenticated;
grant execute on function public.tm_stage3_delivery_result(text,text) to service_role;
