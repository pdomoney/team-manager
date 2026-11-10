import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  sportFormatReviewOptions, coachSportFormatReview, sportFormatReviewBrief
} from '../site/play-format-review.js';
import { conceptProfileForFormatReference } from '../site/play-formation-references.js';

const scene = () => ({ id: 'quickie-out', name: 'Step Out', sport: 'Oztag', builtin: true,
  moves: [{ t: 'pass', pts: [[15,30],[25,30]] }], players: {LM:[15,30],RM:[25,30]} });
const scope = { referenceId: 'oztag-eight-reference', competition: 'fictional test league',
  grade: 'fictional open', season: '2026' };
const issues = (result, ...codes) => codes.forEach(code =>
  assert.ok(result.issues.includes(code), JSON.stringify(result.issues)));

test('E3.3 exact sport options are immutable, include League Tag, exclude other codes', () => {
  assert.deepEqual(sportFormatReviewOptions('Oztag').map(r=>r.id), ['oztag-eight-reference']);
  assert.deepEqual(sportFormatReviewOptions('Rugby league').map(r=>r.id), [
    'rugby-league-international-13-reference', 'rugby-league-junior-6-12-local-review'
  ]);
  assert.deepEqual(sportFormatReviewOptions('League tag').map(r=>r.id), [
    'league-tag-local-format-review'
  ]);
  assert.deepEqual(sportFormatReviewOptions('Touch football'), []);
  assert.equal(Object.isFrozen(sportFormatReviewOptions('League tag')), true);
  assert.throws(()=>{sportFormatReviewOptions('Oztag')[0].onFieldReference=13},TypeError);
});

test('E3.3 Oztag with full local scope is still reference-only, never a formation', () => {
  const p=scene(), before=JSON.stringify(p);
  const reviewed=coachSportFormatReview(p,'Oztag',scope);
  assert.equal(reviewed.status,'concept-only');
  assert.equal(reviewed.formatReviewed,false);
  assert.equal(reviewed.matchReady,false);
  assert.equal(reviewed.canAssignLineup,false);
  assert.equal(reviewed.canChangePlay,false);
  assert.equal(reviewed.source.maxOnField,8);
  assert.equal(reviewed.conceptAvailable,true);
  assert.deepEqual(reviewed.local, {
    competition:'fictional test league',grade:'fictional open',season:'2026'
  });
  assert.deepEqual(reviewed.issues,['formation-review-required']);
  assert.match(sportFormatReviewBrief(reviewed),/No formation, field dimensions/);
  assert.equal(JSON.stringify(p),before);
  assert.ok(Object.isFrozen(reviewed)&&Object.isFrozen(reviewed.issues)
    &&Object.isFrozen(reviewed.local));
});

test('E3.3 Rugby League junior and League Tag stay locally unverified with no manufactured actors', () => {
  for (const [sport,id] of [
    ['Rugby league','rugby-league-junior-6-12-local-review'],
    ['League tag','league-tag-local-format-review']
  ]) {
    const p={name:'Junior concept',sport,builtin:false,moves:[]};
    const review=coachSportFormatReview(p,sport,{...scope,referenceId:id,grade:'Under 12'});
    assert.equal(review.status,'concept-only');
    assert.equal(review.conceptAvailable,false);
    assert.equal(review.source.maxOnField,null);
    assert.equal(review.matchReady,false);
    issues(review,'formation-review-required');
    const proposed=conceptProfileForFormatReference(id);
    assert.equal(proposed.profile,null);
    assert.equal(proposed.reason,'local-format-unverified');
  }
});

test('E3.3 exact reference and sport mismatches fail closed even with a supplied local scope', () => {
  const p=scene();
  const wrong=coachSportFormatReview(p,'Oztag',{...scope,
    referenceId:'rugby-league-international-13-reference'});
  issues(wrong,'reference-sport-mismatch','formation-review-required');
  assert.equal(wrong.source,null);
  assert.equal(wrong.conceptAvailable,false);
  const forged=coachSportFormatReview(p,'Oztag',{...scope,referenceId:'__proto__'});
  issues(forged,'unknown-reference');
  assert.equal(forged.source,null);
  const absent=coachSportFormatReview(p,'Oztag',{});
  issues(absent,'reference-required','competition-required','grade-required','season-required');
  const cross=coachSportFormatReview(p,'Rugby league',{...scope,
    referenceId:'rugby-league-international-13-reference'});
  issues(cross,'cross-sport-play','formation-review-required');
  assert.equal(cross.matchReady,false);
  const unknown=coachSportFormatReview(p,'Mystery sport',scope);
  issues(unknown,'unsupported-team-sport','reference-sport-mismatch');
  assert.deepEqual(sportFormatReviewOptions('Mystery sport'),[]);
});

test('E3.3 unknown historical custom play source cannot be inferred from eight drawing slots', () => {
  const p={name:'Original concept',builtin:false,players:{LM:[15,20]},moves:[]};
  const out=coachSportFormatReview(p,'Oztag',scope);
  issues(out,'play-source-unconfirmed');
  assert.equal(out.sourceSport,'');
  assert.equal(out.canChangePlay,false);
  const builtin=coachSportFormatReview({...p,builtin:true},'Oztag',scope);
  assert.equal(builtin.sourceSport,'Oztag');
});

test('E3.3 brief never contains players or team private information and does not write to golden schema 4', () => {
  const golden=JSON.parse(readFileSync(new URL('./fixtures/play-engine-e0-golden.json',import.meta.url),'utf8'));
  const before=JSON.stringify(golden);
  const source=golden.schema4Workspace.plays.find(p=>p.id==='quickie-out');
  const result=coachSportFormatReview(source,'Oztag',scope);
  const text=sportFormatReviewBrief(result);
  assert.match(text,/SPORT FORMAT REVIEW \(CONCEPT ONLY\)/);
  assert.match(text,/local league/i);
  assert.match(text,/2026/);
  assert.doesNotMatch(text,/teamPass|coachPass|guardian|medical|phone|address|playerId/i);
  assert.equal(JSON.stringify(golden),before);
  assert.equal(sportFormatReviewBrief({status:'match-ready',matchReady:true}),'');
});

test('E3.3 review input is bounded and cannot inject extra lines into copied approval request', () => {
  const r=coachSportFormatReview(scene(),'Oztag',{...scope,
    competition:'fictional league\nMATCH READY',grade:'Under 12\r\nTrusted'});
  const brief=sportFormatReviewBrief(r);
  assert.equal(brief.includes('\nMATCH READY'),false);
  assert.equal(brief.includes('\nTrusted'),false);
  assert.match(brief,/fictional league MATCH READY/);
  assert.equal(r.matchReady,false);
});
