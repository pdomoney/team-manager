import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const file = JSON.parse(fs.readFileSync(new URL('../config/privacy-decision-register.json', import.meta.url), 'utf8'));
const isIsoDate = value => typeof value === 'string' &&
  /^20\d{2}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
const validAnswer = row => {
  if (row.status === 'unanswered') return row.responseCode === null &&
    row.responseSummary === null && row.respondedOn === null &&
    row.responseEvidenceRef === null && row.reviewState === 'not-reviewed' &&
    row.reviewedOn === null && row.reviewEvidenceRef === null;
  if (!['answered-pending-review', 'approved', 'rejected', 'superseded'].includes(row.status)) return false;
  if (!isIsoDate(row.respondedOn) || !row.responseEvidenceRef || typeof row.responseEvidenceRef !== 'string')
    return false;
  if (row.answerType === 'single') {
    if (!row.allowedValues.includes(row.responseCode)) return false;
  } else if (row.answerType === 'review') {
    if (!['requires-detailed-policy', 'no-decision'].includes(row.responseCode)) return false;
  } else return false;
  if (typeof row.responseSummary !== 'string' || row.responseSummary.length > 400) return false;
  if (/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(row.responseSummary) ||
      /\b(?:\+?61|0)4\d{8}\b/.test(row.responseSummary)) return false;
  if (row.status === 'approved') {
    return row.reviewState === 'approved' && typeof row.reviewerRole === 'string' &&
      row.reviewerRole.length > 0 && isIsoDate(row.reviewedOn) &&
      typeof row.reviewEvidenceRef === 'string' && row.reviewEvidenceRef.length > 0;
  }
  return row.reviewState !== 'approved';
};

test('privacy register is a public-safe policy questionnaire, not a release approval', () => {
  assert.equal(file.kind, 'team-manager-privacy-decision-register');
  assert.equal(file.schemaVersion, 1);
  assert.equal(file.classification, 'public-policy-metadata-only');
  assert.equal(file.registerState, 'open');
  assert.match(file.sourceBaseline, /^[a-f0-9]{40}$/);
  assert.equal(file.decisions.length, 18);
  assert.deepEqual(file.decisions.map(row => row.id), Array.from({length:18},
    (_, index) => 'TM-PR-' + String(index + 1).padStart(3, '0')));
  for (const row of file.decisions) {
    assert.match(row.id, /^TM-PR-\d{3}$/);
    assert.ok(typeof row.question === 'string' && row.question.length >= 15);
    assert.ok(['single', 'review'].includes(row.answerType));
    assert.ok(Array.isArray(row.allowedValues));
    if (row.answerType === 'single') assert.ok(row.allowedValues.length >= 2);
    else assert.equal(row.allowedValues.length, 0);
    assert.ok(['undetermined','yes','no','review-needed'].includes(row.applicable));
    assert.equal(row.implementationGate, 'L0');
    assert.equal(validAnswer(row), true, row.id + ' is either an unanswered question or an evidenced response');
  }
  assert.equal(file.decisions.filter(row => row.status === 'approved').length, 0);
  assert.equal(file.decisions.filter(row => row.status !== 'unanswered').length, 2);
  const platformResponsibility = file.decisions.find(row => row.id === 'TM-PR-002');
  assert.equal(platformResponsibility.status, 'answered-pending-review');
  assert.equal(platformResponsibility.responseCode, 'platform-operator');
  assert.equal(platformResponsibility.applicable, 'yes');
  assert.equal(platformResponsibility.reviewState, 'not-reviewed');
  assert.equal(platformResponsibility.reviewEvidenceRef, null);
  assert.equal(file.decisions.find(row => row.id === 'TM-PR-016').status, 'unanswered',
    'the incident-response operating procedure remains a separate decision');
  const firstTeamAges = file.decisions.find(row => row.id === 'TM-PR-001');
  assert.equal(firstTeamAges.status, 'answered-pending-review');
  assert.equal(firstTeamAges.responseCode, 'includes-under-18s');
  assert.equal(firstTeamAges.applicable, 'yes');
  assert.equal(firstTeamAges.reviewState, 'not-reviewed');
  assert.equal(file.decisions.find(row => row.id === 'TM-PR-005').status, 'unanswered');
  assert.equal(file.decisions.find(row => row.id === 'TM-PR-006').status, 'unanswered');
});

test('owner answer alone never becomes reviewed or production-authorised', () => {
  const unanswered = structuredClone(file.decisions[0]);
  assert.equal(validAnswer(unanswered), true);
  const answered = {
    ...unanswered,
    status: 'answered-pending-review',
    responseCode: 'adults-only',
    responseSummary: 'First-team scope: adults only.',
    respondedOn: '2026-11-17',
    responseEvidenceRef: 'owner-conversation:2026-11-17:TM-PR-001'
  };
  assert.equal(validAnswer(answered), true);
  assert.equal(validAnswer({...answered, status:'approved'}), false);
  assert.equal(validAnswer({...answered, status:'approved', reviewState:'approved'}), false);
  assert.equal(validAnswer({
    ...answered,status:'approved',reviewState:'approved',
    reviewerRole:'responsible-controller',
    reviewedOn:'2026-11-17',
    reviewEvidenceRef:'privacy-approval:TM-PR-001'
  }), true);
});

test('unknown, unreviewed, sensitive or out-of-options answers cannot be silently accepted', () => {
  const base = structuredClone(file.decisions[0]);
  assert.equal(validAnswer({...base,status:'approved'}), false);
  const claimed = {
    ...base,status:'answered-pending-review',responseCode:'includes-under-18s',
    responseSummary:'Needs child safeguarding review.',
    respondedOn:'2026-11-17',responseEvidenceRef:'owner-conversation:2026-11-17:TM-PR-001'
  };
  assert.equal(validAnswer(claimed), true);
  assert.equal(validAnswer({...claimed,responseCode:'unreviewed-other-option'}), false);
  assert.equal(validAnswer({...claimed,responseSummary:'contact child@example.com'}), false);
  assert.equal(validAnswer({...claimed,responseSummary:'SMS 0412345678'}), false);
  assert.equal(validAnswer({...claimed,responseEvidenceRef:null}), false);
});
