# Play Engine E4.12.2 | Pointer context isolation under touch, pen and zoom

**Accepted source:** Team Manager `main` `74cb428b2fa66fadd46aec52f81079270ccf5293` after the owner merged #211. [Post-merge Tests #42935656109](https://github.com/pdomoney/team-manager/actions/runs/42935656109) PASS (Node 857/857, Chromium 3792/3792 across 101 suites, Linux WebKit 32/32); [Publish #42935656107](https://github.com/pdomoney/team-manager/actions/runs/42935656107) SUCCESS at the same SHA. Owner independently accepted the E4.12.1 UI in #210. Walking Comet framework `main` `faa3a87c8b3218b1e86490a0d2538c72dfb4858f` refreshed 11 November 2026 AEDT. Programme [#166](https://github.com/pdomoney/team-manager/issues/166).

## Representative failure and expected result

A coach starts dragging an explicitly linked run's Start handle with a finger or pen. A second interaction taps **Phase 2** (or changes tool, selected handle, zoom or Undo) outside the drawing stage before the pointer is released. The existing stage stores `drag` in a closure but on later `pointermove` uses live `pedCur(E)` and `E.sel` without validating that they still identify the original phase, tool and handle. A late move can therefore apply a phase-1 coordinate to another phase or dereference a cleared selection. Because matching LM/RM labels are *not* cross-phase identity, this must fail closed.

An interrupted gesture must restore its original diagram snapshot, undo history, modified state and attached endpoints while preserving the newly chosen phase/tool or zoom. It must not cancel previously completed gestures, write saved plays or leave a phantom Undo step. Normal touch and pen drags must continue working and move only explicitly attached endpoints within their own phase. A deliberate Undo while a drag is active cancels the unfinished gesture first.

## Small implementation

- `site/play-editor-pointer.js`: capture and compare the **same editor instance**, phase, tool, selection and selected handle. No registered person IDs or cross-phase inference.
- `site/app.js`: use the context guard before modifying or completing an active pointer gesture, and clear stale selection/viewport on abort. Add one ephemeral `cancelPointerGesture` callback so accepted controls (phase, tool, handle, Undo, fit/zoom, whole view, snap and panel visibility) synchronously cancel the incomplete pointer **before** changing the context, avoiding lost updates to another phase.
- `test/play-pointer-context.test.js`: four synthetic positive/negative cases covering stable context, phase/tool/handle/editor changes, cancellation and legacy schema preservation.
- `test/browser/play_e4_pointer_context.py`: synthetic pointer events of type **touch** and **pen** through actual existing canvas handlers, at 390px and 1280px. Covers phase switch in mid-drag, attached path following a pen move in phase 2 under manual zoom, Undo, tool switch, handle switch, recovery after cancellation, Cancel and player read-only.
- No visual redesign, selection hit-area or renderer replacement, saved schema change, new role, new production identity/permissions, modified Oztag Step In/Out, E5 possession/timing or inferred cross-phase edges.

## Qualification and release

Run `npm test`, the full Chromium browser suite in PR CI, Linux WebKit B5, and build at the exact final PR head. The CI workflow under `.github/workflows/test.yml` is the source authority. Physical touchscreen, stylus, native Safari/VoiceOver and real Pages runtime require independent owner/device validation; synthetic Chromium PointerEvent streams do not prove them. Source PR must remain open and **unmerged** until all required jobs pass and the owner approves. E4.12 broad cross-device qualification remains open after this bounded protection.
