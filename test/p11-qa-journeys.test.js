import test from 'node:test';
import assert from 'node:assert/strict';
import { qaPreview } from '../site/p11-qa-personas.js';
import { qaJourneys, qaJourney } from '../site/p11-qa-journeys.js';
const roles=['owner','association','club','coach'];
test('QA #62B journeys provide three deterministic fictional walkthroughs for each role',()=>{
 for(const role of roles){
   const first=qaPreview(role,'');
   const journeys=qaJourneys(role,first.scope);
   assert.equal(journeys.length,3,role);
   assert.equal(new Set(journeys.map(j=>j.id)).size,3,role);
   for(const j of journeys){
     assert.equal(j.scope,first.scope);
     assert.equal(j.mode,'SYNTHETIC_READ_ONLY_NO_PERMISSIONS');
     assert.equal(j.steps.length,3);
     assert.ok(j.steps.every(s=>s.length>18));
     assert.equal(qaJourney(role,first.scope,j.id)?.title,j.title);
   }
 }
});
test('QA #62B association guides contain only association-scoped synthetic clubs',()=>{
 const west=qaJourneys('association','qa-west');
 assert.ok(west.every(j=>j.visibleEntities.length===1));
 assert.ok(west.every(j=>j.visibleEntities[0].id==='qa-rangers'));
 assert.ok(west.every(j=>!JSON.stringify(j).includes('Example Comets')));
});
test('QA #62B club and coach guides cannot include nonselected synthetic teams',()=>{
 const club=qaJourneys('club','qa-comets');
 assert.ok(club.every(j=>j.visibleEntities.map(x=>x.id).join(',')==='qa-comets-mixed,qa-comets-juniors'));
 const coach=qaJourneys('coach','qa-stars-women');
 assert.ok(coach.every(j=>j.visibleEntities.map(x=>x.id).join(',')==='qa-stars-women'));
 assert.ok(coach.every(j=>!JSON.stringify(j).includes('Example Rangers U16')));
});
test('QA #62B rejects unknown persona, workflow or forgery without falling back to different roles',()=>{
 assert.deepEqual(qaJourneys('super-admin','qa-platform'),[]);
 assert.equal(qaJourney('coach','qa-stars-women','platform'),null);
 assert.equal(qaJourney('owner','qa-platform','__proto__'),null);
 assert.equal(qaJourney('club','qa-comets','qa-stars-women'),null);
});
test('QA #62B selection returns detached guides containing no private records or credentials',()=>{
 for(const role of roles){
   const a=qaJourneys(role,''), before=JSON.stringify(a);
   a[0].visibleEntities[0].name='Forged';
   a[0].steps.push('Try to publish a secret');
   assert.equal(JSON.stringify(qaJourneys(role,'')),before);
   const text=before.toLowerCase();
   for(const key of ['"token":','"email":','"phone":','"password":','"guardian":','"medical":','"wwcc":','"player":','"auth":'])assert.ok(!text.includes(key),key);
 }
});
