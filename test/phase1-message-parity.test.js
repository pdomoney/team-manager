import test from 'node:test';
import assert from 'node:assert/strict';
import {nextMatchMessageText,competitionCountdownText,
 manualTeamTemplateText,containsUnfilledTemplate,accountInvitationText,
 TEAM_MESSAGE_TEMPLATES,cancelledCloudTraining,nextCloudTraining,trainingReminderText} from '../site/shared-team-messages.js';
import {validateStage3D5} from '../src/stage3d5-management-contract.js';

test('original Team Manager match message retains date, venue, opponent and RSVP wording',()=>{
 const message=nextMatchMessageText({teamName:'Mixed 20',match:{},
  dateLabel:'Saturday 28 November 2026',timeLabel:'9am',venue:'Field 1',
  opponent:'Titans'});
 assert.match(message,/Mixed 20 vs Titans/);
 assert.match(message,/Saturday 28 November 2026, 9am/);
 assert.match(message,/Field 1/);
 assert.match(message,/YES.*NO.*MAYBE/);
 assert.match(nextMatchMessageText({teamName:'Mixed 20'}),/Add a match/);
});
test('the countdown must have a real dated competition and never assume a venue',()=>{
 assert.equal(competitionCountdownText({teamName:'Mixed 20',todayISO:'2027-01-01'}),null);
 const value=competitionCountdownText({teamName:'Mixed 20',todayISO:'2027-01-01',
  competition:{name:'Winter Carnival',beginsOn:'2027-01-04',venue:'Field 2'}});
 assert.match(value,/3 days/);assert.match(value,/Winter Carnival at Field 2/);
 assert.equal(competitionCountdownText({teamName:'Mixed 20',todayISO:'2027-01-05',
  competition:{name:'Winter Carnival',beginsOn:'2027-01-04'}}),null);
});
test('manual results, help and lineups never masquerade as verified records',()=>{
 for(const key of ['results','lineup','help']){
   assert(key in TEAM_MESSAGE_TEMPLATES);
   const body=manualTeamTemplateText(key,{teamName:'Mixed 20'});
   assert.equal(containsUnfilledTemplate(body),true);
   assert.equal(containsUnfilledTemplate(body.replace(/\[.*?\]/,'Confirmed by Coach')),false);
 }
 assert.throws(()=>manualTeamTemplateText('squad',{teamName:'Mixed 20'}));
});
test('individual account invitation link is sign-in only, never a shared password',()=>{
 const body=accountInvitationText({teamName:'Mixed 20',
   url:'https://team-manager.example.test/cloud-access.html'});
 assert.match(body,/own verified invitation/);
 assert.doesNotMatch(body,/team password|coach password/);
 for(const unsafe of ['http://bad.test/cloud-access.html',
  'https://bad.test/cloud-access.html?token=secret',
  'https://bad.test/other.html']){
   assert.throws(()=>accountInvitationText({teamName:'Mixed 20',url:unsafe}));
 }
});

test('original multiline template survives connected validation for both staff roles',()=>{
 const body=trainingReminderText({teamName:'Mixed 20',session:{},dateLabel:'Friday 27 November',timeLabel:'6pm',venue:'Field 2'});
 const request=(value,role='team_coach')=>({teamId:'stgeorge-mixed20',role,action:'messages.prepare',input:{audience:'players',channel:'whatsapp',body:value}});
 for(const role of ['team_coach','team_manager']){
   assert.equal(validateStage3D5(request(body,role)).input.body,body);
   assert.equal(validateStage3D5(request(body.replace(/\n/g,'\r\n'),role)).input.body,body);
 }
 for(const invalid of [' ', 'a\0b', 'a\tb', 'a\rb', 'a\u001bb', 'a\u007fb','x'.repeat(1501)])
   assert.equal(validateStage3D5(request(invalid)),null);
 assert.equal(validateStage3D5(request(body,'team_player')),null);
 assert.equal(validateStage3D5({...request(body),action:'settings.save',input:{teamLabel:'a\nb',jerseyLoan:false,expectedVersion:0}}),null);
});
test('cancellation and reminder candidates do not overlap',()=>{
 const now=new Date('2026-11-24T09:00:00+11:00');
 const row=(sessionId,status,startsAt)=>({sessionId,status,startsAt,kind:'training'});
 const planned=row('planned','planned','2026-11-27T18:00:00+11:00');
 const postponed=row('postponed','postponed','2026-11-25T18:00:00+11:00');
 const past=row('past','cancelled','2026-11-20T18:00:00+11:00');
 const future=row('cancelled','cancelled','2026-11-28T18:00:00+11:00');
 assert.equal(cancelledCloudTraining([planned,postponed,past],{now}),null);
 assert.equal(cancelledCloudTraining([planned,postponed,past,future],{now}).sessionId,'cancelled');
 assert.equal(nextCloudTraining([postponed,future,planned],{now}).sessionId,'planned');
 assert.equal(nextCloudTraining([postponed,future],{now}),null);
 assert.equal(containsUnfilledTemplate('[Choose an actually cancelled upcoming training session before sending]'),true);
});
