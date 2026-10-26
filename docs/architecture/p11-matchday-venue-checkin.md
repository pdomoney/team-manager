# P11K — Non-Oztag match venue check-in

Parent: https://github.com/pdomoney/team-manager/issues/31.
Base: owner-merged PR117, `21559a663a3d4e93e788bd2e34dc134b7b03ea28`.

## Goal and interaction

A coach managing a Rugby League, League Tag, Touch, Netball, Rugby Union or another non-Oztag team needs to record **who has physically arrived at the venue** without being forced into the eight-place Oztag formation or scoring system. PR114–117 built season-scoped roster views, conflict review and bounded RSVPs but the only existing Match Day arrival toggle was part of the Oztag-specific interface.

P11K makes a **Venue check-in** disclosure within the existing coach-only **Match details → Lineup → Squad readiness** area. Its name, existing recorded presence, and a deliberate **Record arrived / Undo check-in** button are displayed for the fixture's season players.

A coach can mark or reverse an arrival **only** when all conditions hold:
- team sport is not Oztag
- match has a valid, explicitly selected **active** season
- match is **scheduled**
- match date equals the browser's current local calendar date
- the chosen player is still part of the fixture season
- original form team, match, season and date still match at click time.

Other seasons and match statuses show historical arrivals as read-only. An orphan fixture season shows no player roster or check-in action. No match result, player status, RSVPs, staff roles, team-wide registration or roster membership is changed by this function.

An arrival is **not** medical fitness, legal eligibility, registration or selection to play. This adds no sport-specific lineup, field position, bench, interchange, player count, match period or scoring policy.

## Safeguards and tests

- Pure frozen `matchArrivalGate` returns a read-only permission decision without data mutation.
- The only write, after a new coach click passes a fresh gate, updates the existing `match.arrived` map at the exact player ID. No new schema and no tenant role change.
- Uses existing encrypted workspace saving. Refreshes Match details; no new public or WhatsApp-sharing channel.
- Oztag keeps its established Match Day arrival and score controls.
- Node: same-date active fixture, historic/played/off-date, orphan/missing season, other sports and Oztag.
- Browser: 390/820/1280px checks no unintended writes, one explicit arrival, revertibility, stale fixture gating, historical read-only, Oztag editor untouched and viewport fitting.
- Owner browser/Safari acceptance and exact-head full CI required before merge; post-merge Tests/Publish required.
- P11 M4 remains **incomplete**: this is venue presence only; age/category/competition-specific formations and substitution policy are not approved.
