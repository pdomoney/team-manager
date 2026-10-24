import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../site/model.js';
import {makeLock,newSalt,seal,openFile,unseal,teamView,toB64,fromB64} from '../site/vault.js';

// All names, phone strings and records in this file are invented. PBKDF2 is
// deliberately cheap for CI; this test never changes the production 600k KDF.
const FAST=1000, PASSWORD='p10b fictional backup password';
const copy=x=>JSON.parse(JSON.stringify(x));
const legacy=()=>({
  schema:3,id:'team1',updatedAt:'2026-10-19T00:00:00.000Z',
  team:{name:'Fictional Juniors',sport:'Oztag',clubId:'club-a',season:'Winter 2026'},
  clubs:[{id:'club-a',name:'Example Club A',sport:'Oztag'},{id:'club-b',name:'Example Club B',sport:'Rugby league'}],
  competitions:[],library:{plays:[],systems:{},playerSets:[]},
  players:[{id:'p1',name:'Fictional Player One',number:'7',positions:['Link'],phone:'PRIVATE-PHONE-ONE',
    notes:'PRIVATE-MEDICAL-NOTE',status:'available'}],
  helpers:[{id:'h1',name:'Fictional Helper',phone:'PRIVATE-HELPER-PHONE',playerId:'p1'}],
  seasons:[],
  matches:[{id:'m1',date:'2026-10-18',start:'10:00',opponent:'Example Opposition',
    status:'played',result:{us:6,them:4},rsvp:{p1:{v:'yes',via:'coach'}},
    coachNotes:'PRIVATE-COACH-NOTE'}],
  sessions:[],lineups:[],notices:[],messages:[],
  tasks:[{id:'task1',date:'2026-10-18',title:'Lifts',kind:'lift',matchId:'m1',
    people:[{who:'h:h1',role:'driver',status:'yes',seats:2}]}],
  plays:[{id:'play1',name:'Original play',sport:'Oztag',moves:[]}],
  playerSets:[],systems:{},
  teams:[{id:'team2',team:{name:'Fictional League',clubId:'club-b',sport:'Rugby league'},
    players:[{id:'p2',name:'Fictional Player Two',number:'12',positions:['Prop'],
      phone:'PRIVATE-SECOND-TEAM'}],
    helpers:[],matches:[],sessions:[],tasks:[],lineups:[],notices:[],
    messages:[],plays:[],playerSets:[],systems:{}}],
});

const migrated=()=>M.migrateWorkspace(copy(legacy()));
const encrypt=async value=>seal(value,await makeLock(PASSWORD,newSalt(),FAST),'coach');

test('P10B repeat legacy upgrade preserves team, person, season, jersey and linked duty identity',()=>{
  const old=legacy(),prior=copy(old);
  const ws=M.migrateWorkspace(copy(old));
  assert.deepEqual(old,prior,'input backup remains unmodified');
  assert.equal(ws.schema,4);
  assert.equal(ws.id,'team1');
  assert.deepEqual([ws.id,...ws.teams.map(t=>t.id)],['team1','team2']);
  assert.equal(ws.players[0].id,'p1');
  assert.equal(ws.teams[0].players[0].id,'p2');
  assert.equal(ws.matches[0].id,'m1');
  assert.deepEqual(ws.matches[0].result,{us:6,them:4});
  assert.equal(ws.tasks[0].id,'task1');
  assert.equal(ws.tasks[0].matchId,'m1','transport link remains local to the original fixture');
  assert.equal(ws.seasons.length,1);
  assert.equal(ws.players[0].jerseys[0].number,'7');
  assert.equal(ws.players[0].jerseys[0].seasonId,ws.seasons[0].id);
  const originalStable=M.stable(ws);
  const second=M.migrateWorkspace(copy(ws));
  const third=M.migrateWorkspace(copy(second));
  assert.equal(M.stable(second),originalStable,'first repeat upgrade is idempotent');
  assert.equal(M.stable(third),originalStable,'further upgrades never create duplicate records');
  assert.equal(M.stable(migrated()),originalStable,'independent clients agree on deterministic migration');
});

test('P10B encrypted backup roundtrip retains nested club/team/history and can be restored twice',async()=>{
  const ws=migrated();
  ws.matches[0].fixtureRevisions=[{
    before:{date:'2026-10-17',start:'09:00'},
    after:{date:'2026-10-18',start:'10:00'},
    reason:'Fictional coach amendment',source:'local-coach-workspace',
    taskDisposition:'move',at:'2026-10-17T01:00:00Z'
  }];
  ws.players[0].jerseys.push({id:'historic-loan',seasonId:'historic-season',number:'9',
    out:'2025-05-01',back:'2025-09-30'});
  ws.library.plays.push({id:'library-v2',name:'Historic cross-team play',rev:2,
    libraryOrigin:{scope:'coach-workspace',teamId:'team1',clubId:'club-a',sport:'Oztag'}});
  const expected=copy(ws);
  const file=await encrypt(ws);
  const serialized=JSON.stringify(file);
  for(const privateText of ['PRIVATE-PHONE-ONE','PRIVATE-MEDICAL-NOTE',
    'PRIVATE-SECOND-TEAM','Historic cross-team play','Fictional Player One']) {
    assert.equal(serialized.includes(privateText),false,'encrypted file leaked '+privateText);
  }
  const backup=JSON.parse(serialized);
  const first=(await openFile(backup,PASSWORD,'coach')).value;
  const second=(await openFile(JSON.parse(serialized),PASSWORD,'coach')).value;
  assert.deepEqual(first,expected);
  assert.deepEqual(second,expected,'second independent restore is identical');
  assert.equal(second.players[0].jerseys.find(x=>x.id==='historic-loan').back,'2025-09-30');
  assert.equal(second.matches[0].fixtureRevisions[0].before.start,'09:00');
  assert.equal(second.library.plays[0].rev,2);
  assert.equal(second.teams[0].id,'team2');
});

test('P10B wrong password, tamper, and role replacement fail without exposing a backup',async()=>{
  const ws=migrated(),lock=await makeLock(PASSWORD,newSalt(),FAST);
  const file=await seal(ws,lock,'coach');
  await assert.rejects(openFile(file,'incorrect password','coach'),e=>e.code==='WRONG');
  await assert.rejects(openFile(file,PASSWORD,'team'),e=>e.code==='WRONG');
  await assert.rejects(openFile({...file,data:undefined},PASSWORD,'coach'),e=>e.code==='FORMAT');
  const bytes=fromB64(file.data);bytes[bytes.length-2]^=4;
  await assert.rejects(unseal({...file,data:toB64(bytes)},lock.key),e=>e.code==='WRONG');
  await assert.rejects(unseal({...file,role:'team'},lock.key),e=>e.code==='WRONG');
  const good=(await openFile(file,PASSWORD,'coach')).value;
  assert.equal(good.matches[0].id,'m1','invalid unlocks do not corrupt original backup');
});

test('P10B player projection from restored encrypted coach record excludes sensitive linked records',async()=>{
  const original=migrated();
  const coach=(await openFile(await encrypt(original),PASSWORD,'coach')).value;
  const projected=teamView(coach,coach.clubs[0]);
  const text=JSON.stringify(projected);
  for(const secret of ['PRIVATE-PHONE-ONE','PRIVATE-MEDICAL-NOTE','PRIVATE-HELPER-PHONE',
    'PRIVATE-COACH-NOTE','PRIVATE-SECOND-TEAM','Fictional Player Two','team2',
    'rsvp','coachNotes','helpers']) {
    assert.equal(text.includes(secret),false,'player projection leaked '+secret);
  }
  assert.equal(projected.players[0].name,'Fictional Player One');
  const teamLock=await makeLock('player-only-password',newSalt(),FAST);
  const teamFile=await seal(projected,teamLock,'team');
  const player=(await openFile(teamFile,'player-only-password','team')).value;
  assert.deepEqual(player,projected);
  await assert.rejects(openFile(teamFile,PASSWORD,'coach'),e=>e.code==='WRONG');
  assert.equal(JSON.stringify(teamFile).includes('PRIVATE'),false);
});

test('P10B two dated encrypted archives restore independently; stale copy is not falsely described as conflict-safe',async()=>{
  const original=migrated(),older=copy(original);
  const early=await encrypt(older);
  original.players[0].number='15';
  original.matches[0].result={us:7,them:4};
  const late=await encrypt(original);
  const restoredEarly=(await openFile(early,PASSWORD,'coach')).value;
  const restoredLate=(await openFile(late,PASSWORD,'coach')).value;
  assert.equal(restoredEarly.players[0].number,'7');
  assert.equal(restoredLate.players[0].number,'15');
  assert.equal(restoredEarly.matches[0].result.us,6);
  assert.equal(restoredLate.matches[0].result.us,7);
  assert.deepEqual(older,(await openFile(early,PASSWORD,'coach')).value,
    'reading later backup must not mutate older encrypted archive');
  // This is snapshot isolation only. It does not prove live multi-device merge,
  // automatic conflict resolution, or GitHub publication behavior.
});
