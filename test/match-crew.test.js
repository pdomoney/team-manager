import test from 'node:test';
import assert from 'node:assert/strict';
import { canCrewServe, matchCrewCheck, normCrewPerson, normCrewRules, crewScheduleClashes } from '../site/match-crew.js';

const team = { id: 'u12', team: { clubId: 'titans', sport: 'Rugby league' } };
const person = (id, roles, reg = { trainer: '2026', coach: '2026', volunteer: '2026' }) =>
 ({ id, name: id, clubId: 'titans', teamIds: [], squadYears:{u12:'2026'}, active: true, roles, registration: reg,
    wwccStatus: 'checked', wwccExpiry: '2027-01-01',
    accreditation: Object.fromEntries(roles.map(r => [r, '2027-01-01'])) });
const date = '2026-11-01';
const policy = { source: 'Approved club U12 match-day rules, reviewed 2026', year: '2026', rows: [
  { role: 'coach', min: 1 }, { role: 'manager', min: 1 }, { role: 'firstResponder', min: 1 }
] };

test('coach and first responder must be separate assigned people', () => {
  const c = person('c', ['coach','blue']), m = person('m', ['manager']);
  let report = matchCrewCheck([c, m], team, { date, crew: [
    { personId: 'c', role: 'coach', confirmed: true },
    { personId: 'c', role: 'blue', confirmed: true },
    { personId: 'm', role: 'manager', confirmed: true }] }, policy);
  assert.equal(report.ready, false);
  assert.ok(report.issues.some(x => x.includes('assigned twice')));
  const t = person('t', ['green']);
  report = matchCrewCheck([c,m,t], team, { date, crew: [
    { personId: 'c', role: 'coach', confirmed: true },
    { personId: 'm', role: 'manager', confirmed: true },
    { personId: 't', role: 'green', confirmed: true }] }, policy);
  assert.equal(report.ready, true);
});

test('club-wide registration alone does not certify a person for each team squad', () => {
  const p = { ...person('b', ['blue']), squadYears: {} };
  assert.match(canCrewServe(p,team,'blue',date),/squad allocation/);
  assert.equal(canCrewServe({ ...p,squadYears:{u12:'2026'} },team,'blue',date),'');
});

test('missing policy can never display match ready', () => {
  const c = person('c', ['coach']);
  assert.equal(matchCrewCheck([c], team, { date, crew: [{personId:'c',role:'coach',confirmed:true}] }, {source:'',rows:[]}).ready,false);
});

test('qualification types and time are checked for each job and date', () => {
  assert.match(canCrewServe(person('p',['blue'],{trainer:'2025'}),team,'blue',date),/registration/);
  assert.match(canCrewServe({ ...person('p',['blue']),wwccExpiry:'2026-01-01' },team,'blue',date),/WWCC/);
  assert.match(canCrewServe({ ...person('p',['blue']),accreditation:{blue:'2026-01-01'} },team,'blue',date),/accreditation/);
  assert.match(canCrewServe({ ...person('p',['blue']),clubId:'other',teamIds:[] },team,'blue',date),/club/);
  assert.equal(canCrewServe({ ...person('p',['blue']),clubId:'other',teamIds:['u12'] },team,'blue',date),'');
  assert.match(canCrewServe(person('p',['yellow']),team,'green',date),/Role/);
});

test('unconfirmed attendance never fulfils a role minimum', () => {
  const p = person('p',['blue']);
  const res = matchCrewCheck([p],team,{date,crew:[{personId:'p',role:'blue',confirmed:false}]},
    {source:'Local requirement',year:'2026',rows:[{role:'firstResponder',min:1}]});
  assert.equal(res.ready,false);
  assert.equal(res.shortages[0].missing,1);
});

test('configured combined minimum counts distinct qualifying jobs', () => {
  const a=person('a',['green']), b=person('b',['orange']);
  const r=matchCrewCheck([a,b],team,{date,crew:[
    {personId:'a',role:'green',confirmed:true},{personId:'b',role:'orange',confirmed:true}
  ]},{source:'Local rule',year:'2026',rows:[{role:'firstResponder',min:2}]});
  assert.equal(r.ready,true);
});

test('normalisation does not retain sensitive ID numbers or external unknown values', () => {
  const n=normCrewPerson({...person('p',['yellow']),wwccNumber:'AB-123',dateOfBirth:'1980-01-01'});
  assert.ok(!JSON.stringify(n).includes('AB-123'));
  assert.ok(!JSON.stringify(n).includes('1980-01-01'));
  assert.deepEqual(normCrewRules({source:'',rows:[{role:'firstResponder',min:1},{role:'bad',min:1}]}).rows,[{role:'firstResponder',min:1}]);
});


test('two overlapping minimums require two separate people, not one blue trainer counted twice', () => {
  const blue = person('b', ['blue']);
  const rule = { source: 'Association staff rule', year: '2026', rows: [
    {role: 'firstResponder',min:1}, {role:'level1',min:1}
  ]};
  const one = matchCrewCheck([blue],team,{date,crew:[{personId:'b',role:'blue',confirmed:true}]},rule);
  assert.equal(one.ready,false);
  assert.equal(one.shortages.reduce((n,x)=>n+x.missing,0),1);
  const orange = person('o',['orange']);
  const two = matchCrewCheck([blue,orange],team,{date,crew:[
    {personId:'b',role:'blue',confirmed:true},{personId:'o',role:'orange',confirmed:true}
  ]},rule);
  assert.equal(two.ready,true);
});
test('a match in the next season cannot use the previous season local policy',()=>{
  const blue = person('b',['blue']);
  const r = matchCrewCheck([blue],team,{date:'2027-01-15',crew:[{personId:'b',role:'blue',confirmed:true}]},
    {source:'2026 local rules',year:'2026',rows:[{role:'firstResponder',min:1}]});
  assert.equal(r.configured,false);
  assert.equal(r.ready,false);
});


test('shared club trainer double-booked across two games is flagged', () => {
  const match = { id:'one', date, start:'09:00', status:'scheduled',
    crew:[{personId:'t',role:'green',confirmed:true}] };
  const other = { id:'two', date, start:'09:30', status:'scheduled',
    crew:[{personId:'t',role:'blue',confirmed:true}] };
  const teams = [
    { id:'u12', matches:[match] },
    { id:'u13', matches:[other] }
  ];
  assert.equal(crewScheduleClashes(teams,'u12',match).length,1);
  other.start='13:30';
  assert.deepEqual(crewScheduleClashes(teams,'u12',match),[]);
  other.start='';
  assert.equal(crewScheduleClashes(teams,'u12',match).length,1);
  other.status='cancelled';
  assert.deepEqual(crewScheduleClashes(teams,'u12',match),[]);
});


test('Oztag and Touch never accept league shirt trainer roles or league policy',()=>{
  const nz={id:'u12',team:{clubId:'titans',sport:'Oztag'}};
  const t={...person('x',['green','firstAid']),registrationBySport:{Oztag:{trainer:'2026'}},
    squadYears:{u12:'2026'}};
  assert.match(canCrewServe(t,nz,'green',date),/not eligible/);
  assert.equal(canCrewServe(t,nz,'firstAid',date),'');
  const bad={source:'Old league staffing',year:'2026',sport:'Rugby league',rows:[{role:'firstResponder',min:1}]};
  assert.equal(matchCrewCheck([t],nz,{date,crew:[{personId:'x',role:'green',confirmed:true}]},bad).ready,false);
  const good={source:'Reviewed local Oztag rules',year:'2026',sport:'Oztag',rows:[{role:'firstAid',min:1}]};
  assert.equal(matchCrewCheck([t],nz,{date,crew:[{personId:'x',role:'firstAid',confirmed:true}]},good).ready,true);
  const touch={...nz,team:{...nz.team,sport:'Touch football'}};
  assert.match(canCrewServe(t,touch,'firstAid',date),/registration/);
});

test('registrations remain independent for shared people and each sport',()=>{
 const p={...person('x',['coach','firstAid']),registrationBySport:{Oztag:{coach:'2026',trainer:'2026'}},
 accreditation:{firstAid:'2027-01-01',coach:'2027-01-01'}};
 assert.equal(canCrewServe(p,{...team,team:{...team.team,sport:'Oztag'}},'firstAid',date),'');
 assert.match(canCrewServe(p,team,'firstAid',date),/registration/);
 p.registrationBySport['Rugby league']={trainer:'2026'};
 assert.equal(canCrewServe(p,team,'firstAid',date),'');
});

test('other sport profiles do not inherit league shirt or first-responder group', async()=>{
 const mod=await import('../site/match-crew.js');
 for(const sport of ['Oztag','Touch football','Rugby union','Netball']){
  assert.equal(mod.crewRoleAllowed(sport,'yellow'),false);
  assert.equal(mod.crewRequirementAllowed(sport,'firstResponder'),false);
  assert.equal(mod.crewRoleAllowed(sport,'firstAid'),true);
 }
 assert.equal(mod.crewRoleAllowed('League tag','blue'),true);
 assert.equal(mod.crewProfile('Touch football').provider.includes('MySideline'),true);
 assert.equal(mod.crewProfile('Rugby union').provider,'Rugby Xplorer');
});
