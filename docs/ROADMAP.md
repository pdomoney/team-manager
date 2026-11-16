# Team Manager | Product roadmap

This file records **future product proposals**, not accepted implementation or migration authority. The current product remains a multi-club/team/season coach/player application, using its original accepted role and group boundaries.

## Team management programme (15 November 2026)

The owner directed development back to everyday management after accepting play E5. M1.1 was merged and published at `b448ded`; M1.2 was merged across PRs #244–#247, with the #247 exact-main post-merge Chromium gate still pending at M1.3 branch creation. M1.3 adds role/team/device qualification, without changing production authorisation. M2–M8 remain proposed, not accepted migration authority. Keep the Home team picker, five-section navigation, explicit QA role/group selection, current encrypted data, roster, fixtures and Tactics journeys.

| Phase | Scope | Status |
| --- | --- | --- |
| M1 | Selected-team management workspace, context UX, role/device acceptance | M1.1–M1.3 merged/published, exact-main Node/Chromium/WebKit PASS through #248; physical Safari/VoiceOver and owner review pending |
| M2 | Player intake, guardian reviews, registration and season lifecycle | M2.1 fictional roster intake review PR candidate; M2.2–M2.5 queued or decision-gated |
| M3 | Coach/Manager training, availability and team selection approvals | Proposed |
| M4 | Sport-scoped Match Day roster, staff, result and publication authority | Proposed; rule-gated |
| M5 | Club and volunteer administration, appointments and qualification evidence | Proposed |
| M6 | Scheduling conflicts, notices, targeted communications and reminders | Proposed |
| M7 | Actionable team and club management reports | Proposed |
| M8 | Real individual identity, server-enforced grants and recovery | Deferred; #55 decision required |

**M1.1 completed:** Home displays a read-only squad and next-match reply snapshot plus existing management-page shortcuts only for an explicitly selected team. No club-wide summary masquerades as team data; Player/guardian never receives this private management view; fictional Manager receives only role-permitted routes.

**M1.2 merged:** Compact working context appears on existing operational pages. It identifies the exact working team, club, selected season and fictional role/group, explicitly marks historical or test roles, and routes to Home for team selection. Match Day and the play engine stay untouched; player/guardian and unassigned roles receive no management strip. The native Crew team-versus-club filter remains the scope authority. No new permission, write, login, schema, fixture authority or data publishing workflow.

**M1.3 qualification candidate:** The [M1.3 role/team/device acceptance plan](acceptance/m1-3-team-role-device.md) and `test/browser/m1_3_role_team_device.py` exercise the original Home team picker and header, allowed cross-club selection, Matches/Squad/Training navigation, role-specific negative paths, 390px/820px/1280px breakpoints and live viewport resizing. Owner, Coach, Manager, Player, Guardian and an explicit multi-role switch are covered using only fictional P12 data. Automated Chromium evidence, macOS/iOS Safari, keyboard/VoiceOver and owner acceptance remain separate; never treat UI filters as production grants.

**M1 actual release evidence (16 November 2026):** PR #248 merged at `cccd0891ba8eb194243a9cf9ee5f7fe047e5eeb8`; [post-merge Tests](https://github.com/pdomoney/team-manager/actions/runs/43809172347) and [Publish](https://github.com/pdomoney/team-manager/actions/runs/43809172316) PASS. M1.3 role/team/viewport Chromium 72/72 PASS. This is automated engineering qualification, not physical Safari or owner UX acceptance.

### M2 | Player and squad lifecycle (five workstreams)

| Slice | Outcome | Current gate |
| --- | --- | --- |
| **M2.1** Team placement intake review | Native Squad shows existing team-only nomination, awaiting approval, approved and withdrawn stages with exact-team filters for fictional Coach/Manager; Club Admin can review only | Source PR candidate; merge, post-merge and owner UI acceptance outstanding |
| **M2.2** Player intake completeness and reported guardian linkage | Identify missing squad fields and review reported relationships without claiming verified guardian authority or creating accounts | Not started; preserve existing player/person and guardian review models |
| **M2.3** Registration and financial evidence lifecycle | Club registration/Registrar and external provider confirmations strictly separate from Coach/Manager team approval | Design/authority gate: D17 grace-period rules, verifiable provider evidence, D21 retention and D23 finance roles |
| **M2.4** Season move/transfer lifecycle | New-season choices, safe withdrawal and cross-team history with explicit approvals, no automatic inherited eligibility | Not started; migration/backups require separate authority |
| **M2.5** Recovery and real-device acceptance | Negative role/club tests, exact-data preservation, genuine iPhone/macOS Safari and restore | Not started; source tests do not prove physical-device or individual identity |

**Progress accounting:** five equal roadmap slices (20% each) for planning. M2.1 is a source candidate, not accepted completion. Do not advance the programme percentage on tests alone. No new backend, real identity, external registration, child data, payments or match eligibility is authorised by M2.1. Keep M3–M8 and play E6–E8 deferred as shown below.

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
