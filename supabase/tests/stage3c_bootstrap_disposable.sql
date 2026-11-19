-- Disposable CI ONLY, never run against a real Supabase project.
-- The production auth.users table already contains email_confirmed_at.
alter table auth.users add column email_confirmed_at timestamptz;
insert into auth.users(id,email_confirmed_at) values
('11111111-1111-4111-8111-111111111111',now()),
('22222222-2222-4222-8222-222222222222',now());
\set coach_uuid 11111111-1111-4111-8111-111111111111
\set manager_uuid 22222222-2222-4222-8222-222222222222
\set approval_ref evidence-ref/stage3c-disposable-ci-approved
\ir ../stage3c/bootstrap_reviewers.sql
do $$
begin
 if (select count(*) from tm_private.role_grants
   where team_id='stage3c-comets' and status='active'
   and approved_by<>user_id)=2
   and (select count(*) from tm_private.account_person_links
     where status='verified' and verified_by<>user_id)=2
   and (select count(*) from tm_private.teams
     where team_id='stage3c-denial' and status='active')=1 then
   raise notice 'PASS: Stage 3C isolated reviewer bootstrap, person links and denial team';
 else raise exception 'Stage 3C bootstrap failed to establish expected roles'; end if;
end $$;
