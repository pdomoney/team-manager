// Fictional person-scoped role workspace. No real session, storage or grants.
import {P12_QA_PROFILES} from './p12-qa-profiles.js';
import {P12_SAMPLE_TEAMS,P12_SAMPLE_CLUBS} from './p12-qa-club-teams.js';
const names={personal_owner:'Owner',association_admin:'Association Admin',association_viewer:'Association Viewer',club_admin:'Club Admin',club_support:'Club Support',team_coach:'Coach',team_assistant:'Assistant Coach',team_manager:'Manager',fixture_scorekeeper:'Scorekeeper',player:'Player',guardian:'Guardian',helper:'Helper',staff:'Volunteer'};
const sections={
 personal_owner:['Dashboard','Associations','Clubs','People','Governance'],
 association_admin:['Dashboard','Clubs','Competitions','People','Governance'],
 association_viewer:['Overview','Clubs','Teams'],
 club_admin:['Dashboard','Teams','People','Volunteers','Seasons'],
 club_support:['Dashboard','Teams','Volunteers'],
 team_coach:['Dashboard','Squad','Training','Matches','Plays','Seasons'],
 team_assistant:['Dashboard','Squad','Training','Matches','Seasons'],
 team_manager:['Dashboard','Fixtures','Availability','Match-day staff','Messages','Seasons'],
 fixture_scorekeeper:['Match centre','Score sheet'],
 player:['My teams','Fixtures','Availability','Seasons'],
 guardian:['My family','Fixtures','Availability'],
 helper:['Volunteer duties','Fixtures'],
 staff:['Volunteer duties','Fixtures']
};
function assignedTeams(record){
 const ids=new Set();
 for(const g of record.grants||[]){
   if(g.status!=='active')continue;
   if(g.group.type==='team')ids.add(g.group.id);
   if(g.group.type==='club')P12_SAMPLE_TEAMS.filter(t=>t.clubId===g.group.id).forEach(t=>ids.add(t.id));
   if(g.group.type==='association'){
     const clubs=P12_SAMPLE_CLUBS.filter(c=>c.associationId===g.group.id);
     P12_SAMPLE_TEAMS.filter(t=>clubs.some(c=>c.id===t.clubId)).forEach(t=>ids.add(t.id));
   }
   if(g.role==='personal_owner')P12_SAMPLE_TEAMS.forEach(t=>ids.add(t.id));
 }
 for(const m of record.memberships||[])if(m.group.type==='team')ids.add(m.group.id);
 return P12_SAMPLE_TEAMS.filter(t=>ids.has(t.id));
}
export function personWorkspace(profileId,contextId=''){
 const record=P12_QA_PROFILES.find(p=>p.id===profileId);
 if(!record)return null;
 const contexts=[
   ...record.grants.filter(g=>g.status==='active').map(g=>({id:'grant:'+g.role+':'+g.group.type+':'+g.group.id,role:g.role,group:g.group,access:true})),
   ...record.memberships.map(m=>({id:'membership:'+m.type+':'+m.group.type+':'+m.group.id,role:m.type,group:m.group,access:false}))
 ];
 const context=contexts.find(c=>c.id===contextId)||contexts[0]||null;
 const allTeams=assignedTeams(record);
 const teams=context?.group.type==='team'?allTeams.filter(t=>t.id===context.group.id)
   :context?.group.type==='club'?allTeams.filter(t=>t.clubId===context.group.id)
   :context?.group.type==='association'?allTeams.filter(t=>P12_SAMPLE_CLUBS.some(c=>c.id===t.clubId&&c.associationId===context.group.id))
   :context?.group.type==='personal'?allTeams:[];
 const role=context?.role||'none';
 const sports=[...new Set(allTeams.map(t=>t.sport))];
 return {profileId,profileLabel:record.label,role,roleLabel:names[role]||'No active workspace',contextId:context?.id||'',contexts,sections:sections[role]||['No access'],teams:teams.map(t=>({id:t.id,name:t.name,clubId:t.clubId,sport:t.sport,season:t.season})),allTeamCount:allTeams.length,sports,access:!!context?.access,fictional:true};
}
