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
  return sessions.filter(s=>s?.kind==='training'&&s.status!=='cancelled'&&
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
    !['cancelled','postponed'].includes(s.status)&&
    Number.isFinite(new Date(s.startsAt).getTime())&&
    new Date(s.startsAt)>=now&&new Date(s.startsAt)<=until)
    .sort((a,b)=>a.startsAt.localeCompare(b.startsAt)).map(s=>{
      const p=projectedCloudSession(s,{timeZone});
      return {kind:s.kind==='match'?'match':'session',dateLabel:p.dayLabel,
        startLabel:p.startLabel,opponent:s.opponent||''};
    }).slice(0,40);
}

export function connectedMessageTemplateReadiness(sessions,{now=new Date()}={}){
 if(!Array.isArray(sessions))throw new TypeError('invalid-sessions');
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw new TypeError('invalid-now');
 const futureMatches=sessions.filter(s=>s?.kind==='match'&&
   !['cancelled','postponed'].includes(s.status)&&
   Number.isFinite(new Date(s.startsAt).getTime())&&new Date(s.startsAt)>=now);
 const availability=cloudAvailabilityEvents(sessions,{now});
 return Object.freeze({
   reminder:!!nextCloudTraining(sessions,{now}),
   availability:availability.length>0,
   match:futureMatches.length>0,
   cancelled:!!cancelledCloudTraining(sessions,{now}),
   blank:true
 });
}
