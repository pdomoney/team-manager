# P11I — Identity-safe Match Day conflict resolution navigation

**Base:** PR115 owner-merged to main at `f079f7b81bd0427897fe8b651515e30025121d8f`.
**Programme:** [Issue #31](https://github.com/pdomoney/team-manager/issues/31), M4 groundwork.

## Why

PR114/P11G shows the fixture-season squad grouped by reply, status and preferences. PR115/P11H detects contradictory RSVP, recorded injury/unavailability and arrival markers without inventing sporting eligibility. One P11H deduplication key used **display name + jersey + reply + status + arrival** rather than stable player ID. Two people with identical names/jerseys/replies could incorrectly collapse to one review row.

## Changes

- Keep exact stable `playerId` inside the existing **coach-only** season-scoped roster snapshot. Never use name or jersey to identify player records.
- Deduplicate P11H warnings by player ID and retain both people even when public display details match. No extra personal information exposed beyond existing coach-only roster/RVSP interfaces.
- Each warning row gets a **Review this player's reply** action. It validates a live fixture, that the player still belongs to the fixture's season and that the conflict still exists. It opens the existing Availability sheet, scrolls to the exact player and focuses their accessible group.
- No auto-click, status or RSVP mutation, permission grant, notifications, new messages or external sharing. The coach must deliberately choose whether to update a reply, just as before.
- Leave generic **Review recorded replies** control available.
- Oztag current scoring/lineup paths remain untouched; multi-sport formation/scoring remains blocked until verified competition policy.

## Tests and acceptance

- Updated Node test: two distinct IDs but identical display details **must not** collapse; repeated IDs do deduplicate. All previous conflict tests remain.
- Chromium 390/820/1280 synthetic fixtures: same names and jersey numbers, two warnings and precise individual focus; non-Oztag scoring blocked; exact pre/post workspace equality; stale warning fails closed; no overflow.
- Exact-head full Node and Chromium including capacity required. Owner review on real iPhone Safari before merge, then post-merge main Tests/Publish.
- **Issue #31 M2/M3/M4 stay incomplete**. Navigating to a reply is not competition rules or an eligibility decision.
