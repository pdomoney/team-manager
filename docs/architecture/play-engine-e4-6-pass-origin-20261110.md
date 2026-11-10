# Play Engine 2.0 | E4.6 explicit pass-origin repair

**Status:** Source change proposed for owner review; not a match-ready formation, timed ball model or deployed release.  
**Source baseline:** Team Manager `main` `8a2178348faf2d044a6c2ca747f553569490998b` (merged PR #203, exact post-merge Node/Chromium/WebKit Tests and Publish SUCCESS).  
**Framework:** `pdomoney/walking-comet-development-framework` `main` `cf557fb14a90e0f15a6de37d6a5ea002eff04ca3`. Read `llm/CHATGPT_PROJECT_INSTRUCTIONS.md`, specialist routing, web-frontend, Engineering Quality Baseline, Existing Project Improvement, Daily Development and Release, and risk-adapted profiles at that commit.  
**Programme:** [Issue #166](https://github.com/pdomoney/team-manager/issues/166). User explicitly postponed E3.4.4 sporting approval on 10 Nov 2026 to continue development.

## Current behaviour and the small gap

The existing **coach** Advanced Diagram allows a coach to draw a *new* versioned (`linkVersion:1`) pass, select an explicit **receiver**, and add a receiver's follow-on run. E4.4 `inspectPlayMovementLinks` already warns when the **passer** is missing, stale or invalid, but the movement properties UI does **not** offer a symmetric chooser for the pass origin. A coach can drag an endpoint by eye, but that is harder to use, especially on mobile. The accepted editor's current Snap default, precision/Undo, Quick Look, legacy Oztag Step Out and eight-slot teaching geometry are preserved.

## One bounded development slice

- `site/play-actor-links.js`: new `assignPassPasser(phase, moveIndex, playerId)` selects a unique existing diagram actor in the current phase and **deliberately moves only the pass's first point** to that actor's current abstract field coordinate. It attaches `actorLinks.start='player:<slot>'` and preserves `actorLinks.end`, all intermediate bends, receiver run, original phase and other moves. It refuses legacy unversioned movements, unsupported link versions, non-pass movements, invalid or duplicate actors, out-of-bounds positions and malformed input without mutation. It identifies diagram slots, *not real registered children*.
- `site/app.js`: adds a **Pass from** row above the existing **Pass receiver** controls, only for the selected versioned pass in coach Advanced Diagram. The chosen sender is marked with `aria-pressed`, with a separate, accessible group label. Uses the accepted `pedSnap()`/Undo/refresh behaviour; an ambiguous actor gets a corrective explanation. This is a coach action, not a player-facing option. The UI says that choosing a passer moves the start and **does not** establish release/catch timing or possession.
- `test/play-pass-passer.test.js`: positive save/reload and actor following, E4.4 warning recovery, ambiguous actors and missing/malformed/unknown-version negative cases, golden schema-4/legacy preservation, and no invented timing.
- `test/browser/play_e4_pass_passer.py`: synthetic 390px/1280px full coach journey including an intentionally unlinked passer, Pass from repair, subsequent change, Undo, no saved play/library writes, Cancel and player preview no coach selector. Browser suite includes existing E4.5 warnings and B6 Quick Look regression.

## Product and release boundaries

- **No persistent schema changes, migrations or new authorisation.** The existing movement linkVersion 1 and workspace schema 4 are reused. Legacy `moves[].pts` and original `quickie-in` / `quickie-out` IDs remain untouched. Selected phase authoring stays separate from team player/club registration.
- **E3 remains paused, not accepted.** Its verified framework references, temporary local scope and reviewer brief stay in source, but E3.4.4 sporting verification, complete approved formations and E3.5/E3.6 remain open. This feature works on the existing Oztag **illustrative teaching canvas**, not an assumed junior Rugby League formation.
- This is a discrete step toward E4 (stable actor relationships), not a complete graph engine. E4.5 warnings remain. Still outstanding are complete actor IDs across every phase and sport, stateful passer/receiver sequences, valid movement graphs, phase timeline, possession E5 and defensive branch E6.
- **No assertion of physical Safari, independently fetched GitHub Pages assets or owner visual acceptance from CI.** Source tests must pass on the exact PR head (Node, full Chromium and Linux WebKit) before owner merge. GitHub Pages Publish on main is a separate post-merge event.

## Representative end-to-end acceptance

1. Coach opens existing Oztag Step Out, creates a copy, adds an explicit new pass whose origin is not linked. The E4.5 warning identifies the missing passer.
2. Coach selects the pass in Advanced Diagram, uses **Pass from → LM** and sees the start move to the LM icon. Receiver stays RM, any bend and second movement remain unchanged. The warning clears. Choosing a different sender is explicit, not guessed from proximity. Undo restores the earlier link.
3. Coach cancels, proving no persisted modifications to original play/team/library. Player preview remains read-only. Existing Snap/zoom/Quick Look remain functional.
4. Negative: overlapping actors must be separated before a link can be authored; unversioned/future-version plays cannot be silently upgraded. No possession, catch time, lineup or sport legality is claimed.

**Next:** PR review and owner visual acceptance for *Pass from* on phone/desktop. After merge, proceed with bounded E4 graph/endpoint validation, not unapproved E3 tactical formations.
