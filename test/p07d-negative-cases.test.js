import test from 'node:test';
import assert from 'node:assert/strict';
import { localWorkspaceCalendar } from '../site/p07-calendar.js';
import { fixtureAuthority } from '../site/p07-fixture-authority.js';
import { fixtureSnapshot, commitFixtureRevision } from '../site/p07-fixture-amendments.js';
import { teamView } from '../site/vault.js';

// Synthetic two-club tournament. Records are local and deliberately reuse a match ID.
function workspace() {
  const match = (entryId, opponent) => ({
    id:'shared-match', entryId, opponent, date:'2026-11-15', start:'09:30',
    venue:'Synthetic Park', field:'1', status:'scheduled',
    result:{us:2,them:1}, crew:[{personId:'PRIVATE-CREW',confirmed:true}],
    rsvp:{'PRIVATE-CHILD':'yes'}, coachNotes:'PRIVATE COACH NOTE',
    lineupId:'lu1', seasonId:'s1'
  });
  return {
    id:'team1', team:{name:'U12 Oztag',clubId:'club-a',sport:'Oztag'},
    seasons:[{id:'s1',year:'2026'}], matches:[match('entry-a','Club B')],
    sessions:[{id:'training',date:'2026-11-15',start:'09:30',end:'10:30',focus:'Passing'}],
    tasks:[{id:'duty',date:'2026-11-15',start:'09:30',title:'Gear duty',
      people:[{who:'PRIVATE-PERSON'}],notes:'PRIVATE HEALTH'}],
    players:[{id:'PRIVATE-CHILD',name:'PRIVATE MINOR'}],
    clubs:[{id:'club-a',name:'Club A',sport:'Oztag'},
      {id:'club-b',name:'Club B',sport:'Oztag'}],
    competitions:[{id:'comp',name:'Synthetic Tournament',format:'roundrobin',sport:'Oztag',
      entries:[{id:'entry-a',teamId:'team1',seasonId:'s1',status:'entered'},
        {id:'entry-b',teamId:'team2',seasonId:'s1',status:'entered'}]}],
    teams:[{id:'team2',team:{name:'U12 Other club',clubId:'club-b',sport:'Oztag'},
      seasons:[{id:'s1',year:'2026'}],matches:[match('entry-b','Club A')],
      sessions:[],tasks:[],players:[]}]
  };
}
const approval=(m,change='Fixture time corrected by coach')=>({
  confirmed:true,reason:change,expectedBefore:fixtureSnapshot(m),
  at:'2026-10-24T00:00:00.000Z',taskDisposition:'none'
});

test('P07D two clubs in one tournament preserve distinct local fixture IDs and ownership',()=>{
  const ws=workspace(),before=JSON.stringify(ws);
  const out=localWorkspaceCalendar(ws);
  const matches=out.events.filter(e=>e.kind==='match');
  assert.equal(matches.length,2);
  assert.equal(new Set(matches.map(e=>e.key)).size,2);
  assert.deepEqual(matches.map(e=>e.clubId).sort(),['club-a','club-b']);
  assert.ok(matches.every(e=>e.recordId==='shared-match' && e.officialFixture===false));
  assert.equal(fixtureAuthority(ws,'team1','shared-match').competitionId,'comp');
  assert.equal(fixtureAuthority(ws,'team2','shared-match').competitionId,'comp');
  assert.equal(JSON.stringify(ws),before);
});

test('P07D simultaneous match, training and duty are displayed separately without invented rescheduling',()=>{
  const ws=workspace(),out=localWorkspaceCalendar(ws);
  assert.equal(out.events.length,4);
  assert.deepEqual(out.events.map(e=>e.start),Array(4).fill('09:30'));
  assert.deepEqual(out.totals,{events:4,matches:2,training:1,duties:1,cancelled:0,review:0});
  assert.equal(ws.matches[0].start,'09:30');
  assert.equal(ws.teams[0].matches[0].start,'09:30');
});

test('P07D cross-team competition entry cannot give another team fixture authority',()=>{
  const ws=workspace();ws.matches[0].entryId='entry-b';
  const main=fixtureAuthority(ws,'team1','shared-match');
  const second=fixtureAuthority(ws,'team2','shared-match');
  assert.equal(main.entryStatus,'wrong-team');
  assert.equal(main.competitionId,'');
  assert.equal(main.reviewRequired,true);
  assert.equal(second.entryStatus,'entered');
  const filtered=localWorkspaceCalendar(ws,{clubId:'club-a'});
  assert.equal(filtered.totals.review,1);
  assert.ok(filtered.events.every(e=>e.clubId==='club-a'));
});

test('P07D malformed and reversed calendar filters fail closed, not broaden visibility',()=>{
  const ws=workspace();
  const bad=[
    {from:'2026-02-30'}, {to:'2026-15-01'}, {from:'wrong'},
    {from:'2026-11-16',to:'2026-11-15'}, {clubId:[]},
    {teamId:{id:'team1'}}, {sport:32}, {clubId:'   '},
    {from:[]}, null, 'all'
  ];
  for(const opts of bad){
    const out=localWorkspaceCalendar(ws,opts);
    assert.equal(out.totals.events,0,JSON.stringify(opts));
    assert.equal(out.events.length,0);
    assert.equal(Object.isFrozen(out),true);
  }
});

test('P07D valid unbounded, club, team and inclusive local date selections retain expected records',()=>{
  const ws=workspace();
  assert.equal(localWorkspaceCalendar(ws,{}).totals.events,4);
  assert.equal(localWorkspaceCalendar(ws,{clubId:''}).totals.events,4);
  assert.equal(localWorkspaceCalendar(ws,{from:'',to:''}).totals.events,4);
  assert.equal(localWorkspaceCalendar(ws,{clubId:'club-a'}).totals.events,3);
  assert.equal(localWorkspaceCalendar(ws,{clubId:'club-b'}).totals.events,1);
  assert.equal(localWorkspaceCalendar(ws,{clubId:'club-a',teamId:'team2'}).totals.events,0);
  assert.equal(localWorkspaceCalendar(ws,{clubId:'unlisted'}).totals.events,0);
  assert.equal(localWorkspaceCalendar(ws,{from:'2026-11-15',to:'2026-11-15'}).totals.events,4);
  assert.equal(localWorkspaceCalendar(ws,{from:'2026-11-16'}).totals.events,0);
});

test('P07D archived teams remain invisible while preserved historical data is untouched',()=>{
  const ws=workspace();ws.teams[0].archived=true;
  const before=JSON.stringify(ws);
  assert.equal(localWorkspaceCalendar(ws).totals.events,3);
  assert.equal(ws.teams[0].matches.length,1);
  assert.equal(JSON.stringify(ws),before);
});

test('P07D confirmed fixture correction retains history, results, crew and private RSVP',()=>{
  const ws=workspace(),m=ws.matches[0],prior=JSON.stringify({
    result:m.result,crew:m.crew,rsvp:m.rsvp,lineupId:m.lineupId,entryId:m.entryId,seasonId:m.seasonId
  });
  const confirmation=commitFixtureRevision(m,{date:'2026-11-16',start:'10:30'},approval(m));
  assert.equal(confirmation.error,undefined);
  assert.equal(m.fixtureRevisions.length,1);
  assert.equal(m.fixtureRevisions[0].source,'local-coach-workspace');
  assert.equal(m.fixtureRevisions[0].before.date,'2026-11-15');
  assert.equal(m.fixtureRevisions[0].after.date,'2026-11-16');
  assert.equal(JSON.stringify({
    result:m.result,crew:m.crew,rsvp:m.rsvp,lineupId:m.lineupId,entryId:m.entryId,seasonId:m.seasonId
  }),prior);
  const player=JSON.stringify(teamView(ws));
  for(const sensitive of ['PRIVATE-CREW','PRIVATE COACH NOTE','PRIVATE HEALTH','PRIVATE-PERSON','fixtureRevisions','coachNotes','crew','rsvp'])
    assert.equal(player.includes(sensitive),false,sensitive);
  assert.ok(JSON.stringify(ws).includes('PRIVATE'));
});

test('P07D stale, unconfirmed and destructive decisions cannot mutate fixture history',()=>{
  const ws=workspace(),m=ws.matches[0],before=JSON.stringify(m);
  const a=approval(m);
  assert.match(commitFixtureRevision(m,{date:'2026-11-16'},{...a,confirmed:false}).error,/confirmation/);
  assert.match(commitFixtureRevision(m,{date:'2026-11-16'},{...a,taskDisposition:'remove'}).error,/disposition/);
  assert.match(commitFixtureRevision(m,{date:'2026-02-30'},a).error,/date/);
  assert.match(commitFixtureRevision(m,{start:'25:99'},a).error,/time/);
  assert.match(commitFixtureRevision(m,{status:'official'},a).error,/status/);
  assert.match(commitFixtureRevision(m,{date:'2026-11-16'},{...a,expectedBefore:{...a.expectedBefore,date:'2026-11-14'}}).error,/changed after review/);
  assert.equal(JSON.stringify(m),before);
});

test('P07D old unlinked friendlies are not coerced into official entries or other teams',()=>{
  const ws=workspace();
  ws.matches.push({id:'friendly',date:'2026-11-17',start:'08:00',friendly:true,
    status:'scheduled',opponent:'Synthetic invitational',result:{us:0,them:0}});
  const authority=fixtureAuthority(ws,'team1','friendly');
  assert.equal(authority.kind,'friendly');
  assert.equal(authority.officialFixture,false);
  assert.equal(authority.competitionId,'');
  const record=localWorkspaceCalendar(ws,{clubId:'club-a'}).events.find(e=>e.recordId==='friendly');
  assert.equal(record.officialFixture,false);
  assert.equal(record.provenance,'local-coach-workspace');
});
