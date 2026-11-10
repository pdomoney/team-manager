# Play Engine 2.0 E4.7 | Explicit Run from and deliberate field start

**Status:** Source change under review, unmerged. Date: 10 November 2026 AEDT.  
**Accepted Team Manager `main` at start:** `74d24cd6c285baaa8136f77eda5b1b4ea885c3b9` (PR #204 owner-merged). Same SHA [Tests #42755433018](https://github.com/pdomoney/team-manager/actions/runs/42755433018) and [Publish #42755432601](https://github.com/pdomoney/team-manager/actions/runs/42755432601) SUCCESS.  
**Walking Comet framework `main`:** `cf557fb14a90e0f15a6de37d6a5ea002eff04ca3`. The reusable engineering guidance and web-frontend/risk profile were read during the previous E4 activity in this chat and remain current.  
**Programme:** [Issue #166](https://github.com/pdomoney/team-manager/issues/166), E4 work. The owner has explicitly deferred E3.4.4–E3.6 sporting approvals, **not waived them**.

## Source gap and representative coach journey

Version-1 authored runs have `actorLinks.start` when their first point was initially snapped to a tactical actor. E4.3 `Add receiver run` and E4.6 `Pass from` exist, but the selected run's property panel offered **no explicit choice** for its starting actor, and no distinct way to mark a run start as deliberately independent from any player. Coaches had to drag handles and rely on snapping to attach/detach. This made exact run authoring harder to discover, particularly on a phone, and risked confusing an independent field location with an attached player slot.

In existing Oztag Teach/Advanced Diagram, a coach opens a play, creates a new run, selects it, chooses **Run from → RM**. The first point follows RM, while its bends/end stay fixed. They may choose **Leave start on field** to remove the link without moving that point. Moving RM later updates only genuinely attached endpoints. Undo restores the previous state; Cancel keeps the original saved play.

## Bounded implementation

- `site/play-actor-links.js`: `assignRunOrigin(phase, moveIndex, playerId)` only acts on a new explicitly versioned `t:'run'` movement, unambiguously selecting a diagram actor in the current phase and updating just the start coordinate and `actorLinks.start`. `freeRunOrigin(phase, moveIndex)` deliberately deletes **only** that relationship and preserves geometry and other `actorLinks`. Both reject missing/invalid geometry, unknown actor, overlaps, legacy unversioned/future link versions and wrong movement type with no mutation.
- `site/app.js`: **Run from** actor buttons and **Leave start on field** in the existing selected versioned run properties, with `aria-pressed`, a named group, disabled no-op detachment, and clear, concise explanation that neither choice proves possession or timing. Existing `pedSnap`/Undo and refresh are reused. Coach-only control, absent from player Learn/Watch and old unversioned runs.
- `test/play-run-origin.test.js`: positive actor follow, explicit detach with exact geometry preservation, JSON save/reload, moving after detach, overlap/invalid/legacy fail-close, golden schema-4 preservation, and explicit `timingVerified:false`/`possessionVerified:false`.
- `test/browser/play_e4_run_origin.py`: synthetic mobile 390px and desktop 1280px coach walkthrough, old-run negative, new run attach/detach/Undo, unchanged saved team/library/original play and player read-only boundary.

## Preserved behaviour and approval boundaries

No new tactical sport formation, physical field dimensions, Rugby League/League Tag player counts, player roster association, new persistence format, event timeline, animation possession, role or credential. Run actor keys are *diagram slots*, not real people. Existing version-1 `moveId`/`actorLinks`, schema 4, eight-slot Oztag, Step In/Step Out legacy IDs, home team selection, shared library, B6 Snap default and Quick Look remain. Older `moves[].pts` are never silently upgraded. No deployment or private data mutation in this PR.

E4 full actor graph, graph-validated multi-phase continuity, a lossless explicit legacy adapter, and E5/E6 ball and defender decisions remain OPEN. E3 sporting review gates are still deferred.

**Tests required before owner merge:** `npm test`, full established Chromium synthetic browser suite, and Linux Playwright WebKit at the exact PR HEAD. Distinguish CI from independently observed GitHub Pages, physical Safari/touch/VoiceOver and owner visual acceptance. An actual publish on `main` is a separate post-merge event.

**One next action:** Owner reviews the run-origin options in Advanced Diagram once PR CI has passed, then merges if satisfied.
