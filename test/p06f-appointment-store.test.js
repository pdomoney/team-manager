import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVolunteerAppointments, upsertVolunteerAppointment } from '../site/p06-appointment-store.js';
import { reviewVolunteerAppointments } from '../site/p06-appointments.js';
import { migrateWorkspace, merge3, stripWs } from '../site/model.js';

const scope={type:'club',id:'club1'};
const people=[{id:'p1',name:'Privacy sensitive',active:true},{id:'p2',name:'Inactive',active:false}];
const draft=(id='a1',status='proposed')=>({id,personId:'p1',scopeType:'club',scopeId:'club1',role:'Coordinator',status});
const base=()=>({
  id:'team1',team:{name:'Oztag',sport:'Oztag',clubId:'club1'},
  teams:[],library:{plays:[],playerSets:[],systems:{}},
  clubs:[{id:'club1',name:'Club One',sport:'Oztag'}],competitions:[],
  matchOfficials:people,volunteerAppointments:[],peopleReviews:[],guardianReviews:[],
  players:[],sessions:[],matches:[],lineups:[],tasks:[],helpers:[],
  notices:[],messages:[],plays:[],playerSets:[],seasons:[],systems:{}
});

test('P06F edits update appointment by stable ID without duplicating people',()=>{
 const first=upsertVolunteerAppointment([],draft(),people,scope);
 assert.equal(first.error,undefined);
 const later=upsertVolunteerAppointment(first.records,draft('a1','accepted'),people,scope);
 assert.equal(later.records.length,1);
 assert.equal(later.records[0].status,'accepted');
 assert.equal(JSON.stringify(later.records).includes('Privacy sensitive'),false);
 assert.equal(first.records[0].status,'proposed');
});
test('P06F invitation is only a manual record and never active',()=>{
 const a=upsertVolunteerAppointment([],draft('a1','invited'),people,scope);
 assert.equal(reviewVolunteerAppointments(people,a.records,scope)[0].active,false);
});
test('P06F suspended or ended lifecycle is retained as history',()=>{
 for(const status of ['suspended','ended']) {
   const a=upsertVolunteerAppointment([draft('a1','accepted')],draft('a1',status),people,scope);
   assert.equal(a.records.length,1);
   assert.equal(reviewVolunteerAppointments(people,a.records,scope)[0].active,false);
 }
});
test('P06F never accepts a person in another scope or allows reassignment of saved ID',()=>{
 assert.match(upsertVolunteerAppointment([], {...draft(),scopeId:'club2'},people,scope).error,/scope/);
 assert.match(upsertVolunteerAppointment([draft()], {...draft(),personId:'p2'},people,scope).error,/reassign/);
 assert.match(upsertVolunteerAppointment([], {...draft(),personId:'missing'},people,scope).error,/existing/);
 assert.match(upsertVolunteerAppointment([], {...draft(),personId:'p2',status:'accepted'},people,scope).error,/Inactive/);
});
test('P06F legacy backups migrate with empty appointments, new backups retain appointments',()=>{
 const legacy=migrateWorkspace(base(), x=>x);
 assert.deepEqual(legacy.volunteerAppointments,[]);
 const source=base();source.volunteerAppointments=[draft()];
 const next=migrateWorkspace(source,x=>x);
 assert.equal(next.volunteerAppointments[0].id,'a1');
 assert.equal(stripWs(next).volunteerAppointments,undefined);
});
test('P06F distinct offline appointment edits merge independently',()=>{
 const before=base(),local=structuredClone(before),remote=structuredClone(before);
 local.volunteerAppointments=[draft('a1')];
 remote.volunteerAppointments=[draft('a2')];
 const x=merge3(before,local,remote);
 assert.deepEqual(x.merged.volunteerAppointments.map(a=>a.id).sort(),['a1','a2']);
 assert.equal(x.changes.both.length,0);
});
test('P06F same appointment changed on both devices triggers conflict review',()=>{
 const before=base();before.volunteerAppointments=[draft()];
 const local=structuredClone(before),remote=structuredClone(before);
 local.volunteerAppointments[0].status='suspended';
 remote.volunteerAppointments[0].status='ended';
 const x=merge3(before,local,remote);
 assert.ok(x.changes.both.some(c=>c.key==='appointment/a1'));
});
test('P06F normalization rejects duplicate IDs and strips unneeded sensitive fields',()=>{
 const a=normalizeVolunteerAppointments([{...draft(),wwccNumber:'SECRET'},draft('a1','accepted')]);
 assert.equal(a.length,1);
 assert.equal(JSON.stringify(a).includes('SECRET'),false);
});
