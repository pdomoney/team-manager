import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../site/model.js';
import { teamView, makeLock, seal, openFile } from '../site/vault.js';
import { localPeopleNamespace, localPeopleReviewView } from '../site/people-ui.js';
import { recordGuardianReview, amendGuardianReview, normalizeGuardianReviews,
  guardianReviewView, REPORTED_RELATIONSHIPS } from '../site/guardian-reviews.js';
const ns=localPeopleNamespace({owner:'example-club-coach',repo:'example-team-manager'});
const clone=x=>JSON.parse(JSON.stringify(x));
const at0='2026-10-21T08:00:00.000Z',at1='2026-10-21T08:01:00.000Z',at2='2026-10-21T08:02:00.000Z';
const baseline=()=>M.migrateWorkspace({
 id:'team1',schema:4,team:{name:'League U16',clubId:'titans',sport:'Rugby league'},
 players:[{id:'p1',name:'Youth One',number:'7',phone:'SECRET CHILD CONTACT',
    jerseys:[{id:'loan',number:'7',out:'2026-06-01',back:''}],notes:'PRIVATE CHILD HEALTH'}],
 helpers:[{id:'h1',name:'Adult Carer',phone:'SECRET ADULT CONTACT',playerId:'p1'}],
 clubs:[{id:'titans',name:'Fictional Titans',sport:'Rugby league'},
        {id:'dragons',name:'Fictional Dragons',sport:'Oztag'}],
 teams:[{id:'team2',team:{name:'Oztag Girls',clubId:'dragons',sport:'Oztag'},
   players:[{id:'p2',name:'Youth Two',number:'11',notes:'OTHER CHILD PRIVATE'}],
   helpers:[],seasons:[{id:'s26b',name:'2026',status:'active',squad:[{playerId:'p2',number:'11',positions:['Link']}]}],
   matches:[],sessions:[],tasks:[],notices:[],messages:[],lineups:[],plays:[],playerSets:[],systems:{}}],
 seasons:[{id:'s26a',name:'2026',status:'active',
    squad:[{playerId:'p1',number:'7',positions:['Wing']}]}],
 matchOfficials:[],matches:[],sessions:[{id:'tr1',date:'2026-10-20',attendance:{p1:'present'}}],
 tasks:[],notices:[],messages:[],lineups:[],plays:[],playerSets:[],systems:{},
 competitions:[],library:{plays:[],playerSets:[],systems:{}}
});
const view=w=>localPeopleReviewView(w,ns);
const refs=(w,childId='p1')=>{
 const p=view(w),helper=p.sources.find(x=>x.kind==='helper'&&JSON.parse(x.sourceRef)[3]==='h1'),
 player=p.sources.find(x=>x.kind==='player'&&JSON.parse(x.sourceRef)[3]===childId);
 assert.ok(helper&&player);
 return {index:p.index,helperRef:helper.sourceRef,childPlayerRef:player.sourceRef};
};
const create=(w,childId='p1',relationship='parent-reported')=>{
 const {index,helperRef,childPlayerRef}=refs(w,childId);
 return recordGuardianReview(w,index,{helperRef,childPlayerRef,relationship,
   by:'Shared coach workspace',at:at0});
};
const amend=(w,action,extra={})=>{
 const v=view(w);
 return amendGuardianReview(w,v.index,{recordId:w.guardianReviews[0].id,by:'Shared coach workspace',
   at:at1,action,...extra});
};
test('P04D old schema-4 workspaces gain an optional deterministic coach-only guardian ledger',()=>{
 const w=baseline(),legacy=clone(w);
 delete legacy.guardianReviews;
 const up=M.migrateWorkspace(legacy);
 assert.deepEqual(up.guardianReviews,[]);
 assert.equal(up.schema,4);
 assert.deepEqual(M.migrateWorkspace(clone(up)),up);
 assert.equal(M.legacyTeam(up,'team1').guardianReviews,undefined);
 assert.equal(M.stripWs(up).guardianReviews,undefined);
});
test('P04D an explicit reported guardian link changes no player/helper/sporting records',()=>{
 const w=baseline(),before=clone(w),z=create(w);
 assert.equal(z.error,undefined);
 assert.equal(z.grantsAccess,false);
 assert.equal(z.verifiedAuthority,false);
 assert.equal(z.changedSourceRecords,false);
 assert.deepEqual(w,before);
 assert.equal(z.workspace.guardianReviews.length,1);
 assert.deepEqual(z.workspace.players,w.players);
 assert.deepEqual(z.workspace.helpers,w.helpers);
 assert.deepEqual(z.workspace.sessions,w.sessions);
 assert.deepEqual(z.workspace.teams,w.teams);
 assert.equal(z.workspace.players[0].jerseys[0].back,'');
 assert.deepEqual(M.migrateWorkspace(clone(z.workspace)).guardianReviews,z.workspace.guardianReviews);
});
test('P04D one helper may be separately recorded for children across two clubs within one workspace',()=>{
 const w=baseline(),first=create(w);
 const second=create(first.workspace,'p2','relative-reported');
 assert.equal(second.error,undefined);
 assert.equal(second.workspace.guardianReviews.length,2);
 const v=view(second.workspace);
 assert.equal(v.guardianLedger.recorded,2);
 assert.ok(v.guardianLedger.reviews.some(x=>x.childTeamId==='team2'));
 assert.equal(v.guardianLedger.safety.accountsGranted,false);
 assert.equal(v.guardianLedger.safety.legalParentageProven,false);
 assert.deepEqual(v.guardianLedger.safety.guardianPermissions,[]);
 assert.equal(second.workspace.teams[0].players[0].name,'Youth Two');
});
test('P04D corrections retain an ordered event history; reversal is terminal',()=>{
 const w=create(baseline()).workspace,original=clone(w);
 const changed=amend(w,'correct',{relationship:'carer-reported'});
 assert.equal(changed.error,undefined);
 assert.deepEqual(w,original);
 assert.equal(changed.workspace.guardianReviews[0].events.length,2);
 assert.deepEqual(changed.workspace.guardianReviews[0].events.map(x=>x.action),['record','correct']);
 assert.equal(view(changed.workspace).guardianLedger.reviews[0].relationship,'carer-reported');
 const reversed=amendGuardianReview(changed.workspace,view(changed.workspace).index,{
   recordId:changed.record.id,by:'Shared coach workspace',at:at2,action:'reverse'
 });
 assert.equal(reversed.error,undefined);
 assert.deepEqual(reversed.record.events.map(e=>e.action),['record','correct','reverse']);
 assert.equal(view(reversed.workspace).guardianLedger.reviews[0].status,'reversed');
 assert.equal(view(reversed.workspace).guardianLedger.reviews[0].canReverse,false);
 assert.ok(amendGuardianReview(reversed.workspace,view(reversed.workspace).index,{
   recordId:changed.record.id,by:'coach',at:'2026-10-21T08:03:00.000Z',action:'correct',
   relationship:'parent-reported'}).error);
 assert.equal(reversed.workspace.guardianReviews.length,1);
});
test('P04D invalid, duplicate, stale or unconfirmed sources never create a new relationship',()=>{
 const w=baseline(),v=refs(w),first=create(w);
 assert.ok(create(first.workspace).error);
 assert.ok(recordGuardianReview(w,v.index,{helperRef:v.childPlayerRef,childPlayerRef:v.helperRef,
   relationship:'parent-reported',by:'coach',at:at0}).error);
 assert.ok(recordGuardianReview(w,v.index,{helperRef:v.helperRef,childPlayerRef:v.childPlayerRef,
   relationship:'verified-guardian',by:'coach',at:at0}).error);
 assert.ok(recordGuardianReview(w,v.index,{helperRef:v.helperRef,childPlayerRef:v.childPlayerRef,
   relationship:'parent-reported',by:'',at:at0}).error);
 const removed=clone(w);removed.helpers=[];
 assert.ok(recordGuardianReview(removed,view(removed).index,{helperRef:v.helperRef,
   childPlayerRef:v.childPlayerRef,relationship:'parent-reported',by:'coach',at:at0}).error);
 const duplicate=clone(w);duplicate.helpers.push({...duplicate.helpers[0]});
 assert.ok(view(duplicate).error);
});
test('P04D stale adviser indexes cannot record or correct after the live source changed',()=>{
 const workspace=baseline(),old=refs(workspace);
 const removed=clone(workspace);removed.helpers=[];
 const stale=recordGuardianReview(removed,old.index,{
   helperRef:old.helperRef,childPlayerRef:old.childPlayerRef,
   relationship:'parent-reported',by:'coach',at:at0});
 assert.match(stale.error,/changed/);
 const changed=clone(workspace);changed.players[0].personId='a-new-local-person';
 const rejected=recordGuardianReview(changed,old.index,{
   helperRef:old.helperRef,childPlayerRef:old.childPlayerRef,
   relationship:'parent-reported',by:'coach',at:at0});
 assert.match(rejected.error,/changed/);
 const original=create(workspace).workspace;
 const stillOld=refs(original);
 const modified=clone(original);modified.players[0].personId='changed-after-record';
 const amendStale=amendGuardianReview(modified,stillOld.index,{
   recordId:original.guardianReviews[0].id,action:'correct',
   relationship:'relative-reported',by:'coach',at:at1});
 assert.match(amendStale.error,/changed/);
});
test('P04D missing and changed sources are marked stale; reversal remains possible',()=>{
 const w=create(baseline()).workspace;
 const missing=clone(w);missing.helpers=[];
 const stale=view(missing).guardianLedger.reviews[0];
 assert.equal(stale.status,'missing-source');
 assert.equal(stale.canCorrect,false);
 assert.equal(stale.canReverse,true);
 const denied=amendGuardianReview(missing,view(missing).index,{recordId:stale.id,action:'correct',
    relationship:'relative-reported',by:'coach',at:at1});
 assert.ok(denied.error);
 const undone=amendGuardianReview(missing,view(missing).index,{recordId:stale.id,
   action:'reverse',by:'coach',at:at1});
 assert.equal(undone.error,undefined);
 const changed=clone(w);changed.players[0].personId='new-player-person-id';
 assert.equal(view(changed).guardianLedger.reviews[0].status,'changed-source');
});
test('P04D normalization strips forged consent/grants and malformed event chains',()=>{
 const r=create(baseline()).record;
 const polluted={...r,authorityVerified:true,legalGuardian:true,
   accessGrants:[{role:'club_admin'}],childRecordAccess:true,accountId:'user123',
   events:r.events.map(e=>({...e,accessGrants:[{role:'owner'}],verified:true,notes:'SECRET MEDICAL NOTE'}))};
 const clean=normalizeGuardianReviews([polluted])[0];
 assert.equal(JSON.stringify(clean).includes('SECRET MEDICAL NOTE'),false);
 for(const field of ['accessGrants','authorityVerified','legalGuardian','accountId','childRecordAccess'])
   assert.equal(clean[field],undefined);
 assert.deepEqual(normalizeGuardianReviews([r,r]).length,1);
 assert.deepEqual(normalizeGuardianReviews([{...r,id:'not canonical'}]),[]);
 assert.deepEqual(normalizeGuardianReviews([{...r,helperRef:JSON.stringify(['other-tenant','helper','team1','h1'])}]),[]);
 assert.deepEqual(normalizeGuardianReviews([{...r,events:[{action:'correct',by:'coach',at:at0,relationship:'parent-reported'}]}]),[]);
 assert.deepEqual(normalizeGuardianReviews([{...r,events:[...r.events,
   {action:'reverse',by:'coach',at:at1},
   {action:'correct',by:'coach',at:at2,relationship:'parent-reported'}]}]),[]);
 assert.ok(REPORTED_RELATIONSHIPS['parent-reported'].includes('not verified'));
});
test('P04D two devices with distinct child relationships merge without lost entries',()=>{
 const base=baseline(),local=create(clone(base)).workspace,remote=create(clone(base),'p2').workspace;
 const merged=M.merge3(base,local,remote);
 assert.equal(merged.changes.both.filter(x=>x.key.startsWith('guardian-review/')).length,0);
 assert.equal(merged.merged.guardianReviews.length,2);
 assert.deepEqual(M.migrateWorkspace(clone(merged.merged)).guardianReviews,merged.merged.guardianReviews);
});
test('P04D two-device conflict for same child is surfaced for deliberate choice',()=>{
 const base=create(baseline()).workspace;
 const local=amend(clone(base),'correct',{relationship:'relative-reported'}).workspace;
 const remote=amendGuardianReview(clone(base),view(base).index,{recordId:base.guardianReviews[0].id,
   action:'correct',relationship:'carer-reported',by:'other coach',at:at2}).workspace;
 const merged=M.merge3(base,local,remote);
 const conflicts=merged.changes.both.filter(x=>x.key.startsWith('guardian-review/'));
 assert.equal(conflicts.length,1);
 assert.equal(view(merged.merged).guardianLedger.reviews[0].relationship,'relative-reported');
 const resolve=M.resolve(merged,{[conflicts[0].key]:'remote'});
 assert.equal(view(resolve).guardianLedger.reviews[0].relationship,'carer-reported');
});
test('P04D reversing one child review survives independent changes to another child and player',()=>{
 const base=create(baseline()).workspace;
 const local=amend(clone(base),'reverse').workspace;
 const remote=create(clone(base),'p2').workspace;
 remote.players[0].number='9';
 const merged=M.merge3(base,local,remote);
 assert.equal(merged.merged.guardianReviews.length,2);
 assert.equal(merged.merged.guardianReviews.find(x=>x.id===base.guardianReviews[0].id).events.at(-1).action,'reverse');
 assert.equal(merged.merged.players[0].number,'9');
});
test('P04D encrypted coach backup round-trip preserves history and team player file excludes it',async()=>{
 const w=create(baseline()).workspace;
 const password='synthetic-guardian-ci-only-password';
 const lock=await makeLock(password,undefined,1024);
 const file=await seal(w,lock,'coach');
 const decoded=await openFile(file,lock,'coach');
 assert.deepEqual(decoded.value.guardianReviews,w.guardianReviews);
 assert.deepEqual(M.migrateWorkspace(decoded.value).guardianReviews,w.guardianReviews);
 assert.ok(!JSON.stringify(file).includes('guardianReviews'));
 const shown=JSON.stringify(teamView(w));
 for(const secret of ['guardianReviews','local-guardian-review','SECRET CHILD CONTACT',
  'SECRET ADULT CONTACT','PRIVATE CHILD HEALTH','OTHER CHILD PRIVATE'])
    assert.ok(!shown.includes(secret),secret);
});
