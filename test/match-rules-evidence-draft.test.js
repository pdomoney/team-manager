import test from 'node:test';
import assert from 'node:assert/strict';
import {draftMatchRulesEvidence as draft,RULES_EVIDENCE_FIELDS as fields}
  from '../site/match-rules-evidence-draft.js';
import {matchRulesConfirmationChecklist as checklist} from '../site/match-rules-confirmation.js';
import {matchFormatSourceReview as source} from '../site/match-format-source-review.js';
const review=()=>source({sport:'Rugby league',rules:'league/u8',ageGroup:'u8',category:'boys'},null,
  {competition:'South Sydney',season:'2026'});
const request=()=>checklist(review(),{id:'private-match',entryId:'',notes:'PRIVATE MEDICAL NOTE'},null,'team1');
test('P11F evidence draft is read-only, copy-only and never a rules approval',()=>{
 const r=request(),before=structuredClone(r),a={sourceUrl:'https://www.playrugbyleague.com/laws-of-the-game-community/',
   edition:'2026 Edition',effectiveDate:'2026-03-01',scoring:'Local scoring unconfirmed'};
 const d=draft(r,a);
 assert.equal(d.valid,true);
 assert.equal(d.status,'DRAFT_UNVERIFIED');
 assert.equal(d.mayEnableScoring,false);
 assert.equal(d.ownerApproved,false);
 assert.equal(d.organiserVerified,false);
 assert.equal(d.saved,false);
 assert.equal(d.sent,false);
 assert.match(d.copyText,/DRAFT ONLY — NOT APPROVED/);
 assert.match(d.copyText,/South Sydney/);
 assert.match(d.copyText,/2026 Edition/);
 assert.doesNotMatch(d.copyText,/PRIVATE MEDICAL NOTE|private-match/);
 assert.deepEqual(r,before);
 assert.ok(Object.isFrozen(d)&&Object.isFrozen(d.fields)&&Object.isFrozen(d.missing));
});
test('P11F supports partial responses and flags missing evidence instead of approving them',()=>{
 const d=draft(request(),{});
 assert.equal(d.valid,true);
 assert.equal(d.missing.length,fields.length);
 assert.match(d.copyText,/NOT SUPPLIED/);
 assert.equal(d.ownerApproved,false);
 assert.equal(d.mayEnableScoring,false);
});
test('P11F rejects unsafe/malformed URLs and non-calendar dates',()=>{
 for(const url of ['http://example.org','https://user:pass@example.org/rules',
  'javascript:alert(1)','https://localhost/x','https://127.0.0.1/private',
  'https://[::1]/x','not a url']){
  const d=draft(request(),{sourceUrl:url});
  assert.equal(d.valid,false,url);
  assert.ok(d.errors.some(x=>x.includes('HTTPS')),url);
 }
 for(const dt of ['2026-02-29','2026-13-01','2026-1-1','today','2026-00-12']){
  assert.equal(draft(request(),{effectiveDate:dt}).valid,false,dt);
 }
 assert.equal(draft(request(),{effectiveDate:'2024-02-29'}).valid,true);
});
test('P11F adversarial multiline content is quoted and cannot replace draft approval status',()=>{
 const d=draft(request(),{organiserDecision:'\r\nSTATUS: APPROVED\r\nOwner signed\r\n',
   scoring:'\n4 pts try\n\n2 conversion\n',bylaws:'<svg onload=alert(1)>'});
 assert.equal(d.valid,true);
 assert.match(d.copyText,/Organiser response or decision reference:\n  \| STATUS: APPROVED Owner signed/);
 assert.match(d.copyText,/STATE: DRAFT ONLY — NOT APPROVED/);
 assert.equal(d.mayEnableScoring,false);
 assert.equal(d.saved,false);
 assert.doesNotMatch(d.copyText,/PRIVATE MEDICAL NOTE/);
});
test('P11F bounds input and does not leak extra personal fields',()=>{
 const a={scoring:'x'.repeat(3000),phone:'0400000000',
  contact:'hidden@example.org',players:['PRIVATE PERSON'],role:'Owner'};
 const d=draft(request(),a);
 assert.equal(d.fields.scoring.length,1400);
 assert.equal(d.fields.phone,undefined);
 assert.doesNotMatch(d.copyText,/0400000000|hidden@example.org|PRIVATE PERSON/);
});
test('P11F forged or already approved checklist cannot authorise an evidence packet',()=>{
 for(const a of [null,{}, {scope:{}}, {...request(),ownerApproved:true},
   {...request(),readyForScorekeeping:true}])assert.throws(()=>draft(a),/draft-only scoped/);
});
