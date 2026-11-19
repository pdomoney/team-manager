-- Stage 3A: source-only, disposable Postgres, fictitious adult accounts.
-- This test deliberately does not call GoTrue nor any real email provider.
begin;
insert into auth.users(id) values
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222'),
 ('33333333-3333-4333-8333-333333333333'),
 ('44444444-4444-4444-8444-444444444444'),
 ('55555555-5555-4555-8555-555555555555');
insert into tm_private.accounts(user_id,status) values
 ('11111111-1111-4111-8111-111111111111','active'),
 ('22222222-2222-4222-8222-222222222222','active'),
 ('33333333-3333-4333-8333-333333333333','active'),
 ('55555555-5555-4555-8555-555555555555','disabled');
insert into tm_private.teams(team_id,club_ref,sport_ref,season_ref,status) values
 ('comets-onboarding','Fictional Comets','oztag','2026','active'),
 ('rangers-onboarding','Fictional Rangers','oztag','2026','active');
insert into tm_private.role_grants(
 grant_id,user_id,team_id,role,status,approved_by,approved_at) values
 ('coach-init','11111111-1111-4111-8111-111111111111','comets-onboarding',
  'team_coach','active','33333333-3333-4333-8333-333333333333',now()),
 ('manager-init','22222222-2222-4222-8222-222222222222','comets-onboarding',
  'team_manager','active','33333333-3333-4333-8333-333333333333',now());
do $$
declare
 coach uuid:='11111111-1111-4111-8111-111111111111';
 manager uuid:='22222222-2222-4222-8222-222222222222';
 stranger uuid:='33333333-3333-4333-8333-333333333333';
 invitee uuid:='44444444-4444-4444-8444-444444444444';
 disabled_user uuid:='55555555-5555-4555-8555-555555555555';
 team text:='comets-onboarding';
 invitation text;
 response jsonb;
 other jsonb;
begin
 if has_table_privilege('authenticated','tm_private.team_invitations','SELECT')
   or has_table_privilege('authenticated','tm_private.team_invitations','INSERT')
   or has_function_privilege('authenticated',
     'public.tm_stage3_onboarding(uuid,text,text,text,text,text,text,text)','EXECUTE')
   or has_function_privilege('anon',
     'public.tm_stage3_delivery_result(text,text)','EXECUTE')
 then raise exception 'Stage 3A private role permissions were exposed'; end if;
 response:=public.tm_stage3_onboarding(coach,'coach@fictional.test',team,
   'team_coach','propose',null,'player@fictional.test','team_player');
 if response->>'code'<>'proposed' then
   raise exception 'Coach could not propose team invitation: %',response; end if;
 invitation:=response->>'invitationId';
 response:=public.tm_stage3_onboarding(coach,'coach@fictional.test',team,
   'team_coach','approve',invitation,null,null);
 if response->>'code'<>'self-approval-denied' then
   raise exception 'Coach self-approved own invitation'; end if;
 response:=public.tm_stage3_onboarding(stranger,'stranger@fictional.test',team,
   'team_manager','approve',invitation,null,null);
 if response->>'code'<>'scope-denied' then
   raise exception 'Unassigned user approved team invitation'; end if;
 response:=public.tm_stage3_onboarding(invitee,'player@fictional.test','',
   '','claim',invitation,null,null);
 if response->>'code'<>'invitation-unavailable' then
   raise exception 'Pre-approval invitation claimed'; end if;
 response:=public.tm_stage3_onboarding(manager,'manager@fictional.test',
   'rangers-onboarding','team_manager','approve',invitation,null,null);
 if response->>'code'<>'scope-denied' then
   raise exception 'Cross-team approval accepted'; end if;
 response:=public.tm_stage3_onboarding(manager,'manager@fictional.test',team,
   'team_manager','approve',invitation,null,null);
 if response->>'code'<>'approved' or response->>'internalEmail'<>'player@fictional.test' then
   raise exception 'Independent approval failed: %',response; end if;
 response:=public.tm_stage3_onboarding(stranger,'stranger@fictional.test','',
   '','claim',invitation,null,null);
 if response->>'code'<>'invitation-unavailable' then
   raise exception 'Other email claimed invitation'; end if;
 response:=public.tm_stage3_onboarding(disabled_user,'player@fictional.test','',
   '','claim',invitation,null,null);
 if response->>'code'<>'account-inactive' then
   raise exception 'Disabled account claimed invitation'; end if;
 response:=public.tm_stage3_onboarding(invitee,'player@fictional.test','',
   '','claim',invitation,null,null);
 if response->>'code'<>'claimed' then
   raise exception 'Verified invitee cannot claim: %',response; end if;
 if not exists(select 1 from tm_private.account_person_links
   where user_id=invitee and status='pending')
   or exists(select 1 from tm_private.role_grants where user_id=invitee
     and status='active') then
   raise exception 'Claim bypassed person or grant review'; end if;
 perform set_config('request.jwt.claim.sub',invitee::text,true);
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into other
   from public.tm_my_team_context() x;
 if jsonb_array_length(other)<>0 then
   raise exception 'Unreviewed invite received a team role: %',other; end if;
 response:=public.tm_stage3_onboarding(manager,'manager@fictional.test',
   team,'team_manager','activate',invitation,null,null);
 if response->>'code'<>'activated' then
   raise exception 'Reviewer could not activate invitation: %',response; end if;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into other
   from public.tm_my_team_context() x;
 if jsonb_array_length(other)<>1 or other->0->>'team_role'<>'team_player' then
   raise exception 'Verified Player grant/team placement did not activate: %',other; end if;
 if not exists(select 1 from tm_private.participations p
   join tm_private.account_person_links l on l.person_id=p.person_id
   where l.user_id=invitee and p.team_id=team and p.status='active') then
   raise exception 'Player team placement missing'; end if;
 response:=public.tm_stage3_onboarding(coach,'coach@fictional.test',team,
   'team_coach','revoke',invitation,null,null);
 if response->>'code'<>'self-approval-denied' then
   raise exception 'Original proposer bypassed independent revocation'; end if;
 response:=public.tm_stage3_onboarding(manager,'manager@fictional.test',team,
   'team_manager','revoke',invitation,null,null);
 if response->>'code'<>'revoked' then
   raise exception 'Reviewer could not revoke team role: %',response; end if;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into other
   from public.tm_my_team_context() x;
 if jsonb_array_length(other)<>0 then
   raise exception 'Revoked team grant survived: %',other; end if;
 if not exists(select 1 from tm_private.audit_events
   where action='onboarding.revoke' and resource_id=invitation) then
   raise exception 'Revocation audit missing'; end if;
 response:=public.tm_stage3_onboarding(coach,'coach@fictional.test',team,
   'team_coach','propose',null,'player@fictional.test','team_player');
 if response->>'code'<>'proposed' then
   raise exception 'Re-invitation after revoked grant failed'; end if;
 raise notice 'PASS: Stage 3A invite, independent review, claim, verified link, Player team role, foreign denial, revocation';
end;
$$;
rollback;
