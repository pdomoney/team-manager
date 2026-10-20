# Club-wide colours and logo inheritance

## Product request
Admins managing multiple teams should not need to select and update each team separately. One club dropdown and one club-level branding editor must control all teams in a club.

## Design
Each club can store an optional validated style with the existing palette or custom colour format. Its logo was already stored once on the club; no team-specific logo duplicates are introduced.

The effective style follows: explicit team override, otherwise club style, otherwise Classic. Previously saved team styles remain overrides. The administrator can select Apply club colours to every team to reset overrides for that club in one operation; unticking preserves them. New teams inherit automatically.

The style and shared logo are included in each published team's public club projection, but no private club officials or coach contacts are added. Stored workspace schema, encryption algorithms and GitHub publishing remain unchanged. The player-data projection in vault.js includes the validated public style object alongside the existing public club logo. Coach authority is still workspace-wide, not secure tenant isolation.

## User flow
Settings > Club branding or Clubs and teams > Branding:
1. Pick any club without switching team.
2. Choose preset or custom colours and a square club logo.
3. Leave Apply club colours to every team checked to replace current team-specific colours for that club; uncheck to preserve existing overrides.
4. Save, and publish using the existing GitHub data process when ready.

Settings > Team colour selection remains available to intentionally override a club look. If there is a club palette, Use club colours appears as the default option. Club logo is inherited universally.

## Acceptance
- Club colour/logo rendered on every team without override and on the player projection after reload.
- A team override stays in place until deliberately reset; no other club is changed.
- Existing records, sport controls, volunteers, encrypted publishing and test library unchanged.
- Run all Node and browser suites on exact head. Real Safari and two-device manual acceptance remain outstanding.
- Do not merge or publish automatically.
