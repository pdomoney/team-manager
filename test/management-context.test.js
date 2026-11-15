import test from 'node:test';
import assert from 'node:assert/strict';
import { managementWorkingContext } from '../site/management-context.js';

const team = { id: 'qarangers16', name: 'Rangers Under 16' };
const input = { tab: 'squad', coachView: true, team, clubName: 'Rangers',
  seasonName: '2026', historical: false };
const session = { role: 'team_manager', label: 'Team manager',
  context: { groupLabel: 'Rangers U16' }, allowedTeams: [{ id: 'qa-rangers-16' }] };

test('M1.2 reflects the exact working team, role, group and season without writing to either input', () => {
  const before = JSON.stringify({ input, session });
  const result = managementWorkingContext({ ...input, session });
  assert.deepEqual(result, {
    teamId: 'qarangers16', teamName: 'Rangers Under 16', clubName: 'Rangers',
    seasonName: '2026', roleLabel: 'Team manager', groupLabel: 'Rangers U16',
    fictional: true, historical: false
  });
  assert.equal(JSON.stringify({ input, session }), before, 'presentation is read-only');
});

test('M1.2 coach workspace and historical season are explicitly labelled', () => {
  const current = managementWorkingContext(input);
  assert.equal(current.roleLabel, 'Coach workspace');
  assert.equal(current.fictional, false);
  assert.equal(current.historical, false);
  assert.equal(managementWorkingContext({ ...input, historical: true }).historical, true);
});

test('M1.2 only appears on the operational pages, never Home, play editor, match-day field or reports', () => {
  for (const tab of ['home', 'plays', 'field', 'matchday', 'reports', 'club', 'teams', 'people', 'more']) {
    assert.equal(managementWorkingContext({ ...input, tab }), null, tab);
  }
  for (const tab of ['agenda', 'training', 'matches', 'attendance', 'squad', 'tasks',
    'helpers', 'crew', 'notices', 'messages']) {
    assert.ok(managementWorkingContext({ ...input, tab }), tab);
  }
});

test('M1.2 never leaks working context to participants or an unassigned fictional group', () => {
  for (const role of ['player', 'guardian', 'helper', 'staff', 'none']) {
    assert.equal(managementWorkingContext({ ...input, session: { ...session, role } }), null, role);
  }
  assert.equal(managementWorkingContext({ ...input, coachView: false, session }), null);
  assert.equal(managementWorkingContext({ ...input, session: {
    ...session, allowedTeams: [{ id: 'other-team' }] } }), null);
  assert.equal(managementWorkingContext({ ...input, session: {
    ...session, allowedTeams: [] } }), null);
  assert.equal(managementWorkingContext({ ...input, team: null }), null);
});
