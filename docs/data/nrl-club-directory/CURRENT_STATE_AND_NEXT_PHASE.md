# NRL research pilot: current implementation, residual risk and next phase

**Reviewed:** 26 October 2026. This archive preserves the research-only pilot's provenance and import schema. It is **not** a source of verified active club registrations or a code deployment.

## Implementation cross-check

| Capability | Current status / authoritative location |
| --- | --- |
| Historical pilot | 143 rugby league candidates, **0 registration-verified**; original ZIP/CSV/JSON/SQLite **not committed** in this public repository; see `PILOT_MANIFEST.json` |
| Published research-candidate catalogue | [PR39](https://github.com/pdomoney/team-manager/pull/39) merged; `site/club-directory-data.js` has **143 rugby league + 132 deduplicated Oztag entries = 275 research candidates**, not verified governing-body memberships |
| Read-only search and scope filters | `site/club-directory.js` and current **More → Clubs and teams → Find a club** interface |
| Explicit metadata adoption | `directoryClubDraft()` prepares a coach-reviewed local club draft; `site/club-link.js` supports owner-confirmed, non-overwriting link to an existing managed club |
| Data boundary | Coach-managed clubs remain `ws.clubs`; catalogue search/link grants **no** association admin, club admin, coach or volunteer permission |
| Regression baseline | `test/club-directory.test.js` and `test/browser/club_directory.py` test counts, distinctions, permissions and privacy; PR39+ main qualification is managed separately |
| Logos/branding | Generic sport icons only; no scraped crests, presumed official colours, or third-party logos imported |

## What merging PR38 means

It archives the **historic manifest, import template and provenance warnings**. It does **not** republish the historical raw pilot archive, verify its SHA-256, certify current registrations, approve upstream copyright/database reuse rights, or implement another directory feature. The absence of the raw archive from public GitHub is a **custody decision**, not a licence conclusion about already-deployed research-derived records.

The historic `PILOT_MANIFEST.json` documents an **asserted** ZIP checksum. The ZIP is not present in this PR, therefore **its checksum and member hashes could not be independently recomputed during this review**; recovery requires the controlled original and verification steps in `PRODUCTION_HANDOFF.md`.

## Next phase: source provenance, rights and verified coverage

**Goal:** improve the existing 275-record reference directory without changing the current encrypted workspace, adding new external records or claiming unverified affiliations. Work in separate PRs with owner review.

1. **Deterministic inventory** of the deployed research catalogue: per-sport and state counts, missing source URLs, stale review dates, duplicates/aliases, missing region/locality/official identifiers, and candidate-only status. Do not fetch personal records or silently alter public records.
2. **Rights audit:** identify upstream providers and source classes for each record. Record terms URL, access method, date, verified permission basis and owner decision; until resolved, treat republication permission as **unknown**, not granted. Explicitly evaluate any current deployed record whose data-origin rights cannot be substantiated.
3. **Authoritative registration confirmation:** reconcile records only against reliable governing-body/club-controlled sources. Keep `research_candidate` unless independently evidenced and reviewed. Distinguish current registration from historical match participation or third-party programme mentions; never infer MySideline IDs.
4. **Coverage review:** prioritise missing Tasmania sources and significant Queensland gaps (the historic NRL pilot contained only 14 QLD candidates). Quantify gaps separately from actual club totals and check cross-state name collisions.
5. **Non-destructive controlled updates:** source-linked validation with idempotent, dry-run plans; human confirmation for merges/conflicts; no automatic writes to `ws.clubs`, teams, permissions, player copies, or public data until a separately accepted PR.
6. **Confidence and governance:** define source freshness cadence, expiry/withdrawal workflow, brand-usage boundaries and explicit release checks, including production UI labels and real Safari acceptance.

**Acceptance:** Public research entries remain explicitly unverified; verified claims must have cited evidence, a review date and approved terms decision; unresolved or conflicted records receive a warning, not a silent fix. Preserve all existing managed club IDs, teams, styles and player privacy. The archive's presence is **not** a production dataset approval.

Related: [PR39](https://github.com/pdomoney/team-manager/pull/39), [P10 release qualification #52](https://github.com/pdomoney/team-manager/issues/52), [current research linking guide](../../club-research-linking.md).
