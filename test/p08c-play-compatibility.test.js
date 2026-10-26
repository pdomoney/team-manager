import test from 'node:test';
import assert from 'node:assert/strict';
import { SPORTS } from '../site/model.js';
import { playTeachingCompatibility } from '../site/p08-play-compatibility.js';
import { transferGuide, TRANSFER_SPORTS } from '../site/play-transfer.js';

const team = sport => ({name:'Synthetic team',sport,category:'mixed'});

test('P08C every named sport is classified as a concept-only drawing except genuine Oztag starters',()=>{
 for(const sport of SPORTS){
   const p={id:'test',name:'Coaching idea',sport,moves:[],steps:'Support runner'};
   const ctx=playTeachingCompatibility(p,team(sport));
   assert.equal(ctx.status,'sport-matched',sport);
   assert.equal(ctx.diagramMode,sport==='Oztag'?'oztag-eight-slot':'eight-slot-concept',sport);
   assert.equal(ctx.fullFormationVerified,false);
   assert.equal(ctx.externalApproval,false);
   assert.equal(Object.isFrozen(ctx),true);
   assert.equal(ctx.reviewRequired,sport!=='Oztag',sport);
   assert.equal(ctx.shareRequiresConfirmation,false,sport);
 }
});

test('P08C historical built-in Oztag play is known; an untagged custom play is not',()=>{
 const built=playTeachingCompatibility({builtin:true,id:'starter'},team('Oztag'));
 const old=playTeachingCompatibility({id:'my-own',moves:[]},team('Oztag'));
 assert.equal(built.sourceSport,'Oztag');
 assert.equal(built.status,'sport-matched');
 assert.equal(old.status,'unconfirmed-play-sport');
 assert.equal(old.sourceSport,'');
 assert.equal(old.shareRequiresConfirmation,true);
 assert.match(old.notice,/no confirmed sport/i);
 const oldTouch=playTeachingCompatibility({id:'my-own',moves:[]},team('Touch football'));
 assert.equal(oldTouch.status,'unconfirmed-play-sport');
 assert.equal(oldTouch.diagramMode,'eight-slot-concept');
});

test('P08C mismatched copied play remains identifiable, not certified for target team',()=>{
 const out=playTeachingCompatibility({name:'Oztag source',sport:'Oztag',moves:[{t:'kick'}]},
   team('Touch football'));
 assert.equal(out.status,'cross-sport-review');
 assert.equal(out.sourceSport,'Oztag');
 assert.equal(out.teamSport,'Touch football');
 assert.match(out.notice,/positions, restarts, movement and scoring/);
 assert.equal(out.shareRequiresConfirmation,true);
 assert.equal(out.fullFormationVerified,false);
});

test('P08C a mismatched explicit team rule pack requires review even for a matched Oztag play',()=>{
 const ctx=playTeachingCompatibility({id:'p',sport:'Oztag'}, {...team('Oztag'),rules:'league/men'});
 assert.equal(ctx.status,'sport-matched');
 assert.equal(ctx.rulePackMismatch,true);
 assert.equal(ctx.ruleCoverage,'mismatch-review-required');
 assert.equal(ctx.reviewRequired,true);
 assert.equal(ctx.shareRequiresConfirmation,true);
});

test('P08C unknown team sport or corrupted custom play sport fails closed',()=>{
 const a=playTeachingCompatibility({sport:'Oztag'},team('Unlisted sport'));
 assert.equal(a.status,'unknown-team-sport');
 assert.equal(a.diagramMode,'eight-slot-concept');
 assert.equal(a.shareRequiresConfirmation,true);
 const b=playTeachingCompatibility({sport:'Incorrect spelling'},team('Rugby league'));
 assert.equal(b.status,'unconfirmed-play-sport');
 assert.equal(b.sourceSport,'');
 assert.equal(b.shareRequiresConfirmation,true);
});

test('P08C compatibility only exports safe metadata and cannot mutate the input',()=>{
 const p={id:'p1',sport:'Rugby league',coachNotes:'PRIVATE HEALTH',transferNotes:{other:'SECRET'},
   moves:[{t:'pass',pts:[[1,2],[4,5]]}],phases:[{title:'Private phase'}]};
 const t={...team('Rugby league'),staff:[{name:'PRIVATE STAFF'}],rules:''};
 const bp=JSON.stringify(p),bt=JSON.stringify(t);
 const ctx=playTeachingCompatibility(p,t);
 assert.equal(ctx.diagramMode,'eight-slot-concept');
 assert.equal(ctx.status,'sport-matched');
 assert.equal(ctx.ruleCoverage,'source-backed-pack-needs-local-review');
 assert.equal(JSON.stringify(p),bp);
 assert.equal(JSON.stringify(t),bt);
 assert.doesNotMatch(JSON.stringify(ctx),/PRIVATE|SECRET/);
});

test('P08C translation always needs an explicit valid origin and different valid destination',()=>{
 const p={id:'p1',steps:'Dummy half passes',moves:[{t:'run'}]};
 for(const target of TRANSFER_SPORTS) {
   assert.equal(transferGuide(p,'',target),null);
   assert.equal(transferGuide(p,'Unknown',target),null);
   assert.equal(transferGuide(p,target,target),null);
 }
 const known=transferGuide(p,'Oztag','Touch football');
 assert.equal(known.source,'Oztag');
 assert.equal(known.target,'Touch football');
 assert.ok(known.warnings.some(x=>x.includes('not convert')));
});
