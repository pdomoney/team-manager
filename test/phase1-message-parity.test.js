import test from 'node:test';
import assert from 'node:assert/strict';
import {nextMatchMessageText,competitionCountdownText,
 manualTeamTemplateText,containsUnfilledTemplate,accountInvitationText,
 TEAM_MESSAGE_TEMPLATES} from '../site/shared-team-messages.js';

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
