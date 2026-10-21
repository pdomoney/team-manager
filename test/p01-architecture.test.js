import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../site/model.js';
import { projectSchema4DryRun, sourceKey } from './support/p01-projector.js';

// Fictional data only. No user uploads, tenant data, accounts, mail, network or persistence.
function sample() {
  return {
    schema: 4, id: 'team1',
    team: {name:'Example League Tag U16',sport:'League tag',clubId:'club-a',
      staff:[{role:'Head coach',name:'Alex Example',phone:'0400 000 012'}]},
    clubs: [
      {id:'club-a',name:'Example Rugby League',sport:'Rugby league',
        directoryMatch:{id:'research-example',classification:'user_confirmed_same_club_research_candidate'},
        officials:[{role:'Secretary',name:'Jordan Example',email:'secretary@example.invalid'}]},
      {id:'club-b',name:'Example Multi-Sport',sport:'Oztag',officials:[]}
    ],
    players: [
      {id:'p1',personId:'person:team1:p1',name:'Alex Example',number:'8',
        phone:'0400 000 011',positions:['Wing'],jerseys:[{id:'j1',number:'8',seasonId:'s26',out:'2026-02-01',back:''}],
        jerseyCorrections:['["s25","6"]']},
      {id:'p3',name:'Alex Example',number:'19',positions:['Middle']}
    ],
    seasons:[{id:'s26',name:'Winter 2026',year:'2026',status:'active',
      staff:[{role:'Assistant coach',name:'Jo Example'}],
      squad:[{playerId:'p1',number:'8',positions:['Wing'],reg:'registered'},{playerId:'p3',number:'19',positions:['Middle']}] }],
    helpers:[{id:'h1',name:'Parent Example',playerId:'p1',relation:'parent',phone:'0400 000 010'}],
    matches:[{id:'m1',date:'2026-10-23',seasonId:'s26',entryId:'entry1',crew:[{personId:'crew1',role:'firstAid',confirmed:false}],result:{}}],
    sessions:[{id:'tr1',date:'2026-10-20',attendance:{p1:'present'}}],
    tasks:[{id:'t1',title:'BBQ',date:'2026-10-23',people:[{who:'h:h1',status:'yes'}],matchId:'m1'}],
    lineups:[{id:'l1',name:'First lineup',slots:[{id:'LW',playerId:'p1'}]}],
    messages:[],notices:[],plays:[{id:'team-play',name:'Team adapted play',lib:{id:'play-library',rev:1,edited:true}}],playerSets:[],systems:{exit:{pos:{},jobs:{coach:'Retained team edits'}}},
    teams:[{id:'team2',team:{name:'Example Oztag Mixed',sport:'Oztag',clubId:'club-b',
      staff:[{role:'Team manager',name:'Jordan Example'}]},
      players:[{id:'p2',personId:'person:team1:p1',name:'Alex Example',number:'2',positions:['Link'],
        jerseys:[{id:'j2',number:'2',seasonId:'s27',out:'2026-05-01',back:'2026-06-01'}]},
        {id:'p4',name:'Alex Example',number:'5',positions:['Rover']}],
      seasons:[{id:'s27',name:'Summer 2026',status:'active',squad:[{playerId:'p2',number:'2',positions:['Link']},
        {playerId:'p4',number:'5',positions:['Rover']}]}],
      helpers:[],matches:[],sessions:[],tasks:[],notices:[],messages:[],lineups:[],plays:[],playerSets:[],systems:{}}],
    competitions:[{id:'comp1',name:'Fictional Cup',format:'knockout',status:'planned',
      entries:[{id:'entry1',teamId:'team1',seasonId:'s26',division:'Juniors',pool:'A',status:'entered'}]}],
    matchOfficials:[{id:'crew1',name:'Alex Example',clubIds:['club-a','club-b'],
      rolesBySport:{'League tag':['firstAid']},wwccStatus:'checked',registrationBySport:{'League tag':{trainer:'2026'}}}],
    library:{plays:[{id:'play-library',name:'Coach private move',phases:[{title:'Move',steps:['Run']}],rev:2}],
      playerSets:[{id:'set-lib',name:'Private list',slots:[]}],
      systems:{exit:{pos:{},jobs:{coach:'Prepare'}}}}
  };
}

test('P01 synthetic dry run is pure, deterministic, repeatable and scoped to source workspace',()=>{
  const source=sample(),before=structuredClone(source);
  const first=projectSchema4DryRun(source,'owner-a');
  assert.deepEqual(source,before,'planning never writes back to source');
  assert.deepEqual(projectSchema4DryRun(source,'owner-a'),first,'identical source/namespace produces stable output');
  const other=projectSchema4DryRun(source,'owner-b');
  assert.notEqual(first.people[0].id,other.people[0].id,'source owner is included in identity reference');
  assert.equal(first.clubs.length,2);
  assert.equal(first.teams.length,2);
  assert.equal(first.teamSeasons.length,2);
  assert.equal(first.competitions.length,1);
  assert.equal(first.entries.length,1);
  assert.equal(first.participations.length,4);
  assert.equal(first.playerRecords.length,4);
  assert.equal(first.helpers.length,1);
  assert.equal(first.matchPersonnel.length,1);
  assert.equal(first.jerseyLoans.length,3,'all issue/return/correction ledger rows retained');
  assert.equal(first.staffSnapshots.length,4,'official, team and season legacy staff snapshots retained');
  assert.equal(first.contentRecords.length,4,'team system plus three coach-library items retained');
  assert.equal(first.legacyReferences.length,new Set(first.legacyReferences.map(x=>x.key)).size);
});

test('P01 explicit personId groups only local linked players; same names and crew stay separate',()=>{
  const v=projectSchema4DryRun(sample(),'owner-a');
  const league=v.playerRecords.find(x=>x.legacyPlayerId==='p1');
  const oztag=v.playerRecords.find(x=>x.legacyPlayerId==='p2');
  assert.equal(league.personId,oztag.personId);
  const sameNames=v.playerRecords.filter(x=>['p3','p4'].includes(x.legacyPlayerId));
  assert.notEqual(sameNames[0].personId,sameNames[1].personId);
  assert.notEqual(sameNames[0].personId,league.personId);
  assert.notEqual(v.matchPersonnel[0].personId,league.personId,'crew name never creates implicit link');
  assert.equal(v.people.filter(p=>p.id===league.personId).length,1);
  assert.ok(v.people.every(p=>p.verified===false && p.claim==='provisional'));
});

test('P01 imports no account, role grant, subscription, affiliation or verified guardian authority',()=>{
  const v=projectSchema4DryRun(sample(),'owner-a');
  for(const field of ['accounts','subscriptions','roleGrants','affiliations','verifiedGuardianGrants'])
    assert.deepEqual(v[field],[],field+' must not be inferred from legacy facts');
  const parent=v.reviewQueue.find(q=>q.type==='possible-guardian-requires-proof');
  assert.ok(parent);
  assert.equal(parent.accessGranted,false);
  assert.equal(parent.verified,false);
  assert.equal(parent.playerRecordKey,sourceKey('owner-a','player','team1','p1'));
  assert.equal(v.clubs[0].directoryMatchIsOnlyResearch,true);
  assert.equal(v.matchPersonnel[0].registrationIsCoachRecorded,true);
  assert.equal(v.matchPersonnel[0].permissionGranted,false);
  assert.equal(v.competitions[0].organiserVerified,false);
});

test('P01 preserve team-specific kit and season snapshots without copying between sports',()=>{
 const p=projectSchema4DryRun(sample(),'owner-a');
 const j1=p.jerseyLoans.find(j=>j.snapshot.id==='j1');
 const j2=p.jerseyLoans.find(j=>j.snapshot.id==='j2');
 assert.equal(j1.snapshot.back,'');
 assert.equal(j2.snapshot.back,'2026-06-01');
 assert.notEqual(j1.teamKey,j2.teamKey);
 assert.ok(p.participations.find(x=>x.snapshot.playerId==='p1').snapshot.positions.includes('Wing'));
 assert.ok(p.participations.find(x=>x.snapshot.playerId==='p2').snapshot.positions.includes('Link'));
 assert.ok(p.events.some(x=>x.legacyKey===sourceKey('owner-a','matches','team1','m1')));
 assert.ok(p.events.some(x=>x.legacyKey===sourceKey('owner-a','tasks','team1','t1')));
 assert.equal(p.contentRecords.find(x=>x.legacyKey===sourceKey('owner-a','team-system','team1','exit')).snapshot.jobs.coach,'Retained team edits');
 assert.equal(p.contentRecords.find(x=>x.legacyKey===sourceKey('owner-a','library','plays','play-library')).snapshot.rev,2);
 assert.ok(p.contentRecords.filter(x=>x.kind==='plays').every(x=>x.publishedToClub===false));
 assert.ok(p.events.some(x=>x.snapshot?.lib?.edited===true),'team-edited play remains independent from library revision');
});

test('P01 reviews orphaned source links instead of silently granting access',()=>{
 const s=sample();
 s.seasons[0].squad.push({playerId:'not-a-player',number:'99'});
 s.helpers[0].playerId='not-a-player';
 s.competitions[0].entries[0].teamId='not-a-team';
 s.teams[0].team.clubId='missing-club';
 const p=projectSchema4DryRun(s,'owner-a');
 for(const kind of ['missing-player-in-season','missing-helper-player-reference','missing-competition-team',
  'unresolved-club-reference','possible-guardian-requires-proof'])
   assert.ok(p.reviewQueue.some(x=>x.type===kind),kind);
 assert.deepEqual(p.roleGrants,[]);
});

test('P01 rejects malformed/duplicate keys and accepts schema-4 structures from existing model migration',()=>{
 assert.throws(()=>projectSchema4DryRun(sample(),''),/namespace/);
 const bad=sample(); bad.teams[0].id='team1';
 assert.throws(()=>projectSchema4DryRun(bad,'owner-a'),/duplicate legacy team/i);
 const old=sample();old.players.push({...old.players[0]});
 assert.throws(()=>projectSchema4DryRun(old,'owner-a'),/Duplicate player ID/);
 assert.throws(()=>projectSchema4DryRun({...sample(),schema:3},'owner-a'),/schema-4/);
 const migrated=M.migrateWorkspace(structuredClone(sample()));
 assert.equal(migrated.schema,4);
 const p=projectSchema4DryRun(migrated,'owner-a');
 assert.equal(p.teams.length,2);
 assert.equal(p.playerRecords.length,4);
 assert.equal(p.entries.length,1);
});
