import test from 'node:test';
import assert from 'node:assert/strict';
import { crewCoverageSummary } from '../site/p06-crew-summary.js';
import { crewProfile } from '../site/match-crew.js';

test('P06B never treats missing or mismatched policy as staffing confirmed',()=>{
 const r=crewCoverageSummary({configured:false,ready:true,shortages:[]});
 assert.equal(r.state,'unverified');assert.equal(r.required,null);
 assert.match(r.explanation,/sport, competition, grade and season/);
});
test('P06B distinguishes confirmed, required and missing people',()=>{
 const r=crewCoverageSummary({configured:true,ready:false,shortages:[{min:2,have:1,missing:1},{min:1,have:0,missing:1}]});
 assert.deepEqual([r.required,r.confirmed,r.missing],[3,1,2]);
 assert.equal(r.state,'attention');
});
test('P06B match readiness always requires the existing eligibility and clash decision',()=>{
 const r=crewCoverageSummary({configured:true,ready:false,shortages:[{min:1,have:1,missing:0}]});
 assert.equal(r.state,'attention');
});
test('P06B successful coverage remains coach-recorded rather than externally verified',()=>{
 const r=crewCoverageSummary({configured:true,ready:true,shortages:[{min:2,have:2,missing:0}]});
 assert.equal(r.state,'covered');assert.match(r.explanation,/not live/);
 assert.equal(Object.isFrozen(r),true);
});
test('P06B role choices remain specific to selected team sport',()=>{
 assert.equal(crewProfile('Oztag').roles.includes('yellow'),false);
 assert.equal(crewProfile('Touch football').roles.includes('blue'),false);
 assert.equal(crewProfile('Rugby league').roles.includes('yellow'),true);
});
