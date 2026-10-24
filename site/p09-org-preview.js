// P09C: metadata-only sketches for trusted coach workspace layout review.
// NOT an account, membership, permission, guardian or tenant-authorisation model.
// Only allow-listed club/team fields cross this projection boundary.
export const ORG_PREVIEW_MODES = Object.freeze([
  Object.freeze({id:'association',label:'Association concept'}),
  Object.freeze({id:'club',label:'Club admin concept'}),
  Object.freeze({id:'coach',label:'Coach / manager concept'}),
  Object.freeze({id:'individual',label:'Individual concept'})
]);
const MODES=new Set(ORG_PREVIEW_MODES.map(x=>x.id));
const str=x=>String(x??'');
export function organisationPreview({clubs=[],teams=[],mode='association',clubId='',teamId=''}={}) {
  if (!MODES.has(mode)) throw new TypeError('Unknown preview mode');
  // Clone ONLY safe summary data. Never pass roster, contact, accreditation,
  // health, relationship, volunteer or authentication records to the renderer.
  const allClubs=clubs.filter(c=>c && c.id).map(c=>({
    id:str(c.id), name:str(c.name||'Unnamed club'), shortName:str(c.shortName||c.name||''),
    sport:str(c.sport||'')
  }));
  const safeTeams=teams.filter(t=>t && t.id && !t.archived).map(t=>({
    id:str(t.id),name:str(t.name||'Team'),clubId:str(t.clubId||''),
    sport:str(t.sport||''),division:str(t.division||'')
  }));
  const cid=allClubs.some(c=>c.id===str(clubId))?str(clubId):allClubs[0]?.id||'';
  const tid=safeTeams.some(t=>t.id===str(teamId))?str(teamId):safeTeams[0]?.id||'';
  let rows=mode==='club'?safeTeams.filter(t=>t.clubId===cid)
    :mode==='individual'?safeTeams.filter(t=>t.id===tid)
    :safeTeams;
  const byId=new Map(allClubs.map(c=>[c.id,c]));
  rows=rows.map(t=>({...t,clubName:byId.get(t.clubId)?.name||'No managed club'}));
  const title={
    association:'Association-style overview',
    club:'Club administration overview',
    coach:'Coach / manager team overview',
    individual:'Individual team-facing overview'
  }[mode];
  const descriptions={
    association:'Conceptual multi-club summary from clubs in this one coach workspace. No association relationship or access is verified.',
    club:'Teams grouped only by the selected local club record. This is not a club administrator account.',
    coach:'Teams that the current encrypted coach workspace can already access. This is not individual manager membership.',
    individual:'Team identity only. Use the existing player-view preview for the actual restricted published team copy.'
  };
  return {mode,title,description:descriptions[mode],clubs:allClubs,teams:rows,
    selectedClubId:cid,selectedTeamId:tid,totalClubs:allClubs.length,totalTeams:rows.length};
}

// P09D: one guarded, non-persistent transition contract for the three
// organisational design-preview controls. No identity or access grant results.
export function nextOrgPreviewSelection(current, change, {clubs=[],teams=[]}={}) {
  const prior={
    mode:MODES.has(current?.mode)?current.mode:'association',
    clubId:str(current?.clubId),
    teamId:str(current?.teamId)
  };
  const id=str(change?.id);
  if (!id) return null;
  if (change?.kind==='mode') {
    return MODES.has(id)?{...prior,mode:id}:null;
  }
  if (change?.kind==='club') {
    return clubs.some(c=>c && c.id && str(c.id)===id)
      ? {...prior,mode:'club',clubId:id} : null;
  }
  if (change?.kind==='team') {
    const team=teams.find(t=>t && t.id && !t.archived && str(t.id)===id);
    return team?{...prior,teamId:id,clubId:str(team.clubId)}:null;
  }
  return null;
}
