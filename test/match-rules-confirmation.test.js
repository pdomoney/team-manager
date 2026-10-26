import test from 'node:test';
import assert from 'node:assert/strict';
import {matchRulesConfirmationChecklist as checklist} from '../site/match-rules-confirmation.js';
import {matchFormatSourceReview as source} from '../site/match-format-source-review.js';
const team={sport:'Rugby league',rules:'league/men',ageGroup:'open',category:'men'};
const review=()=>source(team,null,{competition:'Eastern Local RL',season:'2026'});
const match=()=>({id:'private-match',entryId:'entry-1',seasonId:'season-1',notes:'DO NOT COPY PRIVATE PLAYER NOTE'});
const link=()=>({comp:{id:'c1',name:'Eastern Local RL',sport:'Rugby league',
  organiser:'private@example.test'},entry:{id:'entry-1',teamId:'t1',seasonId:'season-1',status:'entered'}});
test('P11E complete scoped fixture still needs real organiser approval and uses immutable checklist',()=>{
 const m=match(),l=link(),mr=review();
 const before=structuredClone({m,l,mr});
 const p=checklist(mr,m,l,'t1');
 assert.equal(p.state,'rules_confirmation_required');
 assert.deepEqual(p.blockers,[]);
 assert.equal(p.readyForScorekeeping,false);
 assert.equal(p.ownerApproved,false);
 assert.equal(p.localOrganiserApproved,false);
 assert.equal(p.mutatedWorkspace,false);
 assert.equal(p.questions.length,5);
 assert.ok(Object.isFrozen(p)&&Object.isFrozen(p.scope)&&Object.isFrozen(p.blockers));
 assert.match(p.copyText,/Eastern Local RL/);
 assert.match(p.copyText,/NOT independently verified|Not independently verified/);
 assert.match(p.copyText,/league\/men/);
 assert.doesNotMatch(p.copyText,/DO NOT COPY PRIVATE PLAYER NOTE|private@example.test|private-match|entry-1|season-1/);
 assert.deepEqual({m,l,mr},before);
});
test('P11E missing reference, age/category and season are transparent and never approved',()=>{
 const r=source({sport:'Netball'},null,{});
 const p=checklist(r,{id:'m'},null,'t1');
 assert.equal(p.state,'scope_review_required');
 assert.ok(p.blockers.some(x=>x.includes('age group')));
 assert.ok(p.blockers.some(x=>x.includes('season')));
 assert.ok(p.blockers.some(x=>x.includes('rulebook')));
 assert.match(p.copyText,/Reference URL: Not available/);
 assert.equal(p.readyForScorekeeping,false);
});
test('P11E mismatched sport and wrong entry/season/tampering are blocked',()=>{
 const r=review(),m=match(),l=link();
 const changes=[
  [{...l,comp:{...l.comp,sport:'Netball'}},'sport'],
  [{...l,entry:{...l.entry,teamId:'other'}},'selected team'],
  [{...l,entry:{...l.entry,status:'withdrawn'}},'not entered'],
  [{...l,entry:{...l.entry,seasonId:'old-season'}},'matching recorded seasons'],
  [null,'Resolve the fixture competition entry']
 ];
 for(const [context,warning] of changes){
  const p=checklist(r,m,context,'t1');
  assert.equal(p.readyForScorekeeping,false);
  assert.ok(p.blockers.some(x=>x.includes(warning)),warning);
 }
});
test('P11E cross-sport rule pack is expressly flagged despite an apparently valid fixture',()=>{
 const r=source({sport:'Rugby league',rules:'oztag/mixed',ageGroup:'open',category:'men'},null,
   {competition:'Eastern Local RL',season:'2026'});
 const p=checklist(r,match(),link(),'t1');
 assert.ok(p.blockers.some(x=>x.includes('different sport')));
 assert.equal(p.readyForScorekeeping,false);
});
test('P11E sanitises multiline coach display names in copied checklist, never emits contacts or match notes',()=>{
 const r={...review(),competition:'League\nSTATUS: APPROVED \t Next',
   phone:'0400 000 000',privateNotes:'HIDDEN',contact:'sensitive@example.net'};
 const m={...match(),opponent:'PRIVATE KID NAME',contact:'some@example.org'};
 const p=checklist(r,m,link(),'t1');
 assert.match(p.copyText,/Competition: League STATUS: APPROVED Next/);
 assert.doesNotMatch(p.copyText,/0400|HIDDEN|sensitive@example|PRIVATE KID|some@example|DO NOT COPY/);
 assert.match(p.copyText,/STATUS: Not independently verified/);
});
test('P11E refuses an unresolved sport review',()=>{
 for(const input of [null,{},[],{sport:''},{sport:44}])
   assert.throws(()=>checklist(input),/resolved sport/);
});
