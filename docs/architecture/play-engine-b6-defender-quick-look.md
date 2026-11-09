# Play Engine 2.0 | Option B B6: faster defender drawing and draft Quick Look

**Status:** Proposed source implementation awaiting PR exact-head CI and owner Safari acceptance.
**Base:** Team Manager `main` `ba445b024aca671cdf5ad45e03e5c9dfda10d34f` (owner merged and published PR #197); framework `main` `cf557fb14a90e0f15a6de37d6a5ea002eff04ca3`. Issue [#166](https://github.com/pdomoney/team-manager/issues/166). Existing Option B workspace and E4.5 coach-only link diagnostics are preserved.

## User feedback (10 November 2026)

The owner reports that enabling Snap every time is unnecessary friction, the original "Defender" line tool does not make a defensive run intuitive, a coach must be able to inspect *unsaved* changes without going back to the play viewer, and Play/Slow should animate the draft preview.

## B6 behaviour

- **Snap On initially:** `openPlayEditor` starts with conservative `snapEnabled:true`, and the button displays `Snap: On`. The coach can still turn it Off for deliberate freehand drawing. This is an editor preference only, not a stored play property or wider default for other modules. Ambiguous or absent nearby actors still fail closed rather than auto-linking.
- **Defender run:** the original tactical movement type `shift` is retained; its toolbar label is clarified to **Defender run**. In Select mode, tapping a defender or marker shows **+ Defender run** in the compact precision bar (available even with Properties closed on phones) and Properties. It starts a short editable draft move with a stable existing version-1 `moveId` and explicitly anchored starting defender; the coach moves the end handle to choose the route. Ambiguous overlapping actor selection refuses to guess. The original drag-from-defender option and freehand Snap toggle remain. No inferred sports-rule legality or automatic defensive AI.
- **Quick Look:** a dedicated button in the existing coach editor opens a diagram-first preview of a **detached snapshot** of the current draft, including the latest typed name, sport, headline and steps. No Save, navigation away, gallery copy or draft-to-team write occurs. Controls use the current Watch `planPhase` and `animFrame`: Play/Pause/Play again, Slow toggle (0.45×), Restart, seek and phase navigation. Returning leaves the original draft, Undo, Save/Cancel, team and role intact. Closing the editor stops any active animation frame; no hidden playback persists.
- **Animation status:** as in the existing Watch viewer, movement order and ball state are estimated from legacy drawing coordinates. Quick Look **does not** turn spatial proximity or written instructions into verified catch events, ball possession, defensive decision branches or sporting compliance. The preview is labelled as approximate and unsaved.
- **Responsive:** the new Quick Look stays within the established full-area editor and uses the dark watch-style board with bounded height and accessible buttons. The defender hint occupies a small row only while its tool is selected. The original B4.12 preferred lean zoom artwork remains unchanged.

## Preserved behaviours / deliberate non-goals

**Preserve:** starter IDs `quickie-in`/`quickie-out` with Step In/Out labels, editable legacy paths and multiphase geometry, stable actor link IDs, teaching actions, Oztag and Rugby League concept-only caveats, team/home selection, coach versus player preview permissions, existing viewer Watch/Learn and library provenance, encrypted data and workspace schema 4. No password login, database, production migration, release or unrelated Option C editor.

**Do not conflate:** E4 defender path authoring with E5 timed catch/possession or E6 coach-authored choice branches. Those remain open in #166. The requested "Animate Play and Slow" here is implemented as functioning controls for the new **draft preview**, in addition to the existing saved-viewer animation; this is not an assertion that the buttons themselves need decorative motion.

## Qualification and acceptance

**Source tests:** `npm test` plus full Chromium synthetic Playwright suite and Linux WebKit B5 journey at the final PR head. Newly added `test/browser/play_editor_quick_look.py` exercises Snap default and manual override, defender run from real selected actor on 390/1280 widths, unsaved Quick Look Play/Pause/Slow/seek/restart, return-to-draft, Cancel, zero stored source changes, and Player preview isolation. Existing snap regression tests are updated to assert On-by-default while still checking cancellation/ambiguity/freehand modes.

**Owner review:** open a fictional Step Out or custom play on actual iPhone Safari and desktop; see that Snap starts On; select a marker/defender and use the quick-action run; open Quick Look, test Play, Slow, pause, seek, return, then Save or Cancel deliberately. Report any remaining touch interaction friction, especially accidental gestures or poorly placed controls. Full B5 physical Safari qualification remains a separate gate; Linux WebKit is not actual iOS Safari.

One PR, unmerged for owner acceptance. If Chromium or WebKit fails, fix the same PR and retain exact-head qualification evidence. Do not deploy until the owner merges it.
