-- Stage 3D.5 complete, disposable management and authority exercise.
-- Invented adults only; everything rolled back.
begin;
-- Previous disposable first-team test left unrelated synthetic rows.
-- Clear only inside this rollback transaction, never on the real project.
truncate table tm_private.accounts,tm_private.teams,tm_private.persons cascade;
delete from auth.users;
alter table auth.users add column if not exists email text;
insert into auth.users(id,email,email_confirmed_at) values
('11111111-1111-4111-8111-111111111111','owner@fictional.test',now()),
('22222222-2222-4222-8222-222222222222','manager@fictional.test',now()),
('33333333-3333-4333-8333-333333333333','player@fictional.test',now()),
('44444444-4444-4444-8444-444444444444','outsider@fictional.test',now());
insert into tm_private.accounts(user_id,status) values
('11111111-1111-4111-8111-111111111111','active'),
('44444444-4444-4444-8444-444444444444','active');
insert into tm_private.teams(team_id,club_ref,sport_ref,season_ref,status)
values('stgeorge-mixed20','St George Oztag','oztag','2027','active'),
 ('other-team','Other Club','oztag','2027','active');
insert into tm_private.founder_bootstrap(id,user_id,evidence_ref,adult_attested,
 first_team_id,first_coach_grant_id) values
 (1,'11111111-1111-4111-8111-111111111111',
 'evidence-ref/fictional-owner-attestation',true,
 'stgeorge-mixed20','grant-founder-coach');
insert into tm_private.platform_operator_grants(user_id,status,approved_at,founder_bootstrap_id)
 values('11111111-1111-4111-8111-111111111111','active',now(),1);
insert into tm_private.role_grants(grant_id,user_id,team_id,role,status,approved_at,founder_bootstrap_id)
 values('grant-founder-coach','11111111-1111-4111-8111-111111111111',
 'stgeorge-mixed20','team_coach','active',now(),1);
insert into tm_private.registration_policy_versions(
 policy_id,terms_version,terms_sha256,terms_url,
 privacy_version,privacy_sha256,privacy_url,status,reviewed_by,
 approved_at,approval_ref) values(
 'fictional-stg3d5-policy','terms-v1',repeat('a',64),
 'https://policies.example.test/terms-v1',
 'privacy-v1',repeat('b',64),'https://policies.example.test/privacy-v1',
 'active','11111111-1111-4111-8111-111111111111',now(),
 'evidence-ref/fictional-owner-approval');
insert into tm_private.registration_acceptances(
 user_id,policy_id,terms_accepted,privacy_acknowledged,marketing_opt_in)
 values('11111111-1111-4111-8111-111111111111','fictional-stg3d5-policy',
 true,true,false);
insert into tm_private.persons(person_id,lifecycle) values('player-p','active');
insert into tm_private.participations(team_id,person_id,status,verified_by,verified_at)
 values('stgeorge-mixed20','player-p','active',
 '11111111-1111-4111-8111-111111111111',now());
do $$
declare
 coach uuid:='11111111-1111-4111-8111-111111111111';
 manager uuid:='22222222-2222-4222-8222-222222222222';
 player uuid:='33333333-3333-4333-8333-333333333333';
 outsider uuid:='44444444-4444-4444-8444-444444444444';
 r jsonb; id text; invitation text;
begin
 if has_table_privilege('authenticated','tm_private.team_preferences','SELECT')
   or has_table_privilege('authenticated','tm_private.team_jerseys','INSERT')
   or has_function_privilege('authenticated',
    'public.tm_stage3d5_team(uuid,text,text,text,jsonb)','EXECUTE')
 then raise exception 'New private management objects exposed to browser'; end if;
 if not tm_private.stage3d5_team_admin(coach,'stgeorge-mixed20','team_coach')
 then raise exception 'Founder Coach could not cover unstaffed Team Manager duties';end if;
 r:=public.tm_stage3d5_team(outsider,'stgeorge-mixed20','team_coach',
  'settings.read','{}'::jsonb);
 if r->>'code'<>'scope-denied' then raise exception 'Stranger read settings';end if;
 r:=public.tm_stage3d5_team(coach,'other-team','team_coach',
  'settings.read','{}'::jsonb);
 if r->>'code'<>'scope-denied' then raise exception 'Cross-team Coach read';end if;
 r:=public.tm_stage3d5_team(coach,'stgeorge-mixed20','team_coach',
  'settings.save','{"teamLabel":"Mixed 20","trainingVenue":"Local field",
  "trainingStart":"18:00","trainingEnd":"19:30","contactName":"Team contact",
  "contactEmail":"team@fictional.test","jerseyLoan":true,"expectedVersion":0}'::jsonb);
 if r->>'code'<>'committed' or r->'data'->>'version'<>'1'
 then raise exception 'Settings write failed %',r;end if;
 r:=public.tm_stage3d5_team(coach,'stgeorge-mixed20','team_coach',
  'settings.save','{"teamLabel":"Conflict","jerseyLoan":false,"expectedVersion":0}'::jsonb);
 if r->>'code'<>'stale-version' then raise exception 'Settings lost-update accepted';end if;
 r:=public.tm_stage3d5_team(coach,'stgeorge-mixed20','team_coach',
  'jerseys.issue','{"personId":"player-p","jerseyNo":"12"}'::jsonb);
 if r->>'code'<>'committed' then raise exception 'Jersey issue failed %',r;end if;
 id:=r->'data'->>'issueId';
 r:=public.tm_stage3d5_team(coach,'stgeorge-mixed20','team_coach',
  'jerseys.issue','{"personId":"player-p","jerseyNo":"12"}'::jsonb);
 if r->>'code'<>'already-assigned' then raise exception 'Duplicate issued number';end if;
 r:=public.tm_stage3d5_team(coach,'stgeorge-mixed20','team_coach',
  'jerseys.return',jsonb_build_object('issueId',id,'expectedVersion',0));
 if r->>'code'<>'committed' then raise exception 'Jersey return failed';end if;
 r:=public.tm_stage3d5_team(coach,'stgeorge-mixed20','team_coach',
  'competitions.create','{"name":"Winter Oztag","format":"tournament",
   "division":"Mixed 20","organiser":"Fictional League",
   "venue":"Main field","status":"entered"}'::jsonb);
 if r->>'code'<>'committed' then raise exception 'Competition creation failed %',r;end if;
 id:=r->'data'->>'competitionId';
 r:=public.tm_stage3d5_team(coach,'stgeorge-mixed20','team_coach',
  'competitions.fixture',jsonb_build_object('competitionId',id,
   'opponent','Fictional Lions','startsAt','2027-02-20T08:00:00+11:00'));
 if r->>'code'<>'committed' or r->'data'->>'official'<>'false'
 then raise exception 'Unofficial team fixture failed %',r;end if;
 if exists(select 1 from tm_private.team_competitions where official_verified)
 then raise exception 'Team authored authoritative competition draw';end if;
 r:=public.tm_stage3d5_team(coach,'stgeorge-mixed20','team_coach',
  'competitions.fixtures','{}'::jsonb);
 if r->>'code'<>'permitted' or jsonb_array_length(r->'data')<>1
   or r->'data'->0->>'official'<>'false'
   or r->'data'->0->>'title'<>'vs Fictional Lions'
   or r->'data'->0->>'competitionId'<>id
 then raise exception 'Team local fixture read failed %',r;end if;
 r:=public.tm_stage3d5_team(coach,'other-team','team_coach',
  'competitions.fixtures','{}'::jsonb);
 if r->>'code'<>'scope-denied' then raise exception 'Foreign team fixture read succeeded';end if;
 r:=public.tm_stage3d5_team(coach,'stgeorge-mixed20','team_coach',
  'messages.prepare','{"audience":"players","channel":"whatsapp",
    "body":"Check your training availability."}'::jsonb);
 if r->>'code'<>'committed' then raise exception 'Message prepare failed';end if;
 id:=r->'data'->>'messageId';
 if exists(select 1 from tm_private.team_message_log where status='sent')
 then raise exception 'WhatsApp incorrectly auto-confirmed sent';end if;
 r:=public.tm_stage3d5_team(coach,'stgeorge-mixed20','team_coach',
  'messages.confirm',jsonb_build_object('messageId',id,'status','sent','expectedVersion',0));
 if r->>'code'<>'committed' then raise exception 'Manual message confirmation failed';end if;
 r:=public.tm_stage3d5_team(coach,'stgeorge-mixed20','team_coach',
  'invite.issue','{"role":"team_player","email":"player@fictional.test"}'::jsonb);
 if r->>'code'<>'committed' then raise exception 'Coach member invite failed %',r;end if;
 invitation:=r->'data'->>'invitationId';
 if exists(select 1 from tm_private.role_grants where user_id=player)
 then raise exception 'Invitation automatically granted a role';end if;
 r:=public.tm_stage3d5_team(coach,'stgeorge-mixed20','team_coach',
  'invite.issue','{"role":"team_manager","email":"manager@fictional.test"}'::jsonb);
 if r->>'code'<>'invalid-request' then raise exception 'Coach appointed Manager';end if;
 r:=public.tm_stage3d5_team(coach,'stgeorge-mixed20','team_coach',
  'invite.review-adult',jsonb_build_object('invitationId',invitation,
   'evidenceRef','evidence-ref/fictional-adult-identity'));
 if r->>'code'<>'committed' then raise exception 'Coach adult review failed %',r;end if;
 r:=public.tm_stage3d5_team(coach,'stgeorge-mixed20','team_coach',
  'invite.activate',jsonb_build_object('invitationId',invitation));
 if r->>'code'<>'activation-preflight-denied' then
  raise exception 'Accepted policy/claim bypassed %',r;end if;
 insert into tm_private.accounts(user_id,status) values(manager,'active');
 insert into tm_private.role_grants(grant_id,user_id,team_id,role,status,
   approved_by,approved_at) values(
  'grant-manager','22222222-2222-4222-8222-222222222222','stgeorge-mixed20',
  'team_manager','active',coach,now());
 insert into tm_private.registration_acceptances(
  user_id,policy_id,terms_accepted,privacy_acknowledged,marketing_opt_in)
 values(manager,'fictional-stg3d5-policy',true,true,false);
 if tm_private.stage3d5_team_admin(coach,'stgeorge-mixed20','team_coach')
 or not tm_private.stage3d5_team_admin(manager,'stgeorge-mixed20','team_manager')
 then raise exception 'Coach did not surrender Manager administration when appointed';end if;
 r:=public.tm_stage3d5_team(coach,'stgeorge-mixed20','team_coach',
  'invite.issue','{"role":"team_player","email":"another@fictional.test"}'::jsonb);
 if r->>'code'<>'invalid-request' then
  raise exception 'Coach bypassed appointed Manager';end if;
 -- A Manager appointment must NOT disable independently granted Coach messages.
 r:=public.tm_stage3d5_team(coach,'stgeorge-mixed20','team_coach',
  'messages.prepare','{"audience":"players","channel":"whatsapp",
    "body":"Coach reminder while Manager handles administration."}'::jsonb);
 if r->>'code'<>'committed' then
  raise exception 'Coach lost team messaging after Manager appointment %',r;end if;
 r:=public.tm_stage3d5_team(manager,'stgeorge-mixed20','team_manager',
  'settings.read','{}'::jsonb);
 if r->>'code'<>'permitted' then raise exception 'Manager lacked team settings';end if;
 r:=public.tm_stage3d5_team(manager,'stgeorge-mixed20','team_manager',
   'messages.read','{}'::jsonb);
 if r->>'code'<>'permitted' or
   exists(select 1 from jsonb_array_elements(r->'data') msg
     where msg->>'canConfirm'='true')
 then raise exception 'Manager could confirm another Coach message';end if;
 r:=public.tm_stage3d5_team(coach,'stgeorge-mixed20','team_coach',
   'messages.read','{}'::jsonb);
 if r->>'code'<>'permitted' or
   not exists(select 1 from jsonb_array_elements(r->'data') msg
     where msg->>'canConfirm'='true')
 then raise exception 'Coach could not confirm own messages';end if;
 update tm_private.role_grants set status='revoked' where grant_id='grant-manager';
 r:=public.tm_stage3d5_team(manager,'stgeorge-mixed20','team_manager',
  'team.members','{}'::jsonb);
 if r->>'code'<>'scope-denied' then raise exception 'Revoked Manager read team people';end if;
 if not tm_private.stage3d5_team_admin(coach,'stgeorge-mixed20','team_coach')
 then raise exception 'Coach did not recover fallback once Manager revoked';end if;
 if (select count(*) from tm_private.audit_events
   where team_id='stgeorge-mixed20' and action like 'stage3d5.%')<7
 then raise exception 'Management mutations missing audit evidence';end if;
 raise notice 'PASS Stage3D5: Owner+Coach, settings, jerseys, competitions, manual messages, team invitations, takeover/fallback, cross-team and revocation';
end $$;
-- Curated Player summary: only independently reviewed adult and exact-team
-- verified participation, never an arbitrary signed-in account or other team.
do $
declare
 coach uuid:='11111111-1111-4111-8111-111111111111';
 player uuid:='33333333-3333-4333-8333-333333333333';
 outsider uuid:='44444444-4444-4444-8444-444444444444';
 r jsonb;
begin
 if has_function_privilege('authenticated',
   'public.tm_stage3d5_player_team(uuid,text,text,text,jsonb)','EXECUTE') then
   raise exception 'Player RPC exposed to direct browser client'; end if;
 r:=public.tm_stage3d5_player_team(outsider,'stgeorge-mixed20','team_player',
   'player.team.read','{}'::jsonb);
 if r->>'code'<>'scope-denied' then raise exception 'Stranger saw player summary'; end if;
 insert into tm_private.accounts(user_id,status) values(player,'active');
 insert into tm_private.registration_adult_reviews(
   user_id,reviewed_by,reviewed_at,evidence_ref,state)
 values(player,coach,now(),'evidence-ref/fictional-player-review','approved');
 insert into tm_private.registration_acceptances(
   user_id,policy_id,terms_accepted,privacy_acknowledged,marketing_opt_in)
 values(player,'fictional-stg3d5-policy',true,true,false);
 insert into tm_private.account_person_links(
   user_id,person_id,status,verified_by,verified_at)
 values(player,'player-p','verified',coach,now());
 insert into tm_private.account_profiles(user_id,display_name)
 values(player,'Verified Player');
 insert into tm_private.role_grants(grant_id,user_id,team_id,role,status,approved_by,approved_at)
 values('grant-player-phase1',player,'stgeorge-mixed20','team_player','active',coach,now());
 r:=public.tm_stage3d5_player_team(player,'other-team','team_player',
   'player.team.read','{}'::jsonb);
 if r->>'code'<>'scope-denied' then raise exception 'Cross-team Player access'; end if;
 r:=public.tm_stage3d5_player_team(player,'stgeorge-mixed20','team_manager',
   'player.team.read','{}'::jsonb);
 if r->>'code'<>'invalid-request' then raise exception 'Player forged Manager role'; end if;
 r:=public.tm_stage3d5_player_team(player,'stgeorge-mixed20','team_player',
   'player.team.read','{}'::jsonb);
 if r->>'code'<>'permitted' or r->'data'->>'rosterEligible'<>'1'
   or r->'data'->>'rosterShown'<>'1'
   or r->'data'->'roster'->0->>'displayName'<>'Verified Player'
   or jsonb_array_length(r->'data'->'competitions')<>1
   or jsonb_array_length(r->'data'->'fixtures')<>1
   or (r->'data')::text ~ '11111111-1111-4111-8111-111111111111'
 then raise exception 'Verified Player summary is missing, expanded or unsanitised %',r;end if;
 update tm_private.role_grants set status='revoked' where grant_id='grant-player-phase1';
 r:=public.tm_stage3d5_player_team(player,'stgeorge-mixed20','team_player',
   'player.team.read','{}'::jsonb);
 if r->>'code'<>'scope-denied' then raise exception 'Revoked Player still had access'; end if;
 raise notice 'PASS Phase 1 Player: exact team and adult review, curated roster and fixtures, cross-team and revocation denied';
end $;
rollback;
