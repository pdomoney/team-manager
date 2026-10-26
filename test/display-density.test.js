import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDensity, mayUseCompactDensity, activeDensity } from '../site/display-density.js';

test('display density defaults to readable comfortable mode for missing and forged preferences',()=>{
  for(const x of [undefined,null,'',false,'small','zoom:0.8','scale(0.8)','__proto__']){
    assert.equal(normalizeDensity(x),'comfortable');
  }
  assert.equal(normalizeDensity('compact'),'compact');
  assert.equal(normalizeDensity('comfortable'),'comfortable');
});
test('desktop density only activates when wide layout has sufficient CSS viewport width',()=>{
  for(const width of [0,320,390,768,999]){
    assert.equal(mayUseCompactDensity(true,width),false);
    assert.equal(activeDensity('compact',true,width),'comfortable');
  }
  assert.equal(mayUseCompactDensity(true,1000),true);
  assert.equal(activeDensity('compact',true,1000),'compact');
  assert.equal(activeDensity('compact',true,1600),'compact');
  assert.equal(activeDensity('compact',false,1600),'comfortable');
  assert.equal(activeDensity('comfortable',true,1600),'comfortable');
});
test('desktop density module does not read or alter the data model or browser zoom',()=>{
  assert.equal(activeDensity('compact',true,1600),'compact');
  assert.equal(activeDensity('compact',false,390),'comfortable');
});
