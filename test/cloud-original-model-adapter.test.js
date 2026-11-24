import test from 'node:test';
import assert from 'node:assert/strict';
import {
  projectCloudTeamToOriginalModel,originalJerseyReportFromCloud,
  originalJerseyInventoryFromCloud,originalTeamCompetitionsFromCloud,
  teamRecordedMatchesFromSchedule
} from '../site/cloud-original-model-adapter.js';
const context={teamId:'stgeorge-mixed20',club:'St George Oztag',
 teamName:'St George Mixed 20',sport:'oztag',season:'2027'};
const base={
 context,
 members:[
 {personId:'person-01',name:'Verified Player',status:'active',teamId:context.teamId},
 {personId:'person-02',name:'Former Player',status:'inactive',teamId:context.teamId}
 ],
 jerseys:[
 {issueId:'jersey-abc',personId:'person-01',jerseyNo:'14',season:'2027',
  issuedAt:'2027-02-01T00:00:00Z',returnedAt:null},
 {issueId:'jersey-def',personId:'person-02',jerseyNo:'7',season:'2026',
  issuedAt:'2026-02-01T00:00:00Z',returnedAt:null}
 ],
 competitions:[{
  competitionId:'competition-alpha',name:'Winter Oztag',format:'tournament',
  season:'2027',division:'Mixed 20',organiser:'Fictional League',
  venue:'Club field',status:'entered',beginsOn:'2027-03-03',endsOn:'2027-03-07'
 }],
 sessions:[{
  sessionId:'session1',teamId:context.teamId,kind:'training',
  status:'planned',startsAt:'2027-02-20T18:00:00+11:00',locationLabel:'Club field'
 }]
};
test('connected exact-team records feed the original Team Manager jersey report',()=>{
 const report=originalJerseyReportFromCloud(base);
 assert.equal(report.complete,true);
 assert.equal(report.out,1);
 assert.equal(report.gone,0);
 assert(report.rows.some(p=>p.name==='Verified Player'&&p.number==='14'));
 const inventory=originalJerseyInventoryFromCloud(base);
 assert.equal(inventory.outstanding,2);
 assert.equal(inventory.formerPlayers,1);
});
test('original competition model, not a parallel cloud calculation, presents team entry',()=>{
 const items=originalTeamCompetitionsFromCloud(base);
 assert.equal(items.length,1);
 assert.equal(items[0].name,'Winter Oztag');
 assert.equal(items[0].entryStatus,'entered');
 assert.equal(items[0].division,'Mixed 20');
 assert.equal(items[0].venue,'Club field');
});
test('never merge cross-team records, duplicate people or duplicate issue IDs',()=>{
 assert.throws(()=>projectCloudTeamToOriginalModel({...base,
  members:[{personId:'person-01',teamId:'foreign-team',status:'active'}]}),
  /cross-team/);
 assert.throws(()=>projectCloudTeamToOriginalModel({...base,
  members:[base.members[0],base.members[0]]}),/ambiguous-person/);
 assert.throws(()=>projectCloudTeamToOriginalModel({...base,
  jerseys:[base.jerseys[0],base.jerseys[0]]}),/ambiguous-jersey-issue/);
});
test('unknown former jersey keeper must never be silently counted as zero',()=>{
 const input={...base,jerseys:[...base.jerseys,
  {issueId:'jersey-unlinked',personId:'not-linked',jerseyNo:'11',
   season:'2026',issuedAt:'2026-01-01T10:00:00Z'}]};
 const report=originalJerseyInventoryFromCloud(input);
 assert.equal(report.complete,false);
 assert.deepEqual(report.omissions,[{kind:'unlinked-jersey',issueId:'jersey-unlinked'}]);
});
test('does not infer any official fixture or registered player eligibility',()=>{
 const {team,workspace}=projectCloudTeamToOriginalModel(base);
 assert.equal(team.matches.length,0);
 assert.equal(team.sessions[0].date,'2027-02-20');
 assert(!('registered' in team.players[0]));
 assert.equal(workspace.competitions[0].entries[0].teamId,context.teamId);
 assert(!('officialVerified' in workspace.competitions[0]));
});

test('team fixture schedule projection never fabricates official draw or competition entry',()=>{
 const input={context,sessions:[
  {sessionId:'event-abc',teamId:context.teamId,kind:'match',
    startsAt:'2027-03-03T12:00:00+11:00',title:'vs Eagles',status:'planned'},
  {sessionId:'official-abc',teamId:context.teamId,kind:'match',
    startsAt:'2027-03-04T12:00:00+11:00',title:'vs Hawks',status:'planned'},
  {sessionId:'training',teamId:context.teamId,kind:'training',
    startsAt:'2027-03-04T12:00:00+11:00'}
 ]};
 const rows=teamRecordedMatchesFromSchedule(input);
 assert.equal(rows.length,2);
 assert.deepEqual(rows.map(x=>x.source),['team-recorded','unverified']);
 assert(rows.every(x=>x.official===false&&x.competitionId===null));
 assert.throws(()=>teamRecordedMatchesFromSchedule({...input,
  sessions:[...input.sessions,{sessionId:'bad',teamId:'other-team',kind:'match',
    startsAt:'2027-03-03T12:00:00+11:00'}]}),/cross-team/);
});
