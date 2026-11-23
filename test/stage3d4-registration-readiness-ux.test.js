import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifiedOwnerSetup} from '../site/cloud-owner-status.js';

const team=Object.freeze({teamId:'stgeorge-mixed20',clubRef:'St George Oztag',
  sportRef:'oztag',seasonRef:'2027'});
const owner=Object.freeze({ok:true,code:'ready',team,coachAssigned:true,
  policyReady:false,invitations:[]});
function stub({body=owner,status=200,throwAuth=false}={}){
  const requests=[];const identity={verifiedBearer:async()=>{
    if(throwAuth)throw Error('no verified session');
    return 'synthetic-owner-session-only';}};
  const fetchImpl=async(url,init)=>{
    requests.push({url,init});
    return {ok:status===200,status,json:async()=>body};
  };
  return {identity,fetchImpl,requests};
}
test('recorded Coach grant is visible in restricted founder status without team-data access',async()=>{
  const f=stub();
  const data=await verifiedOwnerSetup(f);
  assert.deepEqual(data,{team,coachAssigned:true,policyReady:false});
  assert.equal(Object.isFrozen(data),true);
  assert.equal(f.requests.length,1);
  assert.equal(f.requests[0].url,'/api/stage3d4/v1/owner');
  assert.equal(f.requests[0].init.method,'POST');
  assert.equal(f.requests[0].init.redirect,'error','browser requests fail closed on redirects');
  assert.equal(JSON.parse(f.requests[0].init.body).action,'status');
  assert.equal(f.requests[0].init.headers.Authorization,'Bearer synthetic-owner-session-only');
});
test('no founder metadata is shown without a verified grant, complete status or session',async()=>{
  for(const input of [
    {status:401,body:{ok:false,code:'unauthenticated'}},
    {status:403,body:{ok:false,code:'scope-denied'}},
    {status:503,body:{ok:false,code:'service-unavailable'}},
    {status:200,body:{ok:true,code:'ready',team,coachAssigned:'yes',policyReady:false}},
    {status:200,body:{...owner,team:{...team,seasonRef:'bogus'}}},
    {status:200,body:{...owner,team:null}},
    {throwAuth:true}
  ]){
    const f=stub(input);
    assert.equal(await verifiedOwnerSetup(f),null,JSON.stringify(input));
    if(input.throwAuth)assert.equal(f.requests.length,0);
  }
});
test('first-team role is never added to ordinary team context before policy',()=>{
  const teamSource=readFileSync('site/cloud-team.js','utf8');
  const login=readFileSync('site/cloud-access.js','utf8');
  const registration=readFileSync('site/cloud-registration.js','utf8');
  const ownerUI=readFileSync('site/cloud-owner.js','utf8');
  const sql=readFileSync('supabase/migrations/20261121010000_stage3d4_founder_admin.sql','utf8');
  assert.match(teamSource,/showOwnerRegistrationPending\(current,founder\)/);
  assert.match(teamSource,/CLOUD_STAGE3D3_POLICY_REQUIRED!==true/);
  assert.equal(teamSource.includes('CLOUD_STAGE3D3_POLICY_REQUIRED!==true||CLOUD_STAGE3C_MODE'),false,
    'connected Stage 3D.3 intentionally preserves Stage 3C tactics presentation flag');
  assert.match(teamSource,/Coach grant recorded/);
  assert.match(login,/showRestrictedOwner/);
  assert.match(login,/workspaceLink.hidden=true/);
  assert.match(registration,/policy-unavailable/);
  assert.match(ownerUI,/Team data remains restricted/);
  assert.match(sql,/tm_private\.stage3d3_registration_ready\(\)/);
  assert.match(sql,/tm_private\.stage3d4_founder_owner\(auth\.uid\(\)\)/);
});
test('owner registration link has a flow row that cannot overprint paragraph text',()=>{
  const html=readFileSync('site/cloud-owner.html','utf8');
  const css=readFileSync('site/cloud-owner.css','utf8');
  assert.match(html,/class="owner-summary-action"/);
  assert.match(css,/\.owner-summary-action\s*\{margin-top:18px;display:flex/);
  assert.match(css,/\.owner-summary-action \.access-secondary\{display:inline-flex/);
});
