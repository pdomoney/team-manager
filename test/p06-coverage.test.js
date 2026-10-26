import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateMatchCoverage as check } from '../site/p06-coverage.js';

const policy = {source:'fictional-approved-competition-rules',version:'2026-fixture-v1',sport:'Rugby League',
  requirements:[{role:'Yellow shirt trainer',count:1},{role:'Blue shirt trainer',count:1}]};
const assignment = (personId,role,changes={})=>({
  personId,role,status:'confirmed',available:true,qualificationStatus:'verified',
  registrationStatus:'verified',expiresOn:'2026-12-31',...changes
});
const request=(assignments,sport='Rugby League',p=policy)=>({sport,matchDate:'2026-10-23',policy:p,assignments});

test('P06A distinct confirmed registered trainers meet explicitly configured policy',()=>{
 const r=check(request([assignment('p1','Yellow shirt trainer'),assignment('p2','Blue shirt trainer')]));
 assert.equal(r.status,'coverage-confirmed-from-input');
 assert.equal(r.roles.length,2);
 assert.equal(r.roles[0].missing,0);
});
test('P06A same person cannot fill both required match roles',()=>{
 const r=check(request([assignment('p1','Yellow shirt trainer'),assignment('p1','Blue shirt trainer')]));
 assert.equal(r.status,'coverage-gap');
 assert.equal(r.roles.reduce((n,x)=>n+x.missing,0),1);
});
test('P06A appointment alone, unverified or expired registration never confirms coverage',()=>{
 const r=check(request([
   assignment('p1','Yellow shirt trainer',{status:'invited'}),
   assignment('p2','Yellow shirt trainer',{qualificationStatus:'unverified'}),
   assignment('p3','Yellow shirt trainer',{expiresOn:'2026-01-01'}),
   assignment('p4','Blue shirt trainer',{registrationStatus:'revoked'})
 ]));
 assert.equal(r.status,'coverage-gap');
 assert.equal(r.roles.reduce((n,x)=>n+x.confirmed,0),0);
});
test('P06A no rugby league shirt requirements imposed on Oztag without verified policy',()=>{
 assert.equal(check(request([], 'Oztag')).status,'unverified-policy');
 assert.equal(check(request([], 'Oztag',{sport:'Oztag',source:'',version:'',requirements:[]})).status,'unverified-policy');
});
test('P06A incomplete policies and unsafe dates are flagged, not treated as match-ready',()=>{
 assert.equal(check(request([], 'Rugby League',{...policy,source:''})).status,'unverified-policy');
 assert.equal(check({...request([]),matchDate:'tomorrow'}).status,'unverified-policy');
});
test('P06A coverage is a pure projection and never exports personal evidence',()=>{
 const input=request([assignment('p1','Yellow shirt trainer'),assignment('p2','Blue shirt trainer')]);
 input.assignments[0].privateNotes='health details';
 const before=JSON.stringify(input),output=check(input);
 assert.equal(JSON.stringify(input),before);
 assert.equal(JSON.stringify(output).includes('health details'),false);
 assert.equal(JSON.stringify(output).includes('p1'),false);
 assert.ok(Object.isFrozen(output));
});
