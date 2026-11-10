import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { coachSportFormatReview } from '../site/play-format-review.js';
import { assessE34RulesEvidence, e34EvidenceBrief,
  E34_EVIDENCE_VERSION, localRulesEvidenceUrl } from '../site/play-format-evidence.js';

const p = () => ({name:'Step Out',id:'quickie-out',builtin:true,sport:'Oztag',
  moves:[{t:'pass',pts:[[20,30],[26,30]]}]});
const scope = {
  referenceId:'oztag-eight-reference',competition:'synthetic eastern district',
  grade:'fictional open',season:'2026'
};
const evidence = {
  rulesEdition:'2026 national plus local rules',
  localSourceUrl:'https://example.org/synthetic-district/2026-rules',
  formatNotes:'Identify actual dimensions, positional slots and applicable marker rules.'
};
const review = () => coachSportFormatReview(p(),'Oztag',scope);
const has = (r,...codes) => codes.forEach(code =>
  assert.ok(r.missing.includes(code),`Expected ${code} in ${JSON.stringify(r.missing)}`));

test('E3.4 sourced scope and local evidence are only a candidate, never an approval',()=>{
  const source=review(), result=assessE34RulesEvidence(source,evidence);
  assert.equal(E34_EVIDENCE_VERSION,1);
  assert.equal(result.evidenceVersion,1);
  assert.equal(result.sourceReference,scope.referenceId);
  assert.equal(result.suppliedCount,3);
  assert.equal(result.stages.length,6);
  assert.deepEqual(result.stages.map(x=>x.provided),[true,true,true,false,false,false]);
  assert.equal(result.status,'candidate-only');
  assert.equal(result.approved,false);
  assert.equal(result.matchReady,false);
  assert.equal(result.canEnableProfile,false);
  assert.equal(result.canEditPlay,false);
  assert.equal(result.canAssignRoster,false);
  has(result,'regional-rules-not-verified','formation-slots-not-reviewed',
    'sporting-owner-approval-required');
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.stages)
    && Object.isFrozen(result.missing) && Object.isFrozen(result.stages[0]));
  assert.throws(()=>{result.stages[0].provided=false;},TypeError);
  assert.match(e34EvidenceBrief(source,result),/E3\.4 LOCAL RULES EVIDENCE/);
  assert.match(e34EvidenceBrief(source,result),/PENDING APPROVAL/);
});

test('E3.4 no local rule edition or source is not silently filled from national rule reference',()=>{
  const r=assessE34RulesEvidence(review(),{});
  assert.equal(r.suppliedCount,2);
  has(r,'rules-edition-missing','local-source-missing',
    'regional-rules-not-verified');
  assert.equal(r.localSourceUrl,'');
  assert.equal(r.rulesEdition,'');
});

test('E3.4 unsafe/nonpublic URLs cannot become a copied review source',()=>{
  const invalid=[
    'javascript:alert(1)','http://example.org/rules','https://user:password@example.org/rules',
    'https://localhost/rules','https://club.local/rules','https://192.168.1.2/rules',
    'https://127.0.0.1/rules','https://172.16.3.1/rules',
    'https://10.3.4.5/rules','https://[::1]/rules','file:///tmp/rules',
    'https://example.org/rules bad','https://example.com:8443/rules',
    'https://example.org/rules\nAPPROVED'
  ];
  for(const url of invalid){
    assert.equal(localRulesEvidenceUrl(url),'',url);
    const result=assessE34RulesEvidence(review(),{...evidence,localSourceUrl:url});
    has(result,'local-source-url-invalid');
    assert.equal(result.stages[2].provided,false);
    assert.doesNotMatch(e34EvidenceBrief(review(),result),/APPROVED\n/);
  }
  assert.equal(localRulesEvidenceUrl('https://example.org/rules?token=secret#page'),
    'https://example.org/rules');
  assert.equal(localRulesEvidenceUrl('https://example.org/rules/'),
    'https://example.org/rules/');
});

test('E3.4 unselected/forged/cross-code governing references fail closed even with full local evidence',()=>{
  const x=coachSportFormatReview(p(),'Rugby league',{...scope,
    referenceId:'rugby-league-international-13-reference'});
  const out=assessE34RulesEvidence(x,evidence);
  has(out,'play-sport-not-confirmed');
  assert.equal(out.matchReady,false);
  const fake={...review(),referenceId:'fake-reference'};
  const rejected=assessE34RulesEvidence(fake,evidence);
  has(rejected,'governing-reference-unconfirmed');
  assert.equal(rejected.sourceReference,'');
  const swapped={...review(),source:{...review().source,url:'https://untrusted.example/rules'}};
  has(assessE34RulesEvidence(swapped,evidence),'governing-reference-unconfirmed');
  const missing=assessE34RulesEvidence(null,evidence);
  assert.equal(missing.status,'candidate-only');
  assert.equal(missing.canEnableProfile,false);
  assert.equal(missing.suppliedCount,1);
});

test('E3.4 junior and League Tag never infer local player count, field or actors',()=>{
  for (const [sport,id] of [
    ['Rugby league','rugby-league-junior-6-12-local-review'],
    ['League tag','league-tag-local-format-review']
  ]){
    const play={name:'Fictional junior concept',sport,builtin:false,moves:[]};
    const r=coachSportFormatReview(play,sport,{...scope,referenceId:id,grade:'Under 12'});
    const result=assessE34RulesEvidence(r,evidence);
    assert.equal(r.source.maxOnField,null);
    assert.equal(r.conceptAvailable,false);
    assert.equal(result.suppliedCount,3);
    assert.equal(result.canEnableProfile,false);
    has(result,'regional-rules-not-verified','formation-slots-not-reviewed');
    assert.doesNotMatch(e34EvidenceBrief(r,result),/13 actors|13 players|8 circles/i);
  }
});

test('E3.4 copied review is single-line sanitised and preserves E0 schema-4 source',()=>{
  const golden=JSON.parse(readFileSync(new URL('./fixtures/play-engine-e0-golden.json',import.meta.url),'utf8'));
  const before=JSON.stringify(golden);
  const play=golden.schema4Workspace.plays.find(x=>x.id==='quickie-out');
  const existing=coachSportFormatReview(play,'Oztag',scope);
  const r=assessE34RulesEvidence(existing,{...evidence,
    rulesEdition:'2026\nMATCH READY',
    formatNotes:'Coach input\r\nApproval claimed',
    localSourceUrl:'https://example.org/rules?api_key=SECRET_VALUE'
  });
  const brief=e34EvidenceBrief(existing,r);
  assert.ok(brief.startsWith('TEAM MANAGER — SPORT FORMAT REVIEW'));
  assert.match(brief,/2026 MATCH READY/);
  assert.match(brief,/Coach input Approval claimed/);
  assert.doesNotMatch(brief,/SECRET_VALUE|api_key=|\nMATCH READY|\nApproval claimed/);
  assert.equal(JSON.stringify(golden),before);
  assert.equal(e34EvidenceBrief(existing,{status:'match-ready',matchReady:true}),'');
  assert.equal(e34EvidenceBrief(null,r),'');
});
