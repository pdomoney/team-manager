-- Additive private Owner-authored template catalogue. No user-play collection.
begin;
create table tm_private.owner_play_templates (
 template_id text primary key check(template_id ~ '^template-[a-f0-9]{32}$'),
 owner_id uuid not null references tm_private.accounts(user_id) on delete restrict,
 version integer not null check(version>0),
 state text not null check(state in ('active','archived')),
 origin text not null check(origin='owner-authored'),
 play jsonb not null check(jsonb_typeof(play)='object' and octet_length(play::text)<=65000),
 created_at timestamptz not null default now(),
 changed_at timestamptz not null default now()
);
alter table tm_private.owner_play_templates enable row level security;
alter table tm_private.owner_play_templates force row level security;
revoke all on tm_private.owner_play_templates from public,anon,authenticated,service_role;
create function public.tm_stage4_owner_templates(p_actor uuid,p_action text,p_input jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r tm_private.owner_play_templates%rowtype; tid text; rows jsonb; expected integer; p jsonb;
begin
 if p_actor is null or not tm_private.stage3d4_owner_policy_ready(p_actor)
 or not exists(select 1 from tm_private.accounts where user_id=p_actor and status='active')
 then return jsonb_build_object('ok',false,'code','scope-denied');end if;
 if p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>66000
 then return jsonb_build_object('ok',false,'code','invalid-request');end if;
 if p_action='template.list' then
  if p_input<>'{}'::jsonb then return jsonb_build_object('ok',false,'code','invalid-request');end if;
  select coalesce(jsonb_agg(jsonb_build_object('templateId',template_id,'version',version,'state',state,
    'origin',origin,'name',play->>'name','sport',play->>'sport') order by changed_at desc,template_id),'[]'::jsonb)
   into rows from tm_private.owner_play_templates where owner_id=p_actor;
  return jsonb_build_object('ok',true,'code','ready','templates',rows);
 end if;
 tid:=p_input->>'templateId';
 if tid is null or tid !~ '^template-[a-f0-9]{32}$' then return jsonb_build_object('ok',false,'code','invalid-request');end if;
 if p_action='template.read' then
  if p_input-'templateId'<>'{}'::jsonb then return jsonb_build_object('ok',false,'code','invalid-request');end if;
  select * into r from tm_private.owner_play_templates where owner_id=p_actor and template_id=tid and state='active';
  if not found then return jsonb_build_object('ok',false,'code','scope-denied');end if;
  return jsonb_build_object('ok',true,'code','ready','play',r.play,'version',r.version,'origin',r.origin);
 end if;
 if p_action not in ('template.create','template.archive') or p_action is null then return jsonb_build_object('ok',false,'code','invalid-request');end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text||':owner-play-templates',0));
 select * into r from tm_private.owner_play_templates where owner_id=p_actor and template_id=tid for update;
 if p_action='template.create' then
  p:=p_input->'play';
  if p_input-'templateId'-'play'-'ownerAuthored'<>'{}'::jsonb or p_input->'ownerAuthored' is distinct from 'true'::jsonb
   or jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>65000
   or jsonb_typeof(p->'name') is distinct from 'string' or length(trim(p->>'name')) not between 1 and 120
   or jsonb_typeof(p->'players') is distinct from 'object' or jsonb_typeof(p->'moves') is distinct from 'array'
   or exists(select 1 from jsonb_object_keys(p) k where k not in ('id','name','sport','category','headline','when','steps','side','builtin','rev','edited','players','defence','moves','focus','ghost','view','tags','notes','labels','title','phases','set','setDef','who','study','rules','eventTimeline'))
   then return jsonb_build_object('ok',false,'code','invalid-request');end if;
  if r.template_id is not null then return jsonb_build_object('ok',false,'code','stale-version');end if;
  if (select count(*) from tm_private.owner_play_templates where owner_id=p_actor)>=200 then return jsonb_build_object('ok',false,'code','invalid-request');end if;
  insert into tm_private.owner_play_templates(template_id,owner_id,version,state,origin,play)
   values(tid,p_actor,1,'active','owner-authored',p);
 else
  if p_input-'templateId'-'expectedVersion'<>'{}'::jsonb or coalesce(p_input->>'expectedVersion','') !~ '^[1-9][0-9]{0,8}$'
   then return jsonb_build_object('ok',false,'code','invalid-request');end if;
  expected:=(p_input->>'expectedVersion')::integer;
  if r.template_id is null or r.version<>expected or r.state<>'active'
   then return jsonb_build_object('ok',false,'code','stale-version');end if;
  update tm_private.owner_play_templates set state='archived',version=version+1,changed_at=now()
   where template_id=tid and owner_id=p_actor;
 end if;
 insert into tm_private.audit_events(user_id,action,resource_id,decision,reason_code)
  values(p_actor,'platform.'||p_action,tid,'ALLOW','owner-authored-template');
 return jsonb_build_object('ok',true,'code','ready');
end;
$$;
revoke all on function public.tm_stage4_owner_templates(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.tm_stage4_owner_templates(uuid,text,jsonb) to service_role;
commit;
