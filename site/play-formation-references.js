// Play Engine 2.0 E3.2: authoritative entry points for future sport-format review.
// This is NOT a formation catalogue, player roster, local by-law adjudicator,
// or confirmation that the existing eight-slot tactics canvas is match-ready.
// Do not infer formation coordinates, physical field dimensions or junior
// player counts from the sport name. No UI or persisted workspace uses this yet.
import {
  PLAY_FORMAT_CONTRACT_VERSION, validateFormationProfile
} from './play-formation-contract.js';

export const PLAY_FORMAT_REFERENCE_VERSION = 1;
const checked = '2026-11-10';
const freezeSource = source => Object.freeze({ ...source, checkedAt: checked });
const entries = [
  {
    id: 'oztag-eight-reference',
    sport: 'Oztag', format: 'eight-on-field-reference',
    ageScope: 'competition-defined', maxOnField: 8,
    source: {
      authority: 'Australian Oztag',
      title: 'Official Oztag rules',
      edition: 'Public rules overview',
      url: 'https://www.oztag.com.au/resources/rules'
    },
    localFormatNeedsReview: true,
    notes: 'Maximum eight on the field is a rules fact. Existing tactic slots are not certified positional assignments.'
  },
  {
    id: 'rugby-league-international-13-reference',
    sport: 'Rugby league', format: 'international-13-plus-reference',
    ageScope: '13+', maxOnField: 13,
    source: {
      authority: 'Play Rugby League',
      title: 'International Laws of the Game (13+)',
      edition: 'Community laws entry point',
      url: 'https://www.playrugbyleague.com/laws-of-the-game-community/international-13splus-laws/'
    },
    localFormatNeedsReview: true,
    notes: 'International 13+ laws and the Safeplay obligations applicable to younger participants do not validate a particular club formation.'
  },
  {
    id: 'rugby-league-junior-6-12-local-review',
    sport: 'Rugby league', format: 'junior-6-to-12-local-review',
    ageScope: '6–12', maxOnField: null,
    source: {
      authority: 'Play Rugby League',
      title: 'Junior League Laws (6–12)',
      edition: 'Community laws entry point',
      url: 'https://www.playrugbyleague.com/laws-of-the-game-community/junior-league-laws-6-12s/'
    },
    localFormatNeedsReview: true,
    notes: 'Under 9–12 regional formats may differ. Exact junior grade, local league and number on field must be independently verified.'
  },
  {
    id: 'league-tag-local-format-review',
    sport: 'League tag', format: 'league-tag-local-review',
    ageScope: 'competition-defined', maxOnField: null,
    source: {
      authority: 'Play Rugby League',
      title: 'Other Laws of the Game (including League Tag)',
      edition: 'Community format laws entry point',
      url: 'https://www.playrugbyleague.com/laws-of-the-game-community/other-laws-of-the-game/'
    },
    localFormatNeedsReview: true,
    notes: 'League Tag is a distinct code/format. Confirm competition, age group, current laws and player count before defining any tactical slots.'
  }
];

// The array, its entries and nested sources are immutable. No caller can add a
// selected team, fabricated grade or unapproved formation to the source list.
export const FORMATION_FORMAT_REFERENCES = Object.freeze(entries.map(entry =>
  Object.freeze({
    referenceVersion: PLAY_FORMAT_REFERENCE_VERSION,
    id: entry.id, sport: entry.sport, format: entry.format,
    ageScope: entry.ageScope, maxOnField: entry.maxOnField,
    source: freezeSource(entry.source),
    localFormatNeedsReview: entry.localFormatNeedsReview,
    formationReviewed: false, status: 'reference-only',
    notes: entry.notes
  })
));

export function formationFormatReference(referenceId) {
  if (typeof referenceId !== 'string') return null;
  return FORMATION_FORMAT_REFERENCES.find(item => item.id === referenceId) || null;
}

const freezeConcept = profile => Object.freeze({
  ...profile,
  scope: Object.freeze(profile.scope),
  provenance: Object.freeze(profile.provenance),
  field: Object.freeze(profile.field),
  attackingSlots: Object.freeze(profile.attackingSlots),
  defensiveSlots: Object.freeze(profile.defensiveSlots),
  markerRoleIds: Object.freeze(profile.markerRoleIds),
  actions: Object.freeze({
    permitted: Object.freeze(profile.actions.permitted),
    limited: Object.freeze(profile.actions.limited)
  }),
  applicableRuleSetIds: Object.freeze(profile.applicableRuleSetIds),
  reviewNotes: Object.freeze(profile.reviewNotes)
});

// A draft *concept* can only be built when the rules entry states the number
// on the field. Junior 6–12 and League Tag are deliberately refused: local grade/league could
// have a different player count. Null field dimensions and empty actor lists
// prevent this from being mistaken for an approved formation.
export function conceptProfileForFormatReference(referenceId) {
  const ref = formationFormatReference(referenceId);
  if (!ref) return Object.freeze({ reason: 'unknown-reference', profile: null });
  if (!Number.isSafeInteger(ref.maxOnField) || ref.maxOnField <= 0) {
    return Object.freeze({ reason: 'local-format-unverified', profile: null });
  }
  const profile = {
    contractVersion: PLAY_FORMAT_CONTRACT_VERSION,
    profileId: ref.id, sport: ref.sport, format: ref.format,
    scope: { competitionId: null, grade: null },
    provenance: {
      sourceTitle: ref.source.title,
      sourceEdition: ref.source.edition,
      sourceUrl: ref.source.url,
      reviewedAt: null, reviewedBy: null
    },
    field: { lengthM: null, widthM: null, orientation: 'attack-up' },
    maxOnField: ref.maxOnField,
    attackingSlots: [], defensiveSlots: [], markerRoleIds: [],
    actions: { permitted: [], limited: [] },
    status: 'concept-only', applicableRuleSetIds: [],
    reviewNotes: [
      'Reference only. No reviewed formation or verified player/lineup assignment.',
      ref.notes
    ]
  };
  const assessment = validateFormationProfile(profile);
  if (!assessment.valid || assessment.status !== 'concept-only' || assessment.matchReady) {
    return Object.freeze({ reason: 'invalid-reference-contract', profile: null });
  }
  return Object.freeze({ reason: 'concept-only', profile: freezeConcept(profile) });
}
