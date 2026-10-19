import test from 'node:test';
import assert from 'node:assert/strict';
import { setupReuseIssue, reuseTeamFields, REUSABLE_TEAM_FIELDS } from '../site/team-setup.js';

const source = { team: {
  clubId: 'titans', venue: 'Oval', trainingVenue: 'Ground 1',
  trainingStart: '17:00', trainingEnd: '18:00', rules: 'league/junior',
  bylaws: [{ topic: 'Other', text: 'Only here' }],
  staff: [{ name: 'Private coach', phone: '0400000000' }],
  tasksContact: { phone: '0400000000' },
  event: 'Private cup', eventStart: '2027-04-01', teamPass: 'private',
  positions: ['Halfback'], positionsCustom: true
}};
const policy = (fields = {}) => setupReuseIssue({
  source, sourceSport: 'Rugby league', clubId: 'titans', sport: 'Rugby league',
  copySettings: true, withLibrary: false, ...fields
});
test('no implicit reuse is allowed regardless of current club or sport', () => {
  assert.equal(policy({ copySettings: false, withLibrary: false, clubId: 'other', sport: 'Netball' }), null);
});
test('explicit same-club/sport reuse is permitted', () => {
  assert.equal(policy(), null);
  assert.equal(policy({ copySettings: false, withLibrary: true }), null);
});
test('library-only imports cannot bypass the cross-club or cross-sport rule', () => {
  assert.equal(policy({ copySettings: false, withLibrary: true, clubId: 'other' }).field, 'clubId');
  assert.equal(policy({ copySettings: false, withLibrary: true, sport: 'Netball' }).field, 'teamSport');
});
test('copying settings across clubs or sports is denied, no matter which source is selected', () => {
  assert.equal(policy({ clubId: 'stgeorge' }).field, 'clubId');
  assert.equal(policy({ sport: 'Touch football' }).field, 'teamSport');
  assert.equal(policy({ source: { ...source, archived: true } }).field, 'sourceTeamId');
  assert.equal(policy({ source: null }).field, 'sourceTeamId');
});
test('only explicitly approved fields are copied by value', () => {
  const dest = { staff: [], tasksContact: { phone: '' }, players: [], event: '' };
  reuseTeamFields(source.team, dest);
  assert.ok(REUSABLE_TEAM_FIELDS.includes('trainingVenue'));
  assert.equal(dest.venue, 'Oval');
  assert.equal(dest.staff.length, 0);
  assert.equal(dest.tasksContact.phone, '');
  assert.equal(dest.event, '');
  assert.equal(dest.teamPass, undefined);
  assert.equal(dest.positions, undefined);
  dest.bylaws[0].text = 'Changed';
  assert.equal(source.team.bylaws[0].text, 'Only here');
});
