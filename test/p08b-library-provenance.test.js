import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../site/model.js';
import { localLibraryOrigin, libraryOrigin, libraryCopyReview, LIBRARY_SCOPE } from '../site/p08-library-provenance.js';

function fixture() {
  const ws={id:'team1',team:{name:'Original Oztag',sport:'Oztag',clubId:'club-a'},
    clubs:[{id:'club-a',name:'Club A',sport:'Oztag'},
      {id:'club-b',name:'Club B',sport:'Oztag'}],
    teams:[],library:{plays:[],systems:{},playerSets:[]},
    plays:[{id:'play1',name:'Out the back',sport:'Oztag',moves:[{t:'pass'}]}],
    systems:{},playerSets:[],players:[{id:'p',name:'PRIVATE PLAYER',medical:'PRIVATE HEALTH'}]};
  const team=(id,clubId,sport)=>({id,team:{name:id,sport,clubId},
    plays:[],systems:{},playerSets:[]});
  const same=team('team2','club-a','Oztag'),otherClub=team('team3','club-b','Oztag'),
    otherSport=team('team4','club-a','Touch football');
  ws.teams.push(same,otherClub,otherSport);
  return {ws,same,otherClub,otherSport};
}

test('P08B newly saved library play retains origin and revision history without person data',()=>{
  const {ws,same}=fixture(), before=JSON.stringify(ws.players);
  const v1=M.libSave(ws,ws,'plays','play1',{now:'2026-10-24T00:00:00Z'});
  const li=M.libGet(ws,'plays',v1.id);
  assert.equal(v1.rev,1);
  assert.deepEqual(libraryOrigin(li),{scope:LIBRARY_SCOPE,teamId:'team1',clubId:'club-a',sport:'Oztag'});
  assert.equal(libraryCopyReview(ws,li,same).automaticCopy,true);
  const copy=M.libAdd(ws,same,'plays',v1.id);
  assert.ok(copy && copy.lib.id===v1.id);
  assert.equal(copy.libraryOrigin,undefined,'source metadata belongs to library, not the team play content');
  ws.plays[0].name='Updated play';
  const v2=M.libSave(ws,ws,'plays','play1',{now:'2026-10-25T00:00:00Z'});
  assert.equal(v2.rev,2);
  assert.equal(same.plays[0].name,'Updated play');
  assert.deepEqual(libraryOrigin(M.libGet(ws,'plays',v1.id)),libraryOrigin(li));
  assert.equal(JSON.stringify(ws.players),before);
  assert.equal(JSON.stringify(M.libExport(ws)).includes('PRIVATE'),false);
});

test('P08B old library entries and malicious scope claims require review, not silent copying',()=>{
  const {ws,same}=fixture();
  for(const entry of [
    {id:'legacy',name:'Pre-P08B',rev:3},
    {id:'tenant',libraryOrigin:{scope:'association',teamId:'t',clubId:'club-a',sport:'Oztag'}},
    {id:'empty',libraryOrigin:{scope:'coach-workspace',teamId:'t',clubId:'',sport:'Oztag'}},
    {id:'wrongtype',libraryOrigin:'club-a'}
  ]) {
    const review=libraryCopyReview(ws,entry,same);
    assert.equal(review.result,'unknown-provenance');
    assert.equal(review.automaticCopy,false);
    assert.equal(review.requiresExplicitReview,true);
    assert.equal(review.authorisedExternalShare,false);
  }
});

test('P08B same-sport different-club and same-club different-sport both require explicit copy review',()=>{
  const {ws,same,otherSport,otherClub}=fixture(), li={libraryOrigin:localLibraryOrigin(ws,ws)};
  assert.equal(libraryCopyReview(ws,li,same).result,'same-context');
  assert.equal(libraryCopyReview(ws,li,otherSport).result,'different-sport');
  assert.equal(libraryCopyReview(ws,li,otherClub).result,'different-club');
  assert.equal(libraryCopyReview(ws,li,otherClub).automaticCopy,false);
  assert.equal(libraryCopyReview(ws,li,otherSport).automaticCopy,false);
});

test('P08B preview is immutable and cannot modify source or target records',()=>{
  const {ws,otherSport}=fixture();const input={libraryOrigin:localLibraryOrigin(ws,ws)};
  const before=JSON.stringify(ws),b2=JSON.stringify(input);
  const r=libraryCopyReview(ws,input,otherSport);
  assert.equal(Object.isFrozen(r),true);
  assert.equal(Object.isFrozen(input.libraryOrigin),true);
  assert.equal(r.scope,LIBRARY_SCOPE);
  assert.equal(JSON.stringify(ws),before);
  assert.equal(JSON.stringify(input),b2);
});

test('P08B imported library provenance survives export and import but grants no cross-workspace access',()=>{
  const {ws,otherClub}=fixture();
  const a=M.libSave(ws,ws,'plays','play1');
  const original=M.libGet(ws,'plays',a.id),file=JSON.parse(JSON.stringify(M.libExport(ws)));
  assert.equal(file.version,1,'existing library format unchanged');
  const other={...fixture().ws, library:{plays:[],systems:{},playerSets:[]}};
  const imported=M.libImport(other,file);
  assert.equal(imported.added,1);
  const after=M.libGet(other,'plays',a.id);
  assert.deepEqual(after.libraryOrigin,original.libraryOrigin);
  assert.equal(libraryCopyReview(ws,after,otherClub).requiresExplicitReview,true);
  assert.equal(libraryCopyReview(ws,after,otherClub).authorisedExternalShare,false);
});

test('P08B legacy revision updates preserve old library contents and retain source if known',()=>{
  const {ws}=fixture();
  ws.library.plays=[{id:'legacy',name:'Legacy play',rev:2,at:'2026-01-01'}];
  ws.plays[0].lib={id:'legacy',rev:2};
  const v=M.libSave(ws,ws,'plays','play1');
  assert.equal(v.rev,3);
  assert.equal(M.libGet(ws,'plays','legacy').name,'Out the back');
  assert.deepEqual(libraryOrigin(M.libGet(ws,'plays','legacy')),localLibraryOrigin(ws,ws));
  assert.equal(M.libStatus(ws,'plays',ws.plays[0]),'current');
});
