// P11C: bounded, read-only points breakdown simulator for explicitly selected
// adult Rugby league or 15+ League tag source packs. This is not a rules approval,
// competition scorekeeper, match writer, or replacement for local league rules.
import {sportCapabilities} from './p08-sport-capabilities.js';

const definitions=Object.freeze({
  'Rugby league|league/men': 'league-international',
  'Rugby league|league/women': 'league-international',
  'League tag|league-tag/15': 'league-tag-15'
});
const base=[
  ['tries','Tries',4],
  ['conversions','Conversions',2],
  ['penaltyGoals','Penalty goals',2]
];
const league=Object.freeze([
  ...base,['fieldGoals','Field goals',1],
  ['twoPointFieldGoals','Field goals outside 40 m',2]
].map(([id,label,points])=>Object.freeze({id,label,points})));
const tag=Object.freeze([...base,['dropGoals','Drop goals',1]]
 .map(([id,label,points])=>Object.freeze({id,label,points})));
const eventSets=Object.freeze({'league-international':league,'league-tag-15':tag});
export function sourceScorePreviewPolicy(team={},club=null){
  if(!team||typeof team!=='object'||Array.isArray(team))return null;
  // Never silently select a grade: existing defaultRuleSet can infer an
  // Oztag/league grade even when the coach has never confirmed it.
  const explicit=typeof team.rules==='string'?team.rules.trim():'';
  if(!explicit)return null;
  const cap=sportCapabilities(team,club);
  const id=definitions[cap.sport+'|'+explicit];
  if(!id||cap.crossSportRulePack||cap.activeRuleSetId!==explicit||
      !cap.ruleSource?.url||!cap.ruleSource?.checked)return null;
  const expected=id==='league-international'?'league-intl':'league-tag';
  const path=cap.ruleSource.url;
  // Explicitly rely only on our existing bundled governing-body PDF references.
  if(!path.startsWith('https://www.playrugbyleague.com/media/') ||
     !path.endsWith('.pdf') ||
     (expected==='league-intl'&&!path.includes('/14513/'))||
     (expected==='league-tag'&&!path.includes('/16327/')))return null;
  return Object.freeze({
    id,sport:cap.sport,grade:cap.grade,ruleSetId:explicit,
    source: Object.freeze({
      title:cap.ruleSource.title,edition:cap.ruleSource.edition,
      checked:cap.ruleSource.checked,url:cap.ruleSource.url
    }),
    events:eventSets[id],
    persistable:false,approval:'local-competition-review-required',
    changesMatchResult:false,changesWorkspace:false,
    valueKind:'example-points-from-cited-reference'
  });
}
const parseCount=value=>{
  if(typeof value!=='string'&&!Number.isInteger(value))return null;
  const s=String(value);
  if(!/^(0|[1-9]\d{0,1})$/.test(s))return null;
  const n=Number(s);
  return n<=99?n:null;
};
export function calculateSourceScorePreview(policy,values){
  if(!policy||!eventSets[policy.id]||policy.events!==eventSets[policy.id]||
     !values||typeof values!=='object'||Array.isArray(values))return null;
  const totals={};
  for(const side of ['us','them']){
    const counts=values[side];
    if(!counts||typeof counts!=='object'||Array.isArray(counts))return null;
    let total=0;
    for(const event of policy.events){
      const n=parseCount(counts[event.id]);
      if(n===null)return null;
      total+=n*event.points;
    }
    totals[side]=total;
  }
  return Object.freeze({
    us:totals.us,them:totals.them,approval:'preview-only-not-a-match-result',
    canSave:false,matchDataChanged:false
  });
}
