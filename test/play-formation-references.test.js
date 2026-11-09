import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PLAY_FORMAT_REFERENCE_VERSION,
  FORMATION_FORMAT_REFERENCES,
  formationFormatReference,
  conceptProfileForFormatReference
} from '../site/play-formation-references.js';
import { validateFormationProfile, resolveFormationProfile } from '../site/play-formation-contract.js';

test('E3.2 references are uniquely identified, read-only, source-backed, never formations', () => {
  assert.equal(PLAY_FORMAT_REFERENCE_VERSION, 1);
  assert.deepEqual(FORMATION_FORMAT_REFERENCES.map(r => r.id), [
    'oztag-eight-reference',
    'rugby-league-international-13-reference',
    'rugby-league-junior-6-12-local-review'
  ]);
  assert.equal(new Set(FORMATION_FORMAT_REFERENCES.map(r => r.id)).size, 3);
  assert.ok(Object.isFrozen(FORMATION_FORMAT_REFERENCES));
  for (const ref of FORMATION_FORMAT_REFERENCES) {
    assert.equal(ref.referenceVersion, 1);
    assert.ok(Object.isFrozen(ref) && Object.isFrozen(ref.source));
    assert.equal(ref.source.checkedAt, '2026-11-10');
    assert.match(ref.source.url, /^https:\/\/[^\s]+$/);
    assert.equal(ref.status, 'reference-only');
    assert.equal(ref.formationReviewed, false);
    assert.equal(ref.localFormatNeedsReview, true);
    assert.equal(formationFormatReference(ref.id), ref);
    assert.ok(!('attackingSlots' in ref) && !('players' in ref),
      'the rules reference itself never pretends to be a formation or roster');
  }
  assert.throws(() => { FORMATION_FORMAT_REFERENCES[0].source.url = 'https://untrusted.example'; }, TypeError);
});

test('E3.2 Oztag and Rugby League 13+ may yield only frozen, empty teaching concepts', () => {
  for (const [id, sport, count] of [
    ['oztag-eight-reference', 'Oztag', 8],
    ['rugby-league-international-13-reference', 'Rugby league', 13]
  ]) {
    const result = conceptProfileForFormatReference(id);
    assert.equal(result.reason, 'concept-only');
    const p = result.profile;
    assert.ok(p && Object.isFrozen(p) && Object.isFrozen(p.attackingSlots));
    assert.ok(Object.isFrozen(p.provenance) && Object.isFrozen(p.field));
    assert.equal(p.sport, sport);
    assert.equal(p.maxOnField, count);
    assert.equal(p.status, 'concept-only');
    assert.deepEqual(p.attackingSlots, []);
    assert.deepEqual(p.defensiveSlots, []);
    assert.equal(p.field.lengthM, null);
    assert.equal(p.field.widthM, null);
    assert.equal(p.provenance.reviewedAt, null);
    assert.equal(p.provenance.reviewedBy, null);
    const validated = validateFormationProfile(p);
    assert.equal(validated.valid, true, JSON.stringify(validated));
    assert.equal(validated.matchReady, false);
    const selected = resolveFormationProfile(p, {
      profileId: p.profileId, sport: p.sport, format: p.format
    });
    assert.equal(selected.status, 'concept-only');
    assert.equal(selected.matchReady, false);
    assert.throws(() => p.attackingSlots.push({ slotId: 'forged' }), TypeError);
  }
});

test('E3.2 junior 6–12 refuses guessed participants, formation slots and universal U9–12 grade', () => {
  const ref = formationFormatReference('rugby-league-junior-6-12-local-review');
  assert.equal(ref.ageScope, '6–12');
  assert.equal(ref.maxOnField, null);
  assert.ok(ref.notes.includes('regional formats may differ'));
  const result = conceptProfileForFormatReference(ref.id);
  assert.equal(result.reason, 'local-format-unverified');
  assert.equal(result.profile, null);
  assert.equal(ref.maxOnField, null, 'junior count remains unprovided until grade and league review');
});

test('E3.2 absent, forged and wrong-sport reference cannot become another sport profile', () => {
  for (const invalid of [null, undefined, 2, 'Rugby league',
    'rugby-league-international-13-reference-v2', '__proto__']) {
    assert.equal(formationFormatReference(invalid), null);
    const result = conceptProfileForFormatReference(invalid);
    assert.equal(result.reason, 'unknown-reference');
    assert.equal(result.profile, null);
  }
  const concept = conceptProfileForFormatReference('rugby-league-international-13-reference').profile;
  const mismatch = resolveFormationProfile(concept, {
    profileId: concept.profileId, sport: 'Oztag', format: concept.format
  });
  assert.ok(mismatch.reasons.includes('sport-mismatch'));
  assert.equal(mismatch.matchReady, false);
  const wrongFormat = resolveFormationProfile(concept, {
    profileId: concept.profileId, sport: concept.sport, format: 'junior-6-to-12-local-review'
  });
  assert.ok(wrongFormat.reasons.includes('format-mismatch'));
});

test('E3.2 read-only catalogue leaves E0 legacy, v1 links, all teams and shared library intact', () => {
  const golden = JSON.parse(readFileSync(new URL('./fixtures/play-engine-e0-golden.json', import.meta.url), 'utf8'));
  const before = JSON.stringify(golden);
  const originalStarter = JSON.stringify(golden.schema4Workspace.plays.find(p=>p.id==='quickie-out'));
  const originalLinked = JSON.stringify(golden.schema4Workspace.plays.find(p=>p.id==='coach-v1-e0'));
  const originalLibrary = JSON.stringify(golden.schema4Workspace.library);
  conceptProfileForFormatReference('rugby-league-international-13-reference');
  conceptProfileForFormatReference('rugby-league-junior-6-12-local-review');
  assert.equal(JSON.stringify(golden), before);
  assert.equal(JSON.stringify(golden.schema4Workspace.plays.find(p=>p.id==='quickie-out')), originalStarter);
  assert.equal(JSON.stringify(golden.schema4Workspace.plays.find(p=>p.id==='coach-v1-e0')), originalLinked);
  assert.equal(JSON.stringify(golden.schema4Workspace.library), originalLibrary);
  assert.equal(golden.schema4Workspace.teams[0].team.sport, 'Rugby league');
});
