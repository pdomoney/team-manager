// Play Engine 2.0 E3.1: pure, read-only contract validation for *proposed*
// sport/competition formation profiles. No profile here is authorised to
// replace the existing Oztag editor, alter a lineup or migrate stored plays.
// A diagram actor is not a registered player. Dimensions are metres only when
// explicitly supplied by the profile; the old 50 x 80 canvas is NOT metres.
import { SPORTS } from './model.js';

export const PLAY_FORMAT_CONTRACT_VERSION = 1;
const STATUS = new Set(['concept-only', 'reviewed-teaching']);
const ORIENTATIONS = new Set(['attack-up', 'attack-down']);
const profileId = s => typeof s === 'string' && /^[a-z][a-z0-9-]{2,79}$/.test(s);
const word = s => typeof s === 'string' && s.trim().length > 0 && s.trim() === s;
const object = o => o !== null && typeof o === 'object' && !Array.isArray(o);
const listOfWords = value => Array.isArray(value) && value.every(word) &&
  new Set(value).size === value.length;
const lengthMetres = x => x === null || Number.isFinite(x) && x > 0 && x <= 1000;
const frozenResult = (status, codes, profile) => Object.freeze({
  contractVersion: PLAY_FORMAT_CONTRACT_VERSION,
  profileId: profileId(profile?.profileId) ? profile.profileId : '',
  sport: word(profile?.sport) ? profile.sport : '',
  format: word(profile?.format) ? profile.format : '',
  status, valid: codes.length === 0, matchReady: false,
  reason: codes[0] || (status === 'concept-only' ? 'concept-only' : ''),
  reasons: Object.freeze(codes.slice())
});

function slotCheck(slots, keys, codes, label) {
  if (!Array.isArray(slots)) { codes.push(label + '-missing'); return; }
  for (const slot of slots) {
    if (!object(slot) || !profileId(slot.slotId) ||
      !word(slot.roleId) || !word(slot.label) ||
      !object(slot.start) ||
      !Number.isFinite(slot.start.x) || slot.start.x < 0 || slot.start.x > 1 ||
      !Number.isFinite(slot.start.y) || slot.start.y < 0 || slot.start.y > 1) {
      codes.push(label + '-invalid');
      continue;
    }
    if (keys.has(slot.slotId)) codes.push('duplicate-slot-id');
    keys.add(slot.slotId);
  }
}

// Validity means that a proposed definition has a well-formed *contract*,
// not that a governing body has approved its formation or competition rules.
export function validateFormationProfile(profile) {
  const codes = [];
  if (!object(profile)) return frozenResult('concept-only', ['invalid-profile'], null);
  if (profile.contractVersion !== PLAY_FORMAT_CONTRACT_VERSION) codes.push('unsupported-contract-version');
  if (!profileId(profile.profileId)) codes.push('invalid-profile-id');
  if (!SPORTS.includes(profile.sport)) codes.push('unknown-sport');
  if (!word(profile.format)) codes.push('missing-format');
  if (!STATUS.has(profile.status)) codes.push('unsupported-status');

  const field = profile.field;
  if (!object(field) || !lengthMetres(field.lengthM) || !lengthMetres(field.widthM) ||
    !ORIENTATIONS.has(field.orientation)) codes.push('invalid-field');
  if (!Number.isSafeInteger(profile.maxOnField) || profile.maxOnField < 1 ||
      profile.maxOnField > 30) codes.push('invalid-player-count');

  const keys = new Set();
  slotCheck(profile.attackingSlots, keys, codes, 'attacking-slots');
  slotCheck(profile.defensiveSlots, keys, codes, 'defensive-slots');

  if (!listOfWords(profile.markerRoleIds)) codes.push('invalid-marker-roles');
  if (!object(profile.actions) || !listOfWords(profile.actions.permitted) ||
      !listOfWords(profile.actions.limited)) codes.push('invalid-action-contract');
  if (!listOfWords(profile.applicableRuleSetIds) || !Array.isArray(profile.reviewNotes) ||
    !profile.reviewNotes.every(x => typeof x === 'string')) codes.push('invalid-review-metadata');

  const scope = profile.scope, provenance = profile.provenance;
  if (!object(scope) || !(scope.competitionId === null || word(scope.competitionId)) ||
      !(scope.grade === null || word(scope.grade))) codes.push('invalid-competition-scope');
  if (!object(provenance) || !word(provenance.sourceTitle) ||
      !word(provenance.sourceEdition) ||
      typeof provenance.sourceUrl !== 'string' ||
      !/^https:\/\/[^\s/]+\/[^\s]*$/.test(provenance.sourceUrl) ||
      !(provenance.reviewedAt === null || /^\d{4}-\d{2}-\d{2}$/.test(provenance.reviewedAt)) ||
      !(provenance.reviewedBy === null || word(provenance.reviewedBy))) {
    codes.push('invalid-provenance');
  }

  // A complete, reviewed teaching profile still DOES NOT certify a match
  // lineup. No profile can be match-ready in this first implementation.
  if (profile.status === 'reviewed-teaching') {
    if (!scope || !word(scope.competitionId) || !word(scope.grade)) codes.push('unreviewed-local-scope');
    if (!provenance || !word(provenance.reviewedBy) || !provenance.reviewedAt)
      codes.push('missing-domain-review');
    if (!field || field.lengthM === null || field.widthM === null) codes.push('field-review-pending');
    if (!Array.isArray(profile.attackingSlots) ||
      profile.attackingSlots.length !== profile.maxOnField) codes.push('formation-slots-incomplete');
    if (!Array.isArray(profile.applicableRuleSetIds) ||
      profile.applicableRuleSetIds.length === 0) codes.push('ruleset-review-pending');
    if (!object(profile.actions) || !Array.isArray(profile.actions.permitted) ||
      profile.actions.permitted.length === 0)
      codes.push('actions-review-pending');
  }
  return frozenResult(codes.length ? 'concept-only' : profile.status, [...new Set(codes)], profile);
}

// Never pick a profile merely because a team says "Rugby league" or a legacy
// drawing has eight actors. Caller must provide exact, explicitly selected
// sport, format and profile; reviewed formats also need a matching local scope.
// Returns only a safe assessment, never a mutable formation or roster assignment.
export function resolveFormationProfile(profile, selection) {
  const assessed = validateFormationProfile(profile);
  const reasons = [...assessed.reasons];
  if (!object(selection) || !word(selection.sport) ||
      !word(selection.format) || !word(selection.profileId)) reasons.push('selection-required');
  else {
    if (selection.profileId !== profile?.profileId) reasons.push('profile-mismatch');
    if (selection.sport !== profile?.sport) reasons.push('sport-mismatch');
    if (selection.format !== profile?.format) reasons.push('format-mismatch');
  }
  if (profile?.status === 'reviewed-teaching' && object(selection)) {
    if (!word(selection.competitionId) || selection.competitionId !== profile?.scope?.competitionId)
      reasons.push('competition-mismatch');
    if (!word(selection.grade) || selection.grade !== profile?.scope?.grade)
      reasons.push('grade-mismatch');
  }
  return frozenResult(reasons.length ? 'concept-only' : assessed.status,
    [...new Set(reasons)], profile);
}
