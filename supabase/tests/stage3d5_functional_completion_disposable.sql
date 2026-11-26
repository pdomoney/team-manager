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
 r jsonb; id text; invitation text; competition text; duty text;
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
   "venue":"Main field","beginsOn":"","endsOn":"","status":"entered"}'::jsonb);
 if r->>'code'<>'committed' then raise exception 'Competition creation failed %',r;end if;
 id:=r->'data'->>'competitionId'; competition:=id;
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
 r:=public.tm_stage3d5_team(coach,'stgeorge-mixed20','team_coach','competitions.update',
   jsonb_build_object('competitionId',competition,'name','Winter Oztag revised','format','tournament',
   'venue','Updated field','status','withdrawn','beginsOn','','endsOn','','expectedVersion',0));
 if r->>'code'<>'committed' then raise exception 'Competition withdrawal failed %',r; end if;
 r:=public.tm_stage3d5_team(coach,'stgeorge-mixed20','team_coach','competitions.fixture',
   jsonb_build_object('competitionId',competition,'opponent','Denied match','startsAt','2027-02-24T08:00:00+11:00'));
 if r->>'code'<>'invalid-request' then raise exception 'Withdrawn entry accepted fixture %',r; end if;
 r:=public.tm_stage3d5_team(coach,'stgeorge-mixed20','team_coach','competitions.update',
   jsonb_build_object('competitionId',competition,'name','Stale edit','format','tournament','status','entered','expectedVersion',0));
 if r->>'code'<>'stale-version' then raise exception 'Stale competition edit succeeded %',r; end if;
 r:=public.tm_stage3d5_team(coach,'stgeorge-mixed20','team_coach','competitions.update',
   jsonb_build_object('competitionId',competition,'name','Winter Oztag revised','format','tournament',
   'venue','Updated field','status','entered','expectedVersion',1));
 if r->>'code'<>'committed' or not exists(select 1 from tm_private.team_competition_fixtures
   where competition_id=competition and team_id='stgeorge-mixed20')
 then raise exception 'Re-entry lost existing fixture %',r; end if;
 r:=public.tm_stage3d5_team(coach,'other-team','team_coach',
  'competitions.fixtures','{}'::jsonb);
 if r->>'code'<>'scope-denied' then raise exception 'Foreign team fixture read succeeded';end if;
 r:=public.tm_stage3d5_team(coach,'stgeorge-mixed20','team_coach',
  'messages.prepare',jsonb_build_object('audience','players','channel','whatsapp',
    'body',E'Training update\nCheck your training availability.'));
 if r->>'code'<>'committed' then raise exception 'Message prepare failed';end if;
 id:=r->'data'->>'messageId';
 if not exists(select 1 from tm_private.team_message_log where message_id=id
   and content=E'Training update\nCheck your training availability.')
 then raise exception 'Multiline message was altered in storage';end if;
 if exists(select 1 from tm_private.team_message_log where status='sent')
 then raise exception 'WhatsApp incorrectly auto-confirmed sent';end if;
 r:=public.tm_stage3d5_team(coach,'stgeorge-mixed20','team_coach',
  'messages.confirm',jsonb_build_object('messageId',id,'status','sent','expectedVersion',0));
 if r->>'code'<>'committed' then raise exception 'Manual message confirmation failed';end if;
 -- Real RPC persistence: cancel an actual planned training, retain it in schedule.
 r:=public.tm_stage1_operation(coach,'stgeorge-mixed20','team_coach','schedule.edit',
   'stgeorge-mixed20','{"mutationId":"phase1-create-training-001","expectedVersion":0,
   "command":{"op":"create","kind":"training","title":"Phase 1 training","startsAt":"2027-02-22T18:00:00+11:00"}}'::jsonb,repeat('1',64));
 if r->>'code'<>'committed' then raise exception 'Phase 1 training creation failed %',r; end if;
 id:=r->>'resourceId';
 r:=public.tm_stage1_operation(coach,'stgeorge-mixed20','team_coach','schedule.edit',id,
   '{"mutationId":"phase1-cancel-training-001","expectedVersion":0,"command":{"op":"cancel"}}'::jsonb,repeat('2',64));
 if r->>'code'<>'committed' then raise exception 'Phase 1 training cancellation failed %',r; end if;
 r:=public.tm_stage1_operation(coach,'stgeorge-mixed20','team_coach','schedule.read','stgeorge-mixed20','{}'::jsonb,null);
 if r->>'code'<>'permitted' or not exists(select 1 from jsonb_array_elements(r->'data') x
   where x->>'sessionId'=id and x->>'status'='cancelled') then raise exception 'Cancelled training omitted %',r; end if;
 insert into tm_private.sessions(session_id,team_id,kind,starts_at,title)
 values('phase1-match','stgeorge-mixed20','match','2027-02-25T18:00:00+11:00','External fixture'),
       ('phase1-foreign','other-team','match','2027-02-25T18:00:00+11:00','Foreign fixture');
 r:=public.tm_stage3b_operation(coach,'stgeorge-mixed20','team_coach','availability.board','phase1-match','{}'::jsonb,null);
 if r->>'code'<>'permitted' or jsonb_array_length(r->'data')<>1 then raise exception 'Match availability missing %',r; end if;
 r:=public.tm_stage3b_operation(coach,'stgeorge-mixed20','team_coach','availability.board','phase1-foreign','{}'::jsonb,null);
 if r->>'code'<>'resource-out-of-scope' then raise exception 'Foreign availability exposed %',r; end if;
 r:=public.tm_stage3b_operation(coach,'stgeorge-mixed20','team_coach','availability.transcribe','phase1-match',
   '{"mutationId":"phase1-coach-reply-001","expectedVersion":0,"command":{"personId":"player-p","response":"yes","source":"phone"}}'::jsonb,repeat('3',64));
 if r->>'code'<>'committed' then raise exception 'Coach fallback failed %',r; end if;
 r:=public.tm_stage3b_operation(coach,'stgeorge-mixed20','team_coach','event.change','phase1-match',
   '{"mutationId":"phase1-external-event-001","expectedVersion":0,"command":{"op":"cancel"}}'::jsonb,repeat('4',64));
 if r->>'code'<>'stale-or-external-event' then raise exception 'Official fixture changed %',r; end if;
 r:=public.tm_stage3b_operation(coach,'stgeorge-mixed20','team_coach','availability.transcribe',id,
   '{"mutationId":"phase1-cancelled-reply-001","expectedVersion":0,"command":{"personId":"player-p","response":"yes","source":"phone"}}'::jsonb,repeat('5',64));
 if r->>'code'<>'invalid-availability' then raise exception 'Cancelled training accepted reported reply %',r; end if;
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
 update tm_private.role_grants set valid_from=now()+interval '1 day' where grant_id='grant-manager';
 if not tm_private.stage3d5_team_admin(coach,'stgeorge-mixed20','team_coach')
 or tm_private.stage3d5_team_admin(manager,'stgeorge-mixed20','team_manager')
 then raise exception 'Future Manager incorrectly displaced Coach'; end if;
 update tm_private.role_grants set valid_from=null where grant_id='grant-manager';
 if tm_private.stage3d5_team_admin(coach,'stgeorge-mixed20','team_coach')
 or not tm_private.stage3d5_team_admin(manager,'stgeorge-mixed20','team_manager')
 then raise exception 'Coach did not surrender Manager administration when appointed';end if;
 r:=public.tm_stage3d5_team(coach,'stgeorge-mixed20','team_coach',
  'invite.issue','{"role":"team_player","email":"another@fictional.test"}'::jsonb);
 if r->>'code'<>'invalid-request' then
  raise exception 'Coach bypassed appointed Manager';end if;
 -- Same operation, same team: appointed Manager takes over, Coach is denied.
 r:=public.tm_stage3b_operation(coach,'stgeorge-mixed20','team_coach','availability.transcribe','phase1-match',
   '{"mutationId":"phase1-coach-denied-001","expectedVersion":0,"command":{"personId":"player-p","response":"no","source":"phone"}}'::jsonb,repeat('6',64));
 if r->>'code'<>'role-denied' then raise exception 'Coach retained Manager transcription after appointment %',r; end if;
 r:=public.tm_stage3b_operation(manager,'stgeorge-mixed20','team_manager','availability.transcribe','phase1-match',
   '{"mutationId":"phase1-manager-reply-001","expectedVersion":0,"command":{"personId":"player-p","response":"no","source":"email"}}'::jsonb,repeat('7',64));
 if r->>'code'<>'committed' then raise exception 'Manager transcription failed %',r; end if;
 r:=public.tm_stage3b_operation(manager,'stgeorge-mixed20','team_manager','availability.board','phase1-match','{}'::jsonb,null);
 if r->'data'->0->>'response'<>'no' or r->'data'->0->>'source'<>'email' then raise exception 'Match response provenance missing %',r; end if;
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
 -- Reuse the synthetic outsider account as an independently reviewed Volunteer
 -- only after the earlier outsider-denial assertions have run.
 insert into tm_private.persons(person_id,lifecycle) values('volunteer-p','active');
 insert into tm_private.account_person_links(user_id,person_id,status,verified_by,verified_at)
 values(outsider,'volunteer-p','verified',coach,now());
 insert into tm_private.role_grants(grant_id,user_id,team_id,role,status,approved_by,approved_at)
 values('grant-phase1-volunteer',outsider,'stgeorge-mixed20','team_volunteer','active',coach,now());
 r:=public.tm_stage3d5_team(manager,'stgeorge-mixed20','team_manager','volunteers.list','{}'::jsonb);
 if jsonb_array_length(r->'data')<>0 then raise exception 'Unreviewed Volunteer listed %',r; end if;
 r:=public.tm_stage3d5_team(manager,'stgeorge-mixed20','team_manager','duties.assign',
   '{"sessionId":"phase1-match","personId":"volunteer-p","type":"equipment"}'::jsonb);
 if r->>'code'<>'volunteer-not-verified' then raise exception 'Unreviewed Volunteer assigned %',r; end if;
 insert into tm_private.registration_adult_reviews(user_id,reviewed_by,reviewed_at,evidence_ref,state)
 values(outsider,coach,now(),'evidence-ref/fictional-volunteer-review','approved');
 insert into tm_private.registration_acceptances(user_id,policy_id,terms_accepted,privacy_acknowledged,marketing_opt_in)
 values(outsider,'fictional-stg3d5-policy',true,true,false);
 r:=public.tm_stage3d5_team(manager,'stgeorge-mixed20','team_manager','volunteers.list','{}'::jsonb);
 if jsonb_array_length(r->'data')<>1 then raise exception 'Verified Volunteer omitted %',r; end if;
 r:=public.tm_stage3d5_team(manager,'stgeorge-mixed20','team_manager','duties.assign',
   '{"sessionId":"phase1-match","personId":"volunteer-p","type":"equipment"}'::jsonb);
 if r->>'code'<>'committed' then raise exception 'Verified Volunteer assignment failed %',r; end if;
 duty:=r->'data'->>'dutyId';
 r:=public.tm_stage1_operation(outsider,'stgeorge-mixed20','team_volunteer','duty.read','stgeorge-mixed20','{}'::jsonb,null);
 if r->>'code'<>'permitted' or not exists(select 1 from jsonb_array_elements(r->'data') x where x->>'dutyId'=duty)
 then raise exception 'Assigned Volunteer cannot read own duty %',r; end if;
 r:=public.tm_stage3d5_team(manager,'stgeorge-mixed20','team_manager','duties.withdraw',jsonb_build_object('dutyId',duty,'expectedVersion',0));
 if r->>'code'<>'committed' then raise exception 'Duty withdrawal failed %',r; end if;
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
do $$
declare
 coach uuid:='11111111-1111-4111-8111-111111111111';
 player uuid:='33333333-3333-4333-8333-333333333333';
 outsider uuid:='44444444-4444-4444-8444-444444444444';
 r jsonb; notice_id_value text; volunteer_notice text;
begin
 if has_function_privilege('authenticated',
   'public.tm_stage3d5_player_team(uuid,text,text,text,jsonb)','EXECUTE') then
   raise exception 'Player RPC exposed to direct browser client'; end if;
 r:=public.tm_stage3d5_player_team(outsider,'stgeorge-mixed20','team_player',
   'player.team.read','{}'::jsonb);
 if r->>'code'<>'scope-denied' then raise exception 'Stranger saw player summary'; end if;
 insert into tm_private.accounts(user_id,status) values(player,'active')
 on conflict (user_id) do update set status='active';
 insert into tm_private.registration_adult_reviews(
   user_id,reviewed_by,reviewed_at,evidence_ref,state)
 values(player,coach,now(),'evidence-ref/fictional-player-review','approved')
 on conflict (user_id) do nothing;
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
 r:=public.tm_stage1_operation(player,'stgeorge-mixed20','team_player','schedule.read','stgeorge-mixed20','{}'::jsonb,null);
 if r->>'code'<>'permitted' or not exists(select 1 from jsonb_array_elements(r->'data') x
   where x->>'status'='cancelled' and x->>'kind'='training')
   or exists(select 1 from jsonb_array_elements(r->'data') x where x->>'sessionId'='phase1-foreign')
 then raise exception 'Player cancelled-session visibility or team isolation failed %',r; end if;
 r:=public.tm_stage1_operation(player,'stgeorge-mixed20','team_player','availability.reply',
   (select session_id from tm_private.sessions where team_id='stgeorge-mixed20' and title='Phase 1 training'),
   '{"mutationId":"phase1-player-cancelled-001","expectedVersion":0,"response":"yes"}'::jsonb,repeat('8',64));
 if r->>'code'<>'session-unavailable' then raise exception 'Player answered cancelled training %',r; end if;
 r:=public.tm_stage3b_operation(coach,'stgeorge-mixed20','team_coach','notice.create','stgeorge-mixed20',
   '{"mutationId":"phase1-notice-create-001","expectedVersion":0,"command":{"title":"Player notice","body":"Bring water","audience":"players"}}'::jsonb,repeat('9',64));
 if r->>'code'<>'committed' then raise exception 'Player notice create failed %',r; end if;
 notice_id_value:=r->>'resourceId';
 r:=public.tm_stage3b_operation(player,'stgeorge-mixed20','team_player','notices.read','stgeorge-mixed20','{}'::jsonb,null);
 if r->>'code'<>'permitted' or jsonb_array_length(r->'data')<>0 then raise exception 'Player saw unpublished draft %',r; end if;
 r:=public.tm_stage3b_operation(coach,'stgeorge-mixed20','team_coach','notice.publish',notice_id_value,
   '{"mutationId":"phase1-notice-publish-001","expectedVersion":0,"command":{"op":"publish"}}'::jsonb,repeat('a',64));
 if r->>'code'<>'committed' then raise exception 'Player notice publish failed %',r; end if;
 r:=public.tm_stage3b_operation(player,'stgeorge-mixed20','team_player','notices.read','stgeorge-mixed20','{}'::jsonb,null);
 if r->>'code'<>'permitted' or jsonb_array_length(r->'data')<>1 or r->'data'->0->>'noticeId'<>notice_id_value
 then raise exception 'Published Player notice omitted %',r; end if;
 r:=public.tm_stage3b_operation(outsider,'stgeorge-mixed20','team_volunteer','notices.read','stgeorge-mixed20','{}'::jsonb,null);
 if r->>'code'<>'permitted' or jsonb_array_length(r->'data')<>0 then raise exception 'Volunteer saw Player notice %',r; end if;
 r:=public.tm_stage3b_operation(coach,'stgeorge-mixed20','team_coach','notice.archive',notice_id_value,
   '{"mutationId":"phase1-notice-archive-001","expectedVersion":1,"command":{"op":"archive"}}'::jsonb,repeat('b',64));
 if r->>'code'<>'committed' then raise exception 'Notice archive failed %',r; end if;
 r:=public.tm_stage3b_operation(player,'stgeorge-mixed20','team_player','notices.read','stgeorge-mixed20','{}'::jsonb,null);
 if r->>'code'<>'permitted' or jsonb_array_length(r->'data')<>0 then raise exception 'Archived notice still visible %',r; end if;
 -- Connected match selection: saved draft, published Player view, stale and foreign denial.
 if has_table_privilege('authenticated','tm_private.team_match_selections','SELECT') or
    has_function_privilege('authenticated','public.tm_stage3d5_match(uuid,text,text,text,jsonb)','EXECUTE')
 then raise exception 'Match squad exposed to direct browser'; end if;
 r:=public.tm_stage3d5_match(coach,'stgeorge-mixed20','team_coach','match.selection.save',
   '{"sessionId":"phase1-match","expectedVersion":0,"fixtureVersion":0,"personIds":["player-p","player-p"]}'::jsonb);
 if r->>'code'<>'participation-not-verified' then raise exception 'Duplicate selection accepted %',r; end if;
 r:=public.tm_stage3d5_match(coach,'stgeorge-mixed20','team_coach','match.selection.save',
   '{"sessionId":"phase1-match","expectedVersion":0,"fixtureVersion":0,"personIds":["volunteer-p"]}'::jsonb);
 if r->>'code'<>'participation-not-verified' then raise exception 'Volunteer selected as Player %',r; end if;
 r:=public.tm_stage3d5_match(coach,'stgeorge-mixed20','team_coach','match.selection.save',
   '{"sessionId":"phase1-match","expectedVersion":0,"fixtureVersion":0,"personIds":["player-p"]}'::jsonb);
 if r->>'code'<>'committed' or r->'data'->>'version'<>'1' then raise exception 'Match squad draft failed %',r; end if;
 r:=public.tm_stage3d5_match(player,'stgeorge-mixed20','team_player','player.match.selection.read','{"sessionId":"phase1-match"}'::jsonb);
 if r->'data'->>'state'<>'unavailable' or jsonb_array_length(r->'data'->'players')<>0
 then raise exception 'Player saw draft %',r; end if;
 r:=public.tm_stage3d5_match(coach,'stgeorge-mixed20','team_coach','match.selection.publish',
   '{"sessionId":"phase1-match","expectedVersion":0,"fixtureVersion":0}'::jsonb);
 if r->>'code'<>'stale-version' then raise exception 'Stale publish accepted %',r; end if;
 r:=public.tm_stage3d5_match(coach,'stgeorge-mixed20','team_coach','match.selection.publish',
   '{"sessionId":"phase1-match","expectedVersion":1,"fixtureVersion":0}'::jsonb);
 if r->>'code'<>'committed' then raise exception 'Match squad publish failed %',r; end if;
 r:=public.tm_stage3d5_match(player,'stgeorge-mixed20','team_player','player.match.selection.read','{"sessionId":"phase1-match"}'::jsonb);
 if r->'data'->>'state'<>'published' or r->'data'->'players'->0->>'displayName'<>'Verified Player'
 or (r->'data')::text like '%player-p%' then raise exception 'Published squad missing or private ID leaked %',r; end if;
 r:=public.tm_stage3d5_match(player,'stgeorge-mixed20','team_player','player.match.selection.read','{"sessionId":"phase1-foreign"}'::jsonb);
 if r->>'code'<>'scope-denied' then raise exception 'Foreign match disclosed %',r; end if;
 update tm_private.sessions set resource_version=resource_version+1 where session_id='phase1-match';
 r:=public.tm_stage3d5_match(player,'stgeorge-mixed20','team_player','player.match.selection.read','{"sessionId":"phase1-match"}'::jsonb);
 if r->'data'->>'state'<>'unavailable' then raise exception 'Old selection exposed after fixture change %',r; end if;
 r:=public.tm_stage3d5_match(coach,'stgeorge-mixed20','team_coach','match.selection.withdraw',
   '{"sessionId":"phase1-match","expectedVersion":2,"fixtureVersion":1}'::jsonb);
 if r->>'code'<>'committed' then raise exception 'Selection withdrawal failed %',r; end if;
 update tm_private.role_grants set status='revoked' where grant_id='grant-player-phase1';
 r:=public.tm_stage3d5_player_team(player,'stgeorge-mixed20','team_player',
   'player.team.read','{}'::jsonb);
 if r->>'code'<>'scope-denied' then raise exception 'Revoked Player still had access'; end if;
 raise notice 'PASS Phase 1 Player: exact team and adult review, curated roster and fixtures, cross-team and revocation denied';
end $$;

-- PR295 regression: use the same independently verified synthetic accounts.
do $$
declare
 coach uuid:='11111111-1111-4111-8111-111111111111';
 manager uuid:='22222222-2222-4222-8222-222222222222';
 player uuid:='33333333-3333-4333-8333-333333333333';
 outsider uuid:='44444444-4444-4444-8444-444444444444';
 r jsonb; mid text; mid2 text; nid text; nid2 text; sent_body text:='Original sent message';
begin
 if has_function_privilege('authenticated','public.tm_stage3d5_communications(uuid,text,text,text,jsonb)','EXECUTE')
 or has_function_privilege('anon','public.tm_stage3d5_branding(uuid,text,text,text,jsonb)','EXECUTE')
 or has_table_privilege('authenticated','tm_private.club_branding_grants','INSERT')
 or has_function_privilege('authenticated','public.tm_stage3d5_branding_owner(uuid,text,jsonb)','EXECUTE')
 then raise exception 'PR295 private data/authority exposed';end if;
 update tm_private.role_grants set status='active' where grant_id in ('grant-player-phase1','grant-manager');
 r:=public.tm_stage3d5_branding(coach,'stgeorge-mixed20','team_coach','branding.read','{}');
 if r->>'code'<>'permitted' or r->'data'->>'canEditClub'<>'false' or r->'data'->>'canEditTeam'<>'true'
 then raise exception 'Branding must not grant club authority implicitly %',r;end if;
 r:=public.tm_stage3d5_branding(coach,'other-team','team_coach','branding.read','{}');
 if r->>'code'<>'scope-denied' then raise exception 'Cross-team brand read %',r;end if;
 r:=public.tm_stage3d5_branding(coach,'stgeorge-mixed20','team_coach','branding.club.save',
  '{"style":{"palette":"redwhite"},"logo":"","resetOverrides":false,"expectedVersion":0}');
 if r->>'code'<>'role-denied' then raise exception 'Implicit Coach club authority %',r;end if;
 r:=public.tm_stage3d5_branding_owner(outsider,'branding.authorise','{}');
 if r->>'code'<>'scope-denied' then raise exception 'Unauthorised founder delegation %',r;end if;
 r:=public.tm_stage3d5_branding_owner(coach,'branding.authorise','{}');
 if r->>'brandingAuthorised'<>'true' then raise exception 'Explicit first-club authority failed %',r;end if;
 r:=public.tm_stage3d5_branding(coach,'stgeorge-mixed20','team_coach','branding.club.save',
  '{"style":{"palette":"redwhite"},"logo":"","resetOverrides":false,"expectedVersion":0}');
 if r->>'code'<>'committed' then raise exception 'Club branding save %',r;end if;
 r:=public.tm_stage3d5_branding(coach,'stgeorge-mixed20','team_coach','branding.team.save',
  '{"style":{"palette":"blackwhite"},"expectedVersion":0}');
 if r->>'code'<>'committed' then raise exception 'Team override %',r;end if;
 r:=public.tm_stage3d5_branding(player,'stgeorge-mixed20','team_player','branding.read','{}');
 if r->>'code'<>'permitted' or r->'data'->'clubStyle'->>'palette'<>'redwhite'
 or r->'data'->'teamStyle'->>'palette'<>'blackwhite' or r->'data'->>'canEditTeam'<>'false'
 then raise exception 'Player branding projection %',r;end if;
 r:=public.tm_stage3d5_branding(player,'stgeorge-mixed20','team_player','branding.team.save',
  '{"style":null,"expectedVersion":1}');
 if r->>'code'<>'role-denied' then raise exception 'Player could edit brand %',r;end if;
 r:=public.tm_stage3d5_branding(coach,'stgeorge-mixed20','team_coach','branding.club.save',
  '{"style":{"palette":"maroon"},"logo":"","resetOverrides":false,"expectedVersion":1}');
 if r->>'code'<>'committed' or not exists(select 1 from tm_private.team_branding where team_id='stgeorge-mixed20' and style->>'palette'='blackwhite')
 then raise exception 'Club save destroyed override %',r;end if;
 insert into tm_private.team_branding(team_id,style,version,changed_by) values('other-team','{"palette":"bluewhite"}',1,outsider);
 r:=public.tm_stage3d5_branding(coach,'stgeorge-mixed20','team_coach','branding.club.save',
  '{"style":{"palette":"redwhite"},"logo":"","resetOverrides":true,"expectedVersion":2}');
 if r->>'code'<>'committed' or not exists(select 1 from tm_private.team_branding where team_id='stgeorge-mixed20' and style is null and version=2)
 or not exists(select 1 from tm_private.team_branding where team_id='other-team' and style->>'palette'='bluewhite' and version=1)
 then raise exception 'Club reset crossed scope or stale version %',r;end if;
 r:=public.tm_stage3d5_branding(coach,'stgeorge-mixed20','team_coach','branding.team.save',
  '{"style":{"palette":"pitch"},"expectedVersion":1}');
 if r->>'code'<>'stale-version' then raise exception 'Stale team override %',r;end if;
 r:=public.tm_stage3d5_branding_owner(coach,'branding.revoke','{}');
 if r->>'brandingAuthorised'<>'false' then raise exception 'Branding revocation failed %',r;end if;
 r:=public.tm_stage3d5_branding(coach,'stgeorge-mixed20','team_coach','branding.club.save',
  '{"style":null,"logo":"","resetOverrides":true,"expectedVersion":3}');
 if r->>'code'<>'role-denied' then raise exception 'Revoked branding write %',r;end if;

 r:=public.tm_stage3d5_team(coach,'stgeorge-mixed20','team_coach','messages.prepare',
  jsonb_build_object('audience','all','channel','copy','body',sent_body));
 mid:=r->'data'->>'messageId';
 r:=public.tm_stage3d5_team(coach,'stgeorge-mixed20','team_coach','messages.confirm',
  jsonb_build_object('messageId',mid,'status','sent','expectedVersion',0));
 if r->>'code'<>'committed' then raise exception 'Fixture message confirmation %',r;end if;
 r:=public.tm_stage3d5_team(manager,'stgeorge-mixed20','team_manager','messages.prepare',
  '{"audience":"players","channel":"copy","body":"Manager message"}');
 mid2:=r->'data'->>'messageId';
 if mid is null or mid2 is null then raise exception 'Message fixture missing %',r;end if;
 r:=public.tm_stage3d5_communications(coach,'stgeorge-mixed20','team_coach','messages.remove',
  jsonb_build_object('entries',jsonb_build_array(jsonb_build_object('id',mid,'expectedVersion',1),jsonb_build_object('id',mid2,'expectedVersion',0))));
 if r->>'code'<>'stale-version' or not exists(select 1 from tm_private.team_message_log where message_id=mid and history_state='active')
 then raise exception 'Foreign-author batch partially removed %',r;end if;
 r:=public.tm_stage3d5_communications(coach,'stgeorge-mixed20','team_coach','messages.archive',
  jsonb_build_object('entries',jsonb_build_array(jsonb_build_object('id',mid,'expectedVersion',1))));
 if r->>'code'<>'committed' then raise exception 'Archive failed %',r;end if;
 r:=public.tm_stage3d5_team(coach,'stgeorge-mixed20','team_coach','messages.read','{}');
 if exists(select 1 from jsonb_array_elements(r->'data') e where e->>'messageId'=mid)
 then raise exception 'Archived message exposed to old client %',r;end if;
 r:=public.tm_stage3d5_communications(coach,'stgeorge-mixed20','team_coach','messages.archived','{}');
 if not exists(select 1 from jsonb_array_elements(r->'data') e where e->>'messageId'=mid and e->>'status'='sent')
 then raise exception 'Archived delivery status lost %',r;end if;
 r:=public.tm_stage3d5_communications(manager,'stgeorge-mixed20','team_manager','messages.remove',
  jsonb_build_object('entries',jsonb_build_array(jsonb_build_object('id',mid,'expectedVersion',2),jsonb_build_object('id',mid2,'expectedVersion',0))));
 if r->>'code'<>'committed' or not exists(select 1 from tm_private.team_message_log where message_id=mid and status='sent' and content=sent_body and history_state='removed')
 then raise exception 'Manager removal lost content/delivery %',r;end if;
 r:=public.tm_stage3d5_communications(coach,'stgeorge-mixed20','team_coach','messages.archived','{}');
 if exists(select 1 from jsonb_array_elements(r->'data') e where e->>'messageId'=mid)
 then raise exception 'Removed log still visible %',r;end if;
 r:=public.tm_stage3d5_communications(player,'stgeorge-mixed20','team_player','messages.archived','{}');
 if r->>'ok'<>'false' then raise exception 'Player read staff history %',r;end if;

 r:=public.tm_stage3b_operation(coach,'stgeorge-mixed20','team_coach','notice.create','stgeorge-mixed20',
  '{"mutationId":"pr295-notice-create-001","expectedVersion":0,"command":{"title":"Old notice","body":"Original details","audience":"players"}}',repeat('c',64));
 nid:=r->>'resourceId';
 r:=public.tm_stage3b_operation(coach,'stgeorge-mixed20','team_coach','notice.publish',nid,
  '{"mutationId":"pr295-notice-publish-001","expectedVersion":0,"command":{"op":"publish"}}',repeat('d',64));
 if r->>'code'<>'committed' then raise exception 'Notice fixture failed %',r;end if;
 r:=public.tm_stage3d5_communications(coach,'stgeorge-mixed20','team_coach','notice.correct',
  jsonb_build_object('noticeId',nid,'expectedVersion',1,'title','Corrected notice','body','New details','audience','players'));
 nid2:=r->'data'->>'noticeId';
 if r->>'code'<>'committed' or nid2=nid or not exists(select 1 from tm_private.team_notices where notice_id=nid and status='archived' and body='Original details')
 then raise exception 'Notice correction did not preserve original %',r;end if;
 r:=public.tm_stage3b_operation(player,'stgeorge-mixed20','team_player','notices.read','stgeorge-mixed20','{}',null);
 if not exists(select 1 from jsonb_array_elements(r->'data') e where e->>'noticeId'=nid2 and e->>'body'='New details')
 or exists(select 1 from jsonb_array_elements(r->'data') e where e->>'noticeId'=nid)
 then raise exception 'Corrected notice player read %',r;end if;
 r:=public.tm_stage3d5_communications(coach,'stgeorge-mixed20','team_coach','notice.remove',
  jsonb_build_object('entries',jsonb_build_array(jsonb_build_object('id',nid2,'expectedVersion',0))));
 if r->>'code'<>'committed' then raise exception 'Notice removal failed %',r;end if;
 r:=public.tm_stage3b_operation(player,'stgeorge-mixed20','team_player','notices.read','stgeorge-mixed20','{}',null);
 if exists(select 1 from jsonb_array_elements(r->'data') e where e->>'noticeId'=nid2)
 then raise exception 'Player saw removed notice %',r;end if;
 raise notice 'PASS PR295 communications and branding scope, history, inheritance, stale writes and revocation';
end $$;
-- PR297: shared branding and Platform-only moderation (synthetic accounts).
do $$
declare
 owner_id uuid:='11111111-1111-4111-8111-111111111111';
 manager_id uuid:='22222222-2222-4222-8222-222222222222';
 player_id uuid:='33333333-3333-4333-8333-333333333333';
 outsider_id uuid:='44444444-4444-4444-8444-444444444444';
 r jsonb; club text; v integer;
 logo_value text:='data:image/png;base64,iVBORw0KGgo=';
begin
 select club_ref into club from tm_private.teams where team_id='stgeorge-mixed20';
 select version into v from tm_private.club_branding where club_ref=club;
 if has_function_privilege('authenticated','public.tm_stage3d5_branding_moderation(uuid,text,jsonb)','EXECUTE')
 or has_table_privilege('authenticated','tm_private.club_branding_moderation','UPDATE')
 then raise exception 'Moderation exposed to browser role';end if;
 r:=public.tm_stage3d5_branding_moderation(manager_id,'branding.catalogue','{}');
 if r->>'code'<>'scope-denied' then raise exception 'Manager could access platform catalogue';end if;
 r:=public.tm_stage3d5_branding_moderation(owner_id,'branding.catalogue','{}');
 if r->>'code'<>'ready' or not exists(select 1 from jsonb_array_elements(r->'clubs') b where b->>'clubRef'=club and b->'style'->>'palette'='redwhite') then raise exception 'Owner did not see persisted branding %',r;end if;
 r:=public.tm_stage3d5_branding_owner(owner_id,'branding.authorise','{}');
 if r->>'brandingAuthorised'<>'true' then raise exception 'Delegation prerequisite';end if;
 r:=public.tm_stage3d5_branding_moderation(owner_id,'branding.moderation.save',jsonb_build_object('clubRef',club,'expectedVersion',v,'reason','owner-correction','style',jsonb_build_object('palette','maroon'),'logo',logo_value,'resetOverrides',false));
 if r->>'code'<>'ready' then raise exception 'Owner replacement failed %',r;end if;
 v:=v+1;
 r:=public.tm_stage3d5_branding(manager_id,'stgeorge-mixed20','team_manager','branding.read','{}');
 if r->>'code'<>'permitted' or r->'data'->>'logo'<>logo_value or r->'data'->'clubStyle'->>'palette'<>'maroon' then raise exception 'Manager shared logo/palette %',r;end if;
 r:=public.tm_stage3d5_branding(player_id,'stgeorge-mixed20','team_player','branding.read','{}');
 if r->>'code' is distinct from 'permitted' or r->'data'->>'logo' is distinct from logo_value then raise exception 'Player shared logo %',r;end if;
 r:=public.tm_stage3d5_branding(outsider_id,'stgeorge-mixed20','team_volunteer','branding.read','{}');
 if r->>'code' is distinct from 'permitted' or r->'data'->>'logo' is distinct from logo_value then raise exception 'Volunteer shared logo %',r;end if;
 insert into tm_private.role_grants(grant_id,user_id,team_id,role,status,approved_by,approved_at)
 values('grant-pr297-assistant',outsider_id,'stgeorge-mixed20','team_assistant','active',owner_id,now()),
       ('grant-pr297-viewer',outsider_id,'stgeorge-mixed20','team_play_viewer','active',owner_id,now());
 r:=public.tm_stage3d5_branding(outsider_id,'stgeorge-mixed20','team_assistant','branding.read','{}');
 if r->>'code' is distinct from 'permitted' or r->'data'->>'logo' is distinct from logo_value then raise exception 'Assistant shared logo %',r;end if;
 r:=public.tm_stage3d5_branding(outsider_id,'stgeorge-mixed20','team_play_viewer','branding.read','{}');
 if r->>'code' is distinct from 'permitted' or r->'data'->>'logo' is distinct from logo_value or r->'data'->>'canEditTeam' is distinct from 'false' then raise exception 'Viewer shared logo %',r;end if;
 r:=public.tm_stage3d5_branding(outsider_id,'other-team','team_play_viewer','branding.read','{}');
 if r->>'code' is distinct from 'scope-denied' then raise exception 'Viewer crossed team scope';end if;
 update tm_private.role_grants set status='revoked' where grant_id='grant-pr297-viewer';
 r:=public.tm_stage3d5_branding(outsider_id,'stgeorge-mixed20','team_play_viewer','branding.read','{}');
 if r->>'code' is distinct from 'scope-denied' then raise exception 'Revoked Viewer read branding';end if;
 r:=public.tm_stage3d5_branding_moderation(owner_id,'branding.moderation.remove',jsonb_build_object('clubRef',club,'expectedVersion',v,'reason','inappropriate-image'));
 if r->>'code'<>'ready' then raise exception 'Owner remove failed %',r;end if;
 r:=public.tm_stage3d5_branding(owner_id,'stgeorge-mixed20','team_coach','branding.club.save',jsonb_build_object('style',null,'logo','','expectedVersion',v+1,'resetOverrides',false));
 if r->>'code'<>'role-denied' then raise exception 'Coach bypassed moderation lock %',r;end if;
 r:=public.tm_stage3d5_branding(owner_id,'stgeorge-mixed20','team_coach','branding.read','{}');
 if r->'data'->>'locked' is distinct from 'true' or r->'data'->>'logo' is distinct from '' or r->'data'->>'canEditTeam' is distinct from 'false' then raise exception 'Lock not projected %',r;end if;
 r:=public.tm_stage3d5_branding_moderation(owner_id,'branding.moderation.save',jsonb_build_object('clubRef',club,'expectedVersion',v+1,'reason','owner-correction','style',jsonb_build_object('palette','maroon'),'logo',logo_value,'resetOverrides',false));
 if r->>'code' is distinct from 'ready' then raise exception 'Owner replacement while locked failed %',r;end if;
 v:=v+1;
 r:=public.tm_stage3d5_branding(player_id,'stgeorge-mixed20','team_player','branding.read','{}');
 if r->'data'->>'locked' is distinct from 'true' or r->'data'->>'logo' is distinct from logo_value then raise exception 'Replacement removed lock or failed to propagate %',r;end if;
 r:=public.tm_stage3d5_branding_moderation(manager_id,'branding.moderation.unlock',jsonb_build_object('clubRef',club,'expectedVersion',v+1,'reason','resolved'));
 if r->>'code'<>'scope-denied' then raise exception 'Non-owner unlocked moderation';end if;
 r:=public.tm_stage3d5_branding_moderation(owner_id,'branding.moderation.unlock',jsonb_build_object('clubRef',club,'expectedVersion',v,'reason','resolved'));
 if r->>'code'<>'stale-version' then raise exception 'Stale moderation accepted';end if;
 r:=public.tm_stage3d5_branding_moderation(owner_id,'branding.moderation.unlock',jsonb_build_object('clubRef',club,'expectedVersion',v+1,'reason','resolved'));
 if r->>'code'<>'ready' then raise exception 'Owner unlock failed %',r;end if;
 r:=public.tm_stage3d5_branding_moderation(owner_id,'branding.history',jsonb_build_object('clubRef',club));
 if r->>'code'<>'ready' or not exists(select 1 from jsonb_array_elements(r->'events') a where a->>'reason'='inappropriate-image' and a->>'actor'=owner_id::text) then raise exception 'Missing moderation audit %',r;end if;
 r:=public.tm_stage3d5_branding_moderation(owner_id,'branding.moderation.revoke',jsonb_build_object('clubRef',club,'expectedVersion',v+2,'reason','policy-review'));
 if r->>'code'<>'ready' or exists(select 1 from tm_private.club_branding_grants where club_ref=club and active) then raise exception 'Revocation failed %',r;end if;
 if not exists(select 1 from tm_private.team_branding where team_id='other-team' and style->>'palette'='bluewhite' and version=1) then raise exception 'Other club changed';end if;
 raise notice 'PASS PR297 branding catalogue, shared role projection, moderation, audit and lock controls';
end $$;
rollback;
