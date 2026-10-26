# Club directory D1 — read-only data inventory and rights-gate reporting

Issue [#99](https://github.com/pdomoney/team-manager/issues/99), Stage D1. Based on current Team Manager main after [PR96](https://github.com/pdomoney/team-manager/pull/96). Independent of unrelated Compact Home refinements ([PR98](https://github.com/pdomoney/team-manager/pull/98)).

## Why this exists

The historical 20 October 2026 [PR38](https://github.com/pdomoney/team-manager/pull/38) pilot has 143 rugby league candidates and **no independently confirmed current registrations**. Meanwhile, [PR39](https://github.com/pdomoney/team-manager/pull/39) already deployed a public, research-level 275-row catalogue: **143 rugby league candidates and 132 Oztag**. The historical raw ZIP was **not committed**, but that does not establish permissions to republish the separately derived public records. The next step is to **understand and govern the deployed records before adding or asserting anything**.

## Command and output

```bash
node scripts/audit-club-directory.mjs
node scripts/audit-club-directory.mjs --json
npm test
npm run test:browser
```

The audit is deterministic (explicit reference date 26 October 2026 for the baseline), offline, aggregate-only, with no network access or workspace inputs. It analyses the bundled read-only `CLUB_REFERENCE_RECORDS`, not coach `ws.clubs`. The JSON is safe to attach to a GitHub issue; it includes only counts, missing-field totals, warning codes and row **indices**, with no club names, direct source URLs, email/phone or personal contacts.

It shows candidate counts by sport/state/source class, missing region/association/locality/official contact data, invalid source URLs, duplicate IDs/same-state club-name collisions, bad/future source-review dates, suspect registration status and cross-state names that should not be conflated automatically.

**Critical distinction:** technical inventory PASS (zero malformed records) **does not mean source licensing or authoritative registration PASS**. The result has an explicitly blocked `releaseGate` until source terms and club registration evidence are reviewed. The existing 275 entries lack per-record `reusePermission: approved` and an independent reviewed `permissionEvidenceRef`; this gap is counted, not silently labelled approved.

No external URL is fetched. No registration sources are imported or trusted. No validation results are written back to current public records. No user/team/club data file, schema, encryption, account role or GitHub publication workflow is changed.

## Next two stages (not implemented here)

**D2 — rights and freshness:** review each source class and upstream terms; document legal reuse approvals, contact fields, source freshness, expiry and takedown behaviour. Unapproved data may need to be suppressed or replaced in a separately reviewed PR.

**D3 — verified coverage:** independent authoritative evidence for each club; reconcile missing Tasmania rugby league sources and narrow Queensland pilot coverage, same-name clubs across states, official IDs and controlled non-destructive source updates. No automated claims of active registration, permissions or branding.

## Acceptance

- Inventory technical regression passes at exact head; GitHub Actions Node + full Chromium green (browser unchanged by this PR).
- Verify expected public counts, unknown rights count and status "research_candidate"; privacy/forgery negative tests pass.
- Owner reviews and merges separately; main tests and Publish verified afterwards.
- **No** physical Safari browser claims, source approvals or data-rights clearance are inferred from these unit tests. Source/legal decisions require a later explicit owner review.
