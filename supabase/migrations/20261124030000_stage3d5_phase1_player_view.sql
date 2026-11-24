-- Stage 3D.5 Phase 1: curated Player team information.
-- ADDITIVE, service-only, read-only. The existing Worker verifies the JWT.
-- No account IDs, private contacts, medical, junior, guardian, registration
-- eligibility, official fixtures or other teams are returned.
create function public.tm_stage3d5_player_team(
 p_actor uuid,p_team text,p_role text,p_action text,p_input jsonb
) returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare
 v_person text;
 v_roster jsonb;
 v_comps jsonb;
 v_fixtures jsonb;
 v_eligible integer;
 v_shown integer;
begin
 if p_actor is null or p_team is null
   or p_team !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$'
   or p_role<>'team_player' or p_action<>'player.team.read'
   or p_input<>'{}'::jsonb then
   return pg_catalog.jsonb_build_object('ok',false,'code','invalid-request');
 end if;
 if not exists(
   select 1 from tm_private.accounts a
    join tm_private.role_grants g on g.user_id=a.user_id
    join tm_private.teams t on t.team_id=g.team_id
    join tm_private.registration_adult_reviews review on review.user_id=a.user_id
    where a.user_id=p_actor and a.status='active'
      and t.team_id=p_team and t.status='active'
      and g.role='team_player' and g.status='active'
      and g.approved_by is not null and g.approved_by<>p_actor
      and g.approved_at is not null and g.policy_version=1
      and (g.valid_from is null or g.valid_from<=now())
      and (g.expires_at is null or now()<g.expires_at)
      and review.state='approved' and review.reviewed_by<>p_actor
      and exists(select 1 from tm_private.registration_acceptances receipt
         join tm_private.registration_policy_versions policy
          on policy.policy_id=receipt.policy_id and policy.status='active'
         where receipt.user_id=p_actor and receipt.terms_accepted
           and receipt.privacy_acknowledged)
 ) then return pg_catalog.jsonb_build_object('ok',false,'code','scope-denied');
 end if;
 select l.person_id into v_person
   from tm_private.account_person_links l
   join tm_private.persons p on p.person_id=l.person_id and p.lifecycle='active'
   join tm_private.participations participation on participation.person_id=p.person_id
      and participation.team_id=p_team and participation.status='active'
      and participation.verified_by is not null and participation.verified_at is not null
   where l.user_id=p_actor and l.status='verified'
    and l.verified_by is not null and l.verified_by<>p_actor and l.verified_at is not null
   limit 1;
 if v_person is null then
  return pg_catalog.jsonb_build_object('ok',false,'code','participation-not-verified');
 end if;
 -- Project only approved active participant display names, not raw identities.
 select count(*) into v_eligible from tm_private.participations p
   join tm_private.persons person on person.person_id=p.person_id
   where p.team_id=p_team and p.status='active' and person.lifecycle='active'
     and p.verified_by is not null and p.verified_at is not null;
 with verified as (
    select p.person_id, name.display_name
    from tm_private.participations p
    join tm_private.persons person on person.person_id=p.person_id
    left join lateral (
      select ap.display_name from tm_private.account_person_links l
       join tm_private.accounts ac on ac.user_id=l.user_id and ac.status='active'
       join tm_private.account_profiles ap on ap.user_id=ac.user_id
       join tm_private.registration_adult_reviews review on review.user_id=ac.user_id
         and review.state='approved' and review.reviewed_by<>ac.user_id
      where l.person_id=p.person_id and l.status='verified'
        and l.verified_by is not null and l.verified_by<>l.user_id
        and l.verified_at is not null order by l.verified_at desc limit 1
    ) name on true
    where p.team_id=p_team and p.status='active' and person.lifecycle='active'
      and p.verified_by is not null and p.verified_at is not null
 )
 select coalesce(jsonb_agg(jsonb_build_object('displayName',display_name)
    order by display_name),'[]'::jsonb),count(*)
 into v_roster,v_shown from verified where display_name is not null;
 select coalesce(jsonb_agg(jsonb_build_object(
   'competitionId',c.competition_id,'name',c.name,'format',c.format,
   'division',c.division,'venue',c.venue,'beginsOn',c.begins_on,
   'endsOn',c.ends_on,'status',c.entry_status,'official',false)
   order by c.begins_on,c.name),'[]'::jsonb) into v_comps
 from tm_private.team_competitions c
 join tm_private.teams team on team.team_id=c.team_id
 where c.team_id=p_team and c.season_ref=team.season_ref
  and c.entry_status in ('entered','completed');
 select coalesce(jsonb_agg(jsonb_build_object(
   'competitionId',f.competition_id,'title',s.title,
   'startsAt',s.starts_at,'locationLabel',s.location_label,'status',s.status,
   'official',false)
   order by s.starts_at,s.session_id),'[]'::jsonb) into v_fixtures
 from tm_private.team_competition_fixtures f
 join tm_private.team_competitions c on c.competition_id=f.competition_id
  and c.team_id=f.team_id
 join tm_private.teams team on team.team_id=c.team_id
 join tm_private.sessions s on s.team_id=f.team_id and s.session_id=f.session_id
 where f.team_id=p_team and c.season_ref=team.season_ref
  and c.entry_status in ('entered','completed') and s.status<>'cancelled'
  and s.kind='match' and s.management_origin='team-activity';
 return pg_catalog.jsonb_build_object('ok',true,'code','permitted',
  'data',pg_catalog.jsonb_build_object(
    'roster',v_roster,'rosterEligible',v_eligible,'rosterShown',v_shown,
    'rosterOmittedUnverified',v_eligible-v_shown,
    'competitions',v_comps,'fixtures',v_fixtures));
end;
$$;
revoke all on function public.tm_stage3d5_player_team(uuid,text,text,text,jsonb)
 from public,anon,authenticated;
grant execute on function public.tm_stage3d5_player_team(uuid,text,text,text,jsonb)
 to service_role;
