import {test} from 'node:test';
import assert from 'node:assert/strict';
import {matchDayAccess,resolveMatchDayFixture,matchDayReview,matchDayRulesRequest,STATE_CUP_REFERENCE} from '../site/cloud-matchday.js';
const ctx={kind:'team',teamId:'stgeorge-mixed20',season:'2027',sport:'oztag',roles:['team_coach']};
const fixture={sessionId:'match-example',teamId:ctx.teamId,kind:'match',startsAt:'2027-03-19T09:00:00+11:00',version:2,status:'planned'};
const selection={state:'published',current:true,eligible:3,shown:2,version:4,fixtureVersion:2,
 selectedIds:['p1'],candidates:[{personId:'p1',displayName:'Example A',response:'yes'},{personId:'p2',displayName:'Example B',response:'maybe'}]};
test('future sporting authority is explicit but no role can persist sporting records',()=>{
 for(const role of ['team_coach','team_manager','team_assistant','team_player','team_volunteer','team_play_viewer']){
  const a=matchDayAccess({...ctx,roles:[role]});
  assert.equal(a.proposedRecord,['team_coach','team_manager','team_assistant'].includes(role));
  assert.equal(a.proposedApprove,role==='team_coach');
  assert.equal(a.mayPersistScore||a.mayPersistLineup||a.mayPublishResult,false);
 }
 assert.equal(matchDayAccess({kind:'platform',roles:['team_coach']}).view,false);
});
test('exact fixture scope rejects duplicates, training, stale identity and unauthorised roles',()=>{
 assert.equal(resolveMatchDayFixture(ctx,[fixture],fixture.sessionId),fixture);
 for(const rows of [[],[fixture,fixture],[{...fixture,kind:'training'}],[{...fixture,teamId:'other'}],[{...fixture,version:undefined}]])
  assert.throws(()=>resolveMatchDayFixture(ctx,rows,fixture.sessionId));
 assert.throws(()=>resolveMatchDayFixture({...ctx,roles:['team_volunteer']},[fixture],fixture.sessionId));
});
test('review reconciles selection, omitted records, publication and unknown arrival/eligibility',()=>{
 const r=matchDayReview(ctx,fixture,selection);
 assert.equal(r.omitted,1);assert.equal(r.selected,1);assert.equal(r.current,true);assert.equal(r.arrivals,null);
 assert.equal(r.score,null);assert.equal(r.eligibleToPlay,null);
 assert.equal(matchDayReview(ctx,{...fixture,status:'cancelled'},selection).current,false);
 const omitted=matchDayReview(ctx,fixture,{...selection,selectedIds:['p1','p3']});
 assert.equal(omitted.omittedSelected,1);assert.equal(omitted.current,false);
 for(const bad of [{...selection,fixtureVersion:1},{...selection,shown:3},{...selection,selectedIds:['p1','p1']},
  {...selection,candidates:[selection.candidates[0],selection.candidates[0]]}])
  assert.throws(()=>matchDayReview(ctx,fixture,bad));
 assert.throws(()=>matchDayReview({...ctx,roles:['team_player']},fixture,selection));
 assert.throws(()=>matchDayReview({...ctx,roles:['team_assistant']},fixture,selection));
});
test('only exact approved target has a reference checklist, never an activated rule profile',()=>{
 const r=matchDayRulesRequest(ctx);
 assert.equal(r.readyForScorekeeping,false);assert.equal(r.ownerApproved,false);
 assert.equal(STATE_CUP_REFERENCE.activated,false);assert.match(r.copyText,/2027 NSW Senior State Championships/);
 assert.match(r.copyText,/No competition entry linked/);
 assert.equal(matchDayRulesRequest({...ctx,season:'2028'}),null);
 assert.equal(matchDayRulesRequest({...ctx,teamId:'other'}),null);
 assert.throws(()=>matchDayRulesRequest({...ctx,roles:['team_player']}));
});
