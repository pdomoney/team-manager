import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../site/app.js',import.meta.url),'utf8');
test('role workspace sections use actual click actions, not inert span labels',()=>{
 assert.ok(app.includes('data-act="qa-role-section"'));
 assert.match(app,/'qa-role-section': el =>/);
 assert.match(app,/x\?\.sections\.includes\(el\.dataset\.section\)/);
});
test('role section click is admitted by synthetic preview action boundary',()=>{
 assert.match(app,/'desktop-profile-exit','qa-role-section'/);
});
