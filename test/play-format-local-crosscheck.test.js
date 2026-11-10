import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { coachSportFormatReview } from '../site/play-format-review.js';
import { assessE34RulesEvidence } from '../site/play-format-evidence.js';
import { sportingRulesCrosscheck, sportingRulesCrosscheckBrief,
  E34_RECONCILIATION_VERSION } from '../site/play-format-local-crosscheck.js';

const scope={competition:'synthetic club league',grade:'Under 12',season:'2026'};
const source={rulesEdition:'fictional 2026 local edition',
  localSourceUrl:'https://example.org/league/rules?key=DO_NOT_COPY',
  formatNotes:'Compare grade variations'};
const context=(sport,id,playSport=sport)=> {
  const review=coachSportFormatReview({name:'Synthetic teaching play',
    sport:playSport,builtin:false,moves:[]},sport,{...scope,referenceId:id});
  return {review,evidence:assessE34RulesEvidence(review,source)};
};

test('E3.4.4 exact junior reference produces independent, sport-specific questions not player counts',()=>{
  const {review,evidence}=context('Rugby league','rugby-league-junior-6-12-local-review');
  const r=sportingRulesCrosscheck(review,evidence);
  assert.equal(r.version,E34_RECONCILIATION_VERSION);
  assert.equal(r.status,'independent-review-pending');
  assert.equal(r.applicable,true);
  assert.equal(r.verified,false);
  assert.equal(r.matchReady,false);
  assert.equal(r.canEnableProfile,false);
  assert.equal(r.questions.length,6);
  assert.ok(r.focus.includes('Under 9–12'));
  assert.ok(r.focus.includes('Local League'));
  assert.ok(r.questions.every(x=>x.status==='independent-review-pending'&&x.verified===false));
  assert.ok(r.questions.every(x=>x.nationalSourceUrl===r.sourceUrl));
  assert.deepEqual(r.questions.map(x=>x.id),['scope','participants','field','restarts','safety','formation']);
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.questions) && Object.isFrozen(r.questions[0]));
  assert.throws(()=>r.questions.push({id:'forged'}),TypeError);
  assert.equal(r.localSourceUrl,'https://example.org/league/rules');
  const brief=sportingRulesCrosscheckBrief(r);
  assert.match(brief,/LOCAL RULES RECONCILIATION — NOT VERIFIED/);
  assert.match(brief,/No reviewer verification recorded/);
  assert.doesNotMatch(brief,/DO_NOT_COPY/);
  assert.doesNotMatch(brief,/MATCH READY/);
});

test('E3.4.4 verified national reference does not confer approved 13+, Oztag or League Tag formations',()=>{
  const cases=[
    ['Oztag','oztag-eight-reference','eight-on-field','eight symbols'],
    ['Rugby league','rugby-league-international-13-reference','International 13+','Under 13–15'],
    ['League tag','league-tag-local-format-review','League Tag','separate laws']
  ];
  for (const [sport,id,needle,focus] of cases){
    const {review,evidence}=context(sport,id);
    const check=sportingRulesCrosscheck(review,evidence);
    assert.equal(check.applicable,true,id);
    assert.ok(check.title.includes(needle),id);
    assert.ok(check.focus.includes(focus),id);
    assert.equal(check.verified,false);
    assert.equal(check.matchReady,false);
    assert.equal(check.canEnableProfile,false);
    assert.equal(check.questions.every(x=>x.verified===false),true);
    assert.equal(review.matchReady,false);
  }
});

test('E3.4.4 source-forged, cross-sport and modified profile contexts fail closed',()=>{
  const {review,evidence}=context('Rugby league','rugby-league-junior-6-12-local-review');
  const candidates=[
    [null,evidence], [review,null],
    [{...review,referenceId:'__proto__'},evidence],
    [{...review,source:{...review.source,url:'https://forged.example/rules'}},evidence],
    [{...review,source:{...review.source,title:'Invented rules'}},evidence],
    [{...review,teamSport:'Oztag'},evidence],
    [{...review,sourceSport:'Oztag'},evidence],
    [{...review,status:'reviewed-teaching'},evidence],
    [{...review,matchReady:true},evidence],
    [review,{...evidence,sourceReference:'fake'}],
    [review,{...evidence,status:'verified'}],
    [review,{...evidence,canEnableProfile:true}],
    [review,{...evidence,matchReady:true}]
  ];
  for (const [r,e] of candidates) {
    const answer=sportingRulesCrosscheck(r,e);
    assert.equal(answer.applicable,false,JSON.stringify([r,e]));
    assert.equal(answer.canEnableProfile,false);
    assert.equal(answer.matchReady,false);
    assert.deepEqual(answer.questions,[]);
    assert.equal(answer.reason,'source-context-unverified');
    assert.equal(sportingRulesCrosscheckBrief(answer),'');
  }
});

test('E3.4.4 source can be missing locally, and no law or grade is silently certified',()=>{
  const {review}=context('League tag','league-tag-local-format-review');
  const candidate=assessE34RulesEvidence(review,{});
  const r=sportingRulesCrosscheck(review,candidate);
  assert.equal(r.applicable,true);
  assert.equal(r.localSourceUrl,'');
  assert.equal(r.verified,false);
  assert.match(sportingRulesCrosscheckBrief(r),/NOT SUPPLIED/);
  assert.ok(r.questions.every(x=>x.verified===false));
  assert.equal(r.canEnableProfile,false);
});

test('E3.4.4 copied reviewer questions stay source backed and do not mutate E0 golden plays',()=>{
  const golden=JSON.parse(readFileSync(new URL('./fixtures/play-engine-e0-golden.json',import.meta.url),'utf8'));
  const before=JSON.stringify(golden);
  const play=golden.schema4Workspace.plays.find(x=>x.id==='quickie-out');
  const r=coachSportFormatReview(play,'Oztag',{...scope,referenceId:'oztag-eight-reference'});
  const e=assessE34RulesEvidence(r,source);
  const result=sportingRulesCrosscheck(r,e);
  const brief=sportingRulesCrosscheckBrief(result);
  assert.match(brief,/tactical roles/);
  assert.match(brief,/national/i);
  assert.doesNotMatch(brief,/DO_NOT_COPY|teamPass|coachPass|guardian|phone|playerId/);
  assert.equal(JSON.stringify(golden),before);
  assert.equal(result.matchReady,false);
});
