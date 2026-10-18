// Preferred positions: which sport a team plays, the positions that go with it, a team's own list,
// changing club or sport in Settings, new teams, and upgrading older data.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../site/model.js';
import { teamView } from '../site/vault.js';

const OZ = ['Wing', 'Link', 'Rover', 'Middle'], RL = M.SPORT_POSITIONS['Rugby league'], NB = M.SPORT_POSITIONS.Netball;
const CLUBS = [{ id: 'oz', name: 'Oztag Club', sport: 'Oztag' }, { id: 'rl', name: 'League Club', sport: 'Rugby league' }, { id: 'nb', name: 'Netball Club', sport: 'Netball' }, { id: 'none', name: 'No Sport Club', sport: '' }];
const team = (T, players = []) => M.migrateWorkspace({ schema: 3, id: 'team1', team: { name: 'Test Team', ...T }, players, clubs: CLUBS, teams: [], library: {} });
// The Settings save as the app does it: capture, change club and sport, then the positions field.
function settingsSave(ws, { clubId, sport, positions, shown }) {
  const T = ws.team, before = { clubId: T.clubId || '', sport: M.teamSport(T, M.clubOf(ws, ws)), custom: !!T.positionsCustom, positions: T.positions.slice() };
  const formShown = shown !== undefined ? shown : M.positionsFor(T, M.clubOf(ws, ws)).join(', ');
  T.clubId = clubId; T.sport = sport;
  M.applyPositions(T, M.clubOf(ws, ws), before, positions === undefined ? formShown : positions, formShown);
  M.syncPositions(ws);
  return ws;
}
const pos = ws => M.positionsFor(ws.team, M.clubOf(ws, ws));

test('every sport resolves its catalogue; the expected lists', () => {
  M.SPORTS.forEach(s => assert.deepEqual(M.positionsFor({ sport: s }, null), M.SPORT_POSITIONS[s], s));
  assert.deepEqual(M.SPORT_POSITIONS.Oztag, OZ);
  assert.deepEqual(RL, ['Fullback', 'Wing', 'Centre', 'Five-eighth', 'Halfback', 'Hooker', 'Prop', 'Second row', 'Lock']);
  assert.deepEqual(M.SPORT_POSITIONS['League tag'], RL, 'league tag uses rugby league positions');
  assert.deepEqual(M.SPORT_POSITIONS['Rugby union'], ['Prop', 'Hooker', 'Lock', 'Flanker', 'Number 8', 'Scrum-half', 'Fly-half', 'Centre', 'Wing', 'Fullback']);
  assert.deepEqual(NB, ['GS', 'GA', 'WA', 'C', 'WD', 'GD', 'GK']);
  assert.deepEqual(M.SPORT_POSITIONS['Football (soccer)'], ['Goalkeeper', 'Defender', 'Midfielder', 'Forward']);
  assert.deepEqual(M.SPORT_POSITIONS.Basketball, ['Point guard', 'Shooting guard', 'Small forward', 'Power forward', 'Centre']);
  assert.deepEqual(M.SPORT_POSITIONS.Other, []);
});

test('sport: the team’s own, then its club’s, then Oztag', () => {
  assert.equal(M.teamSport({ sport: 'Netball' }, { sport: 'Rugby league' }), 'Netball', 'team sport override');
  assert.equal(M.teamSport({}, { sport: 'Rugby league' }), 'Rugby league', 'inherited from the club');
  assert.equal(M.teamSport({}, { sport: '' }), 'Oztag', 'a club with no sport set');
  assert.equal(M.teamSport({}, null), 'Oztag', 'no club');
});

test('new players see their team’s sport’s positions, even where the team was made with Oztag’s', () => {
  // the app makes every team from the same starting data, which has the Oztag list
  assert.deepEqual(pos(team({ clubId: 'rl', positions: OZ })), RL, 'rugby league');
  assert.deepEqual(pos(team({ clubId: 'nb', positions: OZ })), NB, 'netball');
  assert.deepEqual(pos(team({ clubId: 'oz', positions: OZ })), OZ, 'oztag');
  assert.deepEqual(pos(team({ clubId: 'oz', sport: 'Netball', positions: OZ })), NB, 'the team’s sport over its club’s');
  const ws = team({ clubId: 'rl', positions: OZ });
  assert.deepEqual(ws.team.positions, RL, 'the list in use is saved too, for older copies of the app and the players’ file');
  assert.deepEqual(teamView(M.activeLens(ws), null).team.positions, RL);
});

test('upgrading older data: an app list follows the sport, anything else is kept as the team’s own', () => {
  const cases = [
    [{ clubId: 'rl', positions: OZ }, false, RL],
    [{ clubId: 'rl', positions: ['Wing', 'Link', 'Middle', 'Half'] }, false, RL],     // Oztag's list before "Rover"
    [{ clubId: 'nb', positions: M.SPORT_POSITIONS['Touch football'] }, false, NB],   // another sport's list, in full and in order
    [{ clubId: 'rl', positions: [] }, false, RL],
    [{ clubId: 'rl', positions: ['Front', 'Back'] }, true, ['Front', 'Back']],
    [{ clubId: 'rl', positions: ['Wing', 'Link'] }, true, ['Wing', 'Link']],         // part of a list: ambiguous, so kept
    [{ clubId: 'rl', positions: ['Middle', 'Wing', 'Link', 'Rover'] }, true, ['Middle', 'Wing', 'Link', 'Rover']], // reordered: kept
    [{ clubId: 'oz', positions: OZ }, false, OZ],
  ];
  for (const [T, custom, want] of cases) {
    const ws = team(T);
    assert.equal(ws.team.positionsCustom, custom, JSON.stringify(T.positions));
    assert.deepEqual(pos(ws), want, JSON.stringify(T.positions));
    const again = M.migrateWorkspace(JSON.parse(JSON.stringify(ws)));
    assert.equal(M.stable(again), M.stable(ws), 'upgrading again changes nothing');
  }
  // a list typed in on an older version of the app (which doesn't know the flag) is the team's own
  const ws = team({ clubId: 'rl', positions: OZ }); ws.team.positions = ['Left', 'Right'];
  M.syncPositions(ws); assert.equal(ws.team.positionsCustom, true); assert.deepEqual(pos(ws), ['Left', 'Right']);
});

test('players keep the positions they had: nothing in a player or a past season changes with the sport', () => {
  const ws = team({ clubId: 'oz', positions: OZ }, [{ id: 'a', name: 'Player A', number: '1', positions: ['Rover', 'Wing'], status: 'available' }]);
  const r = M.rollover(ws, { name: 'Next', activate: true, carry: [{ playerId: 'a', number: '1', positions: ['Rover', 'Wing'] }] }, new Date(2027, 0, 1));
  const past = ws.seasons.find(s => s.id !== r.season.id);
  const pastBefore = JSON.stringify(past);
  settingsSave(ws, { clubId: 'rl', sport: '' });
  assert.deepEqual(pos(ws), RL);
  assert.deepEqual(ws.players[0].positions, ['Rover', 'Wing'], 'the player keeps their Oztag positions until the coach changes them');
  assert.equal(JSON.stringify(past), pastBefore, 'the past season is untouched');
  assert.deepEqual(M.seasonLens(ws, past.id).players[0].positions, ['Rover', 'Wing']);
});

test('Settings save: all nine cases', () => {
  // 1. explicit sport selection
  let ws = settingsSave(team({ clubId: 'oz', positions: OZ }), { clubId: 'oz', sport: 'Netball' });
  assert.deepEqual([pos(ws), ws.team.positionsCustom], [NB, false], '1');
  // 2. inherited from the club, 3. moving between clubs of different sports (the original bug)
  ws = settingsSave(team({ clubId: 'oz', positions: OZ }), { clubId: 'rl', sport: '' });
  assert.deepEqual(pos(ws), RL, '2–3. Oztag club → rugby league club, sport inherited');
  ws = settingsSave(ws, { clubId: 'nb', sport: '' });
  assert.deepEqual(pos(ws), NB, '3. then a netball club');
  // 4. removing the club: back to the default sport
  ws = settingsSave(ws, { clubId: '', sport: '' });
  assert.deepEqual(pos(ws), OZ, '4');
  // 8. the team's own list stays through a club and sport change
  ws = settingsSave(team({ clubId: 'oz', positions: OZ }), { clubId: 'oz', sport: '', positions: 'Front, Middle, Back' });
  assert.deepEqual([pos(ws), ws.team.positionsCustom], [['Front', 'Middle', 'Back'], true], '8. entered');
  ws = settingsSave(ws, { clubId: 'rl', sport: '' });
  assert.deepEqual(pos(ws), ['Front', 'Middle', 'Back'], '8. kept when the club changes');
  ws = settingsSave(ws, { clubId: 'rl', sport: 'Netball' });
  assert.deepEqual(pos(ws), ['Front', 'Middle', 'Back'], '8. kept when the sport changes');
  ws = settingsSave(ws, { clubId: 'rl', sport: '', positions: RL.join(', ') });
  assert.deepEqual([pos(ws), ws.team.positionsCustom], [RL, false], '"Use these": back to following the sport');
  // 9. reverting to the previous sport
  ws = settingsSave(team({ clubId: 'rl', positions: OZ }), { clubId: 'rl', sport: 'Netball' });
  ws = settingsSave(ws, { clubId: 'rl', sport: '' });
  assert.deepEqual(pos(ws), RL, '9');
  // the coach clears the list: follows the sport
  ws = settingsSave(ws, { clubId: 'rl', sport: '', positions: '' });
  assert.deepEqual([pos(ws), ws.team.positionsCustom], [RL, false]);
  // choosing another sport's whole list on purpose is kept
  ws = settingsSave(ws, { clubId: 'rl', sport: '', positions: OZ.join(', ') });
  assert.deepEqual([pos(ws), ws.team.positionsCustom], [OZ, true]);
  // the form's live update already swapped the list to the new sport's: same result
  ws = settingsSave(team({ clubId: 'oz', positions: OZ }), { clubId: 'rl', sport: '', positions: RL.join(', '), shown: OZ.join(', ') });
  assert.deepEqual([pos(ws), ws.team.positionsCustom], [RL, false]);
});

test('Settings save: changing the club’s own sport moves the teams that follow it, not those with their own list', () => {
  const ws = M.migrateWorkspace({ schema: 4, id: 'a', team: { name: 'A', clubId: 'oz', positions: OZ }, players: [], clubs: CLUBS,
    teams: [{ id: 'team2', team: { name: 'B', clubId: 'oz', positions: ['Front', 'Back'] }, players: [] }], library: {} });
  ws.clubs.find(c => c.id === 'oz').sport = 'Netball'; M.syncPositions(ws);
  assert.deepEqual(M.positionsFor(ws.team, M.clubOf(ws, ws)), NB);
  const b = M.findTeam(ws, 'team2'); assert.deepEqual(M.positionsFor(b.team, M.clubOf(ws, b)), ['Front', 'Back']);
});

test('new teams (5–7): a rugby league club, a netball club, and copying another team’s settings', () => {
  // as the app's team-new handler does it
  const create = (src, clubId, sport, copy) => {
    const T = { name: 'New', clubId, sport, positions: OZ.slice() }, club = CLUBS.find(c => c.id === clubId) || null;
    const copyOwn = copy && src.positionsCustom && M.teamSport(T, club) === M.teamSport(src, CLUBS.find(c => c.id === src.clubId) || null);
    if (copyOwn) M.setTeamPositions(T, club, src.positions); else { T.positionsCustom = false; T.positions = M.SPORT_POSITIONS[M.teamSport(T, club)].slice(); }
    return M.positionsFor(T, club);
  };
  const ozOwn = { clubId: 'oz', positions: ['Front', 'Back'], positionsCustom: true }, ozDef = { clubId: 'oz', positions: OZ, positionsCustom: false };
  assert.deepEqual(create(ozDef, 'rl', '', true), RL, '5');
  assert.deepEqual(create(ozDef, 'nb', '', false), NB, '6');
  assert.deepEqual(create(ozOwn, 'oz', '', true), ['Front', 'Back'], '7. same sport: the copied team’s own list');
  assert.deepEqual(create(ozOwn, 'rl', '', true), RL, '7. another sport: that sport’s list, not the copied one');
  assert.deepEqual(create(ozDef, 'oz', 'Netball', true), NB, '7. own sport picked');
});

test('backups round-trip and the players’ copy carries only the list in use', () => {
  const ws = team({ clubId: 'rl', positions: ['Front', 'Back'] }, [{ id: 'a', name: 'Player A', positions: ['Front'], status: 'available' }]);
  const back = M.migrateWorkspace(JSON.parse(JSON.stringify(ws)));
  assert.equal(M.stable(back), M.stable(ws));
  assert.equal(back.team.positionsCustom, true);
  const v = teamView(M.activeLens(back), null);
  assert.deepEqual(v.team.positions, ['Front', 'Back']);
  assert.ok(!('positionsCustom' in v.team), 'the flag stays with the coach');
  assert.deepEqual(v.players[0].positions, ['Front']);
});
