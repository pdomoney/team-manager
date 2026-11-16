import test from 'node:test';
import assert from 'node:assert/strict';
import {createFirstTeamServerBoundary,FIRST_TEAM_SERVER_ACTIONS} from '../src/first-team-server-boundary.js';

// All IDs, accounts, grants, people and transactions in this test are invented.
// This is an adapter contract test, NOT proof of real IdP signing, RLS or DB
// transaction isolation. Real-server P13B/C qualification remains outstanding.
const NOW='2026-11-16T09:00:00Z';
const grant=(accountId,role,teamId='comets-u16')=>({
  accountId,role,scopeType:'team',scopeId:teamId,
  status:'active',approvedBy:'club-reviewer',policyVersion:1,
  validFrom:'2026-11-15T00:00:00Z',expiresAt:'2026-12-15T00:00:00Z'
});
const resource=(id,type='team',teamId='comets-u16',other={})=>({
  id,type,teamId,status:'active',classification:'routine',minorData:false,...other
});
function world(){
  const state={
    accountId:'acct-coach',
    identities:new Map([
      ['coach', {accountId:'acct-coach',status:'active',verified:true,expiresAt:'2026-11-17T00:00:00Z'}],
      ['assistant',{accountId:'acct-assistant',status:'active',verified:true,expiresAt:'2026-11-17T00:00:00Z'}],
      ['manager',{accountId:'acct-manager',status:'active',verified:true,expiresAt:'2026-11-17T00:00:00Z'}],
      ['player',{accountId:'acct-player',status:'active',verified:true,expiresAt:'2026-11-17T00:00:00Z'}],
      ['volunteer',{accountId:'acct-volunteer',status:'active',verified:true,expiresAt:'2026-11-17T00:00:00Z'}],
      ['viewer',{accountId:'acct-viewer',status:'active',verified:true,expiresAt:'2026-11-17T00:00:00Z'}]
    ]),
    resources:new Map([
      ['comets-u16',resource('comets-u16')],
      ['rangers-u16',resource('rangers-u16','team','rangers-u16')],
      ['published',resource('published','play','comets-u16',{publicationState:'published',publishedRevisionId:'rev1'})],
      ['draft',resource('draft','play','comets-u16',{publicationState:'draft'})],
      ['other-play',resource('other-play','play','rangers-u16',{publicationState:'published',publishedRevisionId:'rev1'})],
      ['reply-player',resource('reply-player','availability','comets-u16',{personId:'person-player'})],
      ['reply-other',resource('reply-other','availability','comets-u16',{personId:'person-different'})],
      ['duty-vol',resource('duty-vol','duty','comets-u16',{personId:'person-volunteer'})],
      ['duty-other',resource('duty-other','duty','comets-u16',{personId:'person-different'})]
    ]),
    grants:[
      grant('acct-coach','team_coach'),grant('acct-assistant','team_assistant'),
      grant('acct-manager','team_manager'),grant('acct-player','team_player'),
      grant('acct-volunteer','team_volunteer'),grant('acct-viewer','team_play_viewer')
    ],
    links:new Map([
      ['acct-player',{accountId:'acct-player',personId:'person-player',status:'verified',verifiedBy:'registrar'}],
      ['acct-volunteer',{accountId:'acct-volunteer',personId:'person-volunteer',status:'verified',verifiedBy:'registrar'}]
    ]),
    participations:new Map([
      ['person-player:comets-u16',{personId:'person-player',teamId:'comets-u16',kind:'player',status:'active',verifiedBy:'registrar'}]
    ]),
    duties:new Map([
      ['person-volunteer:duty-vol',{id:'duty-vol',teamId:'comets-u16',personId:'person-volunteer',status:'assigned',approvedBy:'manager'}]
    ]),
    audited:[],executed:[],fail:'',trace:[]
  };
  const adapter={
    async transaction(fn){
      state.trace.push('transaction');
      const tx={
        async verifySession(token){state.trace.push('session');if(state.fail==='session')throw Error('SENSITIVE-SESSION');return state.identities.get(token);},
        async loadResource(type,id){state.trace.push('resource');if(state.fail==='resource')throw Error('PRIVATE-ROW');const r=state.resources.get(id);return r?.type===type?r:null;},
        async loadGrants(accountId){state.trace.push('grants');if(state.fail==='grants')throw Error('PRIVATE-GRANTS');return state.grants.filter(g=>g.accountId===accountId);},
        async loadPersonLink(accountId){state.trace.push('link');return state.links.get(accountId);},
        async loadParticipation(personId,teamId){state.trace.push('participation');return state.participations.get(personId+':'+teamId);},
        async loadDuty(personId,dutyId){state.trace.push('duty');return state.duties.get(personId+':'+dutyId);},
        async auditDecision(record){state.trace.push('audit');if(state.fail==='audit')throw Error('PRIVATE-AUDIT');state.audited.push(record);},
        async executeAuthorized(record){state.trace.push('execute');if(state.fail==='execute')throw Error('PRIVATE-SQL');state.executed.push(record);return {success:true};}
      };
      return fn(tx);
    },
    clock:()=>NOW
  };
  const boundary=createFirstTeamServerBoundary(adapter);
  const ask=(token,role,action,resourceId,teamId='comets-u16',payload={})=>
    boundary.run({token,activeRole:role,activeTeamId:teamId,action,resourceId,payload});
  return {state,adapter,boundary,ask};
}
const cases=[
  ['coach','team_coach','schedule.read','comets-u16'],
  ['coach','team_coach','schedule.edit','comets-u16'],
  ['coach','team_coach','roster.edit','comets-u16'],
  ['manager','team_manager','schedule.edit','comets-u16'],
  ['manager','team_manager','duty.assign','comets-u16'],
  ['coach','team_coach','play.draft.edit','draft'],
  ['coach','team_coach','play.publish','draft'],
  ['assistant','team_assistant','play.draft.read','draft'],
  ['assistant','team_assistant','play.draft.edit','draft'],
  ['player','team_player','schedule.read','comets-u16'],
  ['player','team_player','play.published.read','published'],
  ['player','team_player','availability.reply','reply-player'],
  ['volunteer','team_volunteer','duty.read','duty-vol'],
  ['volunteer','team_volunteer','duty.reply','duty-vol'],
  ['viewer','team_play_viewer','play.published.read','published']
];
test('provider-neutral actions are explicit, bounded and do not include wildcard admin/export access',()=>{
  assert.equal(FIRST_TEAM_SERVER_ACTIONS.length,11);
  for(const forbidden of ['admin.*','private.export','medical.read','guardian.impersonate','play.delete'])
    assert.equal(FIRST_TEAM_SERVER_ACTIONS.includes(forbidden),false);
});
test('individual verified roles may perform only their exact-team journey with server-side records',async()=>{
  for(const [token,role,action,id] of cases){
    const {state,ask}=world();
    const result=await ask(token,role,action,id);
    assert.equal(result.allowed,true,token+':'+action+':'+result.code);
    assert.equal(result.value.success,true);
    assert.deepEqual(state.trace.slice(0,4),['transaction','session','resource','grants']);
    assert.equal(state.audited.length,1);
    assert.equal(state.audited[0].decision,'ALLOW');
    assert.equal(state.executed.length,1);
    assert.equal(state.executed[0].role,role);
    assert.equal(state.executed[0].teamId,'comets-u16');
    assert.equal(JSON.stringify(state.audited).includes(token),false,'session credential must not be logged');
  }
});
test('no adapter or malformed request can perform an action',async()=>{
  assert.throws(()=>createFirstTeamServerBoundary(),/trusted transactional backend/);
  const {state,boundary,ask}=world();
  for(const r of [null,{},[],{token:'coach',activeRole:'team_coach',activeTeamId:'comets-u16',
      action:'admin.*',resourceId:'comets-u16'},{
      token:'coach',activeRole:'team_coach',activeTeamId:'comets-u16',
      action:'schedule.read',resourceId:'comets-u16',accountId:'acct-coach'
    },{
      token:'coach',activeRole:'team_coach',activeTeamId:'comets-u16',
      action:'schedule.read',resourceId:'comets-u16',isAdmin:true
    }]){
    assert.equal((await boundary.run(r)).allowed,false);
  }
  assert.equal((await ask('', 'team_coach','schedule.read','comets-u16')).allowed,false);
  assert.equal(state.executed.length,0);
});
test('browser selected role and team can narrow a real grant but cannot invent one',async()=>{
  const {state,ask}=world();
  assert.equal((await ask('coach','team_manager','schedule.edit','comets-u16')).allowed,false);
  assert.equal((await ask('manager','team_coach','play.publish','draft')).allowed,false);
  assert.equal((await ask('coach','team_coach','schedule.read','rangers-u16','comets-u16')).allowed,false);
  assert.equal((await ask('coach','team_coach','schedule.read','rangers-u16','rangers-u16')).allowed,false);
  state.grants.push(grant('acct-coach','team_manager','rangers-u16'));
  assert.equal((await ask('coach','team_manager','schedule.read','rangers-u16','rangers-u16')).allowed,true);
  assert.equal((await ask('coach','team_coach','schedule.read','rangers-u16','rangers-u16')).allowed,false);
});
test('pending/revoked/expired/self-approved/foreign grants never create authorization',async()=>{
  const mutations=[
    g=>{g.status='pending';},g=>{g.status='revoked';},g=>{g.expiresAt='2026-11-15T00:00:00Z';},
    g=>{g.validFrom='2026-11-17T00:00:00Z';},g=>{g.approvedBy='acct-coach';},
    g=>{g.approvedBy='';},g=>{g.policyVersion=99;},g=>{g.scopeId='rangers-u16';},
    g=>{g.scopeType='club';},g=>{g.accountId='acct-other';},g=>{g.expiresAt='2026-11-31T00:00:00Z';}
  ];
  for(const mutate of mutations){
    const {state,ask}=world();mutate(state.grants[0]);
    const result=await ask('coach','team_coach','play.publish','draft');
    assert.equal(result.allowed,false,result.code);
    assert.equal(state.executed.length,0);
  }
});
test('player can reply only for verified own person and team membership, not another player',async()=>{
  const {state,ask}=world();
  assert.equal((await ask('player','team_player','availability.reply','reply-other')).code,'not-own-availability');
  assert.equal((await ask('player','team_player','roster.edit','comets-u16')).allowed,false);
  assert.equal((await ask('player','team_player','play.draft.read','draft')).allowed,false);
  assert.equal((await ask('player','team_player','play.publish','draft')).allowed,false);
  state.links.get('acct-player').status='reported';
  assert.equal((await ask('player','team_player','availability.reply','reply-player')).code,'unverified-person-link');
  state.links.get('acct-player').status='verified';
  state.participations.get('person-player:comets-u16').status='proposed';
  assert.equal((await ask('player','team_player','availability.reply','reply-player')).code,'no-verified-team-participation');
  assert.equal(state.executed.length,0);
});
test('volunteer requires separately verified identity and assigned duty, not accreditation or appointment alone',async()=>{
  const {state,ask}=world();
  assert.equal((await ask('volunteer','team_volunteer','duty.reply','duty-other')).allowed,false);
  assert.equal((await ask('volunteer','team_volunteer','schedule.edit','comets-u16')).allowed,false);
  assert.equal((await ask('volunteer','team_volunteer','play.published.read','published')).allowed,false);
  assert.equal((await ask('volunteer','team_volunteer','play.publish','draft')).allowed,false);
  state.duties.get('person-volunteer:duty-vol').status='withdrawn';
  assert.equal((await ask('volunteer','team_volunteer','duty.reply','duty-vol')).code,'duty-not-independently-assigned');
  state.duties.get('person-volunteer:duty-vol').status='assigned';
  state.duties.get('person-volunteer:duty-vol').expiresAt='2026-11-15T00:00:00Z';
  assert.equal((await ask('volunteer','team_volunteer','duty.read','duty-vol')).allowed,false);
  assert.equal(state.executed.length,0);
});
test('published play is visible to authorised team users; drafts stay coach-side',async()=>{
  const {state,ask}=world();
  assert.equal((await ask('player','team_player','play.published.read','draft')).code,'unpublished-play');
  assert.equal((await ask('viewer','team_play_viewer','play.draft.read','draft')).allowed,false);
  assert.equal((await ask('manager','team_manager','play.publish','draft')).allowed,false);
  assert.equal((await ask('assistant','team_assistant','play.publish','draft')).allowed,false);
  state.resources.get('published').publishedRevisionId='';
  assert.equal((await ask('player','team_player','play.published.read','published')).code,'unpublished-play');
  assert.equal((await ask('coach','team_coach','play.publish','published')).code,'not-a-draft');
});
test('private health/minor/safeguarding records are always excluded until separately approved',async()=>{
  const {state,ask}=world();
  for(const classification of ['medical','safeguarding','personal-contact','minor-private','unknown']){
    state.resources.get('comets-u16').classification=classification;
    assert.equal((await ask('coach','team_coach','schedule.read','comets-u16')).code,'protected-data-not-authorised');
  }
  state.resources.get('comets-u16').classification='routine';
  state.resources.get('comets-u16').minorData=true;
  assert.equal((await ask('player','team_player','schedule.read','comets-u16')).code,'protected-data-not-authorised');
  assert.equal(state.executed.length,0);
});
test('identity must be active, verified and unexpired on every request',async()=>{
  const {state,ask}=world();
  for(const change of [
    x=>{x.status='disabled';},x=>{x.verified=false;},x=>{x.expiresAt=NOW;},
    x=>{x.expiresAt='2026-11-15T00:00:00Z';},x=>{x.accountId='';}
  ]){
    const original=structuredClone(state.identities.get('coach'));
    change(state.identities.get('coach'));
    assert.equal((await ask('coach','team_coach','schedule.read','comets-u16')).code,'unauthenticated');
    state.identities.set('coach',original);
  }
  assert.equal((await ask('invalid-token','team_coach','schedule.read','comets-u16')).code,'unauthenticated');
  assert.equal(state.executed.length,0);
});
test('backend, policy store, audit and executor faults cannot authorize or disclose private errors',async()=>{
  for(const fail of ['session','resource','grants','audit','execute']){
    const {state,ask}=world();state.fail=fail;
    const result=await ask('coach','team_coach','schedule.read','comets-u16');
    assert.deepEqual(result,{allowed:false,code:'trusted-backend-failure'});
    assert.equal(JSON.stringify(result).includes('PRIVATE-'),false);
    if(fail!=='execute')assert.equal(state.executed.length,0);
  }
});
test('an adapter without mandatory transactional methods fails closed',async()=>{
  const boundary=createFirstTeamServerBoundary({
    clock:()=>NOW,
    transaction:async fn=>fn({verifySession:async()=>({accountId:'fake',verified:true})})
  });
  assert.deepEqual(await boundary.run({
    token:'some',action:'schedule.read',resourceId:'comets-u16',
    activeTeamId:'comets-u16',activeRole:'team_coach'
  }),{allowed:false,code:'missing-trusted-adapter'});
});
