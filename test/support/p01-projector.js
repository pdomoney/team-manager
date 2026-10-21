// P01 ARCHITECTURE DEMONSTRATOR ONLY.
// Pure deterministic projection of synthetic schema-4 records. No I/O, accounts,
// role grants, billing, database writes, links across workspaces or real migrations.
// The original record is unchanged; snapshots are retained for future reconciliations.
const rows = value => Array.isArray(value) ? value : [];
const text = value => String(value ?? '');
export const sourceKey = (sourceWorkspace, ...segments) => JSON.stringify([sourceWorkspace, ...segments.map(text)]);
const snapshot = value => structuredClone(value);
const named = value => value && typeof value === 'object' && !Array.isArray(value);
const identityOfPlayer = (scope, teamId, player) =>
  player.personId ? sourceKey(scope, 'explicit-person', player.personId) :
    sourceKey(scope, 'player-person', teamId, player.id);

export function projectSchema4DryRun(source, sourceWorkspace) {
  if (!named(source) || source.schema !== 4) throw new Error('P01 dry run requires an existing schema-4 workspace');
  if (!text(sourceWorkspace).trim()) throw new Error('P01 dry run requires an explicit private source-workspace namespace');

  const result = {
    version: 'P01-conceptual-dry-run-v1', sourceWorkspace, schema: 4,
    accounts: [], subscriptions: [], roleGrants: [], verifiedGuardianGrants: [],
    affiliations: [], // Never infer approval, account identity or organisation permissions.
    clubs: [], teams: [], teamSeasons: [], people: [], playerRecords: [],
    participations: [], jerseyLoans: [], helpers: [], matchPersonnel: [],
    staffSnapshots: [], competitions: [], entries: [], events: [],
    reviewQueue: [], legacyReferences: []
  };
  // Root-team compatibility: these arrays belong to workspace, not the first team.
  // Avoid embedding workspace-level personal records inside root-team snapshots.
  const { schema, teams: otherTeams, clubs: workspaceClubs, competitions: workspaceComps,
    matchOfficials: workspaceCrew, library: workspaceLibrary, ...rootTeam } = source;
  const teamRows = [{...rootTeam, id: text(source.id || 'team1')}, ...rows(otherTeams)];
  const existingKeys = new Set(), persons = new Map(), clubs = new Set(), teams = new Set();
  const remember = (key, kind, value) => {
    if (existingKeys.has(key)) throw new Error('Duplicate legacy key; manual correction required: ' + key);
    existingKeys.add(key);
    result.legacyReferences.push({ key, kind });
    return { legacyKey: key, snapshot: snapshot(value) };
  };
  const provisional = (key, origin, value) => {
    if (!persons.has(key)) persons.set(key, {id: key, claim: 'provisional', verified: false,
      origins: [], displayName: text(value.name)});
    persons.get(key).origins.push(origin);
    return key;
  };
  for (const club of rows(source.clubs)) {
    if (!club?.id) throw new Error('Missing legacy club ID');
    const key = sourceKey(sourceWorkspace,'club',club.id);
    result.clubs.push({ ...remember(key,'club',club), verifiedAssociation: false,
      proposedOwnerDataSpace: sourceKey(sourceWorkspace,'provisional-data-space'),
      directoryMatchIsOnlyResearch: !!club.directoryMatch });
    clubs.add(text(club.id));
    rows(club.officials).forEach((person,i) => {
      const path=sourceKey(sourceWorkspace,'club-official',club.id,i);
      result.staffSnapshots.push({...remember(path,'club-official',person), scope: key, personId: null});
    });
  }
  const seenTeams = new Set();
  for(const team of teamRows) {
    if (!team?.id || seenTeams.has(team.id)) throw new Error('Missing or duplicate legacy team ID');
    seenTeams.add(team.id); teams.add(text(team.id));
    const teamKey = sourceKey(sourceWorkspace,'team',team.id);
    result.teams.push({...remember(teamKey,'team',team), legacyTeamId: text(team.id),
      originalClubId: text(team.team?.clubId), archived: !!team.archived});
    if(team.team?.clubId && !clubs.has(text(team.team.clubId))) {
      result.reviewQueue.push({type:'unresolved-club-reference',source:teamKey,clubId:text(team.team.clubId)});
    }
    rows(team.team?.staff).forEach((person,i) => {
      const path=sourceKey(sourceWorkspace,'team-staff',team.id,i);
      result.staffSnapshots.push({...remember(path,'team-staff',person),scope:teamKey,personId:null});
    });
    const playerById = new Map();
    for(const player of rows(team.players)) {
      if(!player?.id)throw new Error('Missing legacy player ID');
      const key=sourceKey(sourceWorkspace,'player',team.id,player.id);
      if(playerById.has(text(player.id)))throw new Error('Duplicate player ID within team');
      const personKey=identityOfPlayer(sourceWorkspace, team.id, player);
      provisional(personKey,key,player);
      const record={...remember(key,'player',player),teamKey,legacyPlayerId:text(player.id),personId:personKey};
      result.playerRecords.push(record);playerById.set(text(player.id),record);
      rows(player.jerseys).forEach((loan,i) => {
        const lk=sourceKey(sourceWorkspace,'jersey-loan',team.id,player.id,loan.id||i);
        result.jerseyLoans.push({...remember(lk,'jersey-loan',loan),teamKey,playerRecordKey:key});
      });
      rows(player.jerseyCorrections).forEach((correction,i)=>{
        const ck=sourceKey(sourceWorkspace,'jersey-correction',team.id,player.id,i);
        result.jerseyLoans.push({...remember(ck,'jersey-correction',{correction}),teamKey,playerRecordKey:key});
      });
    }
    for(const season of rows(team.seasons)) {
      if(!season?.id)throw new Error('Missing legacy season ID');
      const sk=sourceKey(sourceWorkspace,'season',team.id,season.id);
      result.teamSeasons.push({...remember(sk,'season',season),teamKey});
      rows(season.staff).forEach((person,i)=>{
        const path=sourceKey(sourceWorkspace,'season-staff',team.id,season.id,i);
        result.staffSnapshots.push({...remember(path,'season-staff',person),scope:sk,personId:null});
      });
      rows(season.squad).forEach((row,i)=>{
        const partKey=sourceKey(sourceWorkspace,'participation',team.id,season.id,row.playerId||i);
        const playerRecord=playerById.get(text(row.playerId));
        result.participations.push({...remember(partKey,'participation',row),teamSeasonKey:sk,
          playerRecordKey:playerRecord?.legacyKey||null});
        if(!playerRecord)result.reviewQueue.push({type:'missing-player-in-season',source:partKey,playerId:text(row.playerId)});
      });
    }
    rows(team.helpers).forEach(helper=>{
      if(!helper?.id)throw new Error('Missing helper ID');
      const hk=sourceKey(sourceWorkspace,'helper',team.id,helper.id);
      const id=provisional(sourceKey(sourceWorkspace,'helper-person',team.id,helper.id),hk,helper);
      result.helpers.push({...remember(hk,'helper',helper),personId:id,teamKey});
      if(helper.playerId){
        const player=playerById.get(text(helper.playerId));
        result.reviewQueue.push({type:'possible-guardian-requires-proof',source:hk,
          playerRecordKey:player?.legacyKey || null, verified:false, accessGranted:false});
        if(!player)result.reviewQueue.push({type:'missing-helper-player-reference',source:hk,playerId:text(helper.playerId)});
      }
    });
    for(const collection of ['sessions','matches','tasks','messages','notices','lineups','plays','playerSets']) {
      rows(team[collection]).forEach((entry,i)=>{
        if(!entry?.id)throw new Error('Missing ID in '+collection);
        const key=sourceKey(sourceWorkspace,collection,team.id,entry.id);
        result.events.push({...remember(key,collection,entry),teamKey});
      });
    }
  }
  rows(source.matchOfficials).forEach(person=>{
    if(!person?.id)throw new Error('Missing match official ID');
    const key=sourceKey(sourceWorkspace,'match-official',person.id);
    const id=provisional(sourceKey(sourceWorkspace,'crew-person',person.id),key,person);
    result.matchPersonnel.push({...remember(key,'match-official',person),personId:id,
      registrationIsCoachRecorded:true, permissionGranted:false});
  });
  for(const comp of rows(source.competitions)){
    if(!comp?.id)throw new Error('Missing legacy competition ID');
    const key=sourceKey(sourceWorkspace,'competition',comp.id);
    result.competitions.push({...remember(key,'competition',comp),organiserVerified:false});
    rows(comp.entries).forEach((entry,i)=>{
      const ek=sourceKey(sourceWorkspace,'competition-entry',comp.id,entry.id||i);
      result.entries.push({...remember(ek,'competition-entry',entry),competitionKey:key});
      if(entry.teamId&&!teams.has(text(entry.teamId)))
        result.reviewQueue.push({type:'missing-competition-team',source:ek,teamId:text(entry.teamId)});
    });
  }
  // Never infer accounts, role grants, guardian authority, subscription, organisation affiliation
  // or actual official registration merely from imported legacy records.
  result.people=[...persons.values()].sort((a,b)=>a.id.localeCompare(b.id));
  result.legacyReferences.sort((a,b)=>a.key.localeCompare(b.key));
  return result;
}
