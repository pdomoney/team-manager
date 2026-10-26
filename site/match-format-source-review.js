// P11B read-only competition-format provenance. This never authorises scoring,
// formation, substitution, tenancy roles, rule updates or coach workspace writes.
import {sportCapabilities} from './p08-sport-capabilities.js';

const word=x=>typeof x==='string'?x.trim().slice(0,160):'';
const allowedHosts=new Set(['www.playrugbyleague.com','api.oztag.com.au']);
const safeSourceUrl=value=>{
  try{
    const u=new URL(word(value));
    return u.protocol==='https:'&&allowedHosts.has(u.hostname)&&
      !u.username&&!u.password&&!u.hash&&!u.search&&
      u.pathname.toLowerCase().endsWith('.pdf')?u.toString():'';
  }catch{return '';}
};
export function matchFormatSourceReview(team={},club=null,context={}){
  const t=team&&typeof team==='object'&&!Array.isArray(team)?team:{};
  const x=context&&typeof context==='object'&&!Array.isArray(context)?context:{};
  const cap=sportCapabilities(t,club);
  const source=cap.ruleSource&&safeSourceUrl(cap.ruleSource.url)
    ?Object.freeze({
       title:word(cap.ruleSource.title),
       edition:word(cap.ruleSource.edition),
       checked:word(cap.ruleSource.checked),
       url:safeSourceUrl(cap.ruleSource.url)
     }):null;
  const missing=['competition','season','ageGroup','category']
    .filter(field=>!word(field==='ageGroup'?t.ageGroup:field==='category'?t.category:x[field]));
  const result={
    sport:word(cap.sport),
    competition:word(x.competition),
    season:word(x.season),
    ageGroup:word(t.ageGroup),
    category:word(t.category),
    builtInPack:cap.builtInRulePackForSport,
    configuredRulePack:word(cap.activeRuleSetId),
    explicitRuleSet:word(t.rules),
    ruleCoverage:cap.ruleCoverage,
    crossSportRulePack:cap.crossSportRulePack,
    source,missing:Object.freeze(missing),
    requiresLocalOrganiserReview:true,
    requiresOwnerRuleApproval:true,
    mayEnableScoring:false,
    mayEnableLineup:false,
    mayChangeHistoricalResults:false,
    status:cap.crossSportRulePack?'RULE_PACK_SPORT_MISMATCH':
      source?'REFERENCE_ONLY_NOT_COMPETITION_CONFIRMED':
      'NO_APPLICABLE_SOURCE_CONFIRMED'
  };
  return Object.freeze(result);
}
