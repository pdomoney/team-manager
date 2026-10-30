import test from 'node:test';
import assert from 'node:assert/strict';
import {P12_QA_PROFILES,P12_QA_GROUP_NAMES,p12QaView} from '../site/p12-qa-profiles.js';

test('P12C: exactly twenty unique fictional profiles and no sensitive data fields',()=>{
  assert.equal(P12_QA_PROFILES.length,20);
  assert.equal(new Set(P12_QA_PROFILES.map(p=>p.id)).size,20);
  for(const p of P12_QA_PROFILES) {
    assert.match(p.id,/^qa-\d\d$/);
    const view=p12QaView(p.id);
    assert.equal(view.mode,'SYNTHETIC_ONLY_NO_AUTHORIZATION');
    assert.equal(view.containsRealPeople,false);
    assert.equal(view.mayGrantAccess,false);
    assert.equal(view.canPublish,false);
    assert.equal(view.saved,false);
    assert.equal(view.profileLabel,p.label);
    assert.ok(view.contexts.length>0,p.id+' should have a context');
    assert.deepEqual(view.selected,view.contexts[0]);
    for(const c of view.contexts) {
      assert.ok(c.groupLabel && P12_QA_GROUP_NAMES[c.group.id],p.id);
      assert.equal(Array.isArray(c.capabilities),true);
    }
  }
  assert.equal(p12QaView('qa-does-not-exist'),null);
  assert.equal(p12QaView('__proto__'),null);
});

test('P12C: QA-18 displays independent club, team and association role assignments',()=>{
  const x=p12QaView('qa-18');
  assert.equal(x.grantCount,5);
  assert.equal(x.relationshipCount,2);
  assert.equal(x.appointmentCount,2);
  assert.equal(x.contexts.length,9);
  const get=(kind,role,id)=>x.contexts.find(c=>c.kind===kind&&c.role===role&&c.group.id===id);
  assert.ok(get('access','club_admin','qa-rangers').capabilities.includes('club:manage'));
  assert.ok(get('access','team_coach','qa-rangers-16').capabilities.includes('roster:manage'));
  assert.ok(get('access','team_manager','qa-stars-women').capabilities.includes('match-staff:manage'));
  assert.ok(get('access','association_viewer','qa-west').capabilities.includes('association:view'));
  assert.ok(get('access','club_support','qa-comets').capabilities.includes('club:view'));
  assert.equal(get('membership','player','qa-comets-mixed').capabilities.length,0);
  assert.equal(get('appointment','acting_coach','qa-fixture-001').capabilities.length,0);
  assert.equal(get('appointment','trainer','qa-fixture-001').status,'unverified proposal');
});

test('P12C: select a scoped context explicitly, invalid selections fall back safely',()=>{
  const x=p12QaView('qa-18');
  const id=x.contexts.find(c=>c.role==='team_manager').id;
  const selected=p12QaView('qa-18',id);
  assert.equal(selected.selected.id,id);
  assert.equal(selected.selected.group.id,'qa-stars-women');
  assert.ok(selected.selected.capabilities.includes('schedule:manage'));
  const invalid=p12QaView('qa-18','grant:club_admin:club:qa-comets');
  assert.equal(invalid.selected.id,x.selected.id);
  assert.ok(!invalid.contexts.some(c=>c.kind==='access'&&c.role==='club_admin'&&c.group.id==='qa-comets'));
});

test('P12C: guardian, helper and player membership never produce access grants',()=>{
  for(const id of ['qa-11','qa-13','qa-14','qa-15','qa-16','qa-17']) {
    const x=p12QaView(id);
    assert.equal(x.grantCount,0);
    assert.ok(x.contexts.every(c=>c.capabilities.length===0));
  }
});

test('P12C: proposed/revoked role appears for review but never enables capabilities',()=>{
  const revoked=p12QaView('qa-19');
  const pending=p12QaView('qa-20');
  assert.equal(revoked.grantCount,0);
  assert.equal(pending.grantCount,0);
  assert.equal(revoked.selected.kind,'inactive');
  assert.equal(pending.selected.kind,'inactive');
  assert.equal(revoked.selected.status,'revoked');
  assert.equal(pending.selected.status,'proposed');
  assert.deepEqual(revoked.selected.capabilities,[]);
  assert.deepEqual(pending.selected.capabilities,[]);
});

test('P12C: multi-club administration is explicit, not inherited from association membership',()=>{
  const p=p12QaView('qa-05');
  const groups=p.contexts.filter(c=>c.kind==='access').map(c=>c.group.id).sort();
  assert.deepEqual(groups,['qa-comets','qa-rangers']);
  assert.ok(p.contexts.every(c=>c.group.type==='club'));
  const assoc=p12QaView('qa-02');
  assert.ok(assoc.contexts.every(c=>c.group.type==='association'));
});

test('P12C: profile switching and context listing are stateless and nonmutating',()=>{
  const original=structuredClone(P12_QA_PROFILES);
  for(const p of P12_QA_PROFILES) {
    const view=p12QaView(p.id);
    for(const c of view.contexts) {
      const v=p12QaView(p.id,c.id);
      assert.equal(v.selected.id,c.id);
      assert.equal(v.accessIsSimulated,true);
    }
  }
  assert.deepEqual(P12_QA_PROFILES,original);
});
