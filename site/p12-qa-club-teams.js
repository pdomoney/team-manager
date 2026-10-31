// P12 QA fixture registry: 3 FICTIONAL clubs x 6 teams, never actual registrations.
// Counts are representative TEST DATA, not league, safety, accreditation, age,
// roster-size or competition-rule requirements. No actual people/contact details.
// Used by P11 read-only previews and P12 scoped team workflow simulation.
const freeze=Object.freeze;
const club=(id,name,sport,associationId)=>freeze({id,name,sport,associationId,synthetic:true});
export const P12_SAMPLE_CLUBS=freeze([
  club('qa-comets','Example Comets Club','Oztag','qa-east'),
  club('qa-stars','Example Stars Club','Touch','qa-east'),
  club('qa-rangers','Example Rangers Club','Rugby league','qa-west')
]);
const T=(id,clubId,name,sport,category,ageGroup,playerCount,staffCount,volunteerCount)=>
  freeze({id,clubId,name,sport,category,ageGroup,playerCount,staffCount,volunteerCount,
    season:'Example 2026 season',synthetic:true,fixtureId:'qa-fixture-'+id.slice(3)});
export const P12_SAMPLE_TEAMS=freeze([
  T('qa-comets-mixed','qa-comets','Example Comets Mixed','Oztag','Mixed','Open',17,3,4),
  T('qa-comets-juniors','qa-comets','Example Comets U14','Oztag','Mixed','U14',14,3,4),
  T('qa-comets-u10','qa-comets','Example Comets U10','Oztag','Mixed','U10',12,3,5),
  T('qa-comets-u12','qa-comets','Example Comets U12','Oztag','Mixed','U12',14,3,5),
  T('qa-comets-u16','qa-comets','Example Comets U16','Oztag','Mixed','U16',16,4,5),
  T('qa-comets-women','qa-comets','Example Comets Women','Oztag','Women','Open',17,3,4),

  T('qa-stars-women','qa-stars','Example Stars Women','Touch','Women','Open',18,3,4),
  T('qa-stars-u10','qa-stars','Example Stars U10','Touch','Mixed','U10',12,3,5),
  T('qa-stars-u12','qa-stars','Example Stars U12','Touch','Mixed','U12',14,3,5),
  T('qa-stars-u14','qa-stars','Example Stars U14 Girls','Touch','Girls','U14',16,3,5),
  T('qa-stars-u16','qa-stars','Example Stars U16 Boys','Touch','Boys','U16',18,4,5),
  T('qa-stars-open','qa-stars','Example Stars Mixed Open','Touch','Mixed','Open',18,4,4),

  T('qa-rangers-16','qa-rangers','Example Rangers U16','Rugby league','Boys','U16',22,4,6),
  T('qa-rangers-u8','qa-rangers','Example Rangers U8','Rugby league','Mixed','U8',16,3,6),
  T('qa-rangers-u10','qa-rangers','Example Rangers U10','Rugby league','Mixed','U10',18,4,6),
  T('qa-rangers-u12','qa-rangers','Example Rangers U12','Rugby league','Mixed','U12',20,4,6),
  T('qa-rangers-u14','qa-rangers','Example Rangers U14','Rugby league','Boys','U14',22,4,6),
  T('qa-rangers-women','qa-rangers','Example Rangers Open Women','Rugby league','Women','Open',24,4,6)
]);

export const P12_TEAM_TO_CLUB=freeze(Object.fromEntries(P12_SAMPLE_TEAMS.map(t=>[t.id,t.clubId])));
export const P12_SAMPLE_GROUP_NAMES=freeze(Object.fromEntries(
  [...P12_SAMPLE_CLUBS,...P12_SAMPLE_TEAMS].map(x=>[x.id,x.name])));
const positions=freeze({
  'Oztag':freeze(['Middle','Link','Wing','Sweeper']),
  'Touch':freeze(['Middle','Link','Wing']),
  'Rugby league':freeze(['Fullback','Wing','Centre','Half','Hooker','Prop','Second row','Lock'])
});
const jobNames=freeze({
  'Oztag':freeze(['Field marshal','Score table helper','Equipment helper','Sideline helper','First-aid contact']),
  'Touch':freeze(['Field marshal','Score table helper','Equipment helper','Sideline helper','First-aid contact']),
  'Rugby league':freeze(['Ground marshal','LeagueSafe (yellow)','Sports trainer (blue)','Sports trainer (orange)','First-aid contact','Equipment helper'])
});
const staffRoles=freeze(['Head Coach','Assistant Coach','Team Manager','Team Support']);
const pct=(n)=>String(n).padStart(2,'0');
const copy=x=>JSON.parse(JSON.stringify(x));
export const sampleTeam=id=>P12_SAMPLE_TEAMS.find(t=>t.id===id)||null;
export const sampleClub=id=>P12_SAMPLE_CLUBS.find(c=>c.id===id)||null;
export const sampleTeamsForClub=id=>P12_SAMPLE_TEAMS.filter(t=>t.clubId===id);
// Populate only on request. One stable, unique identity per fictional player.
// A shared club-wide helper is purposefully referenced on multiple team lists
// to test duplicate-person/multi-team boundaries without creating an account.
export function makeP12SampleRoster(teamId){
  const t=sampleTeam(teamId);
  if(!t)return null;
  const club=sampleClub(t.clubId);
  const prefix=t.name.replace(/^Example /,'');
  const playerPositions=positions[t.sport];
  const duties=jobNames[t.sport];
  const players=Array.from({length:t.playerCount},(_,i)=>({
    id:teamId+'-player-'+(i+1),name:prefix+' · Sample Player '+pct(i+1),
    jersey:i+1,preferredPositions:[playerPositions[i%playerPositions.length]],
    selected:i<2,rsvp:i%6===0?'yes':i%7===0?'no':'pending',
    // Example synthetic playing-status label, not medical disclosure or clearance.
    status:i%10===0?'needs-confirmation':'listed'
  }));
  const staff=Array.from({length:t.staffCount},(_,i)=>({
    id:teamId+'-staff-'+(i+1),
    personId:i===1 ? t.clubId+'-shared-assistant' : teamId+'-staff-person-'+(i+1),
    name:i===1?club.name.replace('Example ','')+' · Shared Sample Assistant':
      prefix+' · Sample Staff '+pct(i+1),
    role:staffRoles[i],appointmentStatus:'fictional',registration:'unverified',
    accreditation:'unverified',grantsAccess:false
  }));
  const volunteers=Array.from({length:t.volunteerCount},(_,i)=>({
    id:teamId+'-volunteer-'+(i+1),
    personId:i===0?t.clubId+'-shared-volunteer':teamId+'-volunteer-person-'+(i+1),
    name:i===0?club.name.replace('Example ','')+' · Shared Sample Volunteer':
      prefix+' · Sample Volunteer '+pct(i+1),
    role:duties[i%duties.length],appointmentStatus:'fictional',
    registration:'unverified',accreditation:'unverified',grantsAccess:false
  }));
  return copy({
    teamId:t.id,clubId:t.clubId,clubName:club.name,teamName:t.name,
    sport:t.sport,category:t.category,ageGroup:t.ageGroup,season:t.season,
    fixtureId:t.fixtureId,players,staff,volunteers,
    realPeople:false,realContactData:false,officialSquadSize:false,
    compliantStaffCoverage:false,accreditationsVerified:false
  });
}


// Projection is only for the fictional QA directory. Association/club/owner
// contexts may view public sample team summaries, NOT edit another team's data.
// Exact team-scoped contexts see only that team. Membership/appointment does
// not expose an organisational overview.
export function p12SampleTeamSummary(view){
  if(view?.mode!=='SYNTHETIC_ONLY_NO_AUTHORIZATION'||view.mayGrantAccess!==false)return [];
  const c=view.selected;
  if(!c||c.kind!=='access'||c.status!=='active')return [];
  const g=c.group;
  let teams=[];
  if(g.type==='personal'&&g.id==='qa-platform'&&c.role==='personal_owner'){
    teams=P12_SAMPLE_TEAMS;
  }else if(g.type==='association'&&['association_admin','association_viewer'].includes(c.role)){
    const clubs=P12_SAMPLE_CLUBS.filter(x=>x.associationId===g.id).map(x=>x.id);
    teams=P12_SAMPLE_TEAMS.filter(t=>clubs.includes(t.clubId));
  }else if(g.type==='club'&&['club_admin','club_support'].includes(c.role)){
    teams=sampleTeamsForClub(g.id);
  }else if(g.type==='team'&&['team_coach','team_assistant','team_manager','team_viewer'].includes(c.role)){
    teams=P12_SAMPLE_TEAMS.filter(t=>t.id===g.id);
  }
  return teams.map(t=>({
    teamId:t.id,clubId:t.clubId,name:t.name,sport:t.sport,
    category:t.category,ageGroup:t.ageGroup,
    players:t.playerCount,staff:t.staffCount,volunteers:t.volunteerCount,
    sampleOnly:true,mayManage:false
  }));
}
