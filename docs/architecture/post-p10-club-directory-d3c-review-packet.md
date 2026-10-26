# Post-P10 Directory D3C: exact-candidate review packets

**Programme:** https://github.com/pdomoney/team-manager/issues/99
**Baseline:** merged PR103, main commit 24812d29bf42f8dda08540aa977d0967e6c4a23b.

D3C is a safe reviewer handoff, NOT an actual club registration check, source licence clearance, data change, or access permission. All 275 current public records remain unverified research candidates and all 13 source hosts still require independent review.

## Procedure

1. List queued candidates: node scripts/review-club-candidates.mjs --state ACT --sport "Rugby league" --json
2. Prepare one exact-ID packet: node scripts/prepare-directory-review.mjs --id rlc_c4d2672383f09c --json
3. Independently inspect the original citation in site/club-directory-data.js. Determine current reuse terms, permitted fields, attribution, expiries and withdrawal requirements. A public website is not a licence to bulk republish.
4. Independently confirm current association or club identity against authoritative sources, not historic competition names. Distinguish club, venue and Oztag location. Resolve same-name and state/sport conflicts.
5. After obtaining REAL human source-rights decisions, prepare a sanitised D3A proposal separately. Never copy the blank generated template as if it were reviewed. To dry-run a JSON array of proposals: node scripts/plan-directory-verification.mjs --stdin (with JSON redirected via stdin). Passing syntax only produces awaiting_independent_owner_decision, not a publish entitlement.
6. A later per-record data PR must provide source scope, approved field-level diff, owner acceptance, tests, and real Safari review before any existing catalogue fields are changed. Do not touch managed clubs, team/role data, private persons or encrypted backups.

## Guards

- The CLI accepts only one exact public directory ID and optional --json; no arbitrary file path, network URL, tokens or data-branch access.
- The packet omits original source URLs, phone and email fields, registration links, private person data and branding. Reviewer evidence remains outside the repository unless specifically approved and sanitised.
- Every packet has five explicit not_reviewed human gates and a blank evidence template which must fail the real D3A validator.
- No synthetic rights metadata, URL or evidenceRef may automatically certify registration, create club access, or clear publication.
- Research coverage gaps such as TAS and limited Queensland sampling are not actual counts of real clubs.

## Validation and rollback

Run npm test, npm run test:browser (including capacity) and npm run build at the exact PR head, then post-merge main Tests and Publish after owner approval. Safari acceptance is manual and independent of Chromium CI. Revert only these new pure module, CLI, test and document files. No data schema or private content is modified.

Issue #99 stays open at 67% overall (D1 + D2 done; D3 remains incomplete) until independent rights, current club verification and controlled data correction have been accepted.