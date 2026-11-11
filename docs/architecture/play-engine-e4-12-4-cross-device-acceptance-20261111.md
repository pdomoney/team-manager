# Play Engine E4.12.4 | Cross-engine qualification and physical-device acceptance

**Source authority:** Team Manager `main` `2fab415bb745f6f1ee9e10fbae7a0ac72b6ae13c` after owner-merged and published [PR #213](https://github.com/pdomoney/team-manager/pull/213). Exact-merge [Tests #42966659486](https://github.com/pdomoney/team-manager/actions/runs/42966659486) PASS (Node 868/868, Chromium 3,898/3,898 across 103 suites, Linux WebKit 32/32); [Publish #42966659555](https://github.com/pdomoney/team-manager/actions/runs/42966659555) SUCCESS. Framework `main` `faa3a87c8b3218b1e86490a0d2538c72dfb4858f`; the Fitts's Law and interruption/recovery heuristics in `PSYCHOLOGY_INFORMED_UX.md` are **proposed**, not product acceptance or automatic adoption. Programme [#166](https://github.com/pdomoney/team-manager/issues/166).

## Source-supported gap and narrow scope

E4.12.1–3 implement connected-path toolbar, phase/tool-specific pointer interruption and zoom-consistent drag-intent thresholds. Existing Chromium tests exercise these at 390/1280 and Fit/manual zoom using *scripted* `PointerEvent` dispatch. The Linux WebKit `browser-webkit` job previously executed only `play_b5_cross_device.py`: coach → nudge → save → reload → player. It did **not** test V1 endpoint/handle touch and pen gestures. It is unsafe to infer iPhone Safari or pen input acceptance from green WebKit B5 or Chromium alone.

E4.12.4 closes the missing **automated cross-engine checks** without changing the accepted editor. It still leaves **physical-device and product-owner acceptance** open.

## Bounded tests

- `test/browser/play_e4_drag_intent.py` accepts `E412_GESTURE_ENGINE=chromium|webkit` (Chromium default). The existing 390px and 1280px, Fit/manual, synthetic mouse/pen/touch, V1 connected line body/Start handle, Snap On/Off, Undo, Cancel and player read-only checks now run on Linux WebKit as well.
- New `test/browser/play_e4_touch_input.py` opens genuine browser *touch-enabled* contexts in both engines and calls **Playwright `touchscreen.tap`**, rather than authoring the `PointerEvent` itself. It targets the visible Start/End SVG hit areas at Fit; when manual zoom places a handle behind the accepted floating palette, it taps that handle's **existing precision toolbar button**. It checks no geometry/link/Undo/dirty mutation from a tap, keyboard arrow-nudge/Undo fallback, stage touch-action ownership, no horizontal overflow, Cancel and player read-only. Browser-generated simulated touchscreen taps are more representative than scripted events, but are **not** a real finger, stylus, palm rejection or iOS Safari.
- The existing WebKit CI job retains B5 and then executes both scripts with `E412_GESTURE_ENGINE=webkit`. The full Chromium suite auto-discovers `play_e4_touch_input.py`, so both engines qualify the same scenario. No external device farm, dependencies, credentials or real participant data.
- **WebKit qualification clarified floating-toolbar occlusion:** at manual zoom, browser-generated taps aimed at a Start circle were actually landing on the already accepted floating precision palette (real `elementFromPoint` target was a button or `.ped-precision`), not on an overlapping SVG handle. No change to the app's accepted hit logic is justified. The browser qualification now checks real touch on SVG handles **when visible**, and uses the existing **Start/End precision controls** by a real touch when the palette covers the intended point. It never silently treats a covered handle as directly touchable, and requires unoccluded Fit handles to be directly operable.

**Preserved:** Oztag Step In/Step Out IDs and legacy schema 4 data, V1 phase-local slot links, role separation, Snap-On default, precision controls, responsive artwork, no passwords in test mode, Save/Cancel semantics and existing UI/navigation. No application source, schema, role, tactical geometry, style, storage or publishing implementation is modified by this PR.

## Physical owner acceptance: required, separately recorded

Use a *published, exact-commit* version and **fictional test data only**. Do not use youth/medical records, team credentials or actual participant information in screenshots or issues. Make a temporary working draft of the existing **Step Out** test play. **Do not save a test change to a real team workspace.** Record device model, OS/browser version, viewport/zoom, published SHA, observed behaviour and PASS/FAIL/NOT TESTED for each line.

| Device and input | Required journey | Acceptance outcome |
| --- | --- | --- |
| iPhone Safari, actual finger | Open test mode, choose team → Tactics → Plays → Step Out → Edit. At **Fit**, create/select a V1 run in the draft; tap Start and End without moving the line; drag away and Undo. At manual ~200%, repeat. | Correct selected handle, connected/free states clear, no unexpected movement, path/actor art usable, Undo returns to prior diagram. |
| iPhone Safari, interruption/recovery | With two fingers, interrupt a drag; change phase/tool during a pending gesture; return to Select and drag again. Toggle Snap On/Off. | No orphan edit/cross-phase carry-over, no phantom Undo, deliberate handle movement succeeds, other phase/bends remain unchanged. |
| macOS Safari, trackpad or mouse | Repeat endpoint selection, tiny versus deliberate moves, Snap On short drag back to actor, Snap Off free movement, Undo and keyboard arrow-nudge at Fit and ~200%. | Click vs drag distinction works; identical snap-back creates no Undo; keyboard remains usable. |
| iPad with compatible stylus, if available | Select linked Start/End and bend at Fit and ~200%; slow pen drag, snap on/off, cancel/Undo and mixed pen+finger interruption. | No unintended detachment or phantom Undo; accurate target, after cancelling can edit normally. **NOT TESTED if no device, not PASS.** |
| Player read-only and source preservation | Exit editor with Cancel; reload, open Step Out in player preview and inspect Watch/Learn. | Original saved play unchanged, no edit controls exposed to player, preview legible. |

**Stop / report a defect** if an unrelated phase or actor moves, an attachment silently disappears on a tap, a prior Undo step is erased, the field cannot be operated at Fit or ~200%, or a player preview exposes coach editing. Keep the corresponding device test FAIL/UNKNOWN and link a minimal synthetic reproduction; do not treat green CI as an override.

## Release gate

For the PR: exact-head Node, full Chromium, Linux WebKit B5 **plus** both new gesture qualifications, source branch review and merge approval. Verify separate push Tests and Publish at the resulting merge SHA after any owner-authorised merge. Physical device acceptance and coach usability remain distinct, outstanding gates and **cannot be marked complete by GitHub Actions**. E4 broader cross-phase graph, E5 timing, sport-specific Rugby League designs and production roles remain outside this slice.
