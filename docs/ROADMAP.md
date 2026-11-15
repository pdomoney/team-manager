# Team Manager | Product roadmap

This file records **future product proposals**, not accepted implementation or migration authority. The current product remains a multi-club/team/season coach/player application, using its original accepted role and group boundaries.

## Team management programme (15 November 2026)

The owner directed development back to everyday management after accepting play E5. M1.1 is the first scoped implementation; M2–M8 remain proposed, not accepted migration authority. Keep the Home team picker, five-section navigation, explicit QA role/group selection, current encrypted data, roster, fixtures and Tactics journeys.

| Phase | Scope | Status |
| --- | --- | --- |
| M1 | Selected-team management workspace, context UX, role/device acceptance | M1.1 PR candidate |
| M2 | Player intake, guardian reviews, registration and season lifecycle | Proposed |
| M3 | Coach/Manager training, availability and team selection approvals | Proposed |
| M4 | Sport-scoped Match Day roster, staff, result and publication authority | Proposed; rule-gated |
| M5 | Club and volunteer administration, appointments and qualification evidence | Proposed |
| M6 | Scheduling conflicts, notices, targeted communications and reminders | Proposed |
| M7 | Actionable team and club management reports | Proposed |
| M8 | Real individual identity, server-enforced grants and recovery | Deferred; #55 decision required |

**M1.1 check:** Home displays a read-only squad and next-match reply snapshot plus existing management-page shortcuts only for an explicitly selected team. No club-wide summary masquerades as team data; Player/guardian never receives this private management view; fictional Manager receives only role-permitted routes. No new write, login, schema, fixture authority or data publishing workflow.

Existing issues #154, #131, #34, #35 and #31 remain open until independently qualified. **Plays:** E5 accepted, E6–E8 and Option C deferred; preserve all existing tactics behaviour.

---

## Prior direction: Option B play workspace

Owner decision (8 November 2026): favour a dedicated diagram-first viewing experience and a purpose-built coach editing workspace, without requiring browser zoom. See [Option B phased programme](architecture/option-b-play-workspace-programme.md) and [Play Engine 2.0 #166](https://github.com/pdomoney/team-manager/issues/166).

Stages: compact Cards library → diagram-first viewer → dedicated editor canvas → precise editing controls → legacy compatibility and Safari acceptance. Implement in small branches, separate source CI from actual owner acceptance. Do not merge or deploy automatically.

## Deferred concept: Option C, full tactical design studio

**Status: ROADMAP ONLY. Not approved for coding, design migration or deployment.**

Possible future scope, after Option B visual and interaction acceptance:

- Dedicated multi-layer scene graph, stable player/ball/defender objects, editable movement tracks, snapping guides, bezier handles, explicit connections and undo/redo timeline.
- Sport- and competition-specific field/formation profiles with documented provenance and owner/domain review, never silently inferred from an Oztag teaching canvas.
- Explicit pass/catch/possession timing, collaborative player/defender path decisions, animation playback controls and state-machine validation.
- Strong preview/authoring separation, responsive tablet/desktop editing, accessible keyboard controls and export/print views.
- A safe compatibility layer for existing Oztag eight-slot plays, Step In/Step Out IDs, coach-authored geometry and every club/season/team/role selection.

**Before adoption:** choose a concrete end-to-end coaching journey and compare it with the accepted Option B result; agree scope, licensing, keyboard and touch requirements, source representation, lossless migration, sport rules ownership, data sensitivity and recovery strategy. Require owner approval of the new behaviour and a standalone development programme. Avoid introducing a generic editor platform, account system, backend or database merely to host it.

**Not a dependency:** B1–B5 must remain useful even if Option C is never implemented.
