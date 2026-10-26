// P11 Match Day presentation contract; never infer rules from a generic sport label.
// Governing-body and competition settings must be independently reviewed before
// configuring a new sport's score controls, roster counts, or match periods.
// No writes to encrypted data, score history, roles, or shared coach workspaces.
import { SPORTS } from './model.js';
const clean=x=>typeof x==='string'?x.trim():'';
const freeze=Object.freeze;
export function matchDayPresentation(sport,context={}){
  const name=clean(sport),isOztag=name==='Oztag';
  const ctx=context&&typeof context==='object'&&!Array.isArray(context)?context:{};
  const competition=clean(ctx.competition);
  const season=clean(ctx.season);
  const category=clean(ctx.category);
  const ageGroup=clean(ctx.ageGroup);
  return freeze({
    sport:name,recognisedSport:SPORTS.includes(name),
    context:freeze({competition,season,category,ageGroup}),
    // Legacy Oztag controls are established app mechanics, NOT independently
    // certified for every age, grade, gender or season.
    scoreControls:isOztag?'legacy-oztag-tries':'not-configured',
    lineupControls:isOztag?'legacy-oztag-eight-slot':'not-configured',
    scoreType:isOztag?'tries':'unconfigured',
    onFieldCount:null,periods:null,substitutionRules:null,
    mayUseAdvancedMatchDay:isOztag,
    mayEnterSportSpecificScore:isOztag,
    ruleSourceApproved:false,competitionRulesVerified:false,
    requiredDecision:isOztag?'confirm-local-competition-policy':
      'verify-competition-score-lineup-and-match-format',
    preservesHistoricalMatchData:true
  });
}
