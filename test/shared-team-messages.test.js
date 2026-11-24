import test from 'node:test';
import assert from 'node:assert/strict';
import {
 TEAM_MESSAGE_TEMPLATES,trainingReminderText,trainingCancellationText,
 availabilityRequestText,projectedCloudSession,nextCloudTraining,
 cloudAvailabilityEvents
} from '../site/shared-team-messages.js';
test('the established ten Team Manager message templates remain the shared catalogue',()=>{
 assert.deepEqual(Object.entries(TEAM_MESSAGE_TEMPLATES),[
 ['reminder','Training reminder'],['availability','Availability check'],
 ['match','Next match'],['results','Results'],['cancelled','Training cancelled'],
 ['lineup','Lineup'],['help','Help needed'],['countdown','Countdown'],
 ['invite','App invite'],['blank','Blank']]);
 assert(Object.isFrozen(TEAM_MESSAGE_TEMPLATES));
});
test('training message matches the original coach wording with actual event fields',()=>{
 assert.equal(trainingReminderText({teamName:'Mixed 20'}),
   '🏉 *Training — Mixed 20*\n\n(Add a training session first and it will fill in here.)');
 assert.equal(trainingReminderText({teamName:'Mixed 20',session:{},
   dateLabel:'Friday 27 November 2026',timeLabel:'6–7:30pm',
   venue:'Local field',focus:'Passing',notes:'Bring a ball'}),
   "🏉 *Training — Mixed 20*\n📅 Friday 27 November 2026\n⏰ 6–7:30pm\n📍 Local field\n🎯 Focus: Passing\n📝 Bring a ball\n\nReply 👍 if you're coming, or let me know if you can't make it.");
 assert.equal(trainingCancellationText({session:{},dateLabel:'Friday',timeLabel:'6pm'}),
   '⚠️ *Training cancelled*\nTraining on Friday (6pm) is off.\n\nReason: \n\nSee you at the next one.');
 assert.equal(trainingCancellationText(),'⚠️ *Training cancelled*\n\n');
});
test('availability request preserves original RSVP wording and actual matches',()=>{
 const body=availabilityRequestText({teamName:'Mixed 20',contactName:'Manager',events:[
  {kind:'session',dateLabel:'Fri 27 Nov',startLabel:'6pm'},
  {kind:'match',dateLabel:'Sun 29 Nov',startLabel:'9am',opponent:'Eagles'}]});
 assert.match(body,/Please reply \*YES\*, \*NO\* or \*MAYBE\*/);
 assert.match(body,/• Fri 27 Nov 6pm: training/);
 assert.match(body,/• Sun 29 Nov 9am: match vs Eagles/);
 assert.match(body,/or message Manager, or use the buttons in the team app \(Schedule\)/);
 assert.match(availabilityRequestText({teamName:'Mixed 20'}),/Nothing in the next two weeks/);
});
test('cloud event projection never imports fictional players or invents unknown venue',()=>{
 const row=projectedCloudSession({
  sessionId:'session1',kind:'training',status:'planned',
  startsAt:'2026-11-27T18:00:00+11:00',locationLabel:'Training ground',
  teamId:'stgeorge-mixed20'
 });
 assert.deepEqual([row.dateISO,row.startLabel,row.venue],
   ['2026-11-27','6pm','Training ground']);
 assert.equal(row.teamId,undefined);
 assert.equal(projectedCloudSession({startsAt:'not-a-date'}),null);
 assert.equal(projectedCloudSession(null),null);
});
test('only real upcoming authorised events feed the cloud availability template',()=>{
 const now=new Date('2026-11-24T09:00:00+11:00');
 const sessions=[
  {sessionId:'old',kind:'training',status:'planned',startsAt:'2026-11-21T18:00:00+11:00'},
  {sessionId:'future',kind:'training',status:'planned',startsAt:'2026-11-27T18:00:00+11:00'},
  {sessionId:'cancel',kind:'training',status:'cancelled',startsAt:'2026-11-29T18:00:00+11:00'},
  {sessionId:'match',kind:'match',status:'planned',startsAt:'2026-11-29T09:00:00+11:00',opponent:'Eagles'},
  {sessionId:'later',kind:'training',status:'planned',startsAt:'2026-12-30T18:00:00+11:00'}
 ];
 assert.equal(nextCloudTraining(sessions,{now}).sessionId,'future');
 const ev=cloudAvailabilityEvents(sessions,{now});
 assert.equal(ev.length,2);
 assert.deepEqual(ev.map(x=>x.kind),['session','match']);
 assert(!JSON.stringify(ev).includes('old'));
 assert(!JSON.stringify(ev).includes('cancel'));
 assert(!JSON.stringify(ev).includes('later'));
});

test('published administrative squad message has names but no inferred positions or result',async()=>{
 const {publishedMatchSquadText}=await import('../site/shared-team-messages.js');
 const input={teamName:'Mixed 20',match:{kind:'match',title:'vs Lions',status:'planned',startsAt:'2027-02-20T08:00:00+11:00'},players:[{displayName:'Verified Player'}]};
 const body=publishedMatchSquadText(input);
 assert.match(body,/Selected match squad/);
 assert.match(body,/Verified Player/);
 assert.match(body,/positions and interchange to be confirmed/);
 assert.throws(()=>publishedMatchSquadText({...input,players:[]}));
 assert.throws(()=>publishedMatchSquadText({...input,match:{...input.match,status:'cancelled'}}));
});
