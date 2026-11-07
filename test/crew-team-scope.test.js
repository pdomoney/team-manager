import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isHomeTeamCrewScope, teamCrewDirectory, teamCrewReadiness
} from '../site/crew-team-scope.js';

const team = () => ({
  id: 'titansA', team: { clubId: 'titans', name: 'Titans Demo A' },
  matches: [{ id: 'a1', crew: [{ personId: 'match-staff' }] }]
});

test('only an explicit Home team selection scopes the match-staff screen', () => {
  const t = team();
  assert.equal(isHomeTeamCrewScope({kind:'team', id:'titansA'}, t),true);
  for (const scope of [
    {kind:'all',id:''}, {kind:'club',id:'titans'},
    {kind:'team',id:'titansB'}, {kind:'team',id:''},null
  ]) assert.equal(isHomeTeamCrewScope(scope,t),false);
  assert.equal(isHomeTeamCrewScope({kind:'team',id:'titansA'},null),false);
});

test('team staff projection uses explicit association, season and fixture, never club membership alone', () => {
  const t = team();
  const people = [
    {id:'team-staff',name:'Team A',teamIds:['titansA']},
    {id:'season-staff',name:'Historical A',squadYears:{titansA:'2026'}},
    {id:'match-staff',name:'Game A',clubIds:['titans']},
    {id:'club-only',name:'Club only',clubIds:['titans']},
    {id:'other-team',name:'Team B',clubIds:['titans'],teamIds:['titansB']},
    {id:'foreign',name:'Different club',clubIds:['foreign']}
  ];
  const before = JSON.stringify({t,people});
  assert.deepEqual(teamCrewDirectory(people,t).map(p=>p.id),[
    'team-staff','season-staff','match-staff'
  ]);
  assert.deepEqual(teamCrewDirectory(people,{id:'titansB',matches:[]}).map(p=>p.id),[
    'other-team'
  ]);
  assert.deepEqual(teamCrewDirectory(people,null),[]);
  assert.equal(JSON.stringify({t,people}),before);
});

test('team readiness and actions have exact team parity without reclassifying unverified fixtures', () => {
  const index = {clubId:'titans',totals:{fixtures:4,covered:1,attention:1,unverified:2},
    fixtures:[
      {teamId:'titansA',matchId:'a1',state:'unverified'},
      {teamId:'titansA',matchId:'a2',state:'attention'},
      {teamId:'titansB',matchId:'b1',state:'covered'},
      {teamId:'titansB',matchId:'b2',state:'unverified'}
    ]};
  const actions = [
    {teamId:'titansA',matchId:'a1',category:'policy'},
    {teamId:'titansB',matchId:'b2',category:'policy'}
  ];
  const before = JSON.stringify({index,actions});
  const result = teamCrewReadiness(index,actions,'titansA');
  assert.deepEqual(result.readiness.totals,{
    fixtures:2,covered:0,attention:1,unverified:1
  });
  assert.deepEqual(result.readiness.fixtures.map(f=>f.matchId),['a1','a2']);
  assert.deepEqual(result.actions.map(x=>x.matchId),['a1']);
  assert.equal(JSON.stringify(result).includes('titansB'),false);
  assert.equal(Object.isFrozen(result.readiness.fixtures),true);
  assert.equal(JSON.stringify({index,actions}),before);
  assert.deepEqual(teamCrewReadiness(index,actions,'missing').readiness.totals,{
    fixtures:0,covered:0,attention:0,unverified:0
  });
});
