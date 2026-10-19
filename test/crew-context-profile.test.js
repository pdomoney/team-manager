import test from 'node:test';
import assert from 'node:assert/strict';
import {
  crewPolicyContext, policyFitsContext, normCrewRules, normCrewPerson,
  matchCrewCheck, canCrewServe
} from '../site/match-crew.js';

const team = {
 id:'u12',team:{sport:'Rugby league',clubId:'titans',ageGroup:'Under 12',
  category:'girls',division:'Gold'}
};
const competition = {comp:{id:'comp-gold',name:'2026 Gold'},entry:{division:'Gold'}};
const checked = {
 source:'NSW competition rules: official U12 Girls Gold rule, checked manually',
 year:'2026',...crewPolicyContext(team,competition),
 rows:[{role:'coach',min:1}]
};
const volunteer = {
 id:'staff',name:'Staff',clubIds:['titans'],teamIds:['u12'],roles:['coach'],
 rolesBySport:{'Rugby league':['coach']},
 registrationBySport:{'Rugby league':{coach:'2026'}},
 squadYears:{u12:'2026'},wwccStatus:'checked',wwccExpiry:'2030-01-01',
 accreditationBySport:{'Rugby league':{coach:'2030-01-01'}}
};
const match={date:'2026-11-01',entryId:'comp-entry',crew:[{personId:'staff',role:'coach',confirmed:true}]};

test('age, gender/category, division and competition must match an approved policy',()=>{
 const correct=matchCrewCheck([volunteer],team,match,checked,competition);
 assert.equal(correct.configured,true);
 assert.equal(correct.ready,true);
 for (const replacement of [
  {...team,team:{...team.team,category:'boys'}},
  {...team,team:{...team.team,ageGroup:'Under 13'}},
  {...team,team:{...team.team,division:'Silver'}}
 ]) {
  const result=matchCrewCheck([volunteer],replacement,match,checked,competition);
  assert.equal(result.configured,false);
  assert.equal(result.ready,false);
  assert.equal(result.shortages.length,0);
  assert.match(result.issues.join(' '),/do not match/);
 }
 assert.equal(matchCrewCheck([volunteer],team,match,checked,{comp:{id:'other'},entry:{division:'Gold'}}).ready,false);
 assert.equal(matchCrewCheck([volunteer],team,match,checked,null).ready,false);
});
test('legacy sport-only policies do not qualify specific junior girls teams',()=>{
 const original={source:'Existing league rules',year:'2026',sport:'Rugby league',rows:[{role:'coach',min:1}]};
 assert.equal(policyFitsContext(original,team,competition),false);
 assert.equal(matchCrewCheck([volunteer],team,match,original,competition).ready,false);
});
test('profile safely keeps contact, joined year, photo and separate sport qualification history',()=>{
 const image='data:image/png;base64,AA==';
 const p=normCrewPerson({
  ...volunteer,email:'volunteer@example.com',phone:'0400 123 123',
  photo:image,clubSince:{titans:'2014',stgeorge:'2020'},
  qualificationSinceBySport:{'Rugby league':{blue:'2019'},Oztag:{firstAid:'2015'}},
  accreditationBySport:{'Rugby league':{blue:'2027-11-01'},Oztag:{firstAid:'2028-11-01'}},
  wwccNumber:'NOT-STORED',dateOfBirth:'1980-01-01',imageDocument:'NOT-STORED'
 });
 assert.equal(p.photo,image);
 assert.equal(p.phone,'0400 123 123');
 assert.deepEqual(p.clubSince,{titans:'2014',stgeorge:'2020'});
 assert.equal(p.qualificationSinceBySport.Oztag.firstAid,'2015');
 assert.equal(p.accreditationBySport['Rugby league'].blue,'2027-11-01');
 assert.equal(JSON.stringify(p).includes('NOT-STORED'),false);
 assert.equal(normCrewPerson({...volunteer,photo:'javascript:alert(1)'}).photo,'');
});
test('per-sport accreditation stays independent and expiry enforces negative evidence',()=>{
 const p={...volunteer,rolesBySport:{'Rugby league':['coach'],Oztag:['firstAid']},
  registrationBySport:{'Rugby league':{coach:'2026'},Oztag:{trainer:'2026'}},
  accreditation:{firstAid:'2030-01-01'},accreditationBySport:{
    'Rugby league':{coach:'2030-01-01'}, Oztag:{firstAid:'2020-01-01'}
  }};
 const oz={...team,team:{...team.team,sport:'Oztag'}};
 assert.match(canCrewServe(p,oz,'firstAid','2026-11-01'),/accreditation/);
 assert.equal(canCrewServe(p,team,'coach','2026-11-01'),'');
});
