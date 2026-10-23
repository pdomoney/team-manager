import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bar,computeProgress,phaseBlock,roadmapBlock,replaceBlock,
  ISSUE_START,ISSUE_END,ROADMAP_START,ROADMAP_END,updateProgress
} from '../scripts/update-issue-progress.mjs';

const p06={phase:'P06',issue:48,pulls:[69,70,71,72,73,74,75,76]};
const issue=(state='open',body='Original issue body',state_reason='')=>({state,body,state_reason});
test('progress is based on fixed, named milestones rather than arbitrary merge count',()=>{
 const merged=new Set(p06.pulls);
 const p=computeProgress(issue(),p06,merged);
 assert.equal(p.complete,73);
 assert.equal(p.remaining,27);
 assert.equal(p.done,8);
 assert.equal(p.total,11);
 assert.equal(p.accepted,false);
 assert.equal(p.manual,false);
 assert.equal(p.owner,false);
});
test('each merged planned PR advances progress; unplanned PRs cannot inflate completion',()=>{
 const a=computeProgress(issue(),p06,new Set([69,70,71,72,73,74,75]));
 const b=computeProgress(issue(),p06,new Set([69,70,71,72,73,74,75,76,999]));
 assert.ok(b.complete>a.complete);
 assert.equal(b.merged,8);
});
test('phase acceptance checkboxes advance independently of merged PRs',()=>{
 const body='- [x] Required Safari/mobile and representative user-journey tests recorded\n'+
 '- [x] **Product owner explicitly accepts this phase and the exact PR head**';
 const p=computeProgress(issue('open',body),p06,new Set(p06.pulls));
 assert.equal(p.done,10);
 assert.equal(p.complete,91);
 assert.equal(p.remaining,9);
});
test('only completed closed issues reach 100%; not-planned closure does not masquerade as completion',()=>{
 assert.equal(computeProgress(issue('closed','', 'completed'),p06,new Set()).complete,100);
 const deferred=computeProgress(issue('closed','', 'not_planned'),p06,new Set(p06.pulls));
 assert.equal(deferred.complete,0);
 assert.equal(deferred.deferred,true);
});
test('unscoped future issue is an explicit planning placeholder, not an effort claim',()=>{
 const p=computeProgress(issue(),{phase:'P07',issue:49,pulls:[]},new Set());
 assert.equal(p.unscoped,true);
 assert.equal(p.complete,0);
 assert.match(phaseBlock(p),/planning placeholder/i);
});
test('progress bar and remaining percentage stay within limits',()=>{
 assert.equal(bar(0,11).length,20);
 assert.equal(bar(11,11),'█'.repeat(20));
 assert.equal(bar(0,11),'░'.repeat(20));
 const p=computeProgress(issue(),p06,new Set(p06.pulls));
 assert.match(phaseBlock(p),/73% complete · 27% remaining/);
});
test('marker insertion is idempotent and preserves authored issue text and checkboxes',()=>{
 const content='# User acceptance\n- [ ] Explicit decision';
 const first=replaceBlock(content,ISSUE_START,ISSUE_END,'Hello');
 const next=replaceBlock(first,ISSUE_START,ISSUE_END,'Hello');
 assert.equal(first,next);
 assert.equal((first.match(/team-manager-phase-progress:start/g)||[]).length,1);
 assert.ok(first.includes(content));
 const changed=replaceBlock(first,ISSUE_START,ISSUE_END,'New');
 assert.equal(changed.includes('Hello'),false);
 assert.ok(changed.includes('New'));
 assert.throws(()=>replaceBlock(ISSUE_START,ISSUE_START,ISSUE_END,'x'),/paired/);
});
test('roadmap closes only phases formally accepted; does not close on merged PRs alone',()=>{
 const completed=Array.from({length:6},(_,i)=>computeProgress(issue('closed','', 'completed'),{phase:'P0'+i,issue:42+i,pulls:[]}));
 const other=Array.from({length:5},(_,i)=>computeProgress(issue(),{phase:'P'+String(i+6).padStart(2,'0'),issue:48+i,pulls:[]}));
 const s=roadmapBlock([...completed,...other]);
 assert.match(s,/55% complete · 45% remaining/);
 assert.match(s,/6\/11 phases formally accepted and closed/);
 assert.ok(replaceBlock('Roadmap',ROADMAP_START,ROADMAP_END,s).includes('Roadmap'));
});
test('API changes are skipped on replay and only progress blocks are modified',async()=>{
 const config={roadmapIssue:41,phases:[p06,{phase:'P07',issue:49,pulls:[]}]};
 const entries=new Map([
 [48,issue()], [49,issue()], [41,issue('open','# Owner-authored roadmap')]
 ]);
 const patches=[];
 const client={
   getIssue:async n=>entries.get(n),
   getPull:async n=>({merged_at:n<=76?'2026-10-23T00:00:00Z':null}),
   updateIssue:async(n,body)=>{const val={...entries.get(n),body};entries.set(n,val);patches.push(n);}
 };
 await updateProgress(config,client,{info:()=>{}});
 assert.deepEqual(patches,[48,49,41]);
 assert.ok(entries.get(48).body.includes('27% remaining'));
 assert.ok(entries.get(41).body.includes('# Owner-authored roadmap'));
 await updateProgress(config,client,{info:()=>{}});
 assert.deepEqual(patches,[48,49,41]);
});
