import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
Object.defineProperty(globalThis,'crypto',{value:webcrypto});
const originalLog=console.log;
globalThis.location={origin:'https://example.test'};
const html='<html><head></head><body>fixture</body></html>';
const opaque='<script src="/'+ 'a'.repeat(140)+'"></script>';
let mode='exact',last;
console.log=s=>{last=JSON.parse(s)};
globalThis.fetch=async(path,opts)=>{
 assert.equal(opts.credentials,'omit');assert.equal(opts.redirect,'error');
 let body,status=200;
 if(path==='/team'){body=mode==='injected'?html.replace('<head>','<head>'+opaque):html;}
 else if(path==='/app.js'){body='console.log(1)';if(mode==='wrong')body='wrong';}
 else if(path==='/api/stage3d5/v1/team'){status=mode==='authfail'?200:401;body=JSON.stringify({ok:false,code:'unauthenticated',canProceed:false});}
 else throw Error('unexpected path');
 const r=new Response(body,{status,headers:{'content-type':path==='/team'?'text/html':'application/json'}});Object.defineProperty(r,'url',{value:location.origin+path});return r;
};
// Exercise the actual Python generator, not a hand-copied JavaScript fixture.
const generator=spawnSync('python3',['-B','-c',`from asset_verification import browser_code,digest
print(browser_code('https://example.test',{'/team.html':digest(b'<html><head></head><body>fixture</body></html>'),'/app.js':digest(b'console.log(1)')}))`],{cwd:fileURLToPath(new URL('.',import.meta.url)),encoding:'utf8'});
assert.equal(generator.status,0,generator.stderr);
const run=()=>vm.runInThisContext(generator.stdout,{filename:'generated-browser-check.js'});
await run();assert.equal(last.status,'PASS');assert.equal(last.passed,2);
mode='injected';await run();assert.equal(last.status,'HOLD');assert.equal(last.assets[0].reason,'ORIGINAL_BYTES_RECOVERED_SCRIPT_PROVENANCE_HOLD');assert.equal(last.passed,1);
mode='wrong';await run();assert.equal(last.status,'HOLD');assert.equal(last.passed,1);
mode='authfail';await run();assert.equal(last.status,'HOLD');assert.equal(last.anonymousAuth.expectedDenial,false);
originalLog('PASS: 4 mocked browser execution cases');
