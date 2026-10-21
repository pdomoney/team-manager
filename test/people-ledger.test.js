import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../site/model.js';
import { buildLocalPeopleIndex, proposeLocalPersonLink, reviewLocalPersonLink } from '../site/people-index.js';
import { appendReviewedPersonLink, reverseReviewedPersonLink, normalizePersonReviews, describeLocalReviews } from '../site/people-ledger.js';
import { makeLock, seal, openFile, teamView } from '../site/vault.js';

const NS='trusted-local-coach-workspace';
const TIME='2026-10-21T05:20:00.000Z';
const LATER='2026-10-21T05:30:00.000Z';
const clone=x=>JSON.parse(JSON.stringify(x));
const initial=()=>M.migrateWorkspace({
 id:'team1',schema:4,clubs:[{id:'leagueclub',name:'Fictional Club',sport:'Rugby league'}],
 team:{name:'Under 16s',clubId:'leagueclub',sport:'Rugby league'},
 players:[{id:'p1',name:'Junior One',personId:'local-explicit-one',
   phone:'PRIVATE PLAYER CONTACT',number:'7',positions:['Wing'],
   jerseys:[{id:'loan1',number:'7',out:'2026-06-01',back:''}]}],
 helpers:[{id:'h1',name:'Volunteer One',playerId:'p1',phone:'PRIVATE HELPER CONTACT'}],
 matchOfficials:[{id:'crew1',name:'Match Trainer',email:'SECRET@EXAMPLE.INVALID'}],
 clubs:[{id:'leagueclub',name:'Fictional Club',sport:'Rugby league'}],
 seasons:[{id:'season26',name:'2026',status:'active',
   squad:[{playerId:'p1',number:'7',positions:['Wing']}],staff:[{name:'Coach One',role:'Head coach'}]}],
 sessions:[{id:'training1',date:'2026-10-19',attendance:{p1:'present'}}],
 matches:[],tasks:[],notices:[],messages:[],lineups:[],plays:[],playerSets:[],systems:{},
 competitions:[],teams:[],library:{plays:[],playerSets:[],systems:{}}
});
const review=(ws,which='helper')=>{
 const i=buildLocalPeopleIndex(ws,NS);
 assert.equal(i.error,undefined);
 const player=i.references.find(r=>r.kind==='player');
 const other=i.references.find(r=>r.kind===which);
 assert.ok(player&&other);
 const proposal=proposeLocalPersonLink(i,{firstRef:player.sourceRef,
   secondRef:other.sourceRef,proposedBy:'trusted-coach'});
 assert.equal(proposal.error,undefined);
 const confirmed=reviewLocalPersonLink(i,proposal,{reviewedBy:'trusted-coach',confirmed:true});
 assert.equal(confirmed.status,'locally-reviewed-link-only');
 return {index:i,confirmed};
};
const add=(ws,which='helper')=>{
 const {index,confirmed}=review(ws,which);
 const result=appendReviewedPersonLink(ws,index,confirmed,{reviewedAt:TIME});
 assert.equal(result.error,undefined);
 return result;
};

test('P04A optional ledger migrates schema-4 data deterministically without a version bump',()=>{
 const old=initial(),legacy=clone(old);delete legacy.peopleReviews;
 const upgraded=M.migrateWorkspace(legacy);
 assert.equal(upgraded.schema,4);
 assert.deepEqual(upgraded.peopleReviews,[]);
 assert.deepEqual(M.migrateWorkspace(clone(upgraded)),upgraded);
 assert.equal(M.legacyTeam(upgraded,'team1').peopleReviews,undefined);
 assert.equal(M.stripWs(upgraded).peopleReviews,undefined);
 assert.equal(legacy.players[0].number,'7');
});
test('P04A a reviewed link persists in the trusted workspace only, without changing legacy records',()=>{
 const ws=initial(),original=clone(ws),result=add(ws);
 assert.deepEqual(ws,original,'review creation is pure; caller must save returned coach workspace');
 assert.equal(result.record.status,'reviewed');
 assert.equal(result.record.verifiedIdentity,false);
 assert.equal(result.record.changedSourceRecords,false);
 assert.deepEqual(result.record.accessGrants,[]);
 assert.equal(result.workspace.peopleReviews.length,1);
 assert.deepEqual(result.workspace.players,original.players);
 assert.deepEqual(result.workspace.helpers,original.helpers);
 assert.deepEqual(result.workspace.matchOfficials,original.matchOfficials);
 assert.deepEqual(result.workspace.seasons,original.seasons);
 assert.deepEqual(result.workspace.sessions,original.sessions);
 assert.equal(result.workspace.players[0].jerseys[0].back,'');
 assert.deepEqual(M.migrateWorkspace(clone(result.workspace)).peopleReviews,result.workspace.peopleReviews);
 assert.deepEqual(describeLocalReviews(result.workspace),{
   reviewed:1,reversed:0,hasAnyRealAccessGrant:false,hasAnyVerifiedGuardian:false,
   sourceRecordsModified:false
 });
});
test('P04A reviewed source is idempotent; cannot accidentally reactivate a reversed tombstone',()=>{
 const ws=initial(),r=add(ws), {index,confirmed}=review(ws);
 assert.ok(appendReviewedPersonLink(r.workspace,index,confirmed,{reviewedAt:TIME}).error);
 const undo=reverseReviewedPersonLink(r.workspace,r.record.id,{reversedBy:'trusted-coach',reversedAt:LATER});
 assert.equal(undo.record.status,'reversed');
 assert.equal(undo.workspace.peopleReviews.length,1);
 assert.ok(reverseReviewedPersonLink(undo.workspace,r.record.id,{reversedBy:'trusted-coach',reversedAt:LATER}).error);
 assert.ok(appendReviewedPersonLink(undo.workspace,index,confirmed,{reviewedAt:TIME}).error);
 assert.equal(describeLocalReviews(undo.workspace).reversed,1);
 assert.deepEqual(M.migrateWorkspace(clone(undo.workspace)).peopleReviews,undo.workspace.peopleReviews);
});
test('P04A missing, duplicate or changed live source records reject stale review before storage',()=>{
 const ws=initial(),reviewed=review(ws),original=clone(ws);
 const removed=clone(ws);removed.helpers=[];
 assert.ok(appendReviewedPersonLink(removed,reviewed.index,reviewed.confirmed,{reviewedAt:TIME}).error);
 const duplicate=clone(ws);duplicate.helpers.push({...duplicate.helpers[0]});
 assert.ok(appendReviewedPersonLink(duplicate,reviewed.index,reviewed.confirmed,{reviewedAt:TIME}).error);
 const reLinked=clone(ws);reLinked.players[0].personId='different-existing-id';
 assert.ok(appendReviewedPersonLink(reLinked,reviewed.index,reviewed.confirmed,{reviewedAt:TIME}).error);
 const indexChanged=clone(reviewed.index);
 indexChanged.references.find(x=>x.kind==='player').personKey='forged';
 assert.ok(appendReviewedPersonLink(ws,indexChanged,reviewed.confirmed,{reviewedAt:TIME}).error);
 assert.deepEqual(ws,original);
});
test('P04A only ID-addressable player, helper, match official records are durable',()=>{
 const ws=initial(),trainer=add(ws,'match-official');
 assert.equal(trainer.workspace.peopleReviews[0].status,'reviewed');
 const index=buildLocalPeopleIndex(ws,NS);
 const player=index.references.find(r=>r.kind==='player');
 const season=index.references.find(r=>r.kind==='season-staff');
 const proposal=proposeLocalPersonLink(index,{firstRef:player.sourceRef,secondRef:season.sourceRef,proposedBy:'coach'});
 const approved=reviewLocalPersonLink(index,proposal,{reviewedBy:'coach',confirmed:true});
 assert.equal(approved.status,'locally-reviewed-link-only');
 assert.match(appendReviewedPersonLink(ws,index,approved,{reviewedAt:TIME}).error,/stable/);
});
test('P04A reject malformed IDs, forged authority, guardian entries and misordered reversal timestamps',()=>{
 const ws=initial(),r=add(ws);
 assert.ok(reverseReviewedPersonLink(r.workspace,r.record.id,{reversedBy:'coach',reversedAt:'2026-01-01T00:00:00Z'}).error);
 const bad={...r.record,verifiedIdentity:true,accessGrants:[{role:'club_admin'}]};
 const scrubbed=normalizePersonReviews([bad]);
 assert.equal(scrubbed[0].verifiedIdentity,false);
 assert.deepEqual(scrubbed[0].accessGrants,[]);
 assert.equal(normalizePersonReviews([r.record,r.record]).length,1);
 assert.deepEqual(normalizePersonReviews([{...r.record,id:'not-canonical'}]),[]);
 assert.deepEqual(normalizePersonReviews([{...r.record,status:'guardian-verified'}]),[]);
 assert.deepEqual(normalizePersonReviews([{...r.record,
   sourceRefs:[JSON.stringify(['another-workspace','player','team1','p1']),r.record.sourceRefs[1]]}]),[]);
 assert.deepEqual(normalizePersonReviews([{...r.record,status:'reversed',reversedBy:'coach',
   reversedAt:'2026-01-01T00:00:00Z'}]),[]);
});
test('P04A merges independent reviewed entries from two devices without dropping either',()=>{
 const base=initial(),local=add(clone(base)).workspace,remote=add(clone(base),'match-official').workspace;
 assert.equal(local.peopleReviews.length,1);
 assert.equal(remote.peopleReviews.length,1);
 const r=M.merge3(base,local,remote);
 assert.equal(r.changes.both.filter(x=>x.key.startsWith('person-review/')).length,0);
 assert.equal(r.merged.peopleReviews.length,2);
 assert.equal(r.changes.local.filter(x=>x.key.startsWith('person-review/')).length,1);
 assert.equal(r.changes.remote.filter(x=>x.key.startsWith('person-review/')).length,1);
 assert.deepEqual(M.migrateWorkspace(clone(r.merged)).peopleReviews,r.merged.peopleReviews);
});
test('P04A merge surfaces simultaneous reversals and keeps chosen resolution',()=>{
 const base=add(initial()).workspace;
 const local=reverseReviewedPersonLink(clone(base),base.peopleReviews[0].id,{reversedBy:'coach-a',reversedAt:LATER}).workspace;
 const remote=reverseReviewedPersonLink(clone(base),base.peopleReviews[0].id,{reversedBy:'coach-b',reversedAt:'2026-10-21T05:40:00.000Z'}).workspace;
 const result=M.merge3(base,local,remote);
 const conflicts=result.changes.both.filter(x=>x.key.startsWith('person-review/'));
 assert.equal(conflicts.length,1,'different decisions must be shown rather than silently overwritten');
 assert.equal(result.merged.peopleReviews[0].reversedBy,'coach-a');
 const resolved=M.resolve(result,{[conflicts[0].key]:'remote'});
 assert.equal(resolved.peopleReviews[0].reversedBy,'coach-b');
 assert.equal(resolved.peopleReviews[0].status,'reversed');
});
test('P04A a reversal cannot disappear when another device only changed a player',()=>{
 const base=add(initial()).workspace;
 const local=reverseReviewedPersonLink(clone(base),base.peopleReviews[0].id,{reversedBy:'coach',reversedAt:LATER}).workspace;
 const remote=clone(base);remote.players[0].number='9';
 const result=M.merge3(base,local,remote);
 assert.equal(result.merged.peopleReviews[0].status,'reversed');
 assert.equal(result.merged.players[0].number,'9');
 assert.equal(result.changes.both.filter(x=>x.key.startsWith('person-review/')).length,0);
});
test('P04A encrypted coach backup round-trip preserves reviews; team projection excludes them',async()=>{
 const ws=add(initial()).workspace;
 const pwd='P04A-test-only-credential';
 // Lower KDF iteration count is limited strictly to this test to avoid CI slowness.
 // Production always uses vault.js default 600000.
 const lock=await makeLock(pwd,undefined,1024);
 const file=await seal(ws,lock,'coach');
 const again=await openFile(file,lock,'coach');
 assert.deepEqual(again.value.peopleReviews,ws.peopleReviews);
 assert.deepEqual(M.migrateWorkspace(again.value).peopleReviews,ws.peopleReviews);
 await assert.rejects(()=>openFile(file,lock,'player'));
 assert.equal(JSON.stringify(M.legacyTeam(ws,'team1')).includes('peopleReviews'),false);
 const playerText=JSON.stringify(teamView({...ws,viewSeason:null}));
 for(const secret of ['peopleReviews','priorPersonKeys','sourceRefs','reviewedBy','PRIVATE PLAYER CONTACT',
   'PRIVATE HELPER CONTACT','SECRET@EXAMPLE.INVALID'])
   assert.ok(!playerText.includes(secret),secret);
 assert.ok(!JSON.stringify(file).includes('peopleReviews'));
});
