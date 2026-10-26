# D3B — Priority verification queue for the already-published club directory

**Workstream:** [#99](https://github.com/pdomoney/team-manager/issues/99), based on merged [D3A PR102](https://github.com/pdomoney/team-manager/pull/102) at `45b110a9e47c80469bfea282f71db33419eb2985`. The static catalogue remains **275 unverified research candidates**, with **0 registrations independently confirmed by this system**. The prior D2 register lists 13 source-host groups without documented re-use permission. Do not conflate a club name's presence on a public site with authorised republication, current membership or account access.

## Purpose

D3A introduced a dry-run validator for individual candidate evidence proposals. D3B connects D1/D2/D3A into a **safe, actionable reviewer queue** without modifying or publishing data. Each queue row contains only information **already present in the public research directory**: candidate ID, name, sport, state, source host, source class, priority and required review steps; not emails, phone numbers, registration links, medical/guardian fields, passwords, licences or submitted evidence values.

Queue priorities are **review order, not confidence scores or allegations of infringement**:
- `integrity_review`: malformed source/identity/status record requires immediate manual triage
- `priority_source_review`: historical location, inferred competition team, third-party listing or research lead (and any compound source-URL value) should be investigated before relying on it
- `standard_source_review`: other sources still require actual terms, current affiliation and reviewer sign-off

All statuses remain `candidate_unverified`. Even a syntactically `approved` D2 host rights record is labelled a claim requiring independent human verification. A queue may **never** mark registrations verified, licence data, assign roles, import contacts, change club branding or update a user's encrypted workspace.

## Operator usage

```bash
node scripts/review-club-candidates.mjs
node scripts/review-club-candidates.mjs --sport "Rugby league" --state QLD --limit 50
node scripts/review-club-candidates.mjs --sport Oztag --state NSW --limit 25 --json
```

Default is 20 rows; maximum is 100 per invocation to avoid dumping the whole catalogue or leaking source/contact data. Inputs are **only** optional exact sport/state filter, count and `--json` (no arbitrary path or URL). It reads the already-bundled public directory and read-only D2 JSON, and performs **no network access or writes**. The report includes counts for **all** eight states, with TAS=0 rugby league research candidates and Queensland's 14 rugby league candidates correctly described as **coverage of this research sample, not real club totals**.

The review handoff follows these gates:
1. Triage the source host's applicable terms and document permitted public fields; obtain rights approval or counsel's decision in a separate controlled process. **The 13 hosts / 275 candidates remain unresolved at implementation time.**
2. Use a current official governing-body or club-controlled source to confirm the club/venue distinction and current registration/affiliation. Do not infer IDs from competition listings, historical match fixtures or names alone.
3. Resolve clashes between same-named candidates, states, teams and existing coach-managed clubs without changing a managed club ID, rights or records.
4. Submit a **sanitised independent D3A review proposal** via `scripts/plan-directory-verification.mjs --stdin`. A syntactically valid proposal is only `awaiting_independent_owner_decision`, not publication-ready or licence-approved.
5. Only after actual human evidence review and separately approved per-record data diff may a subsequent PR propose an authoritative status/field change. Never auto-merge or silently rewrite the existing public catalogue.

## Acceptance, release and rollback

- Run `npm test` and `npm run test:browser` at exact PR head (including capacity). Node tests check source-class prioritisation, 275 count, 13 sources, 14 QLD league research candidates, TAS research gap, bounded query safety, no mutation, no roles and no rights/registration promotion.
- The existing Chromium suite must remain green. No new public-facing page or browser UI is introduced in D3B; the operator uses an offline CLI while verification and rights decisions remain unresolved.
- Following owner merge, check main Tests and Publish again. Real macOS Safari tests, official-source confirmation and rights decisions are **not** covered by Chromium or a successful CLI.
- D3B is preparatory tooling within D3. Issue #99 must remain **open** until actual source approval and independently evidenced official club verification/controlled updates are completed. Report programme completion as **2/3 = 67%** until that milestone.
- Rollback: revert only the D3B pure module, CLI, tests and document. No schema, raw data, encrypted files, GitHub workflows, Pages assets or role grants changed.
