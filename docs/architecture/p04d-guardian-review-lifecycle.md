# P04D — Reported guardian/carer relationship review (coach-only)

**Phase:** [P04 #46](https://github.com/pdomoney/team-manager/issues/46)  
**Accepted baseline:** P04C [PR #61](https://github.com/pdomoney/team-manager/pull/61) merged to main at `2c1322e0b5a347077c0f3fa211700ffe1f28e08b`.  
**Status:** Draft for owner review, **not full P04 acceptance**.

## Objective

The coach needs to identify, review, correct and reverse reported adult/helper relationships to individual junior player records, including **multiple children and teams in one trusted coach workspace**. Existing helper `playerId` values are *suggestions only*, not legal evidence. The system must prevent accidental grant of personal data access.

A coach opens **More → People → Reported guardian and carer relationships**, chooses an existing *Helper* record and a specific *Player* record and one limited category:

- Parent (**reported, not verified**)
- Relative (**reported, not verified**)
- Other carer (**reported, not verified**)
- Relationship not confirmed

The submission requires a second explicit confirmation. No relationship is inferred or auto-approved from name, email, phone or the legacy helper/player link.

## Encrypted data and privacy

An optional schema-4 root `guardianReviews` is held **inside the existing encrypted coach workspace only**, separate from `peopleReviews` and never inserted into the team/player projection or legacy export. No schema bump, no new data service, no app routes, no new sharing of personal data.

Each record has a **canonical namespace-qualified pair** of source IDs (helper, child player), the two original local person keys and a bounded, ordered event chain:

- `record` (explicit reported category)
- `correct` (new category, retaining the prior event)
- `reverse` (terminal tombstone, cannot silently reactivate)

Only these fixed fields can survive normalisation. In particular, `verifiedIdentity`, `guardianAuthorityVerified`, consent, access grants, role claims, personal contact details or authentication claims are **not persisted or recognised** by this record type. A relationship is never represented as a verified legal parent/guardian.

The idempotence and conflict contract follows P04A: same pair cannot be added twice even when reversed; two different pairs merge independently; concurrent corrections or reversals on the same pair are presented by the existing GitHub three-way merge prompt. A missing/changed source is prominently flagged; it may be reversed but **not corrected until reconciled**.

The coach can attach the same adult/helper to separate children in separate **teams within that unlocked workspace**. This does not share identities, guardians, minors or information across independent GitHub repositories/tenants.

## Existing-app UX

The People page provides:

- An opt-in relation form requiring a helper, player and reported relationship.
- Readable reported/reversed/stale states, record and correction count, and Correct/Reverse actions.
- Coach confirmation for each operation, and a distinct correction sheet.
- "No legal verification, consent, account or child access" warnings at point of use.
- The existing `save()` and encrypted local draft/publishing workflow; no changes to GitHub Pages or publishing token behaviour.
- Existing separate guardian-candidate hints remain hints and never auto-convert into records.

## Unresolved future security

This is a **data and workflow model**, not a production authorisation implementation. The shared coach password cannot identify each reviewer independently and cannot prove custody, court orders, consent, eligibility or delegation. It does **not** enable a real guardian login, child portal, cross-club account or safeguarding access policy. Genuine legal authority documentation, verified permission grants and server-enforced organisation / child scoping are deferred to the separately approved **post-P10** architecture [#55](https://github.com/pdomoney/team-manager/issues/55).

Post-P10 persona switcher [#62](https://github.com/pdomoney/team-manager/issues/62) is also **out of scope**.

## Qualification checklist

- [ ] Exact-head Node tests: old schema-4 migration, two children in different clubs, correction/reversal, stale/duplicate sources, forged authority field rejection, no child/jersey/volunteer history changes, encrypted backup/player non-leakage and multi-device merge conflicts.
- [ ] Exact-head Playwright: coach-only form, two synthetic child sources, explicit confirmations, correction, reversal, mobile viewport, legacy export and player preview.
- [ ] Existing whole-app regression and capacity remain green; no bypass of read-only historical-season rules for actual team editing.
- [ ] Owner manually reviews macOS/iOS Safari flows and guardian language, multi-team source disambiguation and correction usability.
- [ ] Product owner explicitly approves **exact PR head** before merge; post-merge main Tests and Publish must pass.

**P04 phase #46 remains open** until final owner acceptance and evidence recording. Never start P05 based on this draft or a green CI alone.

## Backup / rollback

Export an **encrypted coach backup** before introducing relationships. The new `guardianReviews` array is additive in schema 4 and never alters player IDs, helper `playerId`, team/season staff IDs, membership, historical attendance, jersey allocations, match-day compliance or club branding. Reverting to a build predating P04D and saving may drop this root field. Restore an encrypted backup using the compatible accepted build when recovering history. Simultaneous changes require explicit three-way review; do not use last-write-wins or reverse events to silently change another coach's history.
