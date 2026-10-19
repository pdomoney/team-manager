// Club-first volunteer intake helpers for the current encrypted coach workspace.
// This is NOT a global member directory or an authentication/registration service.
const arr = value => Array.isArray(value) ? value : [];
const clean = value => String(value || '').trim();
export const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value)) && clean(value).length <= 254;
export const normalEmail = value => clean(value).toLowerCase();
export const memberOfClub = (person, clubId) => !!clubId &&
  (clean(person?.clubId) === clubId || arr(person?.clubIds).includes(clubId));
export const inTeamPool = (person, team) => !!team && (
  arr(person?.teamIds).includes(team.id) || memberOfClub(person, team.team?.clubId));
export const localClubDirectory = (people, clubId, teams = []) =>
  arr(people).filter(p => memberOfClub(p, clubId) ||
    arr(teams).some(t => t.team?.clubId === clubId && arr(p.teamIds).includes(t.id)))
    .sort((a,b) => clean(a.name).localeCompare(clean(b.name)));
export const clubTeamChoices = (teams, clubId) =>
  arr(teams).filter(t => (t.team?.clubId || '') === clubId && !t.archived);
export function withClubAssociation(person, clubId, teamId = '') {
  const old = person || {};
  return {
    ...old,
    clubIds: [...new Set([...arr(old.clubIds), ...(clubId ? [clubId] : [])])],
    teamIds: [...new Set([...arr(old.teamIds), ...(teamId ? [teamId] : [])])]
  };
}
export function validateManualVolunteer(details, people) {
  const name = clean(details?.name).slice(0, 120);
  const email = normalEmail(details?.email);
  if (!name) return 'Enter the volunteer’s name.';
  if (details?.email && !validEmail(email)) return 'Enter a valid email address, or leave it blank for an offline record.';
  if (email && arr(people).some(p => normalEmail(p?.email) === email))
    return 'This email already belongs to someone in this workspace. Select the existing volunteer rather than creating a duplicate.';
  return '';
}
export function invitationMessage(clubName, recipient, teamName = '') {
  const email = normalEmail(recipient);
  if (!validEmail(email)) throw new Error('Enter a valid volunteer email address.');
  const club = clean(clubName) || 'our club';
  const team = clean(teamName);
  return {
    to: email,
    subject: 'Volunteer enquiry from ' + club,
    body: 'Hello,\n\n' + club + ' would like to discuss a volunteer role' +
      (team ? ' with ' + team : '') + '.\n\n' +
      'Please reply to this email to arrange the next steps and the appropriate sport-specific registration and accreditation checks.\n\n' +
      'This is a personal invitation drafted by the club administrator, not a Team Manager registration or account invitation. No online enrolment link is available yet.\n\n' +
      'Thank you'
  };
}
