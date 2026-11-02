import test from 'node:test';
import assert from 'node:assert/strict';
import {
  desktopProfileAvailable,desktopProfileChoices,resolveDesktopProfile
} from '../site/desktop-profile-preview.js';
import {P12_QA_PROFILES} from '../site/p12-qa-profiles.js';

test('fictional profile picker requires Coach workspace on phone tablet and desktop',()=>{
  assert.equal(desktopProfileAvailable({role:'coach',width:1280}),true);
  for(const width of [320,390,820,899,900])
    assert.equal(desktopProfileAvailable({role:'coach',width}),true);
  for(const width of [0,280,319,-1,NaN])
    assert.equal(desktopProfileAvailable({role:'coach',width}),false);
  for(const width of [390,1280])
    assert.equal(desktopProfileAvailable({role:'coach',playerPreview:true,width}),false);
  for(const role of ['player','helper','guardian','owner',null,''])
    assert.equal(desktopProfileAvailable({role,width:1280}),false);
});

test('desktop role menu contains each of the 20 fictional P12 people exactly once',()=>{
  const groups=desktopProfileChoices(),all=groups.flatMap(g=>g.profiles);
  assert.equal(groups.length,6);
  assert.deepEqual(new Set(all.map(x=>x.id)),new Set(P12_QA_PROFILES.map(x=>x.id)));
  assert.equal(all.length,20);
  assert.ok(all.every(p=>p.fictional&&p.label&&!('email' in p)&&!('password' in p)));
  assert.equal(groups[0].profiles[0].id,'qa-01');
  assert.equal(groups.at(-1).profiles.at(-1).id,'qa-20');
});

test('desktop menu rejects arbitrary role or token values, including inherited object keys',()=>{
  for(const bad of ['','owner','qa-99','qa-18:club-admin','__proto__',
      'qa-01/../../',null,{},'p12:qa-04'])
    assert.equal(resolveDesktopProfile(bad),null);
});

test('desktop preview derives independent roles and scopes only from fictional fixtures',()=>{
  const owner=resolveDesktopProfile('qa-01'),club=resolveDesktopProfile('qa-04'),
    actor=resolveDesktopProfile('qa-18'),revoked=resolveDesktopProfile('qa-19');
  assert.equal(owner.profileLabel,'Platform Owner');
  assert.equal(owner.mayGrantAccess,false);
  assert.equal(owner.canPublish,false);
  assert.equal(club.contexts.filter(c=>c.kind==='access').length,1);
  assert.equal(actor.grantCount,7);
  assert.ok(actor.contexts.some(c=>c.id==='grant:team_manager:team:qa-stars-women'));
  assert.ok(actor.contexts.some(c=>c.id==='grant:team_coach:team:qa-rangers-u12'));
  assert.equal(actor.accessIsSimulated,true);
  assert.equal(actor.containsRealPeople,false);
  assert.equal(revoked.grantCount,0);
  assert.equal(revoked.selected?.status,'revoked');
});

test('all profile previews are non-authorising, immutable source fixtures',()=>{
  for(const source of P12_QA_PROFILES){
    const x=resolveDesktopProfile(source.id);
    assert.equal(x.mode,'SYNTHETIC_ONLY_NO_AUTHORIZATION');
    assert.equal(x.containsRealPeople,false);
    assert.equal(x.saved,false);
    assert.equal(x.canPublish,false);
    assert.equal(x.mayGrantAccess,false);
    assert.ok(x.personId.startsWith('fictional-'));
  }
});
