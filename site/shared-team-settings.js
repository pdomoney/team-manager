// The original Team Manager settings hierarchy, shared with the authorised
// connected application. Sections with legacy GitHub credentials, test data,
// and E5 field geometry remain local/deferred, not cloud administrative rights.
export const TEAM_SETTINGS_SECTIONS = [
  ['team', 'Team', 'Name, club, sport and rules'], ['season', 'Season and tournament', 'The tournament and its dates'],
  ['contacts', 'Contacts', 'Team contact and team staff'], ['training', 'Training', 'Usual venue and times'],
  ['field', 'Field', 'Zones and channels on the Lineup field'], ['players', 'Jerseys', 'Whether jerseys are lent and handed back'],
  ['publishing', 'Publishing', 'Players’ access, passwords and GitHub'], ['backup', 'Backup', 'Export, import and this phone'],
  ['layout', 'Screen layout', 'Width and display density on this device'], ['teams', 'Teams', 'Run more than one team'], ['testlib', 'Test data', 'The test library and a data check to compare devices']];
export const CLOUD_TEAM_SETTINGS_SECTIONS=Object.freeze(
 TEAM_SETTINGS_SECTIONS.filter(([key])=>
  ['team','season','contacts','training','players','layout'].includes(key))
);
