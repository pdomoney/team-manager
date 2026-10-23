import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../site/model.js';
import { RULES } from '../site/rules.js';
import { TRANSFER_SPORTS } from '../site/play-transfer.js';
import { CREW_SPORTS } from '../site/match-crew.js';
import { sportCapabilities, sportCapabilityInventory } from '../site/p08-sport-capabilities.js';

test('P08A inventory covers every sport without inventing unsupported rules or lineups',()=>{
  const entries=sportCapabilityInventory;
  assert.deepEqual(entries.map(e=>e.sport),M.SPORTS);
  assert.equal(new Set(entries.map(e=>e.sport)).size,M.SPORTS.length);
  for(const row of entries){
    const cap=sportCapabilities({sport:row.sport});
    assert.equal(row.builtInRules,['Oztag','Rugby league','League tag'].includes(row.sport));
    assert.equal(row.sportSpecificMatchRoles,Object.hasOwn(CREW_SPORTS,row.sport));
    assert.equal(row.conceptTranslationGuide,TRANSFER_SPORTS.includes(row.sport));
    assert.equal(row.fullTacticsRenderer,row.sport==='Oztag'?'oztag-eight-slot':'unsupported');
    assert.equal(row.positionsAvailable,!!M.SPORT_POSITIONS[row.sport]?.length);
    assert.equal(cap.independentOrganiserVerification,false);
    assert.equal(cap.productionTenantPermissions,false);
    assert.equal(cap.matchStaffRequirementsVerified,false);
    assert.equal(cap.conceptTransferIsCertified,false);
    assert.ok(Object.isFrozen(row)&&Object.isFrozen(cap)&&Object.isFrozen(cap.positions));
  }
});

test('P08A supported rule packs derive from the effective team sport and age context',()=>{
  const oz=sportCapabilities({sport:'Oztag',category:'mixed'});
  const league=sportCapabilities({sport:'Rugby league',category:'boys',ageGroup:'Under 12'});
  const tag=sportCapabilities({sport:'League tag',category:'girls',ageGroup:'8-9'});
  assert.equal(oz.activeRuleSetId,'oztag/mixed');
  assert.equal(league.activeRuleSetId,'league/u12');
  assert.equal(tag.activeRuleSetId,'league-tag/8-9');
  for(const c of [oz,league,tag]){
    assert.equal(c.ruleCoverage,'source-backed-pack-needs-local-review');
    assert.equal(c.rulePackVersion,RULES.pack);
    assert.match(c.ruleSource.url,/^https:\/\//);
    assert.ok(c.ruleSource.checked);
    assert.equal(c.crossSportRulePack,false);
    assert.ok(Object.isFrozen(c.ruleSource));
  }
});

test('P08A unsupported sport does not inherit Oztag rules, numbers or match staff accreditation',()=>{
  for(const sport of ['Touch football','Rugby union','Netball','Rugby sevens','Basketball','Other']){
    const cap=sportCapabilities({sport,category:'mixed'});
    assert.equal(cap.builtInRulePackForSport,false);
    assert.equal(cap.activeRuleSetId,'');
    assert.equal(cap.ruleCoverage,'no-matching-built-in-pack');
    assert.equal(cap.ruleSource,null);
    assert.equal(cap.rulePackVersion,null);
    assert.notEqual(cap.fullTacticsRenderer,'oztag-eight-slot');
  }
  assert.equal(sportCapabilities({sport:'Netball'}).sportSpecificMatchRoles,false);
  assert.equal(sportCapabilities({sport:'Touch football'}).sportSpecificMatchRoles,true);
});

test('P08A explicitly selected wrong-sport rule pack is flagged and not reported as verified',()=>{
  const league=sportCapabilities({sport:'Rugby league',rules:'oztag/mixed'});
  const touch=sportCapabilities({sport:'Touch football',rules:'league/men'});
  for(const cap of [league,touch]){
    assert.equal(cap.ruleCoverage,'mismatch-review-required');
    assert.equal(cap.crossSportRulePack,true);
    assert.equal(cap.activeRuleSetId,'');
    assert.equal(cap.ruleSource,null);
  }
  assert.equal(league.selectedRuleSetId,'oztag/mixed');
  assert.equal(touch.selectedRuleSetId,'league/men');
});

test('P08A same-sport explicit rule pack and intentionally selected grade remain supported',()=>{
  const cap=sportCapabilities({sport:'Rugby league',category:'women',rules:'league/u13-14'});
  assert.equal(cap.crossSportRulePack,false);
  assert.equal(cap.activeRuleSetId,'league/u13-14');
  assert.equal(cap.grade,'13–14');
  assert.equal(cap.ruleCoverage,'source-backed-pack-needs-local-review');
});

test('P08A club default applies only to teams without sport overrides',()=>{
  const club={sport:'Rugby league'};
  assert.equal(sportCapabilities({category:'boys',ageGroup:'Under 12'},club).sport,'Rugby league');
  const tag=sportCapabilities({sport:'League tag',category:'girls',ageGroup:'8-9'},club);
  assert.equal(tag.sport,'League tag');
  assert.equal(tag.activeRuleSetId,'league-tag/8-9');
  assert.equal(tag.positions.includes('Rover'),false);
});

test('P08A private historical team data and custom position order are never mutated or exposed',()=>{
  const team={sport:'Touch football',positionsCustom:true,
    positions:['Left link','Right link'],players:[{name:'PRIVATE PERSON'}],
    matches:[{result:{us:3,them:2},coachNotes:'PRIVATE MEDICAL'}],
    bylaws:[{id:'b1',text:'Local rule remains'}]};
  const before=JSON.stringify(team);
  const cap=sportCapabilities(team);
  assert.deepEqual(cap.positions,['Left link','Right link']);
  assert.equal(cap.positionsAreCustom,true);
  assert.equal(JSON.stringify(team),before);
  assert.equal(JSON.stringify(cap).includes('PRIVATE'),false);
  assert.equal(JSON.stringify(cap).includes('Local rule'),false);
  assert.equal(JSON.stringify(sportCapabilityInventory).includes('PRIVATE'),false);
});

test('P08A unknown strings fail closed and do not inherit a supported sport contract',()=>{
  const c=sportCapabilities({sport:'Custom Sport',rules:'oztag/mixed'});
  assert.equal(c.recognisedSport,false);
  assert.equal(c.builtInRulePackForSport,false);
  assert.equal(c.crossSportRulePack,true);
  assert.equal(c.ruleSource,null);
  assert.equal(c.fullTacticsRenderer,'unsupported');
  assert.equal(c.matchStaffRequirementsVerified,false);
});
