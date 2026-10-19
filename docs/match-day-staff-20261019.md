# Match-day staff and trainer readiness — controlled candidate (19 Oct 2026)

## Purpose

Track coach/manager/trainer availability and provide an explicit, season-scoped **match staffing planning check** across teams in one club. Do not confuse this feature with generic volunteer tasks for lifts, BBQs or carpooling. No connection to NRL/MySideline is implied.

**Source baseline:** merged main `37d441e82bf6f731c816b2d1a0ef82e7113380ef` (PR #19 completed).

## Official guidance checked (19 October 2026)

- [NRL Community Registration](https://www.playrugbyleague.com/terms-and-conditions/community-rugby-league/): players, coaches, trainers, non-playing members register for each season.
- [MySideline competition squad management](https://support.playrugbyleague.com/support/solutions/articles/51000424802-mysideline-admin-competition-management): Coach, Volunteer (Manager) and Trainer are distinct member types, and each relevant role needs registration. Staff must be associated with the appropriate squad to be added to official match team lists.
- [NSWRL trainer FAQs](https://clubhub.nswrl.com.au/support/solutions/articles/51000437368-frequently-asked-questions-sports-trainers): NSW volunteers require a valid WWCC, LeagueSafe is not first response, League First Aid serves Under 6–15, Level 1 serves older community age groups.
- [NSWRL Community Policies](https://clubhub.nswrl.com.au/support/solutions/articles/51000451448/): current local league / competition policy prevails. A coach cannot simultaneously act as the required first responder in the same match (2025 community procedures).
- [NRL training categories](https://www.playrugbyleague.com/trainer/trainer-courses/): LeagueSafe, League First Aid, Level 1, Level 2 roles.

Exact minimum people and combinations are **not** hard-coded, since league, age, season and event category can change requirements. The coach must enter the reviewed policy source, season year and staffing minima for the relevant team and confirm official game-day compliance separately.

## Scope

- **Team → Match staff** (coach only): club-wide directory for the current club, or team-only staff where a club has not been assigned; eligibility roles Coach, Assistant Coach, Manager, yellow (LeagueSafe), green (League First Aid), blue (Level 1), orange (Level 2).
- Each record captures only name, team/club availability, eligible roles, which MySideline member-type registrations have been manually verified for the season, role-specific accreditation expiry, WWCC clearance checked and expiry, and active/inactive status.
- **No** WWCC numbers, personal account IDs, DOBs, certificates, identity scans, login credentials or registration API calls. Staff record belongs to the encrypted **coach** workspace only and is not in the published player-copy view.
- **Match sheet → Match-day staff:** assign a specific person to one actual job for that match; mark confirmed or pending. A person's skills can span jobs but cannot be counted twice on the same match roster.
- Configurable combination minimums including `firstResponder` (green/blue/orange), `level1` (blue/orange), individual shirt colours, coach, assistant and manager. Multiple overlapping categories require **distinct** confirmed people; the matching algorithm cannot count one person towards two minima.
- Readiness shows **Not configured** if no season-matched reviewed requirements; **Needs attention** if minimums, qualifications, registration or confirmed attendance are missing; **All configured roles covered (coach-recorded)** when all configured requirements are accounted for.
- The check is a **planning tool**, not an official NRL approval, a MySideline registration confirmation or authority to start a match. Club/ground officials determine match start conditions under current regulations.
- Matches retain crew assignment history in the private coach record. Deleting an official referenced by matches is blocked; deactivate instead.
- Registration is manually verified independently; NRL remains the authoritative source.

## Risk and limitations

1. Coach-entered years, WWCC expiry and accreditation dates may be inaccurate. The product warns that this is not automated certification.
2. Requirements vary across competitions and age levels. Configured policies are **team-wide and season-wide** in this release; where a team competes across different events with different staff requirements, add separate per-competition/per-match policy support before claiming unified readiness.
3. Multi-club personnel: a person scoped to a club is available to teams in that club. Team-only staff can be assigned to specific teams; entering the same person in separate club pools may create duplicates.
4. No self-service availability messages, identity verification APIs, match attendance signatures, audit trail or ground manager approval in this stage.
5. Trainer color roles use community NRL course descriptions, **not** rules for elite/pathways competitions.
6. Preserve the existing `team.staff` summary, club officials and Helpers/Tasks. Migrating old staff to the new directory must be explicit and controlled to avoid accidental assumptions about registration or training.

## Qualification

- `npm test` — match-crew unit tests: year-scoped policy, attendance, distinct roles, first responder eligibility, duplicates, expiry, model normalization and private player-copy exclusions.
- `python3 test/browser/match_crew.py` — synthetic add staff, verify credentials, configure minima, assign three match roles, then unconfirm one and verify shortage. Both 390px and 1280px.
- Entire `test/browser/run_all.py` including synthetic-photo capacity must pass; no regression to seasons, teams, library, previous releases, publishing or authentication.
- Physical Safari/mobile/manual club admin trial required before release approval; confirm actual age-group rules and personnel verification workflow with an authorised NSWRL local-league official.

**Do not auto-merge or deploy until acceptance.**
