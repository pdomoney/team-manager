create function public.tm_stage3d5_team(
 p_actor uuid,p_team text,p_role text,p_action text,p_input jsonb
) returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare
 now_at timestamptz:=now();
 allowed boolean;
 admin_ok boolean;
 obj jsonb:=coalesce(p_input,'{}'::jsonb);
 records jsonb;
 row_version integer;
 ref text;
 v_email text;
 v_role text;
 v_inv tm_private.team_invitations%rowtype;
 v_user uuid;
 v_evidence text;
 v_label text;
begin
 if p_actor is null or p_team is null or p_team !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$'
   or p_role not in ('team_coach','team_manager') or
   p_action not in ('settings.read','settings.save','jerseys.read','jerseys.issue',
     'jerseys.return','competitions.read','competitions.create','competitions.update',
     'competitions.fixture','messages.read','messages.prepare','messages.confirm',
     'team.members','volunteers.list','admin.status','duties.board','duties.assign','duties.withdraw','invite.list','invite.issue','invite.review-adult',
     'invite.activate','invite.revoke') or jsonb_typeof(obj)<>'object'
   or pg_catalog.length(obj::text)>5000
 then return jsonb_build_object('ok',false,'code','invalid-request'); end if;
 allowed:=tm_private.stage3d5_staff(p_actor,p_team,p_role);
 if not allowed then return jsonb_build_object('ok',false,'code','scope-denied'); end if;
 admin_ok:=tm_private.stage3d5_team_admin(p_actor,p_team,p_role);
 if p_action in ('settings.read','jerseys.read','competitions.read','messages.read',
                'team.members','volunteers.list','admin.status','duties.board','invite.list') then
   if obj<>'{}'::jsonb then return jsonb_build_object('ok',false,'code','invalid-request'); end if;
 else
   -- Stop forged approval, role, account or eligibility claims.
   if obj ?| array['userId','accountId','isAdmin','approvedBy','verified',
      'registered','eligible','accredited','officialVerified','teamId']
   then return jsonb_build_object('ok',false,'code','invalid-request'); end if;
   perform 1 from tm_private.teams t where t.team_id=p_team and t.status='active' for update;
   if not found then return jsonb_build_object('ok',false,'code','scope-denied'); end if;
 end if;

 if p_action='settings.read' then
  select jsonb_build_object('teamLabel',coalesce(s.team_label,''),
    'trainingVenue',coalesce(s.training_venue,''),
    'trainingStart',coalesce(s.training_start,''),
    'trainingEnd',coalesce(s.training_end,''),
    'contactName',coalesce(s.contact_name,''),
    'contactEmail',coalesce(s.contact_email,''),
    'jerseyLoan',coalesce(s.jersey_loan,false),'version',coalesce(s.version,0))
   into records from tm_private.teams t left join tm_private.team_preferences s
     on s.team_id=t.team_id where t.team_id=p_team;
 elsif p_action='settings.save' then
  if not admin_ok or (obj-'teamLabel'-'trainingVenue'-'trainingStart'-'trainingEnd'-
      'contactName'-'contactEmail'-'jerseyLoan'-'expectedVersion')<>'{}'::jsonb or
      jsonb_typeof(obj->'expectedVersion')<>'number'
      or coalesce((obj->>'expectedVersion')::text,'') !~ '^(0|[1-9][0-9]{0,8})$'
      or jsonb_typeof(obj->'jerseyLoan')<>'boolean'
      or coalesce(length(obj->>'teamLabel'),0)>100
      or coalesce(length(obj->>'trainingVenue'),0)>120
      or coalesce(length(obj->>'contactName'),0)>80
      or coalesce(length(obj->>'contactEmail'),0)>254
      or (obj->>'trainingStart') !~ '^$|^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or (obj->>'trainingEnd') !~ '^$|^([01][0-9]|2[0-3]):[0-5][0-9]$'
   then return jsonb_build_object('ok',false,'code','invalid-request'); end if;
   insert into tm_private.team_preferences(team_id) values(p_team) on conflict do nothing;
   update tm_private.team_preferences set
    team_label=coalesce(obj->>'teamLabel',''),training_venue=coalesce(obj->>'trainingVenue',''),
    training_start=coalesce(obj->>'trainingStart',''),
    training_end=coalesce(obj->>'trainingEnd',''),
    contact_name=coalesce(obj->>'contactName',''),
    contact_email=coalesce(obj->>'contactEmail',''),
    jersey_loan=(obj->>'jerseyLoan')::boolean,version=version+1
    where team_id=p_team and version=(obj->>'expectedVersion')::integer
    returning version into row_version;
   if row_version is null then return jsonb_build_object('ok',false,'code','stale-version'); end if;
   records:=jsonb_build_object('version',row_version);
 elsif p_action='jerseys.read' then
  select coalesce(jsonb_agg(jsonb_build_object('issueId',j.issue_id,
    'personId',j.person_id,'jerseyNo',j.jersey_no,'season',j.season_ref,
    'issuedAt',j.issued_at,'returnedAt',j.returned_at,'version',j.version)
    order by j.issued_at desc),'[]'::jsonb) into records
    from tm_private.team_jerseys j where j.team_id=p_team;
 elsif p_action='jerseys.issue' then
  if not admin_ok or (obj-'personId'-'jerseyNo')<>'{}'::jsonb
     or coalesce(obj->>'personId','') !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$'
     or coalesce(obj->>'jerseyNo','') !~ '^[0-9]{1,3}$'
     or not exists(select 1 from tm_private.participations p
       where p.team_id=p_team and p.person_id=obj->>'personId' and p.status='active')
  then return jsonb_build_object('ok',false,'code','invalid-request'); end if;
  ref:='jersey-'||replace(gen_random_uuid()::text,'-','');
  if exists(select 1 from tm_private.team_jerseys j where j.team_id=p_team
     and j.season_ref=(select season_ref from tm_private.teams where team_id=p_team)
     and j.returned_at is null and
     (j.jersey_no=obj->>'jerseyNo' or j.person_id=obj->>'personId'))
  then return jsonb_build_object('ok',false,'code','already-assigned'); end if;
  insert into tm_private.team_jerseys(issue_id,team_id,person_id,season_ref,jersey_no,recorded_by)
   select ref,p_team,obj->>'personId',t.season_ref,obj->>'jerseyNo',p_actor
   from tm_private.teams t where t.team_id=p_team;
  records:=jsonb_build_object('issueId',ref);
 elsif p_action='jerseys.return' then
  if not admin_ok or (obj-'issueId'-'expectedVersion')<>'{}'::jsonb
    or coalesce(obj->>'issueId','') !~ '^jersey-[0-9a-f]{32}$'
    or coalesce(obj->>'expectedVersion','') !~ '^(0|[1-9][0-9]{0,8})$'
  then return jsonb_build_object('ok',false,'code','invalid-request'); end if;
  update tm_private.team_jerseys set returned_at=now_at,version=version+1
    where issue_id=obj->>'issueId' and team_id=p_team and returned_at is null
     and version=(obj->>'expectedVersion')::integer returning version into row_version;
  if row_version is null then return jsonb_build_object('ok',false,'code','stale-version'); end if;
  records:=jsonb_build_object('version',row_version);
 elsif p_action='competitions.read' then
  select coalesce(jsonb_agg(jsonb_build_object('competitionId',c.competition_id,
   'name',c.name,'format',c.format,'season',c.season_ref,'division',c.division,
   'organiser',c.organiser,'venue',c.venue,'beginsOn',c.begins_on,
   'endsOn',c.ends_on,'status',c.entry_status,'version',c.version)
   order by c.created_at desc),'[]'::jsonb) into records
   from tm_private.team_competitions c where c.team_id=p_team;
 elsif p_action in ('competitions.create','competitions.update') then
  if not admin_ok or (obj-'competitionId'-'name'-'format'-'division'-
       'organiser'-'venue'-'beginsOn'-'endsOn'-'status'-'expectedVersion')<>'{}'::jsonb
    or coalesce(length(trim(obj->>'name')),0) not between 1 and 120
    or obj->>'format' not in ('league','tournament','carnival','friendly-series')
    or coalesce(length(obj->>'division'),0)>100
    or coalesce(length(obj->>'organiser'),0)>120
    or coalesce(length(obj->>'venue'),0)>120
    or coalesce(obj->>'status','planned') not in ('planned','entered','withdrawn','completed')
    or (obj->>'beginsOn' is not null and obj->>'beginsOn' !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$')
    or (obj->>'endsOn' is not null and obj->>'endsOn' !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$')
  then return jsonb_build_object('ok',false,'code','invalid-request'); end if;
  if p_action='competitions.create' then
   if obj ? 'competitionId' or obj ? 'expectedVersion'
   then return jsonb_build_object('ok',false,'code','invalid-request'); end if;
   ref:='competition-'||replace(gen_random_uuid()::text,'-','');
   insert into tm_private.team_competitions(
     competition_id,team_id,name,format,season_ref,division,organiser,venue,
     begins_on,ends_on,entry_status,created_by)
   select ref,p_team,trim(obj->>'name'),obj->>'format',t.season_ref,
     coalesce(obj->>'division',''),coalesce(obj->>'organiser',''),
     coalesce(obj->>'venue',''),nullif(obj->>'beginsOn','')::date,
     nullif(obj->>'endsOn','')::date,coalesce(obj->>'status','planned'),p_actor
   from tm_private.teams t where t.team_id=p_team;
   records:=jsonb_build_object('competitionId',ref,'version',0);
  else
   if coalesce(obj->>'competitionId','') !~ '^competition-[0-9a-f]{32}$'
      or coalesce(obj->>'expectedVersion','') !~ '^(0|[1-9][0-9]{0,8})$'
   then return jsonb_build_object('ok',false,'code','invalid-request'); end if;
   update tm_private.team_competitions set
    name=trim(obj->>'name'),format=obj->>'format',
    division=coalesce(obj->>'division',''),organiser=coalesce(obj->>'organiser',''),
    venue=coalesce(obj->>'venue',''),begins_on=nullif(obj->>'beginsOn','')::date,
    ends_on=nullif(obj->>'endsOn','')::date,entry_status=coalesce(obj->>'status','planned'),
    version=version+1
   where competition_id=obj->>'competitionId' and team_id=p_team
     and version=(obj->>'expectedVersion')::integer returning version into row_version;
   if row_version is null then return jsonb_build_object('ok',false,'code','stale-version'); end if;
   records:=jsonb_build_object('competitionId',obj->>'competitionId','version',row_version);
  end if;
 elsif p_action='competitions.fixture' then
   if not admin_ok or (obj-'competitionId'-'opponent'-'startsAt')<>'{}'::jsonb
     or coalesce(obj->>'competitionId','') !~ '^competition-[0-9a-f]{32}$'
     or coalesce(length(trim(obj->>'opponent')),0) not between 1 and 120
     or coalesce(obj->>'startsAt','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T'
     or not exists(select 1 from tm_private.team_competitions c
       where c.competition_id=obj->>'competitionId' and c.team_id=p_team)
   then return jsonb_build_object('ok',false,'code','invalid-request'); end if;
   ref:='event-'||replace(gen_random_uuid()::text,'-','');
   insert into tm_private.sessions(session_id,team_id,kind,starts_at,title,management_origin)
   values(ref,p_team,'match',(obj->>'startsAt')::timestamptz,
     'vs '||trim(obj->>'opponent'),'team-activity');
   insert into tm_private.team_competition_fixtures(competition_id,team_id,session_id)
   values(obj->>'competitionId',p_team,ref);
   records:=jsonb_build_object('sessionId',ref,'official',false);
 elsif p_action='messages.read' then
   select coalesce(jsonb_agg(jsonb_build_object('messageId',m.message_id,
     'audience',m.audience,'channel',m.channel,'body',m.content,
     'status',m.status,'createdAt',m.created_at,'version',m.version)
     order by m.created_at desc),'[]'::jsonb) into records
   from tm_private.team_message_log m where m.team_id=p_team;
 elsif p_action='messages.prepare' then
   if not admin_ok or (obj-'audience'-'channel'-'body')<>'{}'::jsonb
     or obj->>'audience' not in ('players','volunteers','all')
     or obj->>'channel' not in ('whatsapp','share','copy')
     or coalesce(length(trim(obj->>'body')),0) not between 1 and 1500
   then return jsonb_build_object('ok',false,'code','invalid-request'); end if;
   ref:='message-'||replace(gen_random_uuid()::text,'-','');
   insert into tm_private.team_message_log(message_id,team_id,author_id,
      audience,channel,content) values(
      ref,p_team,p_actor,obj->>'audience',obj->>'channel',trim(obj->>'body'));
   records:=jsonb_build_object('messageId',ref,'status','prepared');
 elsif p_action='messages.confirm' then
   if not admin_ok or (obj-'messageId'-'status'-'expectedVersion')<>'{}'::jsonb
     or coalesce(obj->>'messageId','') !~ '^message-[0-9a-f]{32}$'
     or obj->>'status' not in ('sent','not-sent')
     or coalesce(obj->>'expectedVersion','') !~ '^(0|[1-9][0-9]{0,8})$'
   then return jsonb_build_object('ok',false,'code','invalid-request'); end if;
   update tm_private.team_message_log set status=obj->>'status',
     confirmed_at=now_at,version=version+1
    where message_id=obj->>'messageId' and team_id=p_team and author_id=p_actor
      and version=(obj->>'expectedVersion')::integer returning version into row_version;
   if row_version is null then return jsonb_build_object('ok',false,'code','stale-version'); end if;
   records:=jsonb_build_object('version',row_version);
 elsif p_action='duties.board' then
   select coalesce(jsonb_agg(jsonb_build_object(
    'dutyId',d.duty_id,'sessionId',d.session_id,'personId',d.person_id,
    'status',d.status,'type',d.duty_type,'version',d.resource_version)
    order by d.duty_id),'[]'::jsonb) into records
    from tm_private.duties d where d.team_id=p_team and d.status<>'revoked';
 elsif p_action='duties.assign' then
  if not admin_ok or (obj-'sessionId'-'personId'-'type')<>'{}'::jsonb
   or coalesce(obj->>'sessionId','') !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$'
   or coalesce(obj->>'personId','') !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$'
   or obj->>'type' not in ('general_help','setup','equipment','scorer_support')
   or not exists(select 1 from tm_private.sessions ss where ss.team_id=p_team
    and ss.session_id=obj->>'sessionId' and ss.status='planned')
   or not exists(select 1 from tm_private.role_grants g
    join tm_private.accounts ac on ac.user_id=g.user_id
    join tm_private.account_person_links l on l.user_id=g.user_id
    where g.team_id=p_team and g.role='team_volunteer' and g.status='active'
    and ac.status='active' and g.approved_by is not null and g.approved_by<>g.user_id
    and l.person_id=obj->>'personId' and l.status='verified' and l.verified_by<>l.user_id)
  then return jsonb_build_object('ok',false,'code','volunteer-not-verified'); end if;
  ref:='duty-'||replace(gen_random_uuid()::text,'-','');
  insert into tm_private.duties(duty_id,session_id,team_id,person_id,status,
    approved_by,approved_at,duty_type)
   values(ref,obj->>'sessionId',p_team,obj->>'personId','assigned',
    p_actor,now_at,obj->>'type');
  records:=jsonb_build_object('dutyId',ref);
 elsif p_action='duties.withdraw' then
  if not admin_ok or (obj-'dutyId'-'expectedVersion')<>'{}'::jsonb
   or coalesce(obj->>'dutyId','') !~ '^duty-[0-9a-f]{32}$'
   or coalesce(obj->>'expectedVersion','') !~ '^(0|[1-9][0-9]{0,8})$'
  then return jsonb_build_object('ok',false,'code','invalid-request');end if;
  update tm_private.duties set status='revoked',resource_version=resource_version+1
   where duty_id=obj->>'dutyId' and team_id=p_team
   and status in ('assigned','confirmed')
   and resource_version=(obj->>'expectedVersion')::integer
   returning resource_version into row_version;
  if row_version is null then return jsonb_build_object('ok',false,'code','stale-version');end if;
  records:=jsonb_build_object('version',row_version);
 elsif p_action='admin.status' then
  records:=jsonb_build_object('canAdmin',admin_ok,'role',p_role);
 elsif p_action='volunteers.list' then
  select coalesce(jsonb_agg(jsonb_build_object('personId',l.person_id,
    'name',coalesce(prof.display_name,l.person_id)) order by l.person_id),
    '[]'::jsonb) into records
  from tm_private.role_grants g
   join tm_private.account_person_links l on l.user_id=g.user_id
   left join tm_private.account_profiles prof on prof.user_id=g.user_id
  where g.team_id=p_team and g.role='team_volunteer' and g.status='active'
   and g.approved_by is not null and g.approved_by<>g.user_id
   and l.status='verified' and l.verified_by<>l.user_id
   and (g.expires_at is null or now_at<g.expires_at);
 elsif p_action='team.members' then
  select coalesce(jsonb_agg(jsonb_build_object('personId',p.person_id,
    'name',coalesce(prof.display_name,''),'status',p.status)
    order by p.person_id),'[]'::jsonb) into records
  from tm_private.participations p
   left join tm_private.account_person_links l on l.person_id=p.person_id
    and l.status='verified' and l.verified_by<>l.user_id
   left join tm_private.account_profiles prof on prof.user_id=l.user_id
  where p.team_id=p_team;
 elsif p_action='invite.list' then
   if not admin_ok then return jsonb_build_object('ok',false,'code','role-denied'); end if;
   select coalesce(jsonb_agg(jsonb_build_object(
     'invitationId',i.invitation_id,'email',i.email,'role',i.team_role,
     'status',i.status,'delivery',i.delivery_status)
     order by i.created_at desc),'[]'::jsonb) into records
   from tm_private.team_invitations i where i.team_id=p_team
     and i.created_at>now_at-interval '30 days'
     and i.team_role in ('team_player','team_volunteer');
 elsif p_action='invite.issue' then
   v_email:=lower(trim(obj->>'email'));v_role:=obj->>'role';
   if not admin_ok or (obj-'email'-'role')<>'{}'::jsonb
     or v_role not in ('team_player','team_volunteer')
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
     or length(v_email)>254
     or exists(select 1 from auth.users u where u.id=p_actor and lower(u.email)=v_email)
     or exists(select 1 from tm_private.team_invitations i where i.team_id=p_team
       and i.email=v_email and i.team_role=v_role
       and i.status in ('approved','claimed','proposed') and i.expires_at>now_at)
   then return jsonb_build_object('ok',false,'code','invalid-request'); end if;
   ref:='invite-'||replace(gen_random_uuid()::text,'-','');
   insert into tm_private.team_invitations(
     invitation_id,team_id,email,team_role,status,proposed_by,approved_by,
     approved_at,administrator_approved)
    values(ref,p_team,v_email,v_role,'approved',p_actor,p_actor,now_at,true);
   records:=jsonb_build_object('invitationId',ref,'internalEmail',v_email);
 elsif p_action in ('invite.review-adult','invite.activate','invite.revoke') then
   ref:=obj->>'invitationId';
   if not admin_ok or coalesce(ref,'') !~ '^invite-[0-9a-f]{32}$'
     or obj- 'invitationId' - 'evidenceRef' <> '{}'::jsonb
   then return jsonb_build_object('ok',false,'code','invalid-request'); end if;
   select * into v_inv from tm_private.team_invitations i
     where i.invitation_id=ref and i.team_id=p_team
       and i.team_role in ('team_player','team_volunteer')
       and i.administrator_approved=true for update;
   if not found then return jsonb_build_object('ok',false,'code','invite-unavailable'); end if;
   if p_action='invite.review-adult' then
      v_evidence:=obj->>'evidenceRef';
      if v_inv.status not in ('approved','claimed')
        or coalesce(v_evidence,'') !~ '^evidence-ref/[A-Za-z0-9._/-]{12,100}$'
      then return jsonb_build_object('ok',false,'code','invalid-request'); end if;
      select u.id into v_user from auth.users u where lower(u.email)=v_inv.email
         and u.email_confirmed_at is not null limit 1;
      if v_user is null or v_user=p_actor then
        return jsonb_build_object('ok',false,'code','verified-identity-required'); end if;
      insert into tm_private.accounts(user_id,status) values(v_user,'active')
        on conflict(user_id) do nothing;
      insert into tm_private.registration_adult_reviews(
        user_id,reviewed_by,reviewed_at,evidence_ref,state)
        values(v_user,p_actor,now_at,v_evidence,'approved')
        on conflict(user_id) do nothing;
      records:=jsonb_build_object('invitationId',ref);
   elsif p_action='invite.activate' then
      if v_inv.status<>'claimed' or v_inv.claimed_by is null
         or v_inv.claimed_by=p_actor or v_inv.grant_id is null or v_inv.person_id is null
         or not exists(select 1 from tm_private.accounts ac
           where ac.user_id=v_inv.claimed_by and ac.status='active')
         or not exists(select 1 from tm_private.registration_adult_reviews r
           where r.user_id=v_inv.claimed_by and r.state='approved'
            and r.reviewed_by<>v_inv.claimed_by)
         or not exists(select 1 from tm_private.registration_acceptances a
           join tm_private.registration_policy_versions p on p.policy_id=a.policy_id
           where a.user_id=v_inv.claimed_by and p.status='active'
             and a.terms_accepted and a.privacy_acknowledged)
      then return jsonb_build_object('ok',false,'code','activation-preflight-denied'); end if;
      update tm_private.account_person_links set status='verified',
         verified_by=p_actor,verified_at=now_at
        where user_id=v_inv.claimed_by and person_id=v_inv.person_id and status='pending';
      if not found and not exists(select 1 from tm_private.account_person_links l
        where l.user_id=v_inv.claimed_by and l.person_id=v_inv.person_id
         and l.status='verified' and l.verified_by<>l.user_id) then
       return jsonb_build_object('ok',false,'code','person-not-verified'); end if;
      if v_inv.team_role='team_player' then
        insert into tm_private.participations(team_id,person_id,kind,status,
         verified_by,verified_at) values(p_team,v_inv.person_id,'player','active',p_actor,now_at)
         on conflict(team_id,person_id) do update set status='active',
           verified_by=excluded.verified_by,verified_at=excluded.verified_at;
      end if;
      update tm_private.role_grants set status='active',approved_by=p_actor,approved_at=now_at
       where grant_id=v_inv.grant_id and user_id=v_inv.claimed_by
         and team_id=p_team and role=v_inv.team_role and status='proposed';
      if not found then return jsonb_build_object('ok',false,'code','grant-unavailable'); end if;
      update tm_private.team_invitations set status='activated',updated_at=now_at
       where invitation_id=ref;
      records:=jsonb_build_object('invitationId',ref);
   else
      if v_inv.status not in ('approved','claimed','activated') then
       return jsonb_build_object('ok',false,'code','invite-unavailable'); end if;
      update tm_private.team_invitations set status='revoked',updated_at=now_at where invitation_id=ref;
      if v_inv.grant_id is not null then
        update tm_private.role_grants set status='revoked'
        where grant_id=v_inv.grant_id and team_id=p_team and status in ('proposed','active');
      end if;
      records:=jsonb_build_object('invitationId',ref);
   end if;
 end if;
 if p_action not in ('settings.read','jerseys.read','competitions.read','messages.read',
                     'team.members','volunteers.list','admin.status','duties.board','invite.list') then
   insert into tm_private.audit_events(user_id,team_id,action,resource_id,decision,reason_code)
    values(p_actor,p_team,'stage3d5.'||p_action,
      coalesce(ref,p_team),'ALLOW','exact-team-adult-management');
 end if;
 return jsonb_build_object('ok',true,
   'code',case when p_action in ('settings.read','jerseys.read',
     'competitions.read','messages.read','team.members','volunteers.list',
      'admin.status','duties.board','invite.list')
     then 'permitted' else 'committed' end,'data',records);
end;
$$;
revoke all on function public.tm_stage3d5_team(uuid,text,text,text,jsonb)
 from public,anon,authenticated;
grant execute on function public.tm_stage3d5_team(uuid,text,text,text,jsonb) to service_role;