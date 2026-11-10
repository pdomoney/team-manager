// E3.4.4: source-backed questions a *human* sporting reviewer must resolve.
// A public national rules link and a coach-supplied local URL do not certify
// a club's applicable grade rules, pitch dimensions or tactical formation.
import { formationFormatReference } from './play-formation-references.js';

export const E34_RECONCILIATION_VERSION = 1;
const freeze = Object.freeze;
const text = (v, max = 160) => typeof v === 'string'
  ? v.replace(/[\r\n\t\u0000-\u001f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,max) : '';
const common = freeze([
  freeze({id:'scope',title:'Local rules applicability',
    question:'Does the named local league actually run this grade and season under the cited edition, and what amendments or exceptions apply?'}),
  freeze({id:'participants',title:'On-field format',
    question:'What is the correct number of participants on the field, substitute/rotation rules, and any grade-specific modification?'}),
  freeze({id:'field',title:'Playing field',
    question:'What physical pitch length, width, in-goal and attacking direction apply in this exact competition?'}),
  freeze({id:'restarts',title:'Restart and movement rules',
    question:'Confirm the permitted restarts, tags or tackles, marker/defence positioning, kicking and related attacking restrictions.'}),
  freeze({id:'safety',title:'Age and safety requirements',
    question:'Which current safety, contact and age-specific participation codes apply to this grade?'}),
  freeze({id:'formation',title:'Teaching formation roles',
    question:'Which named attacking and defending tactical roles, initial locations, marker roles and action meanings may a coach teach? These are not registered players.'})
]);
const specific = freeze({
  'oztag-eight-reference': freeze({
    title:'Oztag eight-on-field reference',
    focus:'Confirm the local Oztag competition version, eight-on-field maximum, field measures, tag/marker rules and whether the existing eight symbols are only an illustrative teaching shape.'
  }),
  'rugby-league-international-13-reference': freeze({
    title:'Rugby League International 13+ reference',
    focus:'Confirm this team actually uses International 13+ laws; Under 13–15 also need National Safeplay Code review. Do not apply this reference to a modified Under 6–12 competition.'
  }),
  'rugby-league-junior-6-12-local-review': freeze({
    title:'Junior Rugby League ages 6–12 reference',
    focus:'National junior laws are modified. For Under 9–12 the official source explicitly directs verification with the Local League because regional formats may differ. Verify each chosen grade, not an assumed universal junior count.'
  }),
  'league-tag-local-format-review': freeze({
    title:'League Tag reference',
    focus:'League Tag has separate laws from International and Junior Rugby League and other 9- or 11-a-side formats. Confirm the exact local League Tag variant, player count, field and grade-specific play requirements.'
  })
});

// No names, signatures, dates or "verified" switch are accepted here.
// Verification is a future independent sporting/owner decision, not a checkbox
// a local browser can give itself, especially in password-free test mode.
export function sportingRulesCrosscheck(review, evidence) {
  const ref = formationFormatReference(review?.referenceId);
  const valid = !!ref && !!review?.source &&
    review.source.url === ref.source.url &&
    review.source.title === ref.source.title &&
    review.teamSport === ref.sport &&
    review.status === 'concept-only' && review.matchReady === false &&
    evidence?.status === 'candidate-only' &&
    evidence.matchReady === false && evidence.canEnableProfile === false &&
    evidence.sourceReference === ref.id;
  if (!valid) return freeze({
    version:E34_RECONCILIATION_VERSION,
    status:'unavailable',applicable:false,verified:false,
    canEnableProfile:false,matchReady:false,reason:'source-context-unverified',
    referenceId:'',title:'',sourceUrl:'',focus:'',
    localSourceUrl:'',questions:freeze([])
  });
  const questions = common.map(q=>freeze({
    ...q,verified:false,status:'independent-review-pending',
    nationalSourceUrl:ref.source.url
  }));
  return freeze({
    version:E34_RECONCILIATION_VERSION,
    status:'independent-review-pending',applicable:true,verified:false,
    canEnableProfile:false,matchReady:false,reason:'local-competition-review-pending',
    referenceId:ref.id,title:specific[ref.id].title,
    sourceUrl:ref.source.url,focus:specific[ref.id].focus,
    // The URL below was *entered*, not retrieved or verified; never use it as
    // an official rule or evidence of compliance.
    localSourceUrl:text(evidence.localSourceUrl,500),
    questions:freeze(questions)
  });
}

export function sportingRulesCrosscheckBrief(check) {
  if (!check || check.applicable !== true || check.verified !== false ||
      check.matchReady !== false || check.status !== 'independent-review-pending') return '';
  return [
    'E3.4.4 SPORT-SPECIFIC LOCAL RULES RECONCILIATION — NOT VERIFIED',
    'Reference: '+check.title,
    'National governing entry point: '+check.sourceUrl,
    'Coach-provided local source (UNVERIFIED): '+(check.localSourceUrl||'NOT SUPPLIED'),
    'Priority local-format difference: '+check.focus,
    '',
    'REVIEWER QUESTIONS (ALL PENDING)',
    ...check.questions.map(q=>'- [PENDING] '+q.title+': '+q.question),
    '',
    'No reviewer verification recorded. Do not convert this packet into formation coordinates, on-field approval, or a match lineup.'
  ].join('\n');
}
