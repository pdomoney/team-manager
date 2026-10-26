# P11G — Cross-sport Match Day roster readiness (read-only)

Issue: https://github.com/pdomoney/team-manager/issues/31
Base: owner-merged [PR113](https://github.com/pdomoney/team-manager/pull/113), main `9f22cf43e607a40c2f795faba23d3dd38a201995`.

## User value

Until independent competition and age/category-specific requirements are verified, sport-specific full Match Day formations and result submissions are **not** enabled outside established Oztag flows. A coach still needs to see whether a team has replied for a fixture.

In the non-Oztag **Match details → Lineup** area, a collapsed **Squad readiness** section now shows the fixture's recorded season roster grouped as:

- **Said yes · available**: reply=yes and recorded player status=available; this is **not** eligibility.
- **Needs confirmation**: unsure reply or said yes with injured/unavailable player status.
- **No reply**: missing or invalid RSVP.
- **Not attending**: said no.

The view shows the player name, jersey number, previously recorded preferred positions, RSVP, arrived marker and limited availability state, when recorded. It uses the match's own `seasonId` and the existing season lens; a missing/orphan season fails closed with no roster borrowed from another or active season. It does not depend on team type beyond the established **Oztag-only** editor guard. It never infers sport positions on the field, bench counts, required players, actual registrations or playing eligibility.

## Safety and privacy

- This remains **coach-only** within existing Match details, with no new route, no notifications, no public copy, and no data export. Treat player names and recorded injury status as coach-only.
- The pure module returns frozen derived snapshots, without writing RSVP/arrival/season/player fields; no new storage data.
- Existing Oztag match lineup, RSVP controls and score result editing unchanged; all other sports retain explicit **not configured** state. This is not a substitute for official age/category/competition rule confirmation.
- No cross-team memberships are automatically merged. Season names and player-position preferences are not official role assignments.

## Tests and release gates

- Node: exact season scoping, four reply cohorts, injured-yes/unsure separation, duplicate prevention, multiple sports, unknown season and immutability.
- Browser: coach-only synthetic fixture at 390/820/1280px, Rugby league, League tag, Touch football, Netball, missing season, Oztag regression, no data writes and no page overflow.
- Require exact-head Node + full browser including capacity, owner review (including iPhone Safari), manual merge, post-merge main Tests/Publish.
- Issue #31 milestone M2 (rules verification) remains incomplete; M4 roster groundwork begins without counting as the finished multi-sport lineup capability.

