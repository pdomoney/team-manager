import test from 'node:test';
import assert from 'node:assert/strict';
import {matchFormatSourceReview as review} from '../site/match-format-source-review.js';

test('P11B checked official rugby league rulebook is a reference, not local competition authorisation',()=>{
 const team={sport:'Rugby league',ageGroup:'u8',category:'boys',rules:'league/u8'};
 const old=structuredClone(team);
 const p=review(team,null,{competition:'Junior competition',season:'2026'});
 assert.equal(p.sport,'Rugby league');
 assert.equal(p.configuredRulePack,'league/u8');
 assert.equal(p.source?.url,'https://www.playrugbyleague.com/media/18199/2026-national-6-12-junior-league-laws.pdf');
 assert.equal(p.status,'REFERENCE_ONLY_NOT_COMPETITION_CONFIRMED');
 assert.equal(p.ruleCoverage,'source-backed-pack-needs-local-review');
 assert.equal(p.mayEnableScoring,false);
 assert.equal(p.mayEnableLineup,false);
 assert.equal(p.mayChangeHistoricalResults,false);
 assert.equal(p.requiresOwnerRuleApproval,true);
 assert.equal(p.requiresLocalOrganiserReview,true);
 assert.deepEqual(team,old);
 assert.ok(Object.isFrozen(p)&&Object.isFrozen(p.source)&&Object.isFrozen(p.missing));
});
test('P11B prevents a cross-sport selected rulebook from being presented as a valid reference',()=>{
 const p=review({sport:'Rugby league',rules:'oztag/mixed',ageGroup:'u16',category:'girls'},
   null,{competition:'NSW Local',season:'2026'});
 assert.equal(p.crossSportRulePack,true);
 assert.equal(p.status,'RULE_PACK_SPORT_MISMATCH');
 assert.equal(p.source,null);
 assert.equal(p.mayEnableScoring,false);
});
test('P11B non-covered sports and unlinked fixtures show explicit coverage gaps',()=>{
 for(const sport of ['Touch football','Netball','AFL','Rugby union','Other']){
   const p=review({sport},null,{competition:'',season:''});
   assert.equal(p.source,null,sport);
   assert.equal(p.status,'NO_APPLICABLE_SOURCE_CONFIRMED',sport);
   assert.ok(p.missing.includes('season')&&p.missing.includes('competition'));
   assert.ok(p.missing.includes('ageGroup')&&p.missing.includes('category'));
   assert.equal(p.mayEnableScoring,false);
 }
});
test('P11B explicit missing scope is flagged even with a known Oztag base rule source',()=>{
 const p=review({sport:'Oztag',rules:'oztag/mixed'},null,{});
 assert.equal(p.configuredRulePack,'oztag/mixed');
 assert.equal(p.source?.url,'https://api.oztag.com.au/wp-content/uploads/2026/09/AO-RULEBOOK-2022.pdf');
 assert.deepEqual(p.missing,['competition','season','ageGroup','category']);
 assert.equal(p.requiresLocalOrganiserReview,true);
 assert.equal(p.mayEnableScoring,false);
});
test('P11B does not treat arbitrary coach strings as instructions, URLs, or valid source approvals',()=>{
 const p=review({sport:'Netball',ageGroup:'<script>',category:'2026'},
  null,{competition:'<svg onload=alert(1)>',season:'2026'});
 assert.equal(p.competition,'<svg onload=alert(1)>');
 assert.equal(p.source,null);
 assert.equal(p.mayEnableScoring,false);
 assert.equal(p.requiresOwnerRuleApproval,true);
});
