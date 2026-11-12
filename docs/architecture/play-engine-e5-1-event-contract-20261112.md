# Play Engine E5.1 | Explicit timed-event contract (owner review)

**Status:** proposed design contract only. **No authoring, persistence, player playback, schema migration, or runtime changes approved by this document.** Based on Team Manager main `de77203f035c598ddf9a5724c35e9f7d69de28f2` (PR #215 merged; post-merge Tests and Publish SUCCESS). Framework main `faa3a87c8b3218b1e86490a0d2538c72dfb4858f`. Programme #166; deferred duplicate-phase UX #216.

## Accepted boundaries

- The current eight-slot Oztag diagram is a **tactical illustration**, not a registered player's identity. Keep the original Step In/Step Out stable IDs, all legacy movement bytes, team-local and shared library revisions, schema-4 encrypted workspace and player read-only permissions.
- E4.10 continuity declarations are *ephemeral reviewer assertions*. They do not verify identity. E4.11 graph projections and E5.0 pass→receiver-run candidates do not prove possession, a catch, or time. A matching slot name, endpoint coordinate, movement-array order or teaching-step text never implies an event.
- E3.4 Rugby League/League Tag format approvals remain separate. No sport-specific legality is inferred.

## Candidate versioned companion representation (NOT an adopted persisted schema)

A future opt-in `eventTimeline` companion, version 1, references an existing play revision without modifying historical `moves` or `phases`. Exact storage/copy/export strategy is **unapproved** until the compatibility review.

- `actors[]`: stable play-local opaque `actorId`, type (attacker/defender), and explicit per-phase mapping to a diagram `slotKey`. No link to registered people. Cross-phase mapping must be explicitly authored, one-to-one at each boundary, with no inferred continuity. Conflicts block timed playback.
- `events[]`: unique opaque `eventId`, nonnegative integer `atMs`, explicit `kind`, typed `actorId` and/or `movementId` references, and explicit deterministic same-time ordering. Event IDs and movement refs must be unique in their specified scope. Event time is coach-authored, not derived from draw order.
- Initial event vocabulary proposal: `possession-set`, `pass-release`, `catch`, `catch-failed`, `run-start`, `run-end`, `wait-start`, `wait-end`. Future branches and optional decisions are **not** automatically resolved; authoring and playback remain gated until their choice semantics are approved.
- Separate independently moving actor paths may overlap in time. Same-time events need an explicit tie-break/order contract, never implicit array order. The owner must choose between explicit sequence numbers or stable event dependency edges; either way contradictory transitions fail closed.

## Ball-state transition rules

| State before | Explicit event | Required evidence | State after |
| --- | --- | --- | --- |
| unknown | possession-set | one declared attacking actor; explicit author decision | held(actor) |
| held(actor) | pass-release | same possessor; valid linked pass; explicit intended target | in-flight(pass, target) |
| in-flight(pass, target) | catch | named intended receiver, valid identity/phase reference | held(receiver) |
| in-flight(pass, target) | catch-failed | explicitly authored failure | loose |
| loose | possession-set | explicit recovery decision and actor | held(actor) |

A second possessor, catch without flight, wrong receiver, double release, unresolved actor mapping or unsupported event version must yield reason-coded **BLOCKED** state, not an invented transition. An unresolved flight at the end is not a catch. Concurrent run/wait events change actor motion state, not ball ownership.

## Determinism and compatibility

A pure evaluator at timestamp `t` must replay the same validated event ordering from a known initial state, independent of previous seek position or rendering frame rate. Rewind and repeated seek must yield identical actor and ball state; no teleportation at phase boundaries without explicit continuity. Rendering is a later stage, not a source of truth.

Existing schema-4 and legacy version-2 plays without an approved timeline continue to display as **untimed approximate teaching illustrations**. No automatic conversion, mutation, fallback-to-guessed-timing or hidden migration. Unknown future timeline versions fail closed for timed playback but preserve source data for roundtrip/export.

## Proposed E5.1 verification and hold points

1. Approve the actor/phase identity and mapping semantics, including whether same-phase slots can reuse one actor ID across phases only with explicit declaration.
2. Approve coach-authored time units and same-timestamp ordering/dependency semantics.
3. Approve legacy policy: opt-in companion, untimed legacy viewing, no implicit conversion.
4. Only after approval: implement pure validator and synthetic positive/negative tests for held→release→catch→run, failed catch, missing catch, duplicate actor/event/movement IDs, ambiguous cross-phase continuity, simultaneous actions, reordered drawing arrays, deterministic seek/rewind and unchanged schema-4 JSON roundtrip.
5. Run exact-head Node, Chromium and Linux WebKit CI; review a draft PR before any owner merge. Physical Safari/stylus/accessibility and owner visual review remain separate qualification gates.

**Non-goals of this PR:** no changes to source JavaScript, fixtures, tests, UI, runtime, published Pages, live data or release tags. E5.2 deterministic event evaluation cannot begin until the three contract decisions above are accepted.
