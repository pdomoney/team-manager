# P04A — Encrypted local person-review ledger and merge qualification

**Issue:** [P04 #46](https://github.com/pdomoney/team-manager/issues/46), [roadmap #41](https://github.com/pdomoney/team-manager/issues/41).  
**Parent baseline:** merged P04 foundation PR #58, `fbd6d6fb306bfa1ad979cec7122a1f2c52b6fcba`.  
**Status:** Persistence-stage candidate for owner review, **not full P04 acceptance**.

## 1. Purpose and accepted limits

Preserve explicitly confirmed local **person identity review acknowledgements** across encrypted coach-workspace saves, restores and simultaneous edits from multiple devices. This phase **does not** merge legacy player/staff records, authenticate individuals, verify guardians, or disclose data between clubs. `peopleReviews` is encrypted **coach-only metadata** within the existing GitHub Pages encrypted workspace.

P04 delivery is deliberately split:

1. **P04A:** this scoped **persistence and recovery** PR. Owner approval and merge required before UI stage.
2. **P04B:** next **in-app People and Guardian review UI** PR, separately tested and approved. The UI must use the validated P04A API, explicit confirmations and current coach-only storage. It must not imply legal guardian approval or enable children/parents to sign in independently.
3. **P04 closure:** requires both stages, full historical-data and privacy/UX acceptance; issue #46 remains **open** after P04A alone.
4. **P05** starts after P04 acceptance. Backend migration, independent accounts and cross-tenant authorisation remain **post-P10 issue #55**.

## 2. New data

An optional root `peopleReviews` array is read by `migrateWorkspace` and normalised to `[]` in an old schema-4 workspace. **No schema bump**; existing files remain readable in current app and old data is not rewritten by this PR. On the *next normal save* the root coach workspace stores this field inside the existing `coach.enc.json` AES-GCM ciphertext and encrypted local draft; no separate public file, network API or storage provider is added.

Records include `id`, `namespace`, two exact source references, two original local person keys, `reviewedBy`, UTC `reviewedAt`, `status: reviewed | reversed`, and optional reversal actor/time. Normalisation removes unexpected personally identifying fields and never propagates permissions or legal authority. The review is a coach's local assertion **only**, not evidence of legal identity.

Source references are qualified by a **caller-supplied local namespace**. A future UI must supply a stable, owner-scoped workspace namespace; using just the default `team1` ID would be unsafe across independent coach workspaces. No global people directory or identity lookup is attempted.

## 3. What may be saved now and why

`player`, `helper` and `match-official` have stable legacy IDs, so P04A allows those exact source references to be recorded after explicit local review. `club-official`, `team-staff` and `season-staff` currently use **array positions**, not durable IDs; this PR excludes them from persistence rather than silently linking a newly reordered staff member. The P04B work will need safe stable IDs and controlled migration before offering durable links for those forms.

No automatic match on name/email/phone/club occurs. No change is made to legacy `personId`, numbers, jersey loans, seasons, team membership, medical information, WWCC fields, registration evidence or helper task assignments.

## 4. Write pathway

The future *trusted coach UI* will:

- Build a fresh `buildLocalPeopleIndex(workspace, namespace)` after unlocking the coach workspace.
- Present two source records; require intentional confirmation through `proposeLocalPersonLink` and `reviewLocalPersonLink`.
- Call `appendReviewedPersonLink(currentWorkspace, freshIndex, reviewed, { reviewedAt })`. This function **revalidates the live workspace IDs/person keys**, rejects stale/malformed or unstable sources, and returns a **new** workspace object containing the review.
- Replace the current `ws` with that returned object or incorporate the reviewed `peopleReviews` into it, call the existing normal `save()` path (which encrypts the draft and schedules encrypted publishing).
- Use `reverseReviewedPersonLink` to save a **reversed tombstone**, rather than deleting history. Attempting to add the same reviewed pair again is rejected until an explicit follow-up workflow is designed.

The present persistence-stage PR contains **no caller/UI import** of the new append/reverse API. P04B integrates it and must ensure `data` continues pointing to the correct selected team when updating `ws`.

## 5. Multi-device / GitHub merge

`model.js` includes root `peopleReviews` in the `WS_KEYS` split so secondary teams and legacy player exports cannot inherit it. The existing `records()` / `putRecord()` / `merge3()` conflict machinery tracks each reviewed link under a distinct `person-review/<URL-encoded-id>` key:

- Two newly reviewed *different* pairs combine automatically.
- Identical records converge without duplicates.
- A reversal is retained when the other device edits a player or different link.
- Conflicting edits to the same review appear under **both** and require the trusted coach's explicit local/remote selection. Reversal tombstones are retained; no silent deletion or activation by last-write-wins.
- When the old app or an older backup lacks `peopleReviews`, normalisation supplies the empty array and legitimate new rows are preserved by three-way merge, subject to normal conflict policy.

## 6. Acceptance and negative tests

`test/people-ledger.test.js` exercises:

- schema-4 upgrade and repeated normalisation; legacy team export strips root metadata
- explicit review-only write and no original record mutation, duplicate prevention, reversal tombstones
- missing/duplicated/stale person source identity and spoofed data refusal
- malformed IDs, unsupported guardian grant claims, invalid times and unknown statuses
- non-leakage to `teamView` / players' encrypted file
- actual `seal` -> `openFile` coach encrypted round-trip (test-only lower PBKDF2 count; production remains at 600000)
- simultaneous distinct review merges and conflicts; preservation of reversal while a player's sporting record changes

Acceptance gates: exact-head Node, browser + PR capacity, privacy/projection tests, **manual owner acceptance of the narrow storage semantics** and an unchanged running UI; merge and post-merge Tests/Publish all green. Real Safari UI qualification applies in P04B, not this non-UI persistence stage. **Do not mark P04 complete after P04A merge.**

## 7. Rollback, compatibility and future concerns

Before installing a reverted build, export an encrypted coach-workspace backup. The previous schema-4 app did not recognise `peopleReviews` and may silently omit this new ledger when re-saving a workspace; restoring the backup with the new app version restores the review records. Reverting P04A code alone is not guaranteed to preserve the new ledger through old-app edits. No team/player records require migration rollback.

A recorded link remains **advisory** and is not automatically removed when a source record is subsequently deleted; P04B must show a stale-reference warning before displaying/re-using it. Deleted/tombstoned records are not official records of personal identity. This standalone work cannot provide independent club or guardian login without a server and verified accounts.

**No Supabase or backend selection before P10.**
