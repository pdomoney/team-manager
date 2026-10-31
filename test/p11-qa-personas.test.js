import test from 'node:test';
import assert from 'node:assert/strict';
import {QA_ROLES, qaPreview} from '../site/p11-qa-personas.js';
import {sampleTeamsForClub} from '../site/p12-qa-club-teams.js';

const all=()=>QA_ROLES.map(x=>qaPreview(x.id,''));
test('post-P10 four named QA personas are deterministic and never authenticated roles',()=>{
  assert.deepEqual(QA_ROLES.map(x=>x.label),['Owner','Association Admin','Club Admin','Manager / Coach']);
  for(const p of all()) {
    assert.equal(p.mode,'SYNTHETIC_LAYOUT_ONLY_NO_AUTHENTICATION');
    assert.ok(p.scopes.some(s=>s.id===p.scope));
    assert.ok(p.workflows.length>=3);
  }
  assert.equal(qaPreview('__proto__','qa-east'),null);
  assert.equal(qaPreview('administrator','qa-east'),null);
});
test('post-P10 synthetic role projection restricts association/club/team scope',()=>{
  const assoc=qaPreview('association','qa-west');
  assert.deepEqual(assoc.clubs.map(x=>x.id),['qa-rangers']);
  assert.deepEqual(assoc.teams.map(x=>x.id),sampleTeamsForClub('qa-rangers').map(x=>x.id));
  const club=qaPreview('club','qa-comets');
  assert.deepEqual(club.clubs.map(x=>x.id),['qa-comets']);
  assert.deepEqual(club.teams.map(x=>x.id),sampleTeamsForClub('qa-comets').map(x=>x.id));
  const coach=qaPreview('coach','qa-stars-women');
  assert.deepEqual(coach.teams.map(x=>x.id),['qa-stars-women']);
  assert.deepEqual(coach.clubs.map(x=>x.id),['qa-stars']);
});
test('post-P10 invalid scope cannot select a private or cross-tenant entry',()=>{
  const i=qaPreview('club','nonexistent');
  assert.equal(i.scope,i.scopes[0].id);
  assert.ok(i.teams.every(t=>t.id.startsWith('qa-')));
  const coach=qaPreview('coach','qa-rangers-16');
  assert.equal(coach.scope,'qa-rangers-16');
  assert.deepEqual(coach.associations.map(x=>x.id),['qa-west']);
});
test('post-P10 UI projection contains only synthetic identity, never private person data',()=>{
  for(const p of all()) {
    for(const field of ['password','token','email','phone','guardian','medical','wwcc','person','player','auth']) {
      assert.equal(JSON.stringify(p).toLowerCase().includes('"'+field+'":'),false,field);
    }
    assert.ok(p.associations.every(x=>x.id.startsWith('qa-')));
    assert.ok(p.clubs.every(x=>x.id.startsWith('qa-')));
    assert.ok(p.teams.every(x=>x.id.startsWith('qa-')));
  }
});
test('post-P10 QA fixture output is detached and never grants data access',()=>{
  const first=qaPreview('owner','qa-platform'), initial=JSON.stringify(first);
  first.clubs[0].name='Unauthorized modified record';
  first.scopes[0].name='Changed';
  first.workflows.push('Publish real data');
  assert.equal(JSON.stringify(qaPreview('owner','qa-platform')),initial);
});
