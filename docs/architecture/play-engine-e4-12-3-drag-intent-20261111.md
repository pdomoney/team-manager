# Play Engine E4.12.3 | Consistent endpoint selection across zoom and pointer types

**Accepted Team Manager source:** `main` `0d8e0675487aca2253f859087ec1ad46ac800bca` after owner-merged and published E4.12.2 (#212). [Post-merge Tests #42943951443](https://github.com/pdomoney/team-manager/actions/runs/42943951443) SUCCESS, [Publish #42943951461](https://github.com/pdomoney/team-manager/actions/runs/42943951461) SUCCESS at exactly the same SHA. **Framework source:** `pdomoney/walking-comet-development-framework` `main` `faa3a87c8b3218b1e86490a0d2538c72dfb4858f`. The psychology-informed UX playbook is labelled **PROPOSED**; its Fitts's Law/Zeigarnik heuristics are applied here as nonbinding hypotheses, not previously accepted product decisions.

## Source-backed risk and coach's journey

The select tool currently calls `dist(p, drag.p0) < 0.6` to determine whether a pointer has moved. `p` is the **rounded field coordinate** from the zoomed SVG. Thus a 0.6 field-unit threshold becomes a different number of screen pixels at Fit, manual zoom and different browser sizes. A small finger wobble at lower zoom can initiate `mv` dragging, which calls `detachMovementActors` and removes a version-1 tactical path's actor links. A similar distance at high zoom might not allow a deliberately fine drag to begin.

**Hypothesis (Fitts's Law):** if the activation threshold is stable in CSS pixels and appropriate to pointer type, the coach can select an attached run or its Start handle without involuntarily detaching or moving it at either Fit or approximately 200% zoom. Deliberate movement still works with pen/mouse and touch. **Counterexample:** an overly large touch threshold can obstruct tiny precise movements, so preserve the existing precision nudge controls and test positive deliberate gestures at manual zoom. Keep keyboard navigation and snap defaults.

## Change

- New pure helper `site/play-editor-drag-intent.js` uses initial/current **client pixel** distance: 8px touch, 5px pen, 3px mouse/unknown pointer. Invalid positions fail closed. This threshold is not saved or a sporting field measurement.
- `site/app.js`: capture pointer's client origin; use this helper only where the existing **non-pan, non-phase-placement** drag activation was previously in field units. The existing pointer-context guard, pointer cancellation, snap, Undo, zoom rendering, 8-slot legacy diagram, `moves[].pts`, V1 metadata and user-role checks remain unchanged.
- `test/play-editor-drag-intent.test.js`: 4 Node tests for threshold boundaries, negative and diagonal movements, zoom independence and malformed input.
- `test/browser/play_e4_drag_intent.py`: actual synthetic mouse, touch and pen events through the live coach editor at 390px and 1280px, each at Fit and manual zoom. Verify jitter selects without moving/detaching, deliberate line/body movement frees V1 actor references as designed, deliberate handle movement preserves opposite reference and phase data, Undo restores links and geometry, Cancel preserves saved Step Out, player preview remains read-only.

## Boundaries and qualification

No new actual player/person identity, cross-phase actor correspondence, possession/timing or defensive logic. No changes to saved schema, navigation, permissions, appearance, stage size or touch hit geometries. This is not a full physical device qualification; synthetic PointerEvent tests are not evidence of Safari iOS, real finger/palm rejection or actual stylus hardware behaviour. Run exact final-head Node and complete Chromium + Linux WebKit CI, then independent owner mobile/stylus review after merge/publication. Remain draft/unmerged until tests and owner approval. Broader E4.12 remains open.
