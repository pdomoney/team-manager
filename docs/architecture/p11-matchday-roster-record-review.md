# P11H — Match Day roster reply / arrival consistency review

Base: owner-merged [PR114](https://github.com/pdomoney/team-manager/pull/114), `f4e38748495a96b2ab0a6ecef6ee98cc1badc3cd`.
Issue: https://github.com/pdomoney/team-manager/issues/31

## Purpose

PR114 added a **coach-only, fixture-season-scoped, read-only** roster for non-Oztag sports. This continuation checks whether recorded RSVP, player availability and arrival markers contradict each other, so coaches can review them using existing tools before game day. It does **not** assert registration, legal authority, medical fitness, age/category eligibility, player count, formation, substitution rules or competition approval.

## Rules (explicitly not eligibility decisions)

- **Arrived + replied No** → check conflict.
- **Arrived + no reply** → recorded response missing.
- **Arrived + Unsure** → reply needs clarification.
- **Arrived + injured/unavailable** → recorded status needs human verification. There are no medical decisions or changes.
- **Replied Yes + injured/unavailable** → recorded status contradicts acceptance.

Players can have more than one warning, but only one row. When no conflicts are recorded, the UI says so while still explicitly refusing to certify eligibility. Every warning is derived from the season-scoped P11G snapshot, not another team's roster or the active season.

The Match details → Squad readiness panel shows warnings and a **Review recorded replies** button. That button opens the existing coach-only Availability sheet; opening itself does not change any reply or status. No contact is initiated. No personal data is exported or shared.

## Security, safety and compatibility

- The pure helper `site/matchday-roster-review.js` and UI cannot write match, player, attendance or readiness data. No schema changes, no score saving, no cross-team views, no audit claims.
- Existing Oztag Match Day editing, lineup and results remain unchanged.
- Non-Oztag formations and scores remain unavailable, including junior league variations.
- The coach-only screen should be treated as privacy-sensitive; player names and availability status appear only in the existing Match details context.
- Node tests cover contradictory replies, multiple warnings for one player, missing season, duplicate rows, unsupported/other sports and immutability.
- Browser regression at 390px, 820px and 1280px verifies warning labels, no silent writes, RSVP navigation, no unsupported score editor, clear state and viewport fitting.

Owner review and merge remain mandatory; final release requires exact-head Node/Chromium (including capacity) and post-merge main Tests/Publish. Physical Safari remains a distinct manual acceptance step.

## Programme gate

This is useful M4 groundwork, **not completion of M4**. All M2 independent competition policy approvals and M3 sport-specific persistent scoring remain unmet. Issue #31 progress percentage must not advance solely for this safeguard.
