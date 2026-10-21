import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../site/model.js';

const fixture = () => {
  const source = {id:'team1',team:{name:'Oztag',sport:'Oztag'},players:[
    {id:'player1',name:'Alex',number:'9',positions:['Link'],status:'available',
      jerseys:[{number:'9',issued:'2026-01-01'}],notes:'Private team note'}
  ],seasons:[{id:'s26',name:'2026',status:'active',squad:[]}]};
  source.teams=[{id:'team2',team:{name:'League Tag',sport:'League tag'},players:[],
    seasons:[{id:'s27',name:'2027',status:'active',squad:[]}]}];
  return source;
};

test('P05B deliberate cross-sport linking keeps team positions, numbers and jerseys local',()=>{
  const ws=fixture(), source=ws.players[0], before=M.clone(source);
  const result=M.linkPlayerTeams(ws,'team1','player1','team2');
  assert.equal(result.error,undefined);
  assert.equal(result.player.number,'');
  assert.deepEqual(result.player.positions,[]);
  assert.deepEqual(result.player.jerseys,[]);
  assert.equal(result.player.notes,'');
  assert.equal(result.player.personId,source.personId);
  assert.deepEqual(source.jerseys,before.jerseys);
  assert.deepEqual(source.positions,before.positions);
  result.player.positions=['Fullback'];result.player.number='11';
  assert.deepEqual(source.positions,['Link']);
  assert.equal(source.number,'9');
  assert.equal(M.linkPlayerTeams(ws,'team1','player1','team2').error,'This player is already linked to that team.');
});

test('P05B duplicate source IDs fail atomically without editing jersey history',()=>{
  const ws=fixture();
  ws.players.push({...M.clone(ws.players[0]),number:'20'});
  const before=JSON.stringify(ws);
  assert.match(M.linkPlayerTeams(ws,'team1','player1','team2').error,/uniquely identified source/);
  assert.equal(JSON.stringify(ws),before);
});

test('P05B duplicate destination IDs cannot bind wrong archived person',()=>{
  const ws=fixture();
  ws.teams[0].players=[
    {id:'p2',name:'Alex',positions:['Fullback'],number:'14',jerseys:[{number:'14'}]},
    {id:'p2',name:'Alex',positions:['Wing'],number:'21',jerseys:[{number:'21'}]}
  ];
  const before=JSON.stringify(ws);
  assert.match(M.linkPlayerTeams(ws,'team1','player1','team2','p2').error,/uniquely identified destination/);
  assert.equal(JSON.stringify(ws),before);
});

test('P05B duplicate team IDs and archived sources cannot establish ambiguous links',()=>{
  const ws=fixture();
  ws.teams.push({id:'team2',team:{name:'Duplicate'},players:[],seasons:[{id:'s27',status:'active',squad:[]}]});
  const before=JSON.stringify(ws);
  assert.match(M.linkPlayerTeams(ws,'team1','player1','team2').error,/duplicate team IDs/);
  assert.equal(JSON.stringify(ws),before);
  ws.teams.pop();ws.archived=true;
  const archived=JSON.stringify(ws);
  assert.match(M.linkPlayerTeams(ws,'team1','player1','team2').error,/Archived source/);
  assert.equal(JSON.stringify(ws),archived);
});

test('P05B explicitly linking an existing team-local record never overwrites its kit or positions',()=>{
  const ws=fixture();
  const t=ws.teams[0];
  t.players=[{id:'p2',name:'Alex',number:'13',positions:['Centre'],jerseys:[{number:'13',back:'2026-09-01'}],status:'available'}];
  const before=M.clone(t.players[0]);
  const r=M.linkPlayerTeams(ws,'team1','player1','team2','p2');
  assert.equal(r.linkedExisting,true);
  assert.equal(r.player.personId,ws.players[0].personId);
  assert.equal(r.player.number,before.number);
  assert.deepEqual(r.player.positions,before.positions);
  assert.deepEqual(r.player.jerseys,before.jerseys);
});
