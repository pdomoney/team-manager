// Connected Match Day preparation. No new write action, inferred eligibility,
// or automatic activation of sporting rules. The server still owns grants.
import {matchRulesConfirmationChecklist} from './match-rules-confirmation.js';
const freeze=Object.freeze;
const ID=/^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$/;
const staff=['team_coach','team_manager'];
const allowed=['team_coach','team_manager','team_assistant','team_player'];
const validCount=n=>Number.isSafeInteger(n)&&n>=0;
export function matchDayAccess(ctx){
  const roles=ctx?.kind==='team'&&Array.isArray(ctx.roles)?ctx.roles:[];
  const view=roles.some(r=>allowed.includes(r));
  const review=roles.some(r=>staff.includes(r));
  return freeze({view,review,player:!review&&roles.includes('team_player'),
    // Approved future authority is not a live server grant.
    proposedRecord:roles.some(r=>[...staff,'team_assistant'].includes(r)),
    proposedApprove:roles.includes('team_coach'),
    mayPersistLineup:false,mayPersistScore:false,mayPublishResult:false});
}
export function resolveMatchDayFixture(ctx,rows,sessionId){
  if(!matchDayAccess(ctx).view||!ID.test(ctx?.teamId||'')||!ID.test(sessionId||'')||
    !Array.isArray(rows)||rows.length>5000)throw new Error('scope-denied');
  const matches=rows.filter(s=>s?.sessionId===sessionId);
  if(matches.length!==1)throw new Error('scope-denied');
  const s=matches[0];
  if(s.kind!=='match'||(s.teamId!==undefined&&s.teamId!==ctx.teamId)||
     !validCount(s.version)||!Number.isFinite(Date.parse(s.startsAt)))throw new Error('scope-denied');
  return s;
}
export function matchDayReview(ctx,fixture,selection){
  const access=matchDayAccess(ctx);
  if(!access.review||!selection||!Array.isArray(selection.candidates)||
    !Array.isArray(selection.selectedIds)||!validCount(selection.eligible)||
    !validCount(selection.shown)||selection.shown!==selection.candidates.length||
    selection.shown>selection.eligible||selection.fixtureVersion!==fixture.version||
    !validCount(selection.version))throw new Error('stale-version');
  const selected=new Set(selection.selectedIds),seen=new Set();
  if(selected.size!==selection.selectedIds.length||[...selected].some(id=>!ID.test(id||'')))
    throw new Error('invalid-selection');
  const rows=selection.candidates.map(p=>{
    if(!ID.test(p?.personId||'')||seen.has(p.personId)||typeof p.displayName!=='string'||!p.displayName.trim()||
       (p.teamId!==undefined&&p.teamId!==ctx.teamId))throw new Error('invalid-selection');
    seen.add(p.personId);
    return freeze({personId:p.personId,displayName:p.displayName,
      response:['yes','no','maybe'].includes(p.response)?p.response:'none',
      selected:selected.has(p.personId)});
  });
  const selectedRows=rows.filter(p=>p.selected);
  const omittedSelected=selected.size-selectedRows.length;
  return freeze({rows:freeze(rows),eligible:selection.eligible,shown:selection.shown,
    omitted:selection.eligible-selection.shown,selected:selected.size,omittedSelected,
    selectedRows:freeze(selectedRows),current:selection.current===true&&fixture.status!=='cancelled'&&
      selection.state==='published'&&selected.size>0&&omittedSelected===0,
    state:selection.state,arrivals:null,score:null,eligibleToPlay:null});
}
// The target is a development decision, NOT an approved or linked fixture profile.
export const STATE_CUP_REFERENCE=freeze({
  competition:'2027 NSW Senior State Championships',season:'2027',ageGroup:'20',category:'Mixed',
  state:'pending-organiser-confirmation',nationalEdition:'2025',
  nationalSource:'https://oztag.com.au/ao/wp-content/uploads/2025/09/2025-AO-RULEBOOK-FINAL.pdf',
  tournamentSource:'https://api.oztag.com.au/events/',
  organiserSource:'https://www.nswoztag.au/rep-info',
  pending:freeze(['Exact competition and division rules','Match periods and timekeeping',
    'Squad limits and player eligibility','Scoring variations and forfeits',
    'Finals, extra time and ladder tie-breakers','Owner approval of versioned rules']),
  activated:false
});
export function matchDayRulesRequest(ctx){
  if(!matchDayAccess(ctx).review)throw new Error('scope-denied');
  const target=ctx.teamId==='stgeorge-mixed20'&&ctx.season==='2027'&&String(ctx.sport).toLowerCase()==='oztag';
  if(!target)return null;
  const r=STATE_CUP_REFERENCE;
  // Reuse the original P11E checklist without inventing a competition-entry link.
  return matchRulesConfirmationChecklist({sport:'Oztag',competition:r.competition,
    season:r.season,ageGroup:r.ageGroup,category:r.category,configuredRulePack:'National reference only',
    source:{title:'Australian Oztag Official Rulebook',edition:r.nationalEdition,url:r.nationalSource}});
}
