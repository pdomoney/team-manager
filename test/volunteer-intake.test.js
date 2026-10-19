import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validEmail, normalEmail, memberOfClub, inTeamPool, localClubDirectory,
  clubTeamChoices, withClubAssociation, validateManualVolunteer, invitationMessage
} from '../site/volunteer-intake.js';
import { canCrewServe, normCrewPerson } from '../site/match-crew.js';

const league={id:'league-u12',team:{clubId:'titans',sport:'Rugby league'}};
const oztag={id:'oz-open',team:{clubId:'george',sport:'Oztag'}};

test('club association does not duplicate one person or rewrite other clubs',()=>{
  const original={id:'person-1',name:'Jo Smith',clubId:'george',teamIds:['oz-open'],roles:['firstAid']};
  const linked=withClubAssociation(original,'titans','league-u12');
  assert.equal(linked.id,original.id);
  assert.deepEqual(linked.teamIds,['oz-open','league-u12']);
  assert.deepEqual(linked.clubIds,['titans']);
  assert.equal(memberOfClub(linked,'george'),true);
  assert.equal(memberOfClub(linked,'titans'),true);
  assert.equal(inTeamPool(linked,league),true);
  assert.equal(inTeamPool(linked,oztag),true);
  assert.deepEqual(withClubAssociation(linked,'titans','league-u12').teamIds,linked.teamIds);
  assert.deepEqual(original.teamIds,['oz-open']);
});

test('club directory is scoped; a person with no team is still visible',()=>{
  const people=[
    {id:'a',name:'A',clubIds:['titans'],teamIds:[]},
    {id:'b',name:'B',clubId:'george',teamIds:[]},
    {id:'c',name:'C',clubIds:[],teamIds:['league-u12']}
  ];
  assert.deepEqual(localClubDirectory(people,'titans',[league,oztag]).map(p=>p.id),['a','c']);
  assert.deepEqual(localClubDirectory(people,'george',[league,oztag]).map(p=>p.id),['b']);
  assert.equal(inTeamPool(people[0],oztag),false);
  assert.deepEqual(clubTeamChoices([league,oztag,{...league,id:'archived',archived:true}], 'titans').map(x=>x.id),['league-u12']);
});

test('manual intake allows offline records and rejects duplicate email',()=>{
  assert.equal(validateManualVolunteer({name:'No Email'},[]),'');
  assert.equal(validateManualVolunteer({name:'No Email',email:'invalid'},[]).includes('email'),true);
  assert.equal(validateManualVolunteer({name:''},[]).includes('name'),true);
  const people=[{id:'a',email:'volunteer@example.com'}];
  assert.match(validateManualVolunteer({name:'Someone',email:'VOLUNTEER@example.com'},people),/already belongs/);
  assert.equal(normalEmail('  Jo@Example.com '),'jo@example.com');
  assert.equal(validEmail('jo@example.com'),true);
});

test('manual volunteer starts unqualified even when assigned to a club and team',()=>{
  const p=normCrewPerson(withClubAssociation({id:'person',name:'Jo',email:'jo@example.com',roles:[],
    rolesBySport:{},registrationBySport:{},wwccStatus:'unverified'},'titans','league-u12'));
  assert.equal(p.email,'jo@example.com');
  assert.equal(p.clubIds.includes('titans'),true);
  assert.match(canCrewServe(p,league,'coach','2026-11-01'),/not eligible/);
});

test('email draft contains no account link or delivery claim',()=>{
  const msg=invitationMessage('Taren Point Titans','  VOLUNTEER@example.com ','Womens Open Gold');
  assert.equal(msg.to,'volunteer@example.com');
  assert.match(msg.subject,/Taren Point Titans/);
  assert.match(msg.body,/Womens Open Gold/);
  assert.match(msg.body,/No online enrolment link/);
  assert.equal(/https?:\/\//.test(msg.body),false);
  assert.throws(()=>invitationMessage('Titans','not-an-email'),/valid/);
});
