-- Stage 2 A-D: disposable PostgreSQL, all identities and plays fictional.
-- Always executes inside a transaction, ending in ROLLBACK.
begin;
insert into auth.users(id) values
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222'),
 ('33333333-3333-4333-8333-333333333333'),
 ('44444444-4444-4444-8444-444444444444'),
 ('55555555-5555-4555-8555-555555555555'),
 ('66666666-6666-4666-8666-666666666666');
insert into tm_private.accounts(user_id,status)
  select id,'active' from auth.users;
insert into tm_private.teams(team_id,club_ref,sport_ref,season_ref,status) values
 ('comets-qa-u16','Fictional Comets','oztag','2026','active'),
 ('rangers-qa-u16','Fictional Rangers','oztag','2026','active');
insert into tm_private.persons(person_id,lifecycle) values
 ('fictional-player-1','active');
insert into tm_private.account_person_links(
 user_id,person_id,status,verified_by,verified_at) values
 ('33333333-3333-4333-8333-333333333333','fictional-player-1',
 'verified','66666666-6666-4666-8666-666666666666',now());
insert into tm_private.participations(
 team_id,person_id,status,verified_by,verified_at)
 values('comets-qa-u16','fictional-player-1','active',
 '66666666-6666-4666-8666-666666666666',now());
insert into tm_private.platform_operator_grants(user_id,status,approved_by,approved_at)
 values('11111111-1111-4111-8111-111111111111','active',
 '66666666-6666-4666-8666-666666666666',now());
insert into tm_private.role_grants(
 grant_id,user_id,team_id,role,status,approved_by,approved_at)
 values
 ('owner-coach','11111111-1111-4111-8111-111111111111','comets-qa-u16',
  'team_coach','active','66666666-6666-4666-8666-666666666666',now()),
 ('assistant','44444444-4444-4444-8444-444444444444','comets-qa-u16',
  'team_assistant','active','66666666-6666-4666-8666-666666666666',now()),
 ('player','33333333-3333-4333-8333-333333333333','comets-qa-u16',
  'team_player','active','66666666-6666-4666-8666-666666666666',now()),
 ('viewer','55555555-5555-4555-8555-555555555555','comets-qa-u16',
  'team_play_viewer','active','66666666-6666-4666-8666-666666666666',now()),
 ('foreign','22222222-2222-4222-8222-222222222222','rangers-qa-u16',
  'team_coach','active','66666666-6666-4666-8666-666666666666',now());

do $$
declare
  owner_id uuid:='11111111-1111-4111-8111-111111111111';
  foreign_id uuid:='22222222-2222-4222-8222-222222222222';
  player_id uuid:='33333333-3333-4333-8333-333333333333';
  assistant_id uuid:='44444444-4444-4444-8444-444444444444';
  viewer_id uuid:='55555555-5555-4555-8555-555555555555';
  reviewer_id uuid:='66666666-6666-4666-8666-666666666666';
  team text:='comets-qa-u16';
  play_id text;
  rev_id text;
  version integer;
  r jsonb;
  first_result jsonb;
  before_count integer;
  payload jsonb:='{"name":"Step Out","sport":"oztag","players":{"LM":[24.6,49.6],"RM":[25,46]},"moves":[{"t":"pass","pts":[[24.6,49.6],[25,46]]}],"phases":[{"title":"Phase 2","players":{"LM":[28,42]},"moves":[]}],"steps":"Coach authored","eventTimeline":{"version":1,"actors":[],"events":[]}}'::jsonb;
begin
  if has_function_privilege('anon',
       'public.tm_stage2_play_operation(uuid,text,text,text,text,jsonb,text)','EXECUTE')
      or has_function_privilege('authenticated',
       'public.tm_stage2_play_operation(uuid,text,text,text,text,jsonb,text)','EXECUTE')
      or not has_function_privilege('service_role',
       'public.tm_stage2_play_operation(uuid,text,text,text,text,jsonb,text)','EXECUTE')
      or has_table_privilege('authenticated','tm_private.plays','SELECT')
      or has_table_privilege('authenticated','tm_private.platform_operator_grants','SELECT')
  then raise exception 'Stage 2 private ACL failure'; end if;
  if has_function_privilege('anon','public.tm_my_operator_context()','EXECUTE')
    or not has_function_privilege('authenticated',
      'public.tm_my_operator_context()','EXECUTE')
  then raise exception 'operator context ACL failure'; end if;

  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  r:=public.tm_my_operator_context();
  if r->>'isOwner'<>'true' then raise exception 'owner missing independent grant'; end if;
  select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) into r
    from public.tm_my_team_context() c;
  if jsonb_array_length(r)<>1 then
    raise exception 'one signed-in owner+coach account lost team role'; end if;
  perform set_config('request.jwt.claim.sub',reviewer_id::text,true);
  r:=public.tm_my_operator_context();
  if r->>'isOwner'<>'false' then
    raise exception 'operator privilege inferred from reviewer account'; end if;
  perform set_config('request.jwt.claim.sub','',true);
  r:=public.tm_my_operator_context();
  if r->>'isOwner'<>'false' then
    raise exception 'anonymous access to owner grant'; end if;

  -- Platform owner by itself is NOT a team grant.
  r:=public.tm_stage2_play_operation(reviewer_id,team,'team_coach',
    'play.draft.read',team,'{}'::jsonb,null);
  if r->>'code'<>'scope-denied' then raise exception 'unauthorised reviewer saw drafts'; end if;
  r:=public.tm_stage2_play_operation(owner_id,team,'team_coach',
    'play.draft.edit',team,
    jsonb_build_object('mutationId','stage2-create-000001',
      'expectedVersion',0,'command',jsonb_build_object('op','create','play',payload)),
    repeat('a',64));
  first_result:=r;
  if r->>'code'<>'committed' or r->>'version'<>'0' then
    raise exception 'coach create failed: %',r; end if;
  play_id:=r->>'resourceId';rev_id:=r->>'revisionId';version:=0;

  -- Coach-only draft cannot appear in the public/published projection.
  r:=public.tm_stage2_play_operation(player_id,team,'team_player',
    'play.published.read',team,'{}'::jsonb,null);
  if r->>'code'<>'permitted' or jsonb_array_length(r->'data')<>0 then
    raise exception 'player can see draft: %',r; end if;
  r:=public.tm_stage2_play_operation(player_id,team,'team_player',
    'play.draft.read',team,'{}'::jsonb,null);
  if r->>'code'<>'role-denied' then raise exception 'player draft exposed'; end if;
  r:=public.tm_stage2_play_operation(foreign_id,team,'team_coach',
    'play.draft.read',team,'{}'::jsonb,null);
  if r->>'code'<>'scope-denied' then raise exception 'foreign coach draft exposed'; end if;

  -- Assistant may save a new revision, but cannot publish it.
  r:=public.tm_stage2_play_operation(assistant_id,team,'team_assistant',
    'play.draft.edit',play_id,
    jsonb_build_object('mutationId','stage2-assistant-0001',
      'expectedVersion',0,'command',jsonb_build_object('op','save','play',payload)),
    repeat('b',64));
  if r->>'code'<>'committed' or r->>'version'<>'1' then
    raise exception 'assistant draft edit failed: %',r; end if;
  rev_id:=r->>'revisionId';version:=1;
  r:=public.tm_stage2_play_operation(assistant_id,team,'team_assistant',
    'play.publish',play_id,
    jsonb_build_object('mutationId','stage2-assistant-pub1',
      'expectedVersion',1,'revisionId',rev_id),repeat('c',64));
  if r->>'code'<>'role-denied' then raise exception 'assistant published play'; end if;
  r:=public.tm_stage2_play_operation(owner_id,team,'team_coach',
    'play.publish',play_id,
    jsonb_build_object('mutationId','stage2-publish-00001',
      'expectedVersion',1,'revisionId',rev_id),repeat('d',64));
  if r->>'code'<>'committed' or r->>'version'<>'2' then
    raise exception 'head coach publish failed: %',r; end if;

  -- Player and separately granted viewer receive the exact saved E5 JSON,
  -- with authored geometry, phase order and timing preserved.
  r:=public.tm_stage2_play_operation(player_id,team,'team_player',
    'play.published.read',team,'{}'::jsonb,null);
  if r->>'code'<>'permitted' or jsonb_array_length(r->'data')<>1
    or r->'data'->0->'play'<>payload then
    raise exception 'published payload changed or missing: %',r; end if;
  r:=public.tm_stage2_play_operation(viewer_id,team,'team_play_viewer',
    'play.published.read',team,'{}'::jsonb,null);
  if jsonb_array_length(r->'data')<>1 then
    raise exception 'explicit play viewer grant not effective'; end if;
  r:=public.tm_stage2_play_operation(owner_id,team,'team_coach',
    'play.publish',play_id,
    jsonb_build_object('mutationId','stage2-publish-00001',
      'expectedVersion',1,'revisionId',rev_id),repeat('d',64));
  if r->>'code'<>'committed' or r->>'version'<>'2' then
    raise exception 'identical publish replay failed'; end if;
  r:=public.tm_stage2_play_operation(owner_id,team,'team_coach',
    'play.publish',play_id,
    jsonb_build_object('mutationId','stage2-duplicate-0001',
      'expectedVersion',1,'revisionId',rev_id),repeat('e',64));
  if r->>'code'<>'stale-play' then raise exception 'stale publish committed'; end if;
  r:=public.tm_stage2_play_operation(owner_id,team,'team_coach',
    'play.draft.read',team,'{}'::jsonb,null);
  if r->>'code'<>'permitted' then raise exception 'coach cannot read saved source'; end if;

  update tm_private.role_grants set status='revoked' where grant_id='player';
  r:=public.tm_stage2_play_operation(player_id,team,'team_player',
    'play.published.read',team,'{}'::jsonb,null);
  if r->>'code'<>'scope-denied' then raise exception 'revoked player still read published play'; end if;
  update tm_private.platform_operator_grants set status='revoked'
    where user_id=owner_id;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  if public.tm_my_operator_context()->>'isOwner'<>'false'
    then raise exception 'revoked platform owner still active'; end if;
  -- Revoked platform role has no effect on independently approved Coach grant.
  r:=public.tm_stage2_play_operation(owner_id,team,'team_coach',
    'play.draft.read',team,'{}'::jsonb,null);
  if r->>'code'<>'permitted' then raise exception 'independent coach grant broken'; end if;

  -- Force a database failure in the audit insert; the whole play/receipt
  -- transaction must roll back, including its version and draft revision.
  select count(*) into before_count from tm_private.mutation_receipts;
  begin
    alter table tm_private.audit_events add constraint stage2_audit_block
      check (action<>'play.draft.edit') not valid;
    r:=public.tm_stage2_play_operation(owner_id,team,'team_coach',
      'play.draft.edit',play_id,
      jsonb_build_object('mutationId','stage2-fault-0000001',
        'expectedVersion',2,'command',jsonb_build_object('op','save','play',payload)),
      repeat('f',64));
    raise exception 'audit injection unexpectedly succeeded';
  exception when check_violation then
    null;
  end;
  if (select count(*) from tm_private.mutation_receipts)<>before_count
    or (select resource_version from tm_private.plays where tm_private.plays.play_id=first_result->>'resourceId')<>2
  then raise exception 'failed audit did not roll back play or receipt'; end if;
  raise notice 'PASS: Stage 2 one identity two roles, independent grants, E5 lossless publish, replay, revocation, rollback';
end;
$$;
rollback;
