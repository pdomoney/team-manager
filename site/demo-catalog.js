import {stripWs} from './model.js';

// Add missing, known synthetic fixtures to the SAME local development workspace.
// Never rebuild an existing club, team, play, library item or user-created record.
// Published development is password-free; this is not a production data migration.
const rows=value=>Array.isArray(value)?value:[];
const teams=ws=>ws?.id&&ws?.team?[ws,...rows(ws.teams)]:[];

export function recognisedDemoWorkspace(ws){
  if(!(Number(ws?.testLibrary?.version)>=3))return false;
  return teams(ws).some(t=>
    (t.id==='qacometsmixed'&&t.team?.clubId==='qa-comets')||
    (t.id==='testtitans'&&t.team?.clubId==='tarenpointtitans'));
}

// Source must be the versioned, built-in eight-team fictional fixture. An
// unexpected backup or user-edited object is never used as a merge catalogue.
export function appendMissingDemoTeams(target,source){
  const counts={clubs:0,teams:0,competitions:0,matchOfficials:0,volunteerAppointments:0};
  if(!recognisedDemoWorkspace(target)||
     !(Number(source?.testLibrary?.version)>=3)||
     !teams(source).some(t=>t.id==='testtitans'&&t.team?.clubId==='tarenpointtitans'))
    return {...counts,changed:false};
  const append=(key,items)=>{
    if(!Array.isArray(target[key]))target[key]=[];
    const ids=new Set(rows(target[key]).map(x=>x?.id).filter(Boolean));
    for(const item of rows(items)){
      if(!item||typeof item.id!=='string'||!item.id||ids.has(item.id))continue;
      target[key].push(item);
      ids.add(item.id);
      counts[key]++;
    }
  };
  append('clubs',source.clubs);
  // Preserve the root team and its original ID. New teams become ordinary
  // workspace members, including the source's original primary team.
  if(!Array.isArray(target.teams))target.teams=[];
  const ids=new Set(teams(target).map(t=>t.id));
  for(const team of teams(source)){
    if(!team||typeof team.id!=='string'||ids.has(team.id))continue;
    // The eight-team source's primary team carries workspace-only fields.
    // Strip those before storing it as an ordinary secondary team, otherwise
    // its nested clubs/teams/library duplicate an entire workspace.
    const member=team===source?stripWs(team):team;
    if(team===source)delete member.testLibrary;
    target.teams.push(member);
    ids.add(team.id);
    counts.teams++;
  }
  append('competitions',source.competitions);
  append('matchOfficials',source.matchOfficials);
  append('volunteerAppointments',source.volunteerAppointments);
  // Deliberately leave target.library, profile grants, manually edited plays,
  // fixtures, people and passwords untouched.
  return {...counts,changed:Object.values(counts).some(Boolean)};
}
