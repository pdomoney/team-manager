// P04C: deliberate, reversible preparation of stable staff source IDs.
// No merging of people, verification of identity, or guardian access.
// Returns an independent workspace; the trusted coach UI alone may decide to
// replace/save its unlocked workspace and must keep an encrypted backup.
const rows=v=>Array.isArray(v)?v:[];
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v);
const text=v=>typeof v==='string'?v.trim():'';
export const STAFF_SOURCE_ID=/^staff-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const newStaffSourceId=()=>`staff-${globalThis.crypto.randomUUID()}`;

const groups=workspace=>{
  const out=[];
  const teamRows=[workspace,...rows(workspace.teams)];
  const teamIds=new Set();
  for(const t of teamRows){
    if(!obj(t)||!text(t.id)||teamIds.has(t.id))return {error:'Duplicate or missing team ID; correct before preparing staff links'};
    teamIds.add(t.id);
    if(!obj(t.team))return {error:'Team settings missing; correct before preparing staff links'};
    out.push({key:`team/${t.id}/staff`,list:rows(t.team.staff)});
    const seasons=new Set();
    for(const s of rows(t.seasons)){
      if(!obj(s)||!text(s.id)||seasons.has(s.id))return {error:'Duplicate or missing season ID; correct before preparing staff links'};
      seasons.add(s.id);
      out.push({key:`season/${t.id}/${s.id}/staff`,list:rows(s.staff)});
    }
  }
  const clubs=new Set();
  for(const club of rows(workspace.clubs)){
    if(!obj(club)||!text(club.id)||clubs.has(club.id))return {error:'Duplicate or missing club ID; correct before preparing staff links'};
    clubs.add(club.id);
    out.push({key:`club/${club.id}/officials`,list:rows(club.officials)});
  }
  return {groups:out};
};
export function inspectStaffSourceIds(workspace){
  if(!obj(workspace))return {error:'An unlocked coach workspace is required'};
  const result=groups(workspace);
  if(result.error)return result;
  let ready=0,missing=0;
  for(const {key,list} of result.groups){
    const ids=new Set();
    for(const person of list){
      if(!obj(person))return {error:`Invalid staff record in ${key}`};
      const id=text(person.id);
      if(id && (!STAFF_SOURCE_ID.test(id)||ids.has(id)))
        return {error:`Unexpected or duplicate staff source ID in ${key}; correct before proceeding`};
      if(id){ids.add(id);ready++}else missing++;
    }
  }
  return {ready,missing,total:ready+missing,
    groupCount:result.groups.length,noAutomaticIdentityMerging:true};
}
// Mint only previously absent IDs, with cryptographic randomness and collision
// rejection. Only the caller-initiated save makes these IDs durable.
export function prepareStaffSourceIds(workspace,{makeId=newStaffSourceId}={}){
  const checked=inspectStaffSourceIds(workspace);
  if(checked.error)return checked;
  if(checked.missing===0)return {workspace,assigned:0,unchanged:true};
  const next=structuredClone(workspace),grouped=groups(next);
  if(grouped.error)return grouped;
  const existing=new Set(grouped.groups.flatMap(g=>g.list.map(x=>x.id).filter(Boolean)));
  let assigned=0;
  for(const g of grouped.groups){
    for(const entry of g.list){
      if(text(entry.id))continue;
      const id=makeId();
      if(typeof id!=='string'||!STAFF_SOURCE_ID.test(id)||existing.has(id))
        return {error:'Failed to generate unique secure staff IDs; no changes saved'};
      existing.add(id);
      entry.id=id;assigned++;
    }
  }
  return {workspace:next,assigned,unchanged:false,previouslyReady:checked.ready};
}
