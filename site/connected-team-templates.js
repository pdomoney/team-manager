// Connected-only extension. Existing ten template IDs and wording stay in
// shared-team-messages.js. Inputs are exact-team projections, not demo data.
const rows = [
 ['welcome','Welcome to the team','General'],
 ['announcement','General announcement','General'],
 ['venue-change','Change of venue','Training and matches'],
 ['time-change','Change of time','Training and matches'],
 ['match-cancelled','Match cancelled','Training and matches'],
 ['match-postponed','Match postponed','Training and matches'],
 ['squad-announcement','Squad announcement','Squad'],
 ['player-selection','Player selection','Squad'],
 ['jersey-reminder','Jersey reminder','Squad'],
 ['tournament-info','Tournament information','Tournaments'],
 ['tournament-schedule','Tournament schedule','Tournaments'],
 ['tournament-confirm','Participation confirmation','Tournaments'],
 ['volunteer-reminder','Volunteer reminder','Volunteers'],
 ['equipment-reminder','Equipment reminder','Volunteers'],
 ['tournament-results','Tournament results','Results'],
 ['thank-you','Thank you','General']
];
export const EXTRA_TEAM_TEMPLATES = Object.freeze(rows.map(([id,label,group])=>Object.freeze({id,label,group})));
const clean = value => typeof value==='string'?value.trim().replace(/\s+/g,' '):'';
const field = (value,placeholder) => clean(value)||`[Enter ${placeholder} before sending]`;
const eventKinds = new Set(['venue-change','time-change','match-cancelled','match-postponed','volunteer-reminder','equipment-reminder']);
const compKinds = new Set(['tournament-info','tournament-schedule','tournament-confirm','tournament-results']);
export const extraTemplateSource = kind => eventKinds.has(kind)?'event':compKinds.has(kind)?'competition':null;
// Accept only server-projected event state, and explicit user choice. Never
// choose an unrelated fixture as a replacement for a missing selection.
export function eligibleTemplateEvents(kind,events,now=new Date()) {
 if(!Array.isArray(events)||!Number.isFinite(now?.getTime?.()))return [];
 if(!eventKinds.has(kind))return [];
 return events.filter(e=>e && ['training','match'].includes(e.kind) && typeof e.sessionId==='string' &&
  typeof e.startsAt==='string' && Number.isFinite(Date.parse(e.startsAt)) && new Date(e.startsAt)>=now &&
  (kind==='match-cancelled'?e.kind==='match'&&e.status==='cancelled':
   kind==='match-postponed'?e.kind==='match'&&e.status==='planned':e.status==='planned'))
  .sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt));
}
export function eligibleTemplateCompetitions(kind,competitions) {
 if(!compKinds.has(kind)||!Array.isArray(competitions))return [];
 return competitions.filter(c=>c && typeof c.competitionId==='string' && ['tournament','carnival'].includes(c.format) &&
  (kind==='tournament-results'?c.status==='completed':['planned','entered'].includes(c.status)))
  .sort((a,b)=>clean(a.beginsOn).localeCompare(clean(b.beginsOn))||clean(a.name).localeCompare(clean(b.name)));
}
export function extraTemplateText(kind,{teamName,event=null,competition=null}={}) {
 const def=EXTRA_TEAM_TEMPLATES.find(t=>t.id===kind),team=clean(teamName);
 if(!def||!team)throw new TypeError('invalid-connected-template');
 const head=`*${def.label} — ${team}*\n\n`;
 const e=event, c=competition;
 const eventInfo=e?`${field(e.label,'the event name')}\n📅 ${field(e.dateLabel,'the verified event date')}\n⏰ ${field(e.startLabel,'the verified event time')}`:'[Choose the relevant recorded event before sending]';
 const compInfo=c?`🏆 ${field(c.name,'the competition name')}\n📅 ${field(c.beginsOn,'the verified start date')}${clean(c.endsOn)?' to '+clean(c.endsOn):''}\n📍 ${field(c.venue,'the verified venue')}`:'[Choose the relevant recorded tournament before sending]';
 switch(kind){
  case 'welcome':return head+'Welcome to the team! We’ll use Team Manager for training, matches, availability and team notices. Please keep your availability up to date.';
  case 'announcement':return head+'[Enter the team announcement before sending]';
  case 'venue-change':return head+eventInfo+'\n📍 New venue: [Enter the verified new venue before sending]\n\nPlease check the updated team schedule.';
  case 'time-change':return head+eventInfo+'\nNew time: [Enter the verified new time before sending]\n\nPlease check the updated team schedule.';
  case 'match-cancelled':return head+(e?.kind==='match'&&e.status==='cancelled'?eventInfo:'[Choose an actually cancelled match before sending]')+'\n\nThe match has been cancelled. Please check the team schedule for updates.';
  case 'match-postponed':return head+eventInfo+'\n\n[Enter confirmed postponement details from the organiser before sending]';
  case 'squad-announcement':return head+'[Enter the approved squad details before sending]\n\nPlease check Team Manager for your availability and team updates.';
  case 'player-selection':return head+'[Enter the approved player selection details before sending]';
  case 'jersey-reminder':return head+'Please check your jersey details in Team Manager. Contact the Team Manager if you need to arrange collection or return.';
  case 'tournament-info':return head+compInfo+'\n\nPlease confirm your availability.';
  case 'tournament-schedule':return head+compInfo+'\n\n[Enter the verified tournament schedule before sending]';
  case 'tournament-confirm':return head+compInfo+'\n\nPlease confirm YES, NO or MAYBE for your participation.';
  case 'volunteer-reminder':return head+eventInfo+'\n\n[Enter the confirmed volunteer duty and meeting details before sending]';
  case 'equipment-reminder':return head+eventInfo+'\n\n[Enter the equipment to bring before sending]';
  case 'tournament-results':return head+compInfo+'\n\n[Enter the verified tournament results before sending]';
  case 'thank-you':return head+'Thank you to everyone who participated and helped out. Your time and effort are appreciated.';
  default:throw new TypeError('invalid-connected-template');
 }
}
