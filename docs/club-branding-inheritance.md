# Club-wide colours and logo inheritance

## Product request
Admins managing multiple teams should not need to select and update each team separately. The Edit club form must own logo and palette changes for that club. A separate branding screen is not needed.

## Design
Each club can store an optional validated style with the existing palette or custom colour format. Its logo was already stored once on the club; no team-specific logo duplicates are introduced.

The effective style follows: explicit team override, otherwise club style, otherwise Classic. Previously saved team styles remain overrides. The administrator can select Apply club colours to every team to reset overrides for that club in one operation; unticking preserves them. New teams inherit automatically.

The style and shared logo are included in each published team's public club projection, but no private club officials or coach contacts are added. Stored workspace schema, encryption algorithms and GitHub publishing remain unchanged. The player-data projection in vault.js includes the validated public style object alongside the existing public club logo. Coach authority is still workspace-wide, not secure tenant isolation.

## User flow
Clubs and teams > Edit club:
1. Choose the club you want to edit.
2. Upload its logo and select preset or custom club colours in the same form as the rest of the club details.
3. The optional reset of all team-specific colour overrides is OFF by default; tick only when deliberately replacing them.
4. Save and publish using the existing GitHub data process when ready.

Settings > Team colour selection remains available to intentionally override a club look. If there is a club palette, Use club colours appears as the default option. Club logo is inherited universally.

## Acceptance
- Club colour/logo rendered on every team without override and on the player projection after reload.
- A team override stays in place until deliberately reset; no other club is changed.
- Existing records, sport controls, volunteers, encrypted publishing and test library unchanged.
- Run all Node and browser suites on exact head. Real Safari and two-device manual acceptance remain outstanding.
- Do not merge or publish automatically.
