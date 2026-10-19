# Corrective — sport-aware match-day staff

## Issue (user field test)
The original volunteer form used NSWRL's LeagueSafe (yellow), League First Aid (green), Level 1 (blue), and Level 2 (orange) choices for the *current Oztag team*, and hardcoded MySideline registration for all sports. It only provided two scope chips — current club versus current team — without an explicit picker for the other coach-managed teams. As a result the UI could confuse club availability with match eligibility, especially in mixed-sport clubs.

## Corrective design
- Introduce team-sport role profiles and registration provider labels. Rugby league and league tag expose Rugby League trainers. Oztag and touch only show broadly applicable coach, manager, first-aid and team delegate roles; rugby union has Rugby Xplorer and appropriate general roles. Unknown sports have conservative generic options.
- Before creating a staff record in multi-team workspaces, choose the target team (shows **each team’s own sport**, overriding club default). **Change team** control on staff landing page switches teams without copying data. A one-team workspace explains that another team must be created before it can be selected.
- Staff registered under one code must be verified independently in each other code: `registrationBySport` is stored separately; existing `registration` values survive for previous League/League Tag entries. Per-team season allocation remains mandatory for coverage, even if someone appears in a club-wide pool.
- Eligibility and minimum requirements are evaluated against the **target team’s sport**, not the club-wide sport. The minimum policy gets an explicit `sport`. A legacy rugby league policy on an Oztag team is *not configured* until separately reviewed; no RL shirt requirement can be counted for other codes.
- Safeguarding remains independently recorded. No verification API, official clearance, precise WWCC details, or automatic permission to play. Role templates are suggestions and **never supply default minimum staffing numbers**.
- Keep existing person data, historical registrations, WWCC status and match assignments. Old cross-code roles are retained but shown as ineligible for the current sport rather than passed as valid.
- The user continues to approve locally sourced competition-specific role numbers and combinations for each season/fixture.

## Official sources
- [Touch Football Australia 2026 registration policy](https://touchfootball.com.au/news/2026/08/31/tfa-releases-new-national-registration-policy-and-affiliate-membership-regulations/) — uses MySideline for players, coaches, referees, volunteers and health/safety personnel.
- [Rugby Australia registration](https://australia.rugby/participate/register) and [2026 team official guidance](https://australia.rugby/participate/rugby-administration/club-administration/rugby-xplorer-updates/update---march-2026) — Rugby Xplorer.
- [Australian Oztag Assemble guides](https://api.oztag.com.au/resources/assemble-guides/) — separate registration system.
- Rugby league role categories remain controlled by NSWRL/local league trainer rules, not reused as Oztag requirements.

## Qualification
- Node unit tests, all browser suites (including new 390px/1280px Oztag and mixed-sport tests), existing privacy and encrypted-player publishing checks.
- Manual NSW junior sport requirements, club/trainer qualification review and Safari/iPhone UI acceptance before merging.
- Draft PR only; no changes to live published data or deployments.

## Next-phase limitation
One person can keep a cross-club/team association using team IDs but the current UI chooses one team on each add/edit. A fully federated multi-club personnel directory with permissions, self-service volunteer invitations and audited third-party registration lookup is a separate project and is not implied here.