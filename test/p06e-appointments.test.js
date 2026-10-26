import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewVolunteerAppointments } from '../site/p06-appointments.js';
const people=[{id:'p1',name:'PRIVATE PERSON'}];
const scope={type:'club',id:'club1'};
const row=(status='accepted')=>({id:'a1',personId:'p1',scopeType:'club',scopeId:'club1',role:'Volunteer coordinator',status});
test('P06E accepted appointment only denotes local reviewed status, not match credential',()=>{
 const r=reviewVolunteerAppointments(people,[row()],scope);
 assert.equal(r[0].active,true);assert.equal(JSON.stringify(r).includes('PRIVATE'),false);
});
test('P06E invitation never becomes an accepted appointment',()=>{
 const r=reviewVolunteerAppointments(people,[row('invited')],scope);
 assert.equal(r[0].active,false);assert.match(r[0].issues[0],/manual record/);
});
test('P06E suspended or ended appointments remain inactive',()=>{
 for(const s of ['suspended','ended'])assert.equal(reviewVolunteerAppointments(people,[row(s)],scope)[0].active,false);
});
test('P06E avoids cross-club and association scope leakage',()=>{
 const r=reviewVolunteerAppointments(people,[row(),{...row(),scopeId:'club2'}],scope);
 assert.equal(r.length,1);
});
test('P06E missing person, duplicate appointment or unrecognised state requires review',()=>{
 const r=reviewVolunteerAppointments(people,[{...row(),personId:'absent'},row(),{...row(),status:'revoked'}],scope);
 assert.ok(r[0].issues.some(x=>x.includes('Person link')));
 assert.ok(r[1].issues.some(x=>x.includes('Duplicate')));
 assert.ok(r[2].issues.some(x=>x.includes('unknown')));
});
