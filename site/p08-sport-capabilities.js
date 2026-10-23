// P08A: read-only sport capability contract over the existing trusted coach workspace.
// Describes what the app ACTUALLY supports, not permissions, official competition rules,
// approved staffing minimums or a verified whole-team tactical formation.
import { SPORTS, SPORT_POSITIONS, sportOf, teamSport, positionsFor, ruleSet, ruleSetId } from './model.js';
import { RULES } from './rules.js';
import { CREW_SPORTS } from './match-crew.js';
import { TRANSFER_SPORTS } from './play-transfer.js';

const frozen = value => Object.freeze(value);
const word = value => typeof value === 'string' ? value.trim() : '';

export function sportCapabilities(team = {}, club = null, rules = RULES) {
  const name = teamSport(team, club);
  const knownSport = SPORTS.includes(name);
  const ruleSport = knownSport ? sportOf(name) : '';
  const supportedSportRules = !!ruleSport && !!rules.sports?.[ruleSport];
  // Explicit selection can be historical or intentionally from another code.
  // Never present that rulebook as an authoritative pack for the current sport.
  const selectedId = word(team?.rules);
  const selected = ruleSet(ruleSetId(team, club, rules), rules);
  const crossSportRulePack = !!selected && selected.sport !== (supportedSportRules ? ruleSport : '');
  const safePack = !crossSportRulePack ? selected : null;
  const positions = frozen(positionsFor(team, club).slice());
  const source = safePack?.source
    ? frozen({ title: word(safePack.source.title), edition: word(safePack.source.edition),
      checked: word(safePack.source.checked), url: word(safePack.source.url) })
    : null;
  return frozen({
    sport: name,
    recognisedSport: knownSport,
    positions,
    positionsAreCustom: team?.positionsCustom === true,
    // Only Oztag has the existing eight-slot working tactics field/lineup renderer.
    fullTacticsRenderer: name === 'Oztag' ? 'oztag-eight-slot' : 'unsupported',
    playDiagram: name === 'Oztag' ? 'oztag-editor' : 'eight-slot-teaching-canvas-only',
    transferableConcepts: TRANSFER_SPORTS.includes(name),
    conceptTransferIsCertified: false,
    // P06 templates list possible roles; none are an approved match staffing policy.
    sportSpecificMatchRoles: Object.hasOwn(CREW_SPORTS, name),
    matchStaffRequirementsVerified: false,
    builtInRulePackForSport: supportedSportRules,
    selectedRuleSetId: selectedId,
    activeRuleSetId: safePack?.id || '',
    activeRuleSport: safePack?.sportName || '',
    grade: safePack?.name || '',
    rulePackVersion: safePack ? rules.pack : null,
    ruleSource: source,
    crossSportRulePack,
    ruleCoverage: crossSportRulePack ? 'mismatch-review-required' :
      safePack ? 'source-backed-pack-needs-local-review' : 'no-matching-built-in-pack',
    independentOrganiserVerification: false,
    productionTenantPermissions: false
  });
}

export const sportCapabilityInventory = frozen(SPORTS.map(sport => {
  const coverage = sportCapabilities({ sport });
  return frozen({
    sport,
    builtInRules: coverage.builtInRulePackForSport,
    sportSpecificMatchRoles: coverage.sportSpecificMatchRoles,
    positionsAvailable: !!SPORT_POSITIONS[sport]?.length,
    fullTacticsRenderer: coverage.fullTacticsRenderer,
    conceptTranslationGuide: coverage.transferableConcepts
  });
}));
