-- Synthetic only. Run after all current migrations.
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

insert into tm_private.accounts(user_id,status) values
 ('22222222-2222-4222-8222-222222222222','active'),('33333333-3333-4333-8333-333333333333','active');
insert into tm_private.registration_adult_reviews(user_id,reviewed_by,reviewed_at,evidence_ref,state)
 select user_id,'11111111-1111-4111-8111-111111111111',now(),'evidence-ref/synthetic-assignment-review','approved'
 from tm_private.accounts where user_id in ('22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333');
insert into tm_private.registration_acceptances(user_id,policy_id,terms_accepted,privacy_acknowledged,marketing_opt_in)
 select user_id,'fictional-stg3d5-policy',true,true,false from tm_private.accounts
 where user_id in ('22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333');
insert into tm_private.account_person_links(user_id,person_id,status,verified_by,verified_at)
 values('33333333-3333-4333-8333-333333333333','player-p','verified','11111111-1111-4111-8111-111111111111',now());
insert into tm_private.role_grants(grant_id,user_id,team_id,role,status,approved_by,approved_at)
 values('synthetic-assistant','22222222-2222-4222-8222-222222222222','stgeorge-mixed20','team_assistant','active','11111111-1111-4111-8111-111111111111',now()),
 ('synthetic-player','33333333-3333-4333-8333-333333333333','stgeorge-mixed20','team_player','active','11111111-1111-4111-8111-111111111111',now());
insert into tm_private.sessions(session_id,team_id,kind,starts_at,status)
 values('session-training','stgeorge-mixed20','training',now()+interval '1 day','planned'),
 ('session-match','stgeorge-mixed20','match',now()+interval '2 days','planned'),
 ('session-other','other-team','training',now()+interval '1 day','planned');
do $$
declare
 coach uuid:='11111111-1111-4111-8111-111111111111';
 assistant uuid:='22222222-2222-4222-8222-222222222222';
 player uuid:='33333333-3333-4333-8333-333333333333';
 t text:='stgeorge-mixed20'; p text; rev text; r jsonb; x jsonb;
begin
 if has_table_privilege('authenticated','tm_private.play_assignments','SELECT') or
 has_function_privilege('authenticated','public.tm_stage4_play_assignments(uuid,text,text,text,jsonb)','EXECUTE')
 then raise exception 'private assignment ACL failure';end if;
 r:=public.tm_stage2_play_operation(coach,t,'team_coach','play.draft.edit',t,
  '{"mutationId":"synthetic-create-001","expectedVersion":0,"command":{"op":"create","play":{"id":"step","name":"Step","players":{"LM":[24,46]},"moves":[]}}}',repeat('a',64));
 if r->>'code' is distinct from 'committed' then raise exception 'create %',r;end if;
 p:=r->>'resourceId';rev:=r->>'revisionId';
 x:=jsonb_build_object('sessionId','session-training','sessionVersion',0,'playId',p,'revisionId',rev,'expectedVersion',0);
 r:=public.tm_stage4_play_assignments(assistant,t,'team_assistant','play.assignment.propose',x);
 if r->>'code' is distinct from 'stale-version' then raise exception 'draft assigned %',r;end if;
 r:=public.tm_stage2_play_operation(coach,t,'team_coach','play.publish',p,
  jsonb_build_object('mutationId','synthetic-publish-001','expectedVersion',0,'revisionId',rev),repeat('b',64));
 if r->>'code' is distinct from 'committed' then raise exception 'publish %',r;end if;
 r:=public.tm_stage4_play_assignments(assistant,t,'team_assistant','play.assignment.propose',x);
 if r->>'code' is distinct from 'committed' then raise exception 'assistant proposal %',r;end if;
 x:=x||'{"expectedVersion":1}'::jsonb;
 r:=public.tm_stage4_play_assignments(player,t,'team_player','play.assignment.read','{"sessionId":"session-training"}');
 if r->>'code' is distinct from 'permitted' or jsonb_array_length(r->'data'->'rows')<>0 then raise exception 'unapproved assignment exposed %',r;end if;
 r:=public.tm_stage4_play_assignments(assistant,t,'team_assistant','play.assignment.approve',x);
 if r->>'code' is distinct from 'role-denied' then raise exception 'assistant approved %',r;end if;
 r:=public.tm_stage4_play_assignments(coach,t,'team_coach','play.assignment.approve',x);
 if r->>'code' is distinct from 'committed' then raise exception 'coach approve %',r;end if;
 r:=public.tm_stage4_play_assignments(player,t,'team_player','play.assignment.read','{"sessionId":"session-training"}');
 if r->>'code' is distinct from 'permitted' or r->'data'->'rows'->0->>'reason' is distinct from 'current' then raise exception 'player approved assignment %',r;end if;
 r:=public.tm_stage4_play_assignments(coach,t,'team_coach','play.assignment.approve',x);
 if r->>'code' is distinct from 'stale-version' then raise exception 'stale write accepted %',r;end if;
 r:=public.tm_stage4_play_assignments(coach,t,'team_coach','play.assignment.propose',x||'{"sessionId":"session-other","expectedVersion":0}');
 if r->>'code' is distinct from 'scope-denied' then raise exception 'cross-team session %',r;end if;
 r:=public.tm_stage4_play_assignments(coach,t,'team_coach','play.assignment.propose',x||'{"sessionId":"session-match","expectedVersion":0}');
 if r->>'code' is distinct from 'committed' then raise exception 'match proposal %',r;end if;
 update tm_private.sessions set resource_version=1 where session_id='session-training';
 r:=public.tm_stage4_play_assignments(player,t,'team_player','play.assignment.read','{"sessionId":"session-training"}');
 if r->>'code' is distinct from 'permitted' or jsonb_array_length(r->'data'->'rows')<>0 then raise exception 'stale session visible %',r;end if;
 r:=public.tm_stage4_play_assignments(coach,t,'team_coach','play.assignment.read','{"sessionId":"session-training"}');
 if r->'data'->'rows'->0->>'reason' is distinct from 'session-changed' then raise exception 'missing omission reason %',r;end if;
 update tm_private.role_grants set status='revoked' where grant_id='synthetic-player';
 r:=public.tm_stage4_play_assignments(player,t,'team_player','play.assignment.read','{"sessionId":"session-training"}');
 if r->>'code' is distinct from 'scope-denied' then raise exception 'revoked player read %',r;end if;
 -- Template catalogue is independent of team permissions and contains no seeded private plays.
 if has_table_privilege('authenticated','tm_private.owner_play_templates','SELECT') or
 has_function_privilege('authenticated','public.tm_stage4_owner_templates(uuid,text,jsonb)','EXECUTE')
 then raise exception 'template ACL failure';end if;
 r:=public.tm_stage4_owner_templates(assistant,'template.list','{}');
 if r->>'code' is distinct from 'scope-denied' then raise exception 'assistant template access %',r;end if;
 r:=public.tm_stage4_owner_templates(coach,'template.list','{}');
 if r->>'code' is distinct from 'ready' or jsonb_array_length(r->'templates')<>0 then raise exception 'unexpected initial templates %',r;end if;
 x:='{"templateId":"tpl-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","play":{"id":"step","name":"Step","players":{"LM":[24,46]},"moves":[]},"rightsConfirmed":true,"privacyReviewed":true}';
 r:=public.tm_stage4_owner_templates(coach,'template.add',x-'rightsConfirmed');
 if r->>'code' is distinct from 'invalid-request' then raise exception 'missing rights accepted %',r;end if;
 r:=public.tm_stage4_owner_templates(coach,'template.add',x);
 if r->>'code' is distinct from 'ready' then raise exception 'template upload %',r;end if;
 r:=public.tm_stage4_owner_templates(coach,'template.get',jsonb_build_object('templateId',x->>'templateId'));
 if r->'play' is distinct from x->'play' then raise exception 'template payload changed %',r;end if;
 r:=public.tm_stage4_owner_templates(coach,'template.withdraw',jsonb_build_object('templateId',x->>'templateId'));
 if r->>'code' is distinct from 'ready' then raise exception 'withdraw %',r;end if;
 r:=public.tm_stage4_owner_templates(coach,'template.get',jsonb_build_object('templateId',x->>'templateId'));
 if r->>'code' is distinct from 'scope-denied' then raise exception 'withdrawn export %',r;end if;
 raise notice 'PASS Stage 4 exact-session assignments and owner-only reviewed template lifecycle';
end $$;
rollback;
