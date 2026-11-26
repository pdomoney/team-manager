import {validConnectedLogo,validConnectedStyle} from '../site/connected-branding.js';
import {connectedMessageNeedsReview} from '../site/shared-team-messages.js';
// Stage 3D.5 corrective management contract.
// Shared by Worker and synthetic tests. UI state, club chips, Owner status
// and arbitrary payload keys are NEVER accepted as authority.
const ID=/^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$/;
const INVITE=/^invite-[0-9a-f]{32}$/;
const ISSUE=/^jersey-[0-9a-f]{32}$/;
const COMP=/^competition-[0-9a-f]{32}$/;
const MSG=/^message-[0-9a-f]{32}$/;
const EVIDENCE=/^evidence-ref\/[A-Za-z0-9._/-]{12,100}$/;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const COMMUNICATION_ACTIONS=Object.freeze(['messages.archived','messages.archive','messages.remove','notice.archived','notice.remove','notice.correct','notice.edit']);
export const MATCHDAY_ACTIONS=Object.freeze(['matchday.read','player.matchday.read','matchday.lineup.save','matchday.lineup.approve',
 'matchday.clock.start','matchday.clock.pause','matchday.period.next','matchday.interchange','matchday.score.record','matchday.score.void',
 'matchday.finish','matchday.result.approve','matchday.result.publish','matchday.result.reopen']);
export const MATCHDAY_ARRIVAL_ACTIONS=Object.freeze(['matchday.arrivals.read','matchday.arrivals.record','player.matchday.arrivals.read','player.matchday.arrivals.record']);
export const BRANDING_ACTIONS=Object.freeze(['branding.read','branding.team.save','branding.club.save']);
const ACTIONS=new Set([...COMMUNICATION_ACTIONS,...BRANDING_ACTIONS,...MATCHDAY_ARRIVAL_ACTIONS,...MATCHDAY_ACTIONS,'settings.read','settings.save','jerseys.read','jerseys.issue',
 'jerseys.return','competitions.read','competitions.create','competitions.update',
 'competitions.fixture','competitions.fixtures','messages.read','messages.prepare','messages.confirm',
 'team.members','volunteers.list','admin.status','duties.board','duties.assign','duties.withdraw','invite.list','invite.issue','invite.review-adult',
 'invite.activate','invite.revoke','player.team.read',
 'match.selection.read','match.selection.save','match.selection.publish','match.selection.withdraw','player.match.selection.read']);
const reads=new Set(['matchday.read','player.matchday.read','matchday.arrivals.read','player.matchday.arrivals.read','branding.read','messages.archived','notice.archived','settings.read','jerseys.read','competitions.read','competitions.fixtures',
 'messages.read','team.members','volunteers.list','admin.status','duties.board','invite.list','player.team.read',
 'match.selection.read','player.match.selection.read']);
const keys=(o,k)=>Object.keys(o).every(key=>k.includes(key));
const str=(v,max)=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
// Only composed messages may contain line breaks. Keep the stricter validation
// for every other field; normalise browser CRLF to LF without flattening text.
const messageBody=v=>typeof v==='string'&&v.length<=1500&&
  !/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]|\r(?!\n)/.test(v)&&!!v.trim();
const optional=(v,max)=>v===undefined||str(v,max);
const num=v=>Number.isSafeInteger(v)&&v>=0&&v<=999999999;
const date=v=>{
 if(v===undefined||v==='')return true;
 if(typeof v!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(v))return false;
 const d=new Date(v+'T00:00:00Z');
 return Number.isFinite(d.valueOf())&&d.toISOString().slice(0,10)===v;
};
const stamp=v=>typeof v==='string'&&/^20\d{2}-\d{2}-\d{2}T/.test(v)&&
 !Number.isNaN(Date.parse(v));
const email=v=>typeof v==='string'&&v.length<=254&&EMAIL.test(v.trim());
const own=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
export function validateStage3D5(input){
 if(!own(input)||!keys(input,['teamId','role','action','input'])||
  !ID.test(input.teamId||'')||
  !['team_coach','team_manager','team_player','team_assistant','team_volunteer','team_play_viewer'].includes(input.role)||
  !ACTIONS.has(input.action)||!own(input.input))return null;
 const action=input.action,x=input.input;
 // A verified Player may read only the curated team summary, never management
 // settings, invitation records or another role's operations.
 if(MATCHDAY_ACTIONS.includes(action)){
   const staff=['team_coach','team_manager','team_assistant'];
   if(action==='player.matchday.read'?input.role!=='team_player':!staff.includes(input.role))return null;
   if(typeof x.sessionId!=='string'||!ID.test(x.sessionId))return null;
   if(['matchday.read','player.matchday.read'].includes(action)){
     if(!keys(x,['sessionId']))return null;
   }else{
     if(!num(x.fixtureVersion)||!num(x.expectedVersion)||typeof x.ruleId!=='string'||!ID.test(x.ruleId))return null;
     const common=['sessionId','fixtureVersion','expectedVersion','ruleId'];
     if(['matchday.lineup.approve','matchday.finish','matchday.result.approve','matchday.result.reopen'].includes(action)&&input.role!=='team_coach')return null;
     if(action==='matchday.lineup.save'){
       if(!['team_coach','team_assistant'].includes(input.role)||!keys(x,[...common,'lineup'])||!Array.isArray(x.lineup)||!x.lineup.length||x.lineup.length>30||
        x.lineup.some(p=>!own(p)||!keys(p,['personId','category','onField'])||typeof p.personId!=='string'||!ID.test(p.personId)||
        !['a','b'].includes(p.category)||typeof p.onField!=='boolean')||new Set(x.lineup.map(p=>p.personId)).size!==x.lineup.length)return null;
     }else if(action==='matchday.interchange'){
       if(!keys(x,[...common,'outId','inId'])||typeof x.outId!=='string'||typeof x.inId!=='string'||!ID.test(x.outId)||!ID.test(x.inId)||x.outId===x.inId)return null;
     }else if(action==='matchday.score.record'){
       if(!keys(x,[...common,'side','personId','category','reason'])||!optional(x.reason,200)||
        (x.side==='home'?(typeof x.personId!=='string'||!ID.test(x.personId)||x.category!==undefined):
         x.side==='away'?(!['a','b'].includes(x.category)||x.personId!==undefined):true))return null;
     }else if(action==='matchday.score.void'){
       if(!keys(x,[...common,'targetVersion','reason'])||!num(x.targetVersion)||!x.targetVersion||!str(x.reason,200)||!x.reason.trim())return null;
     }else if(['matchday.lineup.approve','matchday.result.approve'].includes(action)){
       if(!keys(x,[...common,'confirmed'])||x.confirmed!==true)return null;
     }else if(action==='matchday.result.reopen'){
       if(!keys(x,[...common,'reason'])||!str(x.reason,200)||!x.reason.trim())return null;
     }else if(action==='matchday.result.publish'){
       if(!['team_coach','team_manager'].includes(input.role)||!keys(x,common))return null;
     }else if(!keys(x,common))return null;
   }
   return Object.freeze({teamId:input.teamId,role:input.role,action,input:Object.freeze({...x})});
 }
 if(MATCHDAY_ARRIVAL_ACTIONS.includes(action)){
   const player=action.startsWith('player.'),write=action.endsWith('.record');
   if(player?input.role!=='team_player':!['team_coach','team_manager','team_assistant'].includes(input.role))return null;
   if(typeof x.sessionId!=='string'||!ID.test(x.sessionId))return null;
   if(write){
     if(!keys(x,['sessionId','fixtureVersion','expectedVersion','arrived',...(player?[]:['personId'])])||
       !num(x.fixtureVersion)||!num(x.expectedVersion)||typeof x.arrived!=='boolean'||
       (!player&&(typeof x.personId!=='string'||!ID.test(x.personId))))return null;
   }else if(!keys(x,['sessionId']))return null;
   return Object.freeze({teamId:input.teamId,role:input.role,action,input:Object.freeze({...x})});
 }
 const playerRead=['player.team.read','player.match.selection.read'].includes(action);
 if(action!=='branding.read'&&((input.role==='team_player')!==playerRead||['team_assistant','team_volunteer','team_play_viewer'].includes(input.role)))return null;
 if(action==='match.selection.read'||action==='player.match.selection.read'){
   if(!keys(x,['sessionId'])||!ID.test(x.sessionId||''))return null;
 }else if(['match.selection.save','match.selection.publish','match.selection.withdraw'].includes(action)){
   if(input.role!=='team_coach'||!ID.test(x.sessionId||'')||!num(x.expectedVersion)||!num(x.fixtureVersion))return null;
   const allowed=['sessionId','expectedVersion','fixtureVersion'];
   if(action==='match.selection.save'){
     if(!keys(x,[...allowed,'personIds'])||!Array.isArray(x.personIds)||x.personIds.length>30||
       x.personIds.some(id=>typeof id!=='string'||!ID.test(id))||new Set(x.personIds).size!==x.personIds.length)return null;
   }else if(!keys(x,allowed))return null;
 }else if(reads.has(action)){if(Object.keys(x).length)return null;}
 else if(action==='settings.save'){
  if(!keys(x,['teamLabel','trainingVenue','trainingStart','trainingEnd',
    'contactName','contactEmail','jerseyLoan','expectedVersion'])||
     !optional(x.teamLabel,100)||!optional(x.trainingVenue,120)||
     !optional(x.contactName,80)||!optional(x.contactEmail,254)||
     !['',undefined].includes(x.contactEmail)&&!email(x.contactEmail)||
     ![undefined,''].includes(x.trainingStart)&&
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(x.trainingStart)||
     ![undefined,''].includes(x.trainingEnd)&&
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(x.trainingEnd)||
     typeof x.jerseyLoan!=='boolean'||!num(x.expectedVersion))return null;
 }else if(action==='jerseys.issue'){
  if(!keys(x,['personId','jerseyNo'])||!ID.test(x.personId||'')||
    !/^\d{1,3}$/.test(x.jerseyNo||''))return null;
 }else if(action==='jerseys.return'){
  if(!keys(x,['issueId','expectedVersion'])||!ISSUE.test(x.issueId||'')||
    !num(x.expectedVersion))return null;
 }else if(['competitions.create','competitions.update'].includes(action)){
  if(!keys(x,['competitionId','name','format','division','organiser','venue',
    'beginsOn','endsOn','status','expectedVersion'])||
    !str(x.name,120)||!x.name.trim()||
    !['league','tournament','carnival','friendly-series'].includes(x.format)||
    !optional(x.division,100)||!optional(x.organiser,120)||
    !optional(x.venue,120)||!date(x.beginsOn)||!date(x.endsOn)||
    (x.beginsOn&&x.endsOn&&x.beginsOn>x.endsOn)||
    !['planned','entered','withdrawn','completed',undefined].includes(x.status))return null;
  if(action==='competitions.create'&&(x.competitionId!==undefined||
    x.expectedVersion!==undefined))return null;
  if(action==='competitions.update'&&(!COMP.test(x.competitionId||'')||
    !num(x.expectedVersion)))return null;
 }else if(action==='competitions.fixture'){
  if(!keys(x,['competitionId','opponent','startsAt'])||
    !COMP.test(x.competitionId||'')||!str(x.opponent,120)||
    !x.opponent.trim()||!stamp(x.startsAt))return null;
 }else if(action==='branding.team.save'||action==='branding.club.save'){
  if(!keys(x,action==='branding.team.save'?['style','expectedVersion']:['style','expectedVersion','logo','resetOverrides'])||
   !Object.hasOwn(x,'style')||!validConnectedStyle(x.style)||!num(x.expectedVersion))return null;
  if(action==='branding.club.save'&&(!validConnectedLogo(x.logo)||typeof x.resetOverrides!=='boolean'))return null;
 }else if(action==='messages.prepare'){
  if(!keys(x,['audience','channel','body'])||
    !['players','volunteers','all'].includes(x.audience)||
    !['whatsapp','share','copy'].includes(x.channel)||
    !messageBody(x.body)||connectedMessageNeedsReview(x.body,input.teamId))return null;
 }else if(['messages.archive','messages.remove','notice.remove'].includes(action)){
  const pattern=action==='notice.remove'?/^notice-[0-9a-f]{32}$/:MSG;
  if(!keys(x,['entries'])||!Array.isArray(x.entries)||x.entries.length<1||x.entries.length>20||
    x.entries.some(e=>!own(e)||!keys(e,['id','expectedVersion'])||typeof e.id!=='string'||!pattern.test(e.id)||!num(e.expectedVersion))||
    new Set(x.entries.map(e=>e.id)).size!==x.entries.length)return null;
 }else if(['notice.correct','notice.edit'].includes(action)){
  if(!keys(x,['noticeId','expectedVersion','title','body','audience'])||
   typeof x.noticeId!=='string'||!/^notice-[0-9a-f]{32}$/.test(x.noticeId)||!num(x.expectedVersion)||
   !str(x.title,100)||!x.title.trim()||!str(x.body,1000)||!x.body.trim()||
   !['all','players','volunteers','coaches'].includes(x.audience)||connectedMessageNeedsReview(x.body,input.teamId))return null;
 }else if(action==='messages.confirm'){
  if(!keys(x,['messageId','status','expectedVersion'])||
    !MSG.test(x.messageId||'')||!['sent','not-sent'].includes(x.status)||
    !num(x.expectedVersion))return null;
 }else if(action==='duties.assign'){
  if(!keys(x,['sessionId','personId','type'])||!ID.test(x.sessionId||'')||
    !ID.test(x.personId||'')||
    !['general_help','setup','equipment','scorer_support'].includes(x.type))
    return null;
 }else if(action==='duties.withdraw'){
  if(!keys(x,['dutyId','expectedVersion'])||
    !/^duty-[0-9a-f]{32}$/.test(x.dutyId||'')||!num(x.expectedVersion))
    return null;
 }else if(action==='invite.issue'){
  if(!keys(x,['role','email'])||!['team_player','team_volunteer'].includes(x.role)||
    !email(x.email))return null;
 }else if(action==='invite.review-adult'){
  if(!keys(x,['invitationId','evidenceRef'])||!INVITE.test(x.invitationId||'')||
   !EVIDENCE.test(x.evidenceRef||''))return null;
 }else if(['invite.activate','invite.revoke'].includes(action)){
  if(!keys(x,['invitationId'])||!INVITE.test(x.invitationId||''))return null;
 }
 return Object.freeze({teamId:input.teamId,role:input.role,action,
   input:Object.freeze({...x,...(action==='messages.prepare'?{body:x.body.replace(/\r\n/g,'\n')}: {}),...(action==='invite.issue'?
     {email:x.email.trim().toLowerCase()}: {})})});
}
export const isStage3D5Read=action=>reads.has(action);
