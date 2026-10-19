// Accreditation badges for match-day volunteers: current, expiring soon, expired, not checked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { crewBadges, crewBadgesBySport, badgeSummary, badgeSvg, badgeText, BADGE_LOOK, SOON_DAYS, fmtDate } from '../site/crew-badges.js';
import { CREW_ROLES, canCrewServe, crewRoleNeedsAccreditation, crewAccreditationExpiry } from '../site/match-crew.js';

const TODAY = '2026-10-20';
const person = (x = {}) => ({ id: 'v1', name: 'Synthetic Volunteer', clubIds: ['c1'], teamIds: ['t1'], wwccStatus: 'checked', wwccExpiry: '2028-01-01', active: true, ...x });
const st = bs => Object.fromEntries(bs.map(b => [b.key, b.status]));

test('each accreditation is current, expiring soon, expired or not recorded, by its expiry', () => {
  const p = person({ rolesBySport: { 'Rugby league': ['coach', 'yellow', 'green', 'blue', 'orange', 'manager'] },
    accreditationBySport: { 'Rugby league': { coach: '2027-06-01', yellow: '2026-11-20', green: '2026-10-19', blue: TODAY } } });
  const bs = crewBadges(p, 'Rugby league', TODAY);
  assert.deepEqual(st(bs), { wwcc: 'current', coach: 'current', yellow: 'expiring', green: 'expired', blue: 'expiring', orange: 'unverified', manager: 'role' });
  assert.equal(bs[0].key, 'wwcc', 'the Working With Children Check comes first');
  assert.equal(badgeSummary(bs), '3 current · 2 expire soon · 1 expired · 1 not checked');
  assert.equal(bs.find(b => b.key === 'yellow').text, 'Yellow · LeagueSafe: expires soon, 20 Nov 2026');
  assert.equal(bs.find(b => b.key === 'green').text, 'Green · League First Aid: expired 19 Oct 2026');
  assert.equal(bs.find(b => b.key === 'orange').text, 'Orange · Level 2 trainer: expiry not recorded');
  assert.equal(bs.find(b => b.key === 'manager').text, 'Team manager: role held');
  assert.equal(SOON_DAYS, 60);
  assert.equal(crewBadges(p, 'Rugby league', TODAY, { soonDays: 10 }).find(b => b.key === 'yellow').status, 'current', 'the window can be set');
});

test('the Working With Children Check: checked with a future expiry, or not', () => {
  const s = x => crewBadges(person(x), 'Oztag', TODAY)[0];
  assert.equal(s({}).status, 'current');
  assert.equal(s({ wwccExpiry: '2026-12-01' }).status, 'expiring');
  assert.equal(s({ wwccExpiry: '2026-01-01' }).status, 'expired');
  assert.equal(s({ wwccExpiry: '' }).status, 'unverified', 'checked but no expiry recorded');
  assert.equal(s({ wwccStatus: 'unverified' }).status, 'unverified');
  assert.equal(s({ wwccStatus: 'unverified' }).text, 'Working With Children Check: not checked by the club');
});

test('roles are per sport; a role from another sport doesn’t show', () => {
  const p = person({ rolesBySport: { Oztag: ['coach', 'firstAid'], 'Rugby league': ['blue'] }, accreditationBySport: { Oztag: { firstAid: '2027-05-01' }, 'Rugby league': { blue: '2027-05-01' } } });
  assert.deepEqual(crewBadges(p, 'Oztag', TODAY).map(b => b.key), ['wwcc', 'coach', 'firstAid']);
  assert.equal(crewBadges(p, 'Oztag', TODAY).find(b => b.key === 'coach').status, 'role', 'an Oztag coach needs no accreditation');
  assert.deepEqual(crewBadges(p, 'Rugby league', TODAY).map(b => b.key), ['wwcc', 'blue']);
  assert.deepEqual(crewBadgesBySport(p, TODAY).map(x => x.sport), ['Oztag', 'Rugby league']);
  assert.deepEqual(crewBadgesBySport(person({ roles: ['manager'] }), TODAY, 'Netball').map(x => [x.sport, x.badges.map(b => b.key)]), [['Netball', ['wwcc', 'manager']]], 'older records use the team’s sport');
  assert.deepEqual(crewBadgesBySport(person({}), TODAY, 'Netball'), []);
});

test('a badge agrees with the match-day check about whether an accreditation counts', () => {
  for (const role of Object.keys(CREW_ROLES)) for (const sport of ['Oztag', 'Rugby league'])
    for (const expiry of ['', '2026-01-01', '2027-06-01']) {
      const p = person({ rolesBySport: { [sport]: [role] }, accreditationBySport: { [sport]: expiry ? { [role]: expiry } : {} }, registrationBySport: { [sport]: { coach: '2026', volunteer: '2026', trainer: '2026' } }, squadYears: { t1: '2026' } });
      const b = crewBadges(p, sport, TODAY).find(x => x.key === role); if (!b) continue;
      const serve = canCrewServe(p, { id: 't1', team: { sport, clubId: 'c1' } }, role, TODAY);
      assert.equal(['current', 'expiring', 'role'].includes(b.status), serve === '', `${sport} ${role} ${expiry || 'none'}: badge ${b.status}, check "${serve}"`);
    }
  assert.equal(crewRoleNeedsAccreditation('coach', 'Oztag'), false);
  assert.equal(crewRoleNeedsAccreditation('coach', 'Rugby league'), true);
  assert.equal(crewAccreditationExpiry(person({ accreditation: { blue: '2027-01-01' }, accreditationBySport: { 'Rugby league': { blue: '' } } }), 'Rugby league', 'blue'), '', 'a cleared sport expiry doesn’t fall back to an older one');
});

test('badge pictures: one look per role, a corner mark for every status but current, no colour-only meaning', () => {
  ['wwcc', ...Object.keys(CREW_ROLES)].forEach(k => assert.ok(BADGE_LOOK[k], k));
  const svg = s => badgeSvg('blue', s);
  assert.ok(!svg('current').includes('<circle cx="26"'), 'current: no mark');
  assert.ok(svg('expiring').includes('#B26A00') && svg('expired').includes('#C0283A') && svg('unverified').includes('stroke-dasharray'), 'each other status has its own mark');
  assert.ok(svg('expired').includes('#2F7FD0'), 'an expired blue shirt keeps a blue ring');
  assert.match(svg('current'), /aria-hidden="true"/);
  assert.equal(fmtDate('2026-03-05'), '5 Mar 2026'); assert.equal(fmtDate('nope'), '');
  assert.equal(badgeText({ key: 'coach', label: 'Head coach', status: 'current', expiry: '2027-06-01' }), 'Head coach: current until 1 Jun 2027');
});
