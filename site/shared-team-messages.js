// Shared team message composition. Extracted from the established Team Manager
// Messages workflow in site/app.js, not an independent cloud template design.
//
// Caller supplies the authorised team's projected records and UI formatters.
// No permissions, user identities, delivery, notice publication or browser
// storage are inferred by this pure module.
export const TEAM_MESSAGE_TEMPLATES=Object.freeze({
  reminder:'Training reminder',
  availability:'Availability check',
  match:'Next match',
  results:'Results',
  cancelled:'Training cancelled',
  lineup:'Lineup',
  help:'Help needed',
  countdown:'Countdown',
  invite:'App invite',
  blank:'Blank'
});
const safe=x=>typeof x==='string'?x:'';
const nonempty=x=>safe(x).trim();
const singleSpace=x=>nonempty(x).replace(/\s+/g,' ');
const text=x=>safe(x);
export function trainingReminderText({
  teamName,session=null,dateLabel='',timeLabel='',venue='',focus='',notes=''
}={}){
  const name=singleSpace(teamName);
  if(!name)throw new TypeError('team-name-required');
  if(!session)return '🏉 *Training — '+name+'*\n\n(Add a training session first and it will fill in here.)';
  if(!dateLabel||!timeLabel)throw new TypeError('session-date-and-time-required');
  return '🏉 *Training — '+name+'*'+
    '\n📅 '+dateLabel+'\n⏰ '+timeLabel+'\n📍 '+(nonempty(venue)||'TBC')+
    (nonempty(focus)?'\n🎯 Focus: '+text(focus):'')+
    (nonempty(notes)?'\n📝 '+text(notes):'')+
    "\n\nReply 👍 if you're coming, or let me know if you can't make it.";
}
export function trainingCancellationText({session=null,dateLabel='',timeLabel=''}={}){
  return session
    ? '⚠️ *Training cancelled*\nTraining on '+dateLabel+' ('+timeLabel+
      ') is off.\n\nReason: \n\nSee you at the next one.'
    : '⚠️ *Training cancelled*\n\n';
}
export function availabilityRequestText({teamName,events=[],contactName=''}={}){
  const name=singleSpace(teamName);
  if(!name)throw new TypeError('team-name-required');
  if(!Array.isArray(events))throw new TypeError('invalid-events');
  if(!events.length)return '📋 *Availability — '+name+
    '*\n\n(Nothing in the next two weeks. Add training or a match and it will fill in here.)';
  const lines=events.map(e=>{
    if(!e||!safe(e.dateLabel)||!['session','match'].includes(e.kind))
      throw new TypeError('invalid-event');
    return '• '+e.dateLabel+(e.startLabel?' '+e.startLabel:'')+
      ': '+(e.kind==='match'?'match vs '+(singleSpace(e.opponent)||'TBC'):'training');
  });
  return '📋 *Availability — '+name+
    '*\nPlease reply *YES*, *NO* or *MAYBE* for:\n'+lines.join('\n')+
    '\n\nReply here'+(singleSpace(contactName)?' or message '+singleSpace(contactName):'')+
    ', or use the buttons in the team app (Schedule). Thanks!';
}
// The connected service supplies ISO timestamps, rather than legacy date +
// start/end properties. Produce a *lossless and bounded* formatting projection;
// do not manufacture a venue, notes, time, status or unrelated team data.
export function projectedCloudSession(s,{timeZone='Australia/Sydney'}={}){
  if(!s||typeof s!=='object'||typeof s.startsAt!=='string')return null;
  const when=new Date(s.startsAt);
  if(!Number.isFinite(when.getTime()))return null;
  const format=(options)=>new Intl.DateTimeFormat('en-AU',{timeZone,...options}).format(when);
  return Object.freeze({
    id:s.sessionId,
    kind:s.kind,
    status:s.status,
    dateISO:format({year:'numeric',month:'2-digit',day:'2-digit'}).split('/').reverse().join('-'),
    dateLabel:format({weekday:'long',day:'numeric',month:'long',year:'numeric'}),
    dayLabel:format({weekday:'short',day:'numeric',month:'short'}),
    startLabel:format({hour:'numeric',minute:'2-digit',hour12:true}).toLowerCase().replace(':00','').replace(/\s+(am|pm)$/,'$1'),
    venue:s.locationLabel||'',
    focus:s.focus||'',
    notes:s.notes||''
  });
}
export function nextCloudTraining(sessions, options={}){
  if(!Array.isArray(sessions))throw new TypeError('invalid-sessions');
  const clock=options.now instanceof Date?options.now:new Date();
  return sessions.filter(s=>s?.kind==='training'&&s.status==='planned'&&
    Number.isFinite(new Date(s.startsAt).getTime())&&new Date(s.startsAt)>=clock)
    .sort((a,b)=>a.startsAt.localeCompare(b.startsAt))[0]||null;
}
// Cancellation and reminder selection must remain separate. In particular,
 // an ordinary planned session must never produce a false cancellation notice.
export function cancelledCloudTraining(sessions,{now=new Date()}={}){
 if(!Array.isArray(sessions))throw new TypeError('invalid-sessions');
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw new TypeError('invalid-now');
 return sessions.filter(s=>s?.kind==='training'&&s.status==='cancelled'&&
   typeof s.startsAt==='string'&&Number.isFinite(new Date(s.startsAt).getTime())&&
   new Date(s.startsAt)>=now)
   .sort((a,b)=>a.startsAt.localeCompare(b.startsAt))[0]||null;
}
export function cloudAvailabilityEvents(sessions,{now=new Date(),timeZone='Australia/Sydney'}={}){
  if(!Array.isArray(sessions))throw new TypeError('invalid-sessions');
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw new TypeError('invalid-now');
  const until=new Date(now.getTime()+14*86400000);
  return sessions.filter(s=>(s?.kind==='training'||s?.kind==='match')&&
    s.status==='planned'&&
    Number.isFinite(new Date(s.startsAt).getTime())&&
    new Date(s.startsAt)>=now&&new Date(s.startsAt)<=until)
    .sort((a,b)=>a.startsAt.localeCompare(b.startsAt)).map(s=>{
      const p=projectedCloudSession(s,{timeZone});
      return {kind:s.kind==='match'?'match':'session',dateLabel:p.dayLabel,
        startLabel:p.startLabel,opponent:s.opponent||''};
    }).slice(0,40);
}


// Original Team Manager match message structure, with real team-scoped data.
// Never treat a team-recorded fixture as an official draw.
export function nextMatchMessageText({
 teamName,match=null,dateLabel='',timeLabel='',venue='',opponent='',round='',notes=''
}={}){
 const name=singleSpace(teamName);
 if(!name)throw new TypeError('team-name-required');
 if(!match)return '🏉 *Next match — '+name+'*\n\n(Add a match and it will fill in here.)';
 if(!dateLabel)throw new TypeError('match-date-required');
 return '🏉 *'+name+' vs '+(singleSpace(opponent)||'TBC')+'*'+
  '\n📅 '+dateLabel+(timeLabel?', '+timeLabel:'')+
  '\n📍 '+(singleSpace(venue)||'Venue TBC')+
  (singleSpace(round)?'\n🏆 '+round:'')+
  (singleSpace(notes)?'\n📝 '+notes:'')+
  '\n\nReply *YES*, *NO* or *MAYBE* if you haven’t yet.';
}
export function competitionCountdownText({teamName,competition=null,todayISO}={}){
 const name=singleSpace(teamName);
 if(!name)throw new TypeError('team-name-required');
 const day=competition?.beginsOn;
 if(typeof day!=='string'||!/^\d{4}-\d\d-\d\d$/.test(day)||
    !/^\d{4}-\d\d-\d\d$/.test(todayISO||''))return null;
 const ms=Date.parse(day+'T00:00:00Z')-Date.parse(todayISO+'T00:00:00Z');
 if(!Number.isFinite(ms)||ms<0)return null;
 const days=Math.round(ms/86400000);
 return '⏳ *'+days+' days* until '+singleSpace(competition.name)+
   (singleSpace(competition.venue)?' at '+singleSpace(competition.venue):'')+
   ' — '+name+'.\n\nEvery session counts from here. Let’s keep turning up. 💪';
}
export const MANUAL_TEAM_TEMPLATES=Object.freeze({
 results:{label:'Results',placeholder:'[Enter verified results before sending]'},
 lineup:{label:'Lineup',placeholder:'[Enter the confirmed team lineup before sending]'},
 help:{label:'Help needed',placeholder:'[Describe the actual help needed before sending]'}
});
export function manualTeamTemplateText(kind,{teamName}={}){
 const template=MANUAL_TEAM_TEMPLATES[kind],name=singleSpace(teamName);
 if(!template||!name)throw new TypeError('invalid-manual-template');
 return ({results:'🏉',lineup:'📋',help:'🙋'})[kind]+' *'+template.label+
   ' — '+name+'*\n\n'+template.placeholder;
}
export function containsUnfilledTemplate(textValue){
 return Object.values(MANUAL_TEAM_TEMPLATES).some(x=>safe(textValue).includes(x.placeholder))||
  /\[(?:Enter|Choose) [^\]\r\n]{1,120}\]/.test(safe(textValue));
}
// Connected-only guard for obsolete demo placeholders and the exact observed
// screenshot discrepancy. Legitimate opponent names in ordinary text are not
// rejected. Only the known generated heading is blocked for the real team.
export function connectedMessageNeedsReview(value,teamId){
 const body=safe(value);
 return containsUnfilledTemplate(body)||
  /\(Add a (?:training session|match)(?: first)? and it will fill in here\.\)/i.test(body)||
  /\(Nothing in the next two weeks\. Add training or a match and it will fill in here\.\)/i.test(body)||
  (teamId==='stgeorge-mixed20'&&/(?:^|\n)\s*(?:🏉\s*)?\*Training\s+[—–-]\s+Example Comets Mixed\*/i.test(body));
}
export function accountInvitationText({teamName,url}={}){
 const name=singleSpace(teamName);
 let link;
 try{link=new URL(url);}catch{throw new TypeError('invalid-signin-url');}
 if(link.protocol!=='https:'||link.username||link.password||link.search||link.hash||
    !link.pathname.endsWith('/cloud-access.html'))throw new TypeError('invalid-signin-url');
 return '👋 Here’s the '+name+' team app: training, team notices and availability.\n\n'+
   link.href+'\n\nYour account must have its own verified invitation and approved team role before you can access team information. Ask the Team Manager if you have not received one.';
}

/** Connected administrative squad. Retain the original match-message heading
 * and date presentation; never infer positions or interchange from a name list. */
export function publishedMatchSquadText({teamName,match,players}={}){
 const name=singleSpace(teamName),p=projectedCloudSession(match);
 if(!name||!p||match.kind!=='match'||match.status==='cancelled'||!Array.isArray(players)||!players.length||
   players.some(x=>!singleSpace(x?.displayName)))throw new TypeError('published-match-squad-required');
 return '🏉 *'+name+' · '+singleSpace(match.title||'Match')+'*\n📅 '+p.dateLabel+', '+p.startLabel+
   '\n📍 '+(singleSpace(p.venue)||'Venue TBC')+'\n\n*Selected match squad*\n'+
   players.map(x=>'• '+singleSpace(x.displayName)).join('\n')+
   '\n\nOn-field positions and interchange to be confirmed by the Coach.';
}

/** Team-recorded match messages. Only callers holding a fresh published server
 * record may use these helpers; nothing is sent automatically. */
export function publishedMatchRecordText({kind,teamName,match,record}={}){
 const name=singleSpace(teamName),title=singleSpace(match?.title);
 if(!name||!title||!record||record.teamRecorded!==true)return '';
 if(kind==='result'){
   if(record.state!=='published'||![record.homeScore,record.awayScore].every(v=>Number.isSafeInteger(v)&&v>=0))return '';
   return '🏉 *Results — '+name+'*\n'+title+'\nTeam-recorded final score: '+record.homeScore+' – '+record.awayScore+'\nConfirm official results with the competition organiser.';
 }
 if(kind==='lineup'){
   if(!['ready','playing','finished','approved','published'].includes(record.state)||!Array.isArray(record.startingIds)||!Array.isArray(record.players))return '';
   const names=record.startingIds.map(id=>singleSpace(record.players.find(p=>p.personId===id)?.displayName));
   if(!names.length||names.some(n=>!n))return '';
   return '📋 *Starting lineup — '+name+'*\n'+title+'\n'+names.join('\n')+'\nCoach-approved team lineup.';
 }
 return '';
}
