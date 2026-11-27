-- Additive owner-only template catalogue. No collection from team data.
begin;
create table tm_private.owner_play_templates (
 template_id text primary key check(template_id ~ '^tpl-[a-f0-9]{32}$'),
 play jsonb not null check(jsonb_typeof(play)='object' and octet_length(play::text)<=65536),
 source text not null default 'owner-authorised-upload' check(source='owner-authorised-upload'),
 reviewed_by uuid not null references tm_private.accounts(user_id) on delete restrict,
 reviewed_at timestamptz not null default now(),
 state text not null default 'active' check(state in ('active','withdrawn')),
 withdrawn_at timestamptz,
 check((state='withdrawn')=(withdrawn_at is not null))
);
alter table tm_private.owner_play_templates enable row level security;
alter table tm_private.owner_play_templates force row level security;
revoke all on tm_private.owner_play_templates from public,anon,authenticated,service_role;
create function public.tm_stage4_owner_templates(p_actor uuid,p_action text,p_input jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_id text; v_play jsonb; rows jsonb;
begin
 if not tm_private.stage3d4_owner_policy_ready(p_actor)
 or not exists(select 1 from tm_private.accounts where user_id=p_actor and status='active')
 then return jsonb_build_object('ok',false,'code','scope-denied');end if;
 if p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>66000
 then return jsonb_build_object('ok',false,'code','invalid-request');end if;
 if p_action='template.list' then
  if p_input<>'{}'::jsonb then return jsonb_build_object('ok',false,'code','invalid-request');end if;
  select coalesce(jsonb_agg(jsonb_build_object('templateId',template_id,'name',play->>'name','state',state,'source',source) order by reviewed_at desc,template_id),'[]'::jsonb)
  into rows from tm_private.owner_play_templates;
  return jsonb_build_object('ok',true,'code','ready','templates',rows);
 end if;
 v_id:=p_input->>'templateId';
 if coalesce(v_id,'') !~ '^tpl-[a-f0-9]{32}$' then return jsonb_build_object('ok',false,'code','invalid-request');end if;
 if p_action='template.add' then
  if p_input-'templateId'-'play'-'rightsConfirmed'-'privacyReviewed'<>'{}'::jsonb
  or p_input->'rightsConfirmed' is distinct from 'true'::jsonb
  or p_input->'privacyReviewed' is distinct from 'true'::jsonb
  or jsonb_typeof(p_input->'play') is distinct from 'object'
  or jsonb_typeof(p_input->'play'->'name') is distinct from 'string'
  or length(trim(p_input->'play'->>'name')) not between 1 and 120
  or jsonb_typeof(p_input->'play'->'players') is distinct from 'object'
  or jsonb_typeof(p_input->'play'->'moves') is distinct from 'array'
  then return jsonb_build_object('ok',false,'code','invalid-request');end if;
  -- Serialize capacity check and add. No source team query, no bulk collection.
  perform pg_advisory_xact_lock(hashtextextended('stage4-owner-templates',0));
  if (select count(*) from tm_private.owner_play_templates)>=200 then
   return jsonb_build_object('ok',false,'code','scope-denied');end if;
  insert into tm_private.owner_play_templates(template_id,play,reviewed_by)
   values(v_id,p_input->'play',p_actor) on conflict do nothing;
  if not found then return jsonb_build_object('ok',false,'code','stale-version');end if;
 elsif p_action='template.get' then
  if p_input-'templateId'<>'{}'::jsonb then return jsonb_build_object('ok',false,'code','invalid-request');end if;
  select play into v_play from tm_private.owner_play_templates where template_id=v_id and state='active';
  if not found then return jsonb_build_object('ok',false,'code','scope-denied');end if;
  return jsonb_build_object('ok',true,'code','ready','templateId',v_id,'play',v_play);
 elsif p_action='template.withdraw' then
  if p_input-'templateId'<>'{}'::jsonb then return jsonb_build_object('ok',false,'code','invalid-request');end if;
  update tm_private.owner_play_templates set state='withdrawn',withdrawn_at=now()
   where template_id=v_id and state='active';
  if not found then return jsonb_build_object('ok',false,'code','stale-version');end if;
 else return jsonb_build_object('ok',false,'code','invalid-request');end if;
 return jsonb_build_object('ok',true,'code','ready','templateId',v_id);
end $$;
revoke all on function public.tm_stage4_owner_templates(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.tm_stage4_owner_templates(uuid,text,jsonb) to service_role;
commit;
