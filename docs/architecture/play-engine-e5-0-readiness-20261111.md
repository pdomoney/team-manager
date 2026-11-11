# Play Engine E5.0 | Safe handover readiness, not a timed event engine

**Accepted base:** Team Manager `main` `c6271a7c3273b8812afa35565ee7a733443af1b4`, [PR #214](https://github.com/pdomoney/team-manager/pull/214) owner-merged, published and UI-reviewed. Exact-merge [Tests #42972826841](https://github.com/pdomoney/team-manager/actions/runs/42972826841) SUCCESS: Node 868/868, Chromium 3933/3933 in 104 suites, Linux WebKit B5 32/32, pointer gestures 74/74 and browser-generated touch 34/34. [Publish #42972826833](https://github.com/pdomoney/team-manager/actions/runs/42972826833) SUCCESS at the same SHA. Framework main `faa3a87c8b3218b1e86490a0d2538c72dfb4858f`. Programme [#166](https://github.com/pdomoney/team-manager/issues/166).

## Why this is the next safe slice

E4.12's 4/4 editor-delivery milestones are complete. **The full original E4 graph is not complete**, especially persistence/approval of cross-phase actor identity and an explicit temporal pass→catch→run sequence. E5 requires those prerequisites; the current movement array order and matching LM/RM slot labels **cannot** establish possession or event time. E3.4 local Rugby League/League Tag sporting rules also remain unapproved.

A coach currently can explicitly link a pass from a phase-local diagram slot to an intended receiver and begin a run at the same slot, and E4.10 supports unsaved reviewer declarations between adjacent phases. Before writing a new timed engine, produce a bounded **read-only** answer: which pass→receiver-run connections have unambiguous explicit structural evidence, and which require choices or repair? This exposes the remaining E4 gate instead of silently treating the graph as complete.

## Source changes and contract

- `site/play-possession-readiness.js` is a pure, immutable, in-memory `inspectPlayPossessionPrerequisites(playObjectOrExactJsonText, reviewerDeclarations=[])` inspection. It reuses accepted E4.11 graph compatibility and E4.10 continuity inspection. No editor, Watch, Learn, publishing or saved-play integration.
- A valid V1 pass with explicitly linked local passer and receiver may have a **same-phase structural candidate** when exactly one valid V1 run starts at that receiver slot. This is *not* evidence of catch, timing or an actual player/person.
- A next-phase candidate requires an **explicit, adjacent, one-to-one reviewer declaration**, even when the slot name repeats in both phases. These assertions are not persisted or independently verified.
- Zero runs, two candidate runs, duplicate move IDs across phases, damaged/unsupported V1, legacy-only geometry, contradictory declarations and malformed input yield reason-coded BLOCKED results. The source is unchanged.
- Return `timingVerified:false`, `possessionVerified:false`, `actorIdentityVerified:false`, `timedPlaybackAllowed:false` and `events:[]` **even if every structural candidate is unique**. Drawing or study-step order is never treated as chronological authority.
- `test/play-possession-readiness.test.js`: eight positive/negative synthetic Node tests: same-phase candidate, no cross-phase inference, explicitly declared adjacent candidate, multiple candidates, invalid links and declarations, cross-phase duplicate IDs, historical schema-4 preservation, and movement-order independence. Full existing CI remains a gate.

**Non-goals:** no timed graph, ball ownership, invented catch, E5 event serialization, role or permission additions, saved workspace changes, sport format approval, automated defensive decisions or UI controls. This step does not qualify E5 possession animation, which requires a further owner design decision and source-backed E4 closure.

## Proposed E5 delivery roadmap (subject to owner acceptance)

| Slice | Intended value | Gate |
| --- | --- | --- |
| **E5.0** (this PR) | Read-only explicit pass→receiver-run candidate inspection and reason-coded blockers | Source CI, review and owner merge |
| **E5.1** | Authoritative event/identity/time contract design for coach-authored passes, catches, failures, options and runs | **HOLD schema/source writes** until E4 cross-phase identity, event-order choice and legacy policy approved |
| **E5.2** | Deterministic pure event-state evaluation at any seek position, no teleportation | Accepted E5.1 contract and synthetic failure/recovery tests |
| **E5.3** | Coach editor actions to author event/timing choices, validate ambiguous states and Undo | Owner-approved UX/schema; fixture backward compatibility |
| **E5.4** | Watch/Learn/player animation and scrubbing using the *same* accepted event graph | Player read-only, both directions, B5/browser & actual Safari checks |
| **E5.5** | Scenario acceptance, schema-4 compatibility and migration/rollback rehearsal if needed | No live data migration before explicit owner approval |

**Next merge gate:** final-head `npm test`, complete Chromium, pinned Linux WebKit, then owner approval. No release or real-data changes from this PR. The E4 full checklist remains open; E3.4 58.3% accepted status not waived. E5.0 is a diagnostic preflight, not a completion of E5's behavioural milestone.
