# Play Engine 2.0 | E4.8 explicit run endpoint or deliberate field point

**Status:** SOURCE CANDIDATE for owner review, not deployed or sporting-approved. 10 November 2026 AEDT.  
**Accepted Team Manager baseline:** `main` `193d796ffb78ef6afc916058194cf04e17fca919`, PR #205 merged and owner visually approved. [Post-merge Tests #42759169800](https://github.com/pdomoney/team-manager/actions/runs/42759169800) all three jobs SUCCESS; [Publish #42759169816](https://github.com/pdomoney/team-manager/actions/runs/42759169816) SUCCESS.  
**Framework main verified:** `cf557fb14a90e0f15a6de37d6a5ea002eff04ca3`, current existing-product web frontend and proportional P1 synthetic regression guidance reused.  
**Tracking:** [Issue #166](https://github.com/pdomoney/team-manager/issues/166). E3.4.4–E3.6 sporting decisions deferred by owner, not approved or dropped.

## Real E4 gap

The accepted E4.7 Run from controls attach/detach the first point of a new versioned run. E4.4 already models both `actorLinks.start` and `actorLinks.end`, and the existing editor permits freehand endpoint dragging, but the coach cannot deliberately **select an actor at the other end of the same run** or make a formerly actor-attached destination an independent field point through an explicit control. This inconsistency makes continuing edited run paths and relocating diagram actors less understandable. A stable explicit run endpoint closes one small authoring gap toward the E4 graph without introducing a new schema or movement timeline.

## Bounded implementation

- `site/play-actor-links.js`: `assignRunEndpoint(phase, index, slotId)` validates a *version 1*, `t:'run'` object and uniquely resolved player diagram slot, then deliberately sets only the last `pts` coordinate and `actorLinks.end`. It requires a nonzero length (at least one teaching-canvas unit from the start), rejects invalid points, unknown or overlapping actors and legacy/future versions with no mutation. `freeRunEndpoint` deletes only `actorLinks.end`, preserving the endpoint coordinate exactly so later actor movement will not drag that free location. Existing `editableRun`, `actorEndpointLinks` and actor following remain authoritative; actor keys are diagram positions, not roster people.
- `site/app.js`: Coach Advanced Diagram properties for selected explicit `run` add **Run ends at** buttons and **Leave end on field**, below E4.7 **Run from**. The chosen actor has `aria-pressed`, distinct group name and disabled no-op detach. Existing `pedSnap`/Undo/refresh and earlier mobile toolbar correction preserved. The UI explicitly says this is endpoint geometry, **not** a catch, collision, timed event or legal sporting action. Player Watch/Learn cannot access these controls.
- `test/play-run-endpoint.test.js`: positive actor-follow/pass→run, unchanged start and bends, field-end independent after actor drag, JSON roundtrip, two distinct start/end selections, same-position and overlap negatives, legacy/malformed/wrong-kind/future-version and schema-4 golden unchanged; no inferred timing/possession.
- `test/browser/play_e4_run_endpoint.py`: synthetic 390px and 1280px coach journey, explicit old-run negative, new-run attach→detach→Undo×2→Cancel, accessible actor pressed state, unforced Undo hit-target check, unchanged workspace/shared library, player read-only and no page-level overflow.

## Explicit constraints and acceptance

- No new data, migration, password, ruleset, real team member/child record, E3 approved formation, modified Oztag physical pitch, extra diagram slots, animation possession, simultaneous timing or defensive decisions. E3 remains OPEN at 58.3% accepted milestone-count, with E3.4 at 50% and domain sign-off deferred. Full E4 stable graph/role semantics, exact cross-phase continuity and legacy adapter remain OPEN.
- Preserves historical `moves[].pts` and existing `quickie-in`/`quickie-out` identifiers, stage zoom, Snap on, precision, Quick Look, save/cancel and role/squad selection. No source movement is silently reinterpreted or converted.
- Source qualification requires exact-head Node `npm test`, all established Chromium browser suites and Linux WebKit B5. Physical Safari, observed served Pages and owner visual acceptance must be recorded separately; source CI cannot establish them.

**Representative owner review:** Select a newly drawn Run, tap **Run ends at → RM**, observe only the run's endpoint meet RM, then **Leave end on field** to leave the endpoint at that same coordinate; change RM afterward, noting that only truly attached lines follow. Undo and Cancel must preserve the prior play. Check at phone and desktop layouts. PR should remain unmerged until exact-head CI and owner review.
