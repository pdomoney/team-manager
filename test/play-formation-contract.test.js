import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateFormationProfile, resolveFormationProfile, PLAY_FORMAT_CONTRACT_VERSION } from '../site/play-formation-contract.js';
import { SCHEMA, migrateWorkspace } from '../site/model.js';

const clone = o => structuredClone(o);
const fixture = () => ({
  contractVersion: 1,
  profileId: 'oztag-eight-training-v1',
  sport: 'Oztag',
  format: 'synthetic-eight-training',
  // This is a wholly fictional validation fixture, NOT an approved Oztag layout.
  scope: { competitionId: 'synthetic-competition', grade: 'synthetic-grade' },
  provenance: {
    sourceTitle: 'Synthetic rules fixture', sourceEdition: 'test',
    sourceUrl: 'https://example.test/fictional-rules',
    reviewedAt: '2026-11-10', reviewedBy: 'Synthetic fixture reviewer'
  },
  field: { lengthM: 90, widthM: 50, orientation: 'attack-up' },
  maxOnField: 8,
  attackingSlots: Array.from({ length: 8 }, (_, i) => ({
    slotId: 'actor-' + (i + 1), roleId: 'demo-role-' + (i + 1),
    label: 'Test actor ' + (i + 1), start: { x: (i + 1) / 10, y: .5 }
  })),
  defensiveSlots: [{ slotId: 'defender-one', roleId: 'synthetic-defence',
    label: 'Defender', start: { x: .3, y: .1 } }],
  markerRoleIds: ['synthetic-defence'],
  actions: { permitted: ['test-action'], limited: ['test-restriction'] },
  status: 'reviewed-teaching',
  applicableRuleSetIds: ['synthetic-rulepack'],
  reviewNotes: ['Synthetic only: real owner/competition approval is not inferred']
});
const selection = p => ({
  profileId: p.profileId, sport: p.sport, format: p.format,
  competitionId: p.scope.competitionId, grade: p.scope.grade
});
const inspect = p => validateFormationProfile(p);
const has = (result, code) => assert.ok(result.reasons.includes(code),
  `Expected reason ${code}, got ${JSON.stringify(result.reasons)}`);

test('E3.1 contract is versioned and valid synthetic reviewed-teaching never becomes match-ready', () => {
  const p = fixture(), before = JSON.stringify(p);
  assert.equal(PLAY_FORMAT_CONTRACT_VERSION, 1);
  const checked = inspect(p), resolved = resolveFormationProfile(p, selection(p));
  assert.equal(checked.valid, true);
  assert.equal(checked.status, 'reviewed-teaching');
  assert.equal(resolved.status, 'reviewed-teaching');
  assert.equal(resolved.matchReady, false);
  assert.equal(Object.isFrozen(resolved), true);
  assert.equal(Object.isFrozen(resolved.reasons), true);
  assert.equal(JSON.stringify(p), before, 'the profile is read-only');
});

test('E3.1 incomplete historical Oztag concept is allowed but never certified as match formation', () => {
  const p=fixture();
  p.status='concept-only'; p.attackingSlots=[]; p.defensiveSlots=[];
  p.field.lengthM=null; p.field.widthM=null;
  p.scope={competitionId:null,grade:null};
  p.provenance.reviewedAt=null; p.provenance.reviewedBy=null;
  p.applicableRuleSetIds=[];p.actions={permitted:[],limited:[]};
  const checked=inspect(p), selected=resolveFormationProfile(p, {
    profileId:p.profileId,sport:p.sport,format:p.format
  });
  assert.equal(checked.valid,true);
  assert.equal(selected.status,'concept-only');
  assert.equal(selected.reason,'concept-only');
  assert.equal(selected.matchReady,false);
});

test('E3.1 Rugby League international 13s reference is not a legal lineup or junior profile', () => {
  const p=fixture();
  Object.assign(p,{
    profileId:'rugby-league-international-13-reference-v1',sport:'Rugby league',
    format:'international-13s-reference',maxOnField:13,status:'concept-only',
    scope:{competitionId:null,grade:null}, attackingSlots:[],defensiveSlots:[],
    markerRoleIds:[],applicableRuleSetIds:[],reviewNotes:['Rule source is not a reviewed formation']
  });
  Object.assign(p.field,{lengthM:null,widthM:null});
  Object.assign(p.provenance,{
    sourceTitle:'International Laws (13+) community guidance',
    sourceEdition:'2026 reference',
    sourceUrl:'https://www.playrugbyleague.com/laws-of-the-game-community/international-13splus-laws/',
    reviewedAt:null,reviewedBy:null
  });
  p.actions={permitted:[],limited:[]};
  assert.equal(inspect(p).valid,true);
  const old=JSON.stringify(p);
  const result=resolveFormationProfile(p,{profileId:p.profileId,sport:p.sport,format:p.format,
    grade:'U15',competitionId:'fictional-nswrl-junior'});
  assert.equal(result.status,'concept-only');
  assert.equal(result.matchReady,false);
  assert.equal(JSON.stringify(p),old);
  const wrong=resolveFormationProfile(p,{profileId:p.profileId,sport:'League tag',format:p.format});
  has(wrong,'sport-mismatch');
});

test('E3.1 missing selection, forged profile, cross-sport and different formats all fail closed', () => {
  const p=fixture();
  has(resolveFormationProfile(p), 'selection-required');
  has(resolveFormationProfile(p, {...selection(p),profileId:'prototype'}),'profile-mismatch');
  has(resolveFormationProfile(p, {...selection(p),sport:'Rugby league'}),'sport-mismatch');
  has(resolveFormationProfile(p, {...selection(p),format:'junior-nine'}),'format-mismatch');
  has(resolveFormationProfile(p, {...selection(p),grade:'Under 9'}),'grade-mismatch');
  has(resolveFormationProfile(p, {...selection(p),competitionId:'other-club'}),'competition-mismatch');
  assert.equal(resolveFormationProfile(p,selection(p)).matchReady,false);
  assert.equal(resolveFormationProfile(null,selection(p)).status,'concept-only');
});

test('E3.1 new or malformed contract never defaults to the old eight-slot Oztag drawing', () => {
  const p=fixture();
  const cases=[
    [x => {x.contractVersion=2},'unsupported-contract-version'],
    [x => {x.profileId='__proto__'},'invalid-profile-id'],
    [x => {x.sport='Mystery football'},'unknown-sport'],
    [x => {x.format=''},'missing-format'],
    [x => {x.status='match-ready'},'unsupported-status'],
    [x => {x.maxOnField=0},'invalid-player-count'],
    [x => {x.field.lengthM=Infinity},'invalid-field'],
    [x => {x.attackingSlots[0].start.x=1.2},'attacking-slots-invalid'],
    [x => {x.attackingSlots[1].slotId=x.attackingSlots[0].slotId},'duplicate-slot-id'],
    [x => {x.defensiveSlots[0].slotId=x.attackingSlots[0].slotId},'duplicate-slot-id'],
    [x => {x.attackingSlots.pop()},'formation-slots-incomplete'],
    [x => {x.markerRoleIds=['marker','marker']},'invalid-marker-roles'],
    [x => {x.actions.permitted='not-array'},'invalid-action-contract'],
    [x => {x.applicableRuleSetIds=[]},'ruleset-review-pending'],
    [x => {x.provenance.sourceUrl='javascript:alert(1)'},'invalid-provenance'],
    [x => {x.provenance.reviewedBy=null},'missing-domain-review'],
    [x => {x.scope.grade=null},'unreviewed-local-scope']
  ];
  for (const [change,code] of cases) {
    const one=clone(p), before=JSON.stringify(p);
    change(one);
    const result=inspect(one);
    assert.equal(result.status,'concept-only',code);
    assert.equal(result.matchReady,false,code);
    has(result,code);
    assert.equal(JSON.stringify(p),before,'mutating a candidate does not alter the trusted original');
  }
});

test('E3.1 existing schema-4 golden plays and shared library are opaque and unchanged', () => {
  const golden=JSON.parse(readFileSync(new URL('./fixtures/play-engine-e0-golden.json',import.meta.url),'utf8'));
  const source=clone(golden.schema4Workspace);
  const before=JSON.stringify(source);
  assert.equal(source.schema, SCHEMA);
  const p=fixture();
  resolveFormationProfile(p,{...selection(p),sport:'Rugby league'});
  assert.equal(JSON.stringify(source),before,
    'formation validation cannot migrate legacy Step Out, versioned moves or shared library');
  const imported=migrateWorkspace(clone(source));
  assert.deepEqual(imported.plays,source.plays);
  assert.deepEqual(imported.library.plays,source.library.plays);
  assert.deepEqual(imported.teams[0].plays,source.teams[0].plays);
});
