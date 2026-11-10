// E3.3: read-only coach format review, never a formation selector or lineup.
// A source entry describes laws to check; it cannot approve a tactical shape,
// turn an eight-slot drawing into 13 actors, or infer eligible squad members.
import { FORMATION_FORMAT_REFERENCES, formationFormatReference,
  conceptProfileForFormatReference } from './play-formation-references.js';

const freeze = Object.freeze;
const words = (value, max=120) => typeof value === 'string'
  ? value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
  : '';
const hasSport = sport => FORMATION_FORMAT_REFERENCES.some(ref => ref.sport === sport);

export function sportFormatReviewOptions(sport) {
  return freeze(FORMATION_FORMAT_REFERENCES.filter(ref => ref.sport === sport)
    .map(ref => freeze({
      id: ref.id, sport: ref.sport, format: ref.format, ageScope: ref.ageScope,
      sourceTitle: ref.source.title, sourceUrl: ref.source.url,
      onFieldReference: ref.maxOnField, formationReviewed: false
    })));
}

// Exact source selection is mandatory. Competition/grade/season are local
// review inputs only and stay on the coach's screen or user-selected clipboard.
export function coachSportFormatReview(play, teamSport, input = {}) {
  const sport = words(teamSport);
  const sourceSport = words(play?.sport) || (!play?.sport && play?.builtin ? 'Oztag' : '');
  const referenceId = words(input?.referenceId);
  const chosen = formationFormatReference(referenceId);
  const ref = chosen?.sport === sport ? chosen : null;
  const local = freeze({
    competition: words(input?.competition, 140),
    grade: words(input?.grade, 80),
    season: words(input?.season, 40)
  });
  const issues = [];
  if (!hasSport(sport)) issues.push('unsupported-team-sport');
  if (!referenceId) issues.push('reference-required');
  else if (!chosen) issues.push('unknown-reference');
  else if (!ref) issues.push('reference-sport-mismatch');
  if (!sourceSport) issues.push('play-source-unconfirmed');
  else if (sourceSport !== sport) issues.push('cross-sport-play');
  if (!local.competition) issues.push('competition-required');
  if (!local.grade) issues.push('grade-required');
  if (!local.season) issues.push('season-required');
  // No E3 catalogue entry has a reviewed formation. Even an exact source,
  // complete local scope and compatible play must remain unqualified.
  issues.push('formation-review-required');

  const concept = ref ? conceptProfileForFormatReference(ref.id) : null;
  const source = ref ? freeze({
    authority: ref.source.authority, title: ref.source.title,
    edition: ref.source.edition, url: ref.source.url,
    checkedAt: ref.source.checkedAt,
    maxOnField: ref.maxOnField
  }) : null;
  return freeze({
    status: 'concept-only', formatReviewed: false, matchReady: false,
    canAssignLineup: false, canChangePlay: false,
    playName: words(play?.name, 160), teamSport: sport, sourceSport,
    referenceId: ref?.id || '', format: ref?.format || '', source, local,
    conceptAvailable: !!concept?.profile, // empty draft ONLY; never actors
    issues: freeze(issues),
    remaining: freeze([
      'Verify the exact local league, grade, season and current governing rules.',
      'Have the appropriate sporting reviewer approve player counts, role slots, field convention and positions.',
      'Review defensive/marker roles and permitted actions for this specific format.',
      'Approve a separately versioned teaching profile with tests before offering it to coaches.',
      'Match eligibility, registration and lineup approval remain separate.'
    ])
  });
}

// A deliberate copy for the owner/sport reviewer, with no player identity,
// private contact, medical record or password. Nothing is auto-published.
export function sportFormatReviewBrief(review) {
  if (!review || review.status !== 'concept-only' || review.matchReady !== false) return '';
  return [
    'TEAM MANAGER — SPORT FORMAT REVIEW (CONCEPT ONLY)',
    'Play: ' + (review.playName || 'Untitled'),
    'Working team sport: ' + (review.teamSport || 'Not confirmed'),
    'Play source sport: ' + (review.sourceSport || 'Not confirmed'),
    'Reference: ' + (review.source?.title || 'Not selected'),
    'Source URL: ' + (review.source?.url || 'Not selected'),
    'Format: ' + (review.format || 'Not selected'),
    'Local league / competition: ' + (review.local.competition || 'TO CONFIRM'),
    'Grade / age group: ' + (review.local.grade || 'TO CONFIRM'),
    'Season / rules edition: ' + (review.local.season || 'TO CONFIRM'),
    'Outstanding checks: ' + review.issues.join(', '),
    '',
    ...review.remaining.map(x => '- ' + x),
    '',
    'No formation, field dimensions, tactical actor positions, player eligibility or match-ready status approved.',
    'This note is not a saved play, profile, team lineup or rule compliance certificate.'
  ].join('\n');
}
