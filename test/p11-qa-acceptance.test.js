import test from 'node:test';
import assert from 'node:assert/strict';
import {qaAcceptanceBoard,qaAcceptanceText} from '../site/p11-qa-acceptance.js';
import {qaPreview} from '../site/p11-qa-personas.js';
test('Stage C builds a deterministic seven-case acceptance workbench for all four synthetic personas',()=>{
 for(const [role,scope] of [['owner','qa-platform'],['association','qa-west'],
  ['club','qa-comets'],['coach','qa-stars-women']]){
  const a=qaAcceptanceBoard(role,scope),b=qaAcceptanceBoard(role,scope);
  assert.equal(a.cases.length,7);assert.deepEqual(a,b);
  assert.equal(a.scope,scope);assert.equal(a.completed,0);
  assert.equal(a.mayGrantAccess,false);assert.equal(a.canPublish,false);
  assert.equal(a.requiresRealSafari,true);
  assert.ok(qaAcceptanceText(a).includes('NOT RUN ON PHYSICAL DEVICE'));
  assert.ok(Object.isFrozen(a)&&Object.isFrozen(a.cases));
  assert.equal(a.cases.filter(x=>x.id.startsWith('journey-')).length,3);
  assert.equal(a.scopeLabel,qaPreview(role,scope).scopeLabel);
 }
});
test('Stage C fails closed on forged role or unknown scope without silent fallback',()=>{
 assert.equal(qaAcceptanceBoard('superuser','qa-platform'),null);
 assert.equal(qaAcceptanceBoard('coach','qa-rangers-16-foreign'),null);
 assert.equal(qaAcceptanceBoard('owner','qa-west'),null);
 assert.equal(qaAcceptanceText(null),'');
});
test('Stage C exports a synthetic non-attested checklist with no personal data fields',()=>{
 const text=qaAcceptanceText(qaAcceptanceBoard('association','qa-west'));
 for(const prohibited of ['token:','password:','phone:','email:','medical:','guardian:','wwcc:'])
   assert.ok(!text.toLowerCase().includes(prohibited),prohibited);
 assert.ok(text.includes('Owner acceptance: PENDING'));
 assert.ok(!text.includes('Example Comets'));
 assert.ok(text.includes('Sample Valley Sporting Association'));
});
