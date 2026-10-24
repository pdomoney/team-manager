// P08C — conservative, read-only play/teaching compatibility for a team's current sport.
// A diagram's eight slots are not evidence of an official lineup for another code.
import { SPORTS, teamSport } from './model.js';
import { sportCapabilities } from './p08-sport-capabilities.js';

const validSport = s => typeof s === 'string' && SPORTS.includes(s) ? s : '';
const freeze = Object.freeze;

// Never infer the source sport of an old custom play from its eight-slot drawing.
// Only original built-in Oztag starters have a known historical sport without a tag.
export function playTeachingCompatibility(play, team = {}, club = null) {
  const sport = teamSport(team, club), supportedTarget = !!validSport(sport);
  const declared = validSport(play?.sport);
  const sourceSport = declared || (!play?.sport && play?.builtin ? 'Oztag' : '');
  const rule = sportCapabilities(team, club);
  const status = !supportedTarget ? 'unknown-team-sport'
    : !sourceSport ? 'unconfirmed-play-sport'
    : sourceSport !== sport ? 'cross-sport-review'
    : 'sport-matched';
  const eightSlotOnly = sport !== 'Oztag' || status !== 'sport-matched';
  const ruleMismatch = rule.crossSportRulePack;
  const reviewRequired = status !== 'sport-matched' || eightSlotOnly || ruleMismatch;
  const note = status === 'unknown-team-sport'
    ? 'Team sport is not recognised. Confirm the team sport before using these instructions.'
    : status === 'unconfirmed-play-sport'
      ? 'This older play has no confirmed sport. A coach must identify its original sport and check the instructions before use.'
      : status === 'cross-sport-review'
        ? `This play is labelled ${sourceSport} but this team plays ${sport}. Review positions, restarts, movement and scoring before use.`
        : eightSlotOnly
          ? `This is an eight-slot teaching canvas, not a validated ${sport} formation. Check age, competition rules, positioning and the actual player count.`
          : '';
  return freeze({
    teamSport: sport, sourceSport, status,
    // A team-specific sport tag does not certify the rules or the correctness of a play.
    diagramMode: eightSlotOnly ? 'eight-slot-concept' : 'oztag-eight-slot',
    fullFormationVerified: false,
    rulePackMismatch: ruleMismatch,
    ruleCoverage: rule.ruleCoverage,
    reviewRequired,
    shareRequiresConfirmation: status !== 'sport-matched' || ruleMismatch,
    notice: note,
    // No player, guardian, staff, health, accreditation, club licence or secret data.
    externalApproval: false
  });
}
