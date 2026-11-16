# M2.1 | Native Squad intake review

**Status:** synthetic, source-only feature candidate for owner review. Base `main` `cccd0891ba8eb194243a9cf9ee5f7fe047e5eeb8`, post-merge Node, Chromium, WebKit and Pages PASS.

## Intended journey

Fictional Team Manager chooses a club/team on **Home**, opens **Team → Squad**, and sees a compact **Team intake** stage filter above the existing player list. Initially every squad member without a placement decision is **Not nominated**. The Manager filters those needing attention, opens the existing person-specific placement confirmation, gives a reason, nominates and separately approves that team placement. The corresponding stage count and visible rows update immediately. A Head Coach sees the same team event history, and the Club Administrator can inspect the stage without acting.

This does not create a new player identity or registration state, and does not approve someone for match day. **Team approved** means only the existing D04 team-level decision, not financial, registration, medical or competition clearance.

## Preserve and exclude

- Preserve Home as the one team selector, the five original navigation sections, original Squad search/gender filters, Coach player editing, Manager scoped placement workflow and existing encrypted backup/publication boundary.
- Show this section **only** in the explicit fictional P12 active Coach, Manager or Club Admin context within test mode and the exact permitted team. Club Admin sees review only.
- Show no intake board to Player, Guardian, revoked or unassigned roles; neither a fabricated filter button nor an unrelated team ID may change the active intake view.
- Use existing `teamPlacementEvents` with current team roster/season lens. Never rewrite event history or infer official registration, payment, junior consent, injury clearance or approved sport rule.
- Placement events currently are **team-scoped, not season-scoped**. M2.4 must resolve season carryover before any official new-season readiness assertion.

## Tests and gates

- `test/roster-intake-review.test.js`: counts and stages; duplicate/stale/cross-team rows; malformed event fallback; positive and negative role/eligibility boundaries; no player-export leak.
- `test/browser/m2_1_roster_intake.py`: 390px and 1280px fictional Manager nomination/approval journey, keyboard focus and touch target, team switch resets filter, Coach review, Club Admin read-only, Player/Guardian/revoked role denial.
- CI: exact PR-head Node, entire Chromium suite, existing WebKit checks; then exact-main post-merge Node/Chromium/WebKit and Publish.
- Actual iPhone Safari and macOS Safari, keyboard/VoiceOver, user clarity of the approval-versus-registration distinction, and owner acceptance remain **manual**. Chrome/WebKit test passes alone cannot satisfy them.

No production authentication, server-enforced permissions, real registration, external financial provider, personal/medical record, schema migration or live data publication is approved by this phase. Those remain behind [#55](https://github.com/pdomoney/team-manager/issues/55) and [#154](https://github.com/pdomoney/team-manager/issues/154), D17, D21, D23 and other applicable owner approvals.
