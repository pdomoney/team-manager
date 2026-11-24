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
const ACTIONS=new Set(['settings.read','settings.save','jerseys.read','jerseys.issue',
 'jerseys.return','competitions.read','competitions.create','competitions.update',
 'competitions.fixture','competitions.fixtures','messages.read','messages.prepare','messages.confirm',
 'team.members','volunteers.list','admin.status','duties.board','duties.assign','duties.withdraw','invite.list','invite.issue','invite.review-adult',
 'invite.activate','invite.revoke','player.team.read']);
const reads=new Set(['settings.read','jerseys.read','competitions.read','competitions.fixtures',
 'messages.read','team.members','volunteers.list','admin.status','duties.board','invite.list','player.team.read']);
const keys=(o,k)=>Object.keys(o).every(key=>k.includes(key));
const str=(v,max)=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
// Only composed messages may contain line breaks. Keep the stricter validation
// for every other field; normalise browser CRLF to LF without flattening text.
const messageBody=v=>typeof v==='string'&&v.length<=1500&&
  !/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]|\r(?!\n)/.test(v)&&!!v.trim();
const optional=(v,max)=>v===undefined||str(v,max);
const num=v=>Number.isSafeInteger(v)&&v>=0&&v<=999999999;
const date=v=>v===undefined||v===''||(typeof v==='string'&&
  /^20\d{2}-\d{2}-\d{2}$/.test(v)&&
  !Number.isNaN(Date.parse(v+'T00:00:00Z')));
const stamp=v=>typeof v==='string'&&/^20\d{2}-\d{2}-\d{2}T/.test(v)&&
 !Number.isNaN(Date.parse(v));
const email=v=>typeof v==='string'&&v.length<=254&&EMAIL.test(v.trim());
const own=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
export function validateStage3D5(input){
 if(!own(input)||!keys(input,['teamId','role','action','input'])||
  !ID.test(input.teamId||'')||
  !['team_coach','team_manager','team_player'].includes(input.role)||
  !ACTIONS.has(input.action)||!own(input.input))return null;
 const action=input.action,x=input.input;
 // A verified Player may read only the curated team summary, never management
 // settings, invitation records or another role's operations.
 if((input.role==='team_player')!==(action==='player.team.read'))return null;
 if(reads.has(action)){if(Object.keys(x).length)return null;}
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
    !['planned','entered','withdrawn','completed',undefined].includes(x.status))return null;
  if(action==='competitions.create'&&(x.competitionId!==undefined||
    x.expectedVersion!==undefined))return null;
  if(action==='competitions.update'&&(!COMP.test(x.competitionId||'')||
    !num(x.expectedVersion)))return null;
 }else if(action==='competitions.fixture'){
  if(!keys(x,['competitionId','opponent','startsAt'])||
    !COMP.test(x.competitionId||'')||!str(x.opponent,120)||
    !x.opponent.trim()||!stamp(x.startsAt))return null;
 }else if(action==='messages.prepare'){
  if(!keys(x,['audience','channel','body'])||
    !['players','volunteers','all'].includes(x.audience)||
    !['whatsapp','share','copy'].includes(x.channel)||
    !messageBody(x.body))return null;
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
