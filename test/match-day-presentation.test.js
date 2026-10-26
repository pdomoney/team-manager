import test from 'node:test';
import assert from 'node:assert/strict';
import {matchDayPresentation} from '../site/match-day-presentation.js';
test('P11 Oztag retains the existing on-field and tries controls without claiming verified competition rules',()=>{
 const c=matchDayPresentation('Oztag',{competition:'State Cup',season:'2026',category:'Mixed',ageGroup:'Open'});
 assert.equal(c.mayUseAdvancedMatchDay,true);
 assert.equal(c.scoreControls,'legacy-oztag-tries');
 assert.equal(c.lineupControls,'legacy-oztag-eight-slot');
 assert.equal(c.scoreType,'tries');
 assert.equal(c.onFieldCount,null);
 assert.equal(c.periods,null);
 assert.equal(c.competitionRulesVerified,false);
 assert.equal(c.ruleSourceApproved,false);
 assert.deepEqual(c.context,{competition:'State Cup',season:'2026',category:'Mixed',ageGroup:'Open'});
 assert.ok(Object.isFrozen(c)&&Object.isFrozen(c.context));
});
test('P11 never presents an Oztag +1 try counter or eight-player field for different sports',()=>{
 for(const sport of ['Rugby League','League Tag','Touch','Rugby Union','Netball','AFL']){
   const p=matchDayPresentation(sport,{competition:'Under 16',season:'2026'});
   assert.equal(p.mayUseAdvancedMatchDay,false,sport);
   assert.equal(p.mayEnterSportSpecificScore,false,sport);
   assert.equal(p.scoreControls,'not-configured',sport);
   assert.equal(p.lineupControls,'not-configured',sport);
   assert.equal(p.onFieldCount,null,sport);
   assert.equal(p.periods,null,sport);
   assert.equal(p.ruleSourceApproved,false,sport);
   assert.equal(p.preservesHistoricalMatchData,true,sport);
 }
});
test('P11 unsupported, forged or unexpected sport names fail closed',()=>{
 for(const name of ['',null,undefined,42,'Oztag<script>','Oztag Mixed']){
   const p=matchDayPresentation(name);
   assert.equal(p.mayUseAdvancedMatchDay,false);
   assert.equal(p.mayEnterSportSpecificScore,false);
   assert.equal(p.scoreType,'unconfigured');
 }
});
test('P11 different local grade/category labels never authorise sport scoring',()=>{
 const a=matchDayPresentation('Rugby League',{ageGroup:'U16',category:'Girls',competition:'Club',season:'2026'});
 const b=matchDayPresentation('Rugby League',{ageGroup:'U18',category:'Boys',competition:'State',season:'2027'});
 assert.notDeepEqual(a.context,b.context);
 assert.equal(a.scoreControls,'not-configured');
 assert.equal(b.scoreControls,'not-configured');
 assert.equal(a.onFieldCount,null);
 assert.equal(b.onFieldCount,null);
});
