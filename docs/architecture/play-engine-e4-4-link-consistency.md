# Play Engine 2.0 | E4.4 read-only actor-link consistency

**Status:** Proposed source-only implementation, not a new animation engine, movement scene graph, schema, sport formation or completed E4 milestone.

**Source base:** Team Manager `main` `e3bf2ca2698d41ca63fab7422caf6d33fcea9bc3` (owner-merged #195); framework `main` `cf557fb14a90e0f15a6de37d6a5ea002eff04ca3`. B5 physical Safari acceptance remains separately open. The current E3.1 and E3.2 sport contracts/reference records are read-only and **not** permission to invent junior Rugby League formations.

## Why this is useful

Actual `site/play-actor-links.js` already implements E4.1–E4.3 slices: tactical actor keys, explicit new `moves[].moveId` and `linkVersion:1`, coach-chosen pass receiver, an independently editable receiver run and later actor endpoint following. These parts work but do not provide a single trustworthy phase-wide read-only diagnostic of whether the saved links are intact. The rest of E4 (complete actor graph, undo/redo, full pointer coverage, multi-phase continuity) and E5/E6 timed possession/defence must remain separately tested and approved.

The owner-approved E0 golden fixture captures one Oztag LM→RM pass and RM-origin run. An audit can verify that **both movement endpoints reference the same tactical RM slot** without concluding that RM caught the ball at a particular time or owns possession.

## Proposed pure helper

`site/play-movement-link-audit.js` exports `inspectPlayMovementLinks(phase)`:

- Read-only input of one original play phase. Returns an immutable snapshot of tactical actor keys, valid explicit movement links and shared-actor run/pass references.
- Checks V1 movement identifiers for duplicates, expected `actorLinks` shape and supported version, bounds in the **existing abstract 50×80 teaching grid**, actor presence and actor type (pass/run attackers vs defensive shifts), and whether the explicitly linked endpoint still coincides with its tactical actor.
- A passer and receiver must be explicitly named on an E4.2 pass before it qualifies as a well-linked pass. A run may deliberately terminate at a field point, with no invented target actor.
- Reports `status:'consistent-links-only'`, `'partial'` (including legacy lines) or `'invalid'` with stable issue codes. Legacy unversioned movements are **not** retroactively linked based on proximity. Unknown versions fail closed, no migration or mutated saved source.
- A `sharedActorPaths` diagnostic can report a pass to RM and a run starting from RM, but **`temporalOrderingVerified:false`, `timingVerified:false`, `possessionVerified:false` always**. This does not assert catch, possession, order or sporting legality.
- Not wired into coach/player UI or storage. No new sport formation, player assignment, movement persistence or generic design studio.

`test/play-movement-link-audit.test.js` protects the E0 versioned example, legacy paths, tactical actor moves, missing/stale refs, duplicate IDs, unsupported versions, invalid geometry and defensive actor separation.

## Limitations and next change

This helper is a diagnostic foundation only. It does **not** solve event simulation, defensive response alternatives, phase transitions, stable cross-phase actor identity, or incomplete Oztag/League/Tag formation specifications. Do not mark all E4 checklist tasks complete on its merge.

**Review gate:** exact-head `npm test`, full synthetic Chromium and Linux WebKit B5 tests PASS, then owner review and merge. Source CI does not qualify physical Safari or the live client cache.

**Next accepted product-facing step:** once a coach-side warning design is reviewed, show *specific* broken explicit-link warnings in existing Advanced Diagram rather than silently repairing a path; ensure player view remains compatible and does not expose developer diagnostics. No new persisted schema or generic Option C scene graph. Actual timed pass/catch/possession remains E5, distinct from this check.
