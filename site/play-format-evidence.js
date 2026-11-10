// E3.4: read-only review of proposed competition/grade rules evidence.
// This helper has NO authority to certify a formation, approve rule exceptions,
// set playing positions, modify a team's rules, or change the existing play.
// Even a complete candidate packet remains unverified until independent review.
import { formationFormatReference } from './play-formation-references.js';
import { sportFormatReviewBrief } from './play-format-review.js';

export const E34_EVIDENCE_VERSION = 1;
const freeze = Object.freeze;
const clean = (v, max = 200) => typeof v === 'string'
  ? v.replace(/[\r\n\t\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
  : '';
const isObject = v => !!v && typeof v === 'object' && !Array.isArray(v);

// External URLs must not be accepted as executable links from copied text.
// The returned value is evidence SUPPLIED by a coach, not a fetched/validated
// rulebook; credentials, loopback/private addresses, query tokens and fragments
// are excluded from the generated brief.
export function localRulesEvidenceUrl(value) {
  const candidate = clean(value, 500);
  if (!candidate || /\s/.test(candidate)) return '';
  try {
    const u = new URL(candidate);
    const host = u.hostname.toLowerCase();
    if (u.protocol !== 'https:' || !host.includes('.') ||
        u.username || u.password || u.port ||
        host === 'localhost' || host.endsWith('.localhost') ||
        host.endsWith('.local') || host.endsWith('.internal') ||
        /^(?:127|10|0|169\.254|192\.168)\./.test(host) ||
        /^172\.(?:1[6-9]|2\d|3[01])\./.test(host) ||
        /^\d+(?:\.\d+){3}$/.test(host) ||
        host.includes(':')) return '';
    // URLs are only printed as text in the copyable packet. Discard query and
    // fragment because a review link must never carry token-like parameters.
    u.search = '';
    u.hash = '';
    return u.href.slice(0, 500);
  } catch (_) { return ''; }
}

export function assessE34RulesEvidence(review, supplied = {}) {
  const value = isObject(supplied) ? supplied : {};
  const edition = clean(value.rulesEdition, 80);
  const rawUrl = clean(value.localSourceUrl, 500);
  const localSourceUrl = localRulesEvidenceUrl(rawUrl);
  const formatNotes = clean(value.formatNotes, 500);
  const knownRef = formationFormatReference(review?.referenceId);
  const referenceOK = !!knownRef && !!review?.source &&
    knownRef.sport === review?.teamSport &&
    knownRef.source.url === review.source.url &&
    review.matchReady === false && review.status === 'concept-only';
  const scopeOK = !!clean(review?.local?.competition, 140) &&
    !!clean(review?.local?.grade, 80) &&
    !!clean(review?.local?.season, 40);
  const crossCode = !review?.sourceSport || review.sourceSport !== review.teamSport;
  const reasons = [];
  if (!referenceOK) reasons.push('governing-reference-unconfirmed');
  if (!scopeOK) reasons.push('local-competition-scope-incomplete');
  if (crossCode) reasons.push('play-sport-not-confirmed');
  if (!edition) reasons.push('rules-edition-missing');
  if (!rawUrl) reasons.push('local-source-missing');
  else if (!localSourceUrl) reasons.push('local-source-url-invalid');
  // Inputs alone never provide evidence of regional rules applicability or
  // approve any on-field roles/positions, regardless of submitted review names.
  reasons.push('regional-rules-not-verified');
  reasons.push('formation-slots-not-reviewed');
  reasons.push('sporting-owner-approval-required');

  const stages = [
    { id:'source', label:'Governing sport reference selected', provided:referenceOK },
    { id:'scope', label:'Competition, grade and season supplied', provided:scopeOK },
    { id:'local-evidence', label:'Rules edition and public local source supplied', provided:!!edition && !!localSourceUrl },
    { id:'independent-verification', label:'Local rules independently verified', provided:false },
    { id:'formation', label:'Sporting reviewer approves field and all actor slots', provided:false },
    { id:'owner', label:'Product owner accepts approved teaching profile', provided:false }
  ].map(stage => freeze(stage));
  return freeze({
    evidenceVersion:E34_EVIDENCE_VERSION,
    status:'candidate-only', approved:false, matchReady:false,
    canEnableProfile:false, canEditPlay:false, canAssignRoster:false,
    sourceReference:referenceOK ? knownRef.id : '',
    rulesEdition:edition, localSourceUrl, formatNotes,
    stages:freeze(stages), suppliedCount:stages.filter(x=>x.provided).length,
    missing:freeze(reasons)
  });
}

// Intentionally not a certifying document or signed approval. Coach initiates
// copying, and no player/guardian/squad information is loaded or included.
export function e34EvidenceBrief(review, assessment) {
  if (!review || review.status !== 'concept-only' ||
      !assessment || assessment.status !== 'candidate-only' ||
      assessment.matchReady !== false) return '';
  return [
    sportFormatReviewBrief(review),
    '',
    'E3.4 LOCAL RULES EVIDENCE — DRAFT, NOT VERIFIED',
    'Edition / publication year supplied: ' + (assessment.rulesEdition || 'TO CONFIRM'),
    'Local governing source URL supplied: ' + (assessment.localSourceUrl || 'TO CONFIRM'),
    'Requested sporting review of field, player count and slots: ' +
      (assessment.formatNotes || 'TO CONFIRM'),
    'Evidence supplied: ' + assessment.suppliedCount + ' of ' + assessment.stages.length +
      ' preparation/approval checkpoints (not a claim of completion)',
    'Review checkpoints:',
    ...assessment.stages.map(x => '- ' + (x.provided ? '[SOURCE INPUT]' : '[PENDING APPROVAL]') + ' ' + x.label),
    'Review reasons: ' + assessment.missing.join(', '),
    '',
    'No local rules independently verified. No tactical formation, match lineup, player eligibility or app release approved.'
  ].join('\n');
}
