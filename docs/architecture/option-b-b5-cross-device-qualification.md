# Option B B5 | Cross-device play engine qualification

**Status (9 November 2026):** Source qualification candidate, **not final release or device acceptance**.
**Product:** Team Manager, the existing multi-club/team GitHub Pages sports app.
**Accepted source entering B5:** `main` `a9b5b5cbdb2e20fd793d63867c4bb3e8502f1ec5` (merged #191).
**Framework reference:** `pdomoney/walking-comet-development-framework` `main` `cf557fb14a90e0f15a6de37d6a5ea002eff04ca3` (merged #42).
**Programme:** [Option B workspace plan](option-b-play-workspace-programme.md), [issue #166](https://github.com/pdomoney/team-manager/issues/166).
**Owner evidence:** B4.12 mobile diagram visuals accepted after merging PR #191. This is **not** blanket B5 cross-device or installed-site approval.

## What B5 qualifies and protects

One representative journey:

1. **Coach:** Home active club/team → Tactics → Plays → Step Out (historical ID `quickie-out`) → Cards/List → Watch / seek / mirror → Learn / steps / position highlight.
2. **Coach editor:** Advanced Diagram at responsive Fit; select and precisely nudge LM; zoom then resize; draft remains unsaved until Save. Teach the play: seed legacy instruction, link an explicit movement/role, preview and Save.
3. **Roundtrip:** Reopen after browser reload and verify the identical saved play geometry, movement/link fields, teaching cues, selected team and untouched Step In record. Protect custom plays and older local copies through existing regression suites.
4. **Player:** No-password development profile preview exposes the read-only Learn cue, not coach editing/deletion, and rejects forged editing actions.

Protected Team Manager behaviour: original Home team selector (header is informational), separate active role/group, Step In / Step Out stable IDs, Oztag vs other sport compatibility warnings, no invented rugby formations, player-facing coach/private-data boundaries, 50×80 teaching geometry, mirrored directions, saved phases and movement actor links, animation seek/Slow/Restart, and the shared play library. A tactical symbol is not a registered player.

Do **not** introduce a login, alter permissions, reset real/fictional stored records, change schema, replace the existing Play editor, or mistake CI for an installed release.

## Automated source qualification

| Control | Automation and evidence | Limit |
| --- | --- | --- |
| Unit and schema contracts | `npm test`, existing `test/*.test.js` | No browser/device rendering |
| Full Chromium qualification | `python3 test/browser/run_all.py --skip-unit --out qualification.json` in the established Ubuntu 24.04 runner; evidence artifact retained 14 days | Synthetic local browser; no iOS Safari |
| **New B5 end-to-end** | `test/browser/play_b5_cross_device.py`: 390 / 853 / 1280 CSS px Chromium; saved Step Out edit, reload, role switch | Viewport sizes simulate, not physical devices; browser-local data does not sync between devices |
| **New B5 WebKit gate** | Targeted Playwright 1.55.0 on Ubuntu 24.04, `B5_BROWSER_ENGINE=webkit python3 test/browser/play_b5_cross_device.py`, 390 / 1280 CSS px | Linux WebKit is Safari-like, but **not Apple Safari** |
| Historic / negative coverage | Existing `play_board_parity`, `combined_demo_catalog`, `play_editor_bends`, `play_editor_precision`, `play_editor_pointer_cancel`, `play_canvas_zoom_pan`, `play_editor_mobile_density`, `play_learning`, `coach_teaching`, `play_transfer`, `owner_team_context`, `development_home_profile` | Scope depends on each exact suite and its fixture |
| PR/main status | Check Node, Chromium and new WebKit **at final PR head**; after merge check distinct `main` Tests and Publish events | Main Publish PASS is not proof that a user opened the actual Pages build |

Failure rule: any required red job is a **HOLD**. Inspect exact SHA, workflow event, command, failed suite and error, then correct the source/test contract. Never skip the failing suite merely to pass B5.

## Physical Safari and accessibility acceptance: pending B5 owner journey

Use the actual *published* Pages version **only after** its published source has been verified against a merged, qualified commit. Use fictional data and your existing password-free test profile; do not enter personal/real player data.

| Device / view | Real acceptance exercise | Required observation |
| --- | --- | --- |
| iPhone Safari portrait | Home team → Step Out → Watch/Slow/seek → Learn step and choose LM → Edit → Advanced Fit, 118%, ~193% | No horizontal page overflow, clear tactics at Fit, ~27px phone badges, paths not fat, reliable touch selection, user-visible correct instructions |
| iPhone Safari landscape / rotation | Enter manual zoom and rotate; select LM, movement, bend; use nudge/undo and return Fit | Manual zoom and focal region remain useful; no double touch-induced unexpected edit; accepted minor touch limitation remains unchanged |
| iPad Safari narrow and wide | Repeat Learn, Watch and Teach empty/populated; alternate portrait/landscape | Diagram and instruction rail remain accessible; preview not obscured by controls; field and saved play don't jump |
| macOS Safari desktop | Cards/List; Watch and Learn; desktop Teach populated and empty; Advanced Fit/zoom; keyboard-only step navigation and selected-role focus | Desktop 36px density and wider layout remain readable; tab/focus and Save/Cancel accessible |
| Player preview on phone/desktop | Switch to explicit player test profile; reopen same Oztag play and try editor access | Saved cue visible, coach/private data and edit/delete not reachable; normal Home team selector retains scope |
| Regression fixture | Revisit Step In, Step Out, one versioned custom play and one legacy saved play; reopen after reload | Stable IDs/geometry/roles, actor links and notes; no silent migration or overwritten play |

Owner records device/OS/Safari versions, committed Pages source version (if known), any screenshot/console issue, and PASS/FAIL for each exercise. Screenshots can establish appearance, but not security/encryption guarantees; production authorisation and real-data publishing are separately qualified.

## Decision states and next gate

- **B4.12:** PR #191 merged; owner explicitly visually accepted the B4.12 changes.
- **B5 source:** PR candidate; exact-head Node + Chromium + Linux WebKit required.
- **B5 deployed Pages:** NOT VERIFIED, even if a publish workflow later passes.
- **B5 physical Safari:** NOT VERIFIED as a complete B5 journey.
- **B5 owner acceptance:** PENDING. No universal release qualification or match-ready Rugby League formation claim.

**One next action after the PR is opened:** inspect its exact-head Node, Chromium and WebKit GitHub Actions jobs. Do not merge on partial green. Once all required PR checks pass, owner may merge. Only after a verified main publish should the physical Safari checklist above be performed.
