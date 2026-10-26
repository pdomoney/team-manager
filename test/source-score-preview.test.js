import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceScorePreviewPolicy as policy,calculateSourceScorePreview as calc}
from '../site/source-score-preview.js';
const league=policy({sport:'Rugby league',rules:'league/men'});
const tag=policy({sport:'League tag',rules:'league-tag/15'});
const zeros=p=>Object.fromEntries(p.events.map(e=>[e.id,'0']));
test('P11C international rugby league breakdown uses explicit selected source only',()=>{
 assert.equal(league.id,'league-international');
 assert.deepEqual(league.events.map(e=>[e.id,e.points]),[
 ['tries',4],['conversions',2],['penaltyGoals',2],
 ['fieldGoals',1],['twoPointFieldGoals',2]]);
 assert.equal(league.source.checked,'2026-10-18');
 assert.equal(league.persistable,false);
 assert.equal(league.changesWorkspace,false);
 assert.ok(Object.isFrozen(league)&&Object.isFrozen(league.events));
 const before={us:{...zeros(league),tries:'2',conversions:'1',fieldGoals:'1',
   twoPointFieldGoals:'1'},them:{...zeros(league),tries:'1',penaltyGoals:'1'}};
 const same=structuredClone(before);
 const score=calc(league,before);
 assert.deepEqual([score.us,score.them],[13,6]);
 assert.equal(score.canSave,false);
 assert.deepEqual(before,same);
});
test('P11C League tag 15+ has drop goal; no borrowed 40m field goal',()=>{
 assert.equal(tag.id,'league-tag-15');
 assert.deepEqual(tag.events.map(e=>[e.id,e.points]),[
 ['tries',4],['conversions',2],['penaltyGoals',2],['dropGoals',1]]);
 assert.equal(tag.events.some(x=>x.id==='twoPointFieldGoals'),false);
 const result=calc(tag,{us:{...zeros(tag),tries:'1',dropGoals:'2'},
   them:{...zeros(tag),tries:'1',conversions:'1'}});
 assert.deepEqual([result.us,result.them],[6,6]);
});
test('P11C juniors, unknown sports, default inferred grades and cross-sport rules fail closed',()=>{
 for(const team of [
  {sport:'Rugby league'}, {sport:'Rugby league',rules:'league/u6'},
  {sport:'Rugby league',rules:'league/u8'},{sport:'Rugby league',rules:'league/u13-14'},
  {sport:'League tag',rules:'league-tag/10-12'},
  {sport:'Touch football',rules:'league/men'},
  {sport:'Netball',rules:'league/men'},
  {sport:'Rugby league',rules:'league-tag/15'},
  {sport:'League tag',rules:'league/men'},
  {sport:'Oztag',rules:'oztag/mixed'},null,'Rugby league']){
   assert.equal(policy(team),null,JSON.stringify(team));
 }
});
test('P11C invalid counts, fractions, negatives, blank and surprise policy rejected',()=>{
 const valid={us:zeros(league),them:zeros(league)};
 for(const value of ['','-1','1.5','1e4','100','00','2x',' 3 ',Infinity,NaN,null]){
  const candidate=structuredClone(valid);candidate.us.tries=value;
  assert.equal(calc(league,candidate),null,String(value));
 }
 assert.equal(calc({...league,events:tag.events},valid),null);
 assert.equal(calc(null,valid),null);
 assert.equal(calc(tag,valid),null);
 assert.equal(calc(league,{us:{...zeros(league)}}),null);
 assert.equal(calc(league,{us:[],them:{}}),null);
});
test('P11C integer bounds and unaltered event schema cover edge cases',()=>{
 const counts=zeros(league);
 for(const e of league.events)counts[e.id]=99;
 const score=calc(league,{us:counts,them:zeros(league)});
 assert.equal(score.us,99*11);
 assert.equal(score.them,0);
 assert.equal(score.canSave,false);
 assert.ok(Object.isFrozen(score));
});
