import test from 'node:test';
import assert from 'node:assert/strict';
import { TRANSFER_SPORTS, playMechanics, transferGuide, transferBrief } from '../site/play-transfer.js';

const sample = {name:'Quickie Out',headline:'Draw the marker and attack the space.',steps:'Dummy half passes to a runner.',
 moves:[{t:'run',pts:[[0,1],[1,2]]},{t:'pass',pts:[[1,2],[2,3]]},{t:'shift',pts:[[3,4],[4,5]]}] };

test('identifies only drawn and explicitly described reusable mechanics', () => {
 const result=playMechanics(sample);
 assert.ok(result.some(x=>x.key==='pass'&&x.basis==='Drawn movement'));
 assert.ok(result.some(x=>x.key==='run'));
 assert.ok(result.some(x=>x.key==='half'&&x.basis.includes('coach to confirm')));
 assert.equal(result.some(x=>x.key==='kick'),false);
});

test('all target rugby codes have reviewed explicit requirements and never claim a converted diagram',()=>{
 for(const from of TRANSFER_SPORTS)for(const to of TRANSFER_SPORTS){
  const g=transferGuide(sample,from,to);
  if(from===to){assert.equal(g,null);continue}
  assert.equal(g.source,from);assert.equal(g.target,to);
  assert.equal(g.adjustments.length,4);
  assert.ok(g.warnings.some(w=>w.includes('eight Oztag-shaped')));
  assert.ok(transferBrief(sample,g).includes('Not a match-ready formation'));
  assert.ok(transferBrief(sample,g).includes('CONCEPT ONLY'));
 }
});

test('touch football flags kicks and union flags league restarts',()=>{
 const kick={...sample,moves:[...sample.moves,{t:'kick',pts:[[1,2],[3,4]]}]};
 assert.ok(transferGuide(kick,'Oztag','Touch football').warnings.some(x=>x.includes('kick')));
 assert.ok(transferGuide(sample,'Oztag','Rugby union').warnings.some(x=>x.includes('union tackle')));
 assert.equal(transferGuide(kick,'Oztag','Rugby league').warnings.some(x=>x.includes('Do not carry the kick')),false);
});
test('source and target validation prevents misleading translation',()=>{
 assert.equal(transferGuide(sample,'Oztag','Netball'),null);
 assert.equal(transferGuide(sample,'Oztag','Oztag'),null);
 assert.equal(transferGuide(sample,'Oztag','Rugby league').detected.some(x=>x.key==='kick'),false);
});
test('multi-phase movements contribute ideas without modifying input',()=>{
 const play={...sample,phases:[{moves:[{t:'dummy'}],steps:'Wrap around the back'}]};
 const b=JSON.stringify(play);
 const keys=playMechanics(play).map(x=>x.key);
 assert.ok(keys.includes('dummy'));assert.ok(keys.includes('wrap'));
 assert.equal(JSON.stringify(play),b);
});
test('coach note copied as distinct review, source remains unmodified',()=>{
 const b=JSON.stringify(sample),g=transferGuide(sample,'Touch football','Rugby league');
 const text=transferBrief(sample,g,'Use a second receiver but do not assume the dummy half can score.');
 assert.ok(text.includes('second receiver'));assert.ok(text.includes('Rugby league'));
 assert.equal(JSON.stringify(sample),b);
});
