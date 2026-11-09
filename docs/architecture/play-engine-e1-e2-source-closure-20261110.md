# Play Engine 2.0 | E1/E2 source closure candidate

**Date:** 10 November 2026 AEDT  
**Baseline:** Team Manager `main` `edbd8ecdc1772de7bf6a476109667b8f00f76aa0` (merged #199).  
**Framework:** `cf557fb14a90e0f15a6de37d6a5ea002eff04ca3`.  
**Programme:** [issue #166](https://github.com/pdomoney/team-manager/issues/166).

## Why E1/E2 were still open

Earlier merged #167/#168 and subsequent Option B B1–B6 already delivered the responsive editing workspace and unified dark presentation. The original #166 checklist nevertheless still requested (a) the complete width/zoom/rotation and Save-reachability regression and (b) coherent Teach preview, selected/empty/error UI and keyboard navigation. This PR closes **the source implementation and automated qualification gaps** without reopening accepted B4.4 touch behaviour or claiming a physical Safari test.

## E1: responsive editor qualification

New `test/browser/play_e1_e2_completion.py` exercises Step Out from Home to Plays to coach edit to Cancel at:
- Reference viewports 390, 768 and 1280 CSS px with 100%, 125%, 150% and 200% **effective layout-width contraction**, giving 12 scenarios.
- Short landscape-shaped 844×390 and 1024×500 CSS viewports.
- Teach preview and Advanced Diagram, tools, Fit, Play details, Save/Cancel reachability, contained preview, no horizontal page overflow when at least 320 effective CSS px is available, and untouched saved Step Out after Cancel.
- Widths below 320 CSS px are sampled for basic control access only; they are not represented as WCAG 320px reflow proof.

**Test limitation:** viewport contraction is a deterministic Chromium proxy for CSS layout space at browser zoom. It is *not* Apple Safari page zoom, large text accessibility settings, physical keyboard software, or an iPhone rotated mid-drag. Physical device qualification remains required and must be recorded rather than inferred.

## E2: Teach/diagram design and recovery

- Preserve the existing dark tactical preview, selected action and original actor/field geometry. A selected action's Preview button now exposes `aria-pressed` and visible amber emphasis; the same button regains focus after the preview rerenders, allowing keyboard continuation.
- Make the empty Teach state distinct and readable on the dark board, with its existing Add and Use instructions choices retained.
- On Save with a missing teaching instruction, locate **the first invalid action in the correct phase**, select it, show a visible inline error with `role=alert`, set `aria-invalid` and place keyboard focus on that instruction. Typing a valid instruction clears that error in place without an unsaved-data write.
- Reject forged/out-of-range Preview selections instead of silently displaying another action.
- Automated positive/negative examples cover empty, selected, keyboard, validation recovery, and Cancel without committing.

## Preservation and acceptance

Never change: Step In/Step Out IDs or legacy lines, data schema 4, formation/role semantics, coach versus player permissions, Home team selection, existing editor tools, Watch/Learn/Mirror/Quick Look, B6 Snap and Defender run, save and encrypted publishing boundaries. The PR has no saved-data migration, real roster, new backend, login, deployment or Option C studio.

**Source acceptance:** exact PR-head Node, full Chromium including the new matrix, targeted Linux WebKit B5, then owner merge and separate post-merge `main` Tests/Publish if all required checks pass.

**Owner/device gate still open:** iPhone Safari portrait and landscape at actual browser text/zoom settings, iPad Safari, macOS Safari and keyboard/VoiceOver where available. Run with fictional Test mode data, inspect Teach and Advanced Diagram at zoom and rotation, confirm the selected amber action/error, keep Save/Cancel visible, and check actual published version. Report device/browser/version, PASS/FAIL, screen evidence without personal data. This is also relevant to B5's wider cross-device acceptance.

**Do not mark original #166 E1/E2 manual-only items complete before physical evidence and explicit owner acceptance.** Completing a source PR does not prove final Safari UX acceptance.