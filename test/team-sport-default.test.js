import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../site/model.js';

const make = () => M.migrateWorkspace({
  schema: 4, id: 'team1', team: { name: 'Titans League', sport: '', clubId: 'titans', positions: M.SPORT_POSITIONS.Oztag.slice(), positionsCustom: false },
  players: [{ id: 'amy', name: 'Amy', positions: ['Wing'], number: '7', jerseys: [] }],
  teams: [{ id: 'team2', team: { name: 'Titans League Tag', sport: 'League tag', clubId: 'titans', positions: M.SPORT_POSITIONS.Oztag.slice(), positionsCustom: false },
    players: [{ id: 'alice', name: 'Alice', number: '11', positions: ['Halfback'], jerseys: [] }] },
    { id: 'team3', team: { name: 'St George Touch', sport: 'Touch football', clubId: 'stgeorge', positions: M.SPORT_POSITIONS.Oztag.slice(), positionsCustom: false },
      players: [] }],
  clubs: [{ id: 'titans', name: 'Taren Point Titans', sport: 'Rugby league' },
    { id: 'stgeorge', name: 'St George Oztag', sport: 'Oztag' }],
  library: {}
});

test('club default sport applies only to teams without an explicit override', () => {
  const ws = make();
  assert.equal(M.teamSport(ws.team, M.clubOf(ws, ws)), 'Rugby league');
  assert.equal(M.teamSport(ws.teams[0].team, M.clubOf(ws, ws.teams[0])), 'League tag');
  assert.equal(M.teamSport(ws.teams[1].team, M.clubOf(ws, ws.teams[1])), 'Touch football');
  assert.deepEqual(M.positionsFor(ws.team, M.clubOf(ws,ws)), M.SPORT_POSITIONS['Rugby league']);
  assert.deepEqual(M.positionsFor(ws.teams[0].team, M.clubOf(ws,ws.teams[0])), M.SPORT_POSITIONS['League tag']);
  assert.deepEqual(M.positionsFor(ws.teams[1].team, M.clubOf(ws,ws.teams[1])), M.SPORT_POSITIONS['Touch football']);
  assert.ok(!M.positionsFor(ws.teams[1].team,M.clubOf(ws,ws.teams[1])).includes('Rover'),
    'Touch team does not inherit Oztag Rover merely because the club is Oztag');
});

test('changing a club default affects inherited teams only, and never rewrites old player preferences', () => {
  const ws = make(), inherited = ws, override = ws.teams[0], leaguePlayer = ws.players[0], tagPlayer = override.players[0];
  const oldLeaguePos = leaguePlayer.positions.slice(), oldTagPos = tagPlayer.positions.slice();
  ws.clubs.find(c => c.id === 'titans').sport = 'Netball';
  M.syncSportPositions(ws);
  assert.deepEqual(M.positionsFor(inherited.team,M.clubOf(ws,inherited)), M.SPORT_POSITIONS.Netball);
  assert.deepEqual(M.positionsFor(override.team,M.clubOf(ws,override)), M.SPORT_POSITIONS['League tag']);
  assert.deepEqual(leaguePlayer.positions, oldLeaguePos);
  assert.deepEqual(tagPlayer.positions, oldTagPos);
});

test('explicit team override takes effect despite club default, and existing custom list remains intact', () => {
  const ws = make(), t = ws.teams[1];
  assert.deepEqual(M.positionsFor(t.team, M.clubOf(ws,t)), M.SPORT_POSITIONS['Touch football']);
  const before = structuredClone(t.team), club = M.clubOf(ws,t);
  t.team.sport = 'Netball';
  let result = M.changedSportPositions(before, club, t.team, club, M.positionsFor(before,club));
  assert.deepEqual(result, { positions: M.SPORT_POSITIONS.Netball, positionsCustom: false });
  t.team.positions = ['Left wing', 'Right wing', 'Utility']; t.team.positionsCustom = true;
  const custom = structuredClone(t.team);
  t.team.sport = 'Rugby league';
  result = M.changedSportPositions(custom,club,t.team,club, custom.positions);
  assert.deepEqual(result, {positions: custom.positions, positionsCustom: true});
});

test('team/club sport settings preserve all jersey histories and survive migration', () => {
  const ws = make();
  const a = ws.players[0];
  a.jerseys = [{id:'kit7',number:'7',seasonId:M.activeSeason(ws).id,out:'2026-03-01',back:''}];
  const old = JSON.stringify(a.jerseys);
  ws.teams[0].team.sport = 'League tag';
  M.syncSportPositions(ws);
  assert.equal(JSON.stringify(a.jerseys), old, 'club/team sport does not alter jersey loan history');
  const restored = M.migrateWorkspace(JSON.parse(JSON.stringify(ws)));
  assert.equal(M.teamSport(restored.teams[0].team, M.clubOf(restored,restored.teams[0])), 'League tag');
  assert.equal(M.stable(restored), M.stable(M.migrateWorkspace(JSON.parse(JSON.stringify(restored)))));
});
