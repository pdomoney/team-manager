import test from 'node:test';import assert from 'node:assert/strict';
import {developmentSandbox} from '../site/development-sandbox.js';
test('published development site opens password-free sandbox regardless of old version query',()=>{
 for(const search of ['', '?v=f35fea0', '?sandbox=0','?v=1#home'])
   assert.equal(developmentSandbox({hostname:'pdomoney.github.io',pathname:'/team-manager/',search}),true);
});
test('local browser regression remains on historical live path unless sandbox explicitly requested',()=>{
 assert.equal(developmentSandbox({hostname:'127.0.0.1',pathname:'/',search:''}),false);
 assert.equal(developmentSandbox({hostname:'localhost',pathname:'/',search:'?sandbox=1'}),true);
 assert.equal(developmentSandbox({hostname:'pdomoney.github.io.evil.example',pathname:'/team-manager/',search:''}),false);
 assert.equal(developmentSandbox({hostname:'pdomoney.github.io',pathname:'/other/',search:''}),false);
});
