import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../site/model.js';
import { prepareStaffSourceIds, inspectStaffSourceIds, STAFF_SOURCE_ID } from '../site/staff-source-ids.js';
import { localPeopleNamespace, localPeopleReviewView, acceptLocalPeopleLink, undoLocalPeopleLink } from '../site/people-ui.js';
import { teamView } from '../site/vault.js';
const clone=x=>JSON.parse(JSON.stringify(x));
const ns=localPeopleNamespace({owner:'fixture-coach',repo:'fixture-team'});
const seed=()=>M.migrateWorkspace({
 id:'team1',team:{name:'Titans U16',sport:'Rugby league',clubId:'titans',
 staff:[{role:'Head coach',name:'Alex Example',phone:'SECRET COACH PHONE',email:'secret@coach.invalid'},
        {role:'Manager',name:'Jordan Example'}]},
 players:[{id:'p1',name:'Alex Example',personId:'legacy-explicit',number:'7',
  jerseys:[{id:'j1',number:'7',issuedAt:'2026-01-01'}]}],
 helpers:[{id:'h1',name:'Alex Example',playerId:'p1',phone:'PRIVATE HELPER CONTACT'}],
 matchOfficials:[],clubs:[{id:'titans',name:'Fictional Titans',officials:[
  {role:'Secretary',name:'Alex Example',phone:'SECRET OFFICIAL PHONE'}]}],
 seasons:[{id:'s2026',name:'2026',status:'active',staff:[
  {role:'First aid',name:'Alex Example',email:'private@season.invalid'}],
  squad:[{playerId:'p1',number:'7',positions:['Wing']}]}],
 sessions:[{id:'tr1',date:'2026-10-20',attendance:{p1:'present'}}],
 matches:[],tasks:[],notices:[],messages:[],lineups:[],plays:[],playerSets:[],systems:{},
 competitions:[],teams:[],library:{plays:[],playerSets:[],systems:{}}
});
const deterministic=()=>{
 let n=1;
 return ()=>`staff-00000000-0000-4000-8000-${String(n++).padStart(12,'0')}`;
};
test('P04C staff preparation is explicit, pure and repeatable',()=>{
 const w=seed(),before=clone(w),p=inspectStaffSourceIds(w);
 assert.equal(p.missing,4);
 const result=prepareStaffSourceIds(w,{makeId:deterministic()});
 assert.equal(result.error,undefined);
 assert.equal(result.assigned,4);
 assert.deepEqual(w,before,'original workspace unmodified until owner invokes normal save');
 const next=result.workspace;
 assert.equal(inspectStaffSourceIds(next).ready,4);
 assert.equal(inspectStaffSourceIds(next).missing,0);
 assert.equal(prepareStaffSourceIds(next).unchanged,true);
 assert.equal(prepareStaffSourceIds(next).workspace,next);
 for(const row of [...next.team.staff,...next.seasons[0].staff,...next.clubs[0].officials])
   assert.ok(STAFF_SOURCE_ID.test(row.id));
});
test('P04C all sporting records and private fields survive staff preparation and schema-4 migration',()=>{
 const w=seed(),next=prepareStaffSourceIds(w,{makeId:deterministic()}).workspace;
 assert.deepEqual(next.players,w.players);
 assert.deepEqual(next.helpers,w.helpers);
 assert.deepEqual(next.sessions,w.sessions);
 assert.deepEqual(next.seasons[0].squad,w.seasons[0].squad);
 assert.deepEqual(next.players[0].jerseys,w.players[0].jerseys);
 assert.equal(next.team.staff[0].phone,'SECRET COACH PHONE');
 assert.equal(next.clubs[0].officials[0].phone,'SECRET OFFICIAL PHONE');
 assert.deepEqual(M.migrateWorkspace(clone(next)).team.staff,next.team.staff);
 assert.deepEqual(M.migrateWorkspace(clone(next)).clubs[0].officials,next.clubs[0].officials);
 assert.deepEqual(M.migrateWorkspace(clone(next)).seasons[0].staff,next.seasons[0].staff);
 assert.ok(!JSON.stringify(teamView(next)).includes('SECRET COACH PHONE'));
 assert.ok(!JSON.stringify(teamView(next)).includes('SECRET OFFICIAL PHONE'));
 assert.ok(!JSON.stringify(teamView(next)).includes('staff-00000000'));
});
test('P04C secure ID generator collisions, corrupt staff IDs and duplicates fail without mutation',()=>{
 const w=seed(),original=clone(w);
 const duplicate=()=> 'staff-00000000-0000-4000-8000-000000000001';
 assert.match(prepareStaffSourceIds(w,{makeId:duplicate}).error,/unique/);
 assert.deepEqual(w,original);
 const broken=clone(w);broken.team.staff[0].id='not-a-valid-stable-id';
 assert.match(inspectStaffSourceIds(broken).error,/Unexpected/);
 const copied=prepareStaffSourceIds(w,{makeId:deterministic()}).workspace;
 copied.team.staff[1].id=copied.team.staff[0].id;
 assert.match(inspectStaffSourceIds(copied).error,/duplicate/);
});
test('P04C same name in four staff contexts is never automatically unified',()=>{
 const w=seed(),prepared=prepareStaffSourceIds(w,{makeId:deterministic()}).workspace;
 const view=localPeopleReviewView(prepared,ns);
 assert.equal(view.error,undefined);
 const alex=view.sources.filter(x=>x.displayName==='Alex Example');
 assert.equal(alex.length,5);
 assert.equal(view.reviews.length,0);
 assert.equal(view.staffReadiness.ready,4);
 assert.equal(view.sources.filter(x=>x.kind.includes('staff')||x.kind==='club-official').every(x=>x.durable),true);
 assert.equal(view.safety.joinsNamesAutomatically,false);
});
test('P04C stable staff rows link to other staff or helpers only after explicit review',()=>{
 const w=seed(),prepared=prepareStaffSourceIds(w,{makeId:deterministic()}).workspace,
 view=localPeopleReviewView(prepared,ns);
 const one=view.sources.find(x=>x.kind==='club-official'),two=view.sources.find(x=>x.kind==='season-staff');
 const done=acceptLocalPeopleLink(prepared,ns,{firstRef:one.sourceRef,secondRef:two.sourceRef,
  reviewedBy:'coach workspace',reviewedAt:'2026-10-21T09:00:00.000Z'});
 assert.equal(done.error,undefined);
 assert.equal(done.workspace.peopleReviews.length,1);
 assert.equal(done.workspace.peopleReviews[0].status,'reviewed');
 assert.deepEqual(done.workspace.team,prepared.team);
 assert.deepEqual(done.workspace.clubs,prepared.clubs);
 assert.deepEqual(done.workspace.seasons,prepared.seasons);
 assert.equal(M.migrateWorkspace(clone(done.workspace)).peopleReviews.length,1);
 const undo=undoLocalPeopleLink(done.workspace,ns,{recordId:done.record.id,
  reversedBy:'coach workspace',reversedAt:'2026-10-21T09:05:00.000Z'});
 assert.equal(undo.error,undefined);
 assert.equal(undo.workspace.peopleReviews[0].status,'reversed');
});
test('P04C stale or removed staff sources cannot create new reviewed links',()=>{
 const prepared=prepareStaffSourceIds(seed(),{makeId:deterministic()}).workspace;
 const v=localPeopleReviewView(prepared,ns),first=v.sources.find(x=>x.kind==='team-staff'),
 second=v.sources.find(x=>x.kind==='club-official');
 const changed=clone(prepared);changed.team.staff[0].id='staff-00000000-0000-4000-8000-000000000333';
 const result=acceptLocalPeopleLink(changed,ns,{firstRef:first.sourceRef,secondRef:second.sourceRef,
  reviewedBy:'coach',reviewedAt:'2026-10-21T09:10:00.000Z'});
 assert.ok(result.error);
 const reordered=clone(prepared);reordered.team.staff.reverse();
 const after=localPeopleReviewView(reordered,ns);
 assert.ok(after.sources.some(x=>x.sourceRef===first.sourceRef),
   'stable reference remains valid after staff display order changes');
});
test('P04C staff review merge from independent coach devices is flagged on conflicting edits',()=>{
 const prepared=prepareStaffSourceIds(seed(),{makeId:deterministic()}).workspace;
 const v=localPeopleReviewView(prepared,ns),first=v.sources.find(x=>x.kind==='team-staff'),second=v.sources.find(x=>x.kind==='club-official');
 const added=acceptLocalPeopleLink(prepared,ns,{firstRef:first.sourceRef,secondRef:second.sourceRef,
  reviewedBy:'coach',reviewedAt:'2026-10-21T09:00:00.000Z'});
 const base=added.workspace,local=clone(base),remote=clone(base);
 local.peopleReviews[0].status='reversed';local.peopleReviews[0].reversedBy='device 1';local.peopleReviews[0].reversedAt='2026-10-21T09:02:00.000Z';
 remote.peopleReviews[0].status='reversed';remote.peopleReviews[0].reversedBy='device 2';remote.peopleReviews[0].reversedAt='2026-10-21T09:03:00.000Z';
 const merge=M.merge3(base,local,remote);
 assert.equal(merge.changes.both.filter(x=>x.key.startsWith('person-review/')).length,1);
});
test('P04C cannot persist an unstamped index-position historical staff row',()=>{
 const w=seed(),v=localPeopleReviewView(w,ns);
 const staff=v.sources.find(x=>x.kind==='team-staff');
 assert.equal(staff.durable,false);
 assert.ok(acceptLocalPeopleLink(w,ns,{firstRef:staff.sourceRef,
  secondRef:v.sources.find(x=>x.kind==='helper').sourceRef,
  reviewedBy:'coach',reviewedAt:'2026-10-21T09:00:00.000Z'}).error);
});
