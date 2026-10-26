# Team Manager — authoritative development baseline (26 October 2026)

> This is a repository and GitHub Actions review handoff, not a stable-production release certification. Revalidate the main SHA and live PR state before making further code changes.

## Exact code baseline and evidence

- **Repository:** https://github.com/pdomoney/team-manager; default branch `main`; GitHub Pages app at https://pdomoney.github.io/team-manager/.
- **Last verified merged `main`:** `21559a663a3d4e93e788bd2e34dc134b7b03ea28` (merged PR #117, non-Oztag fixture-season RSVP scoping). The main-commit run https://github.com/pdomoney/team-manager/actions/runs/40295459626 passed **542/542 Node** and **1,817/1,817 Chromium checks in 52/52 suites**. Publish completed at https://github.com/pdomoney/team-manager/actions/runs/40296651820 .
- **Current pending implementation:** PR #118 (P11K exact-player venue check-in) head `e3224e0e9af3917af5a6ef7041d102ba0d4c97c8`, READY FOR OWNER REVIEW, NOT MERGED at handoff. Exact-head Tests https://github.com/pdomoney/team-manager/actions/runs/40297477173 passed **546/546 Node** and **1,871/1,871 Chromium in 54/54 suites**, including synthetic photo capacity.
- The test evidence is synthetic Chromium, not physical Safari, backend security, account separation, third-party rules approval or a genuine GitHub data-branch end-to-end acceptance.
- Repository tree on verified main: **300 tracked files**, comprising **65 site files**, **76 Node test files**, **53 browser test suites**, **76 docs files** and **four GitHub Actions workflows**. The pending PR #118 adds a browser suite and Node test file.

## Product and storage architecture

- No npm runtime dependencies; native browser JavaScript modules (ESM) and CSS, Node >=20 for build/tests (CI uses Node 22), Python Playwright Chromium for browser regression.
- `site/index.html`, `site/app.js` (primary application controller and UI; ~8,960 lines), `site/model.js` (canonical team/season/competition model), modular `site/*.js` domain helpers and `site/styles.css`. `src/build.js` copies/stamps the static app and only allows role-compatible encrypted data-file names.
- Coach edits are kept locally; live mode stores encrypted coach and per-team player copies in GitHub's `data` branch and dispatches `.github/workflows/publish.yml` to GitHub Pages. `site/github.js` handles data-branch compare-and-commit and workflow dispatch; `site/vault.js` implements AES-256-GCM with PBKDF2-SHA256 (600,000 iterations). These are confidentiality mechanisms, **not** server-enforced person/club/association tenant permissions.
- The production auth model still has a **shared coach password** and **team passwords**, with no independently authenticated individual owner/association administrator/club administrator/coach accounts. `site/role-model.js` is an intentionally non-authoritative policy simulator. Persona previews are for isolated fictional QA only.
- Preserve existing IDs and seasonal/jersey history, shared-person references, public-player privacy projections, prior encrypted backups, data-branch reconciliation and accepted Oztag Match Day controls. Do not silently change storage schema or publish external club identity claims.

## Functional map

- **Home:** compact/standard density, organisation/team filtering and coach attention/next-event cards.
- **Clubs and teams:** local multi-club workspace, team-specific sport overrides, club branding, directory reference and explicit link/copy decisions.
- **People, squad and seasons:** sport-specific positions, player photo crop, cross-team player references, jersey issue/return history, season membership and historical corrections.
- **Schedule/competitions:** fixtures, practice, RSVPs, volunteer roles, official-source references, attendance, results and season-linked competition entries.
- **Match Day and tactics:** specialised Oztag lineups/scoring remain; non-Oztag P11 work exposes evidence and coach review rather than inventing sport/age/category scoring and bench policies.
- **Reports, rules and publishing:** coach-only reports, rule sets/by-laws and source watching, synthetic persona guides, encrypted backup/restore, GitHub Pages publication and multi-device conflict review.

## Programme and open issue gates

| Workstream | Verified state as of handoff | Remaining gate |
| --- | --- | --- |
| [#41 P00–P10 roadmap](https://github.com/pdomoney/team-manager/issues/41) | **11/11 phases, 100% administratively accepted**; P10 #52 closed | Real Safari/mobile, device recovery and authenticated publishing evidence retained as explicit release exceptions; **no stable release sign-off inferred** |
| [#31 P11 Match Day](https://github.com/pdomoney/team-manager/issues/31) | **1/5 milestones = 20%**; M1 complete, M2 source review and M4 roster work underway; PR #118 pending | Competition-specific authoritative rules and owner selection, sport scoring migrations, field/bench/period controls, physical Safari and release acceptance |
| [#99 Club directory D1–D3](https://github.com/pdomoney/team-manager/issues/99) | **2/3 stages = 67%**; D3A–D3D offline evidence aids completed | Independent source rights/identity determinations, explicitly authorised per-record data changes, real-device acceptance |
| [#62 QA-only persona](https://github.com/pdomoney/team-manager/issues/62) | **2/3 delivery gates = 67%**; synthetic header preview and guided journeys merged | Explicit physical Safari owner acceptance, without confusing synthetic personas with real access grants |
| [#55 backend/multi-tenancy](https://github.com/pdomoney/team-manager/issues/55) | Deferred, NOT authorised | Owner decision on backend/hosting/privacy before any identity, server authorization or migration |
| [#35 individual roles and #34 role-aware selector](https://github.com/pdomoney/team-manager/issues/35) | Requirements open | Real per-person grants, cross-tenant negative security tests and appropriately scoped navigation after backend approval |

## PR #118 boundary reviewed

- The proposed `site/matchday-arrival-gate.js` inspects exact match-season roster context, active season, `scheduled` status, local browser fixture date and non-Oztag sport before allowing an arrival update. An action verifies original match/team/season/date and exact player ID again before changing the existing `match.arrived` map.
- Historical non-Oztag records remain visible without editing; orphan fixture seasons fail closed. The action does not create new scoring, lineup, registration, medical fitness or eligibility assertions, nor change Oztag controls.
- **Important limitation:** `todayISO()` is the **device's local calendar**, not a server-trusted timestamp, and the shared coach credential is not an individual identity. This is suitable only as the existing single-workspace operator flow, not an authoritative venue access log.
- Owner review: verify Record arrived, Undo check-in, historical record read-only, Oztag unchanged, and 390px iPhone/macOS Safari manually; then explicit merge decision. After merge, verify merged `main` Tests and Publish against exact SHA before advancing P11.

## Engineering and release risks

1. **Security architecture:** no cross-tenant server enforcement; do not enable independent club/association accounts or volunteer self-service as a production feature.
2. **Unverified real-device paths:** Chromium CI is comprehensive but does not certify Safari, VoiceOver, real storage capacity, real GitHub encrypted publish/recovery or a clean version/tag release.
3. **Rules/rights provenance:** the public club catalogue has 275 research candidates, not 275 verified active clubs. No authoritative source reuse rights were approved in #99. P11 competition-specific rules remain under source/owner review.
4. **Controller concentration:** `site/app.js` is large, with broad UI and save-side effects. Continue extracting small pure helpers behind regression tests, rather than replacing the app or changing persistence semantics wholesale.
5. **Documentation drift:** older README and release-record text incorrectly labelled a 19 October PR15 snapshot as the current baseline. That record is historical; this document contains the newer source-of-truth handoff.

## Next safe development sequence

1. Obtain PR #118 owner's Safari/function acceptance, then merge and verify post-merge Tests and Publish. Keep #31 M4 incomplete.
2. Progress P11 in small PRs that **do not** assume unapproved sport field/bench/interchange or scoring policy. Treat exact sourced competition/age/category rule selection as an independent gate.
3. Continue #99 D3 only with independent human rights and identity review before any change to the public directory; retain candidate designations otherwise.
4. Close #62's remaining physical Safari owner-acceptance gate when actually performed, while keeping real backend role permissions deferred to #55.
5. Update issue progress bars **only** when their defined acceptance milestones close. Never replace an evidence gate with a green CI badge.

## Method and limits of this handoff

Inspected repository metadata, complete recursive source tree, project README, build/encryption/GitHub/role source modules, application/model Match Day implementation, PR #118 complete file patches, workflow definitions and execution logs, issues #31/#41/#52/#55/#62/#99/#34/#35, and release/operational documentation. GitHub connector reviews and preserved CI evidence were available; direct local Git clone and independent Safari execution were not possible in this environment. This is a **broad architectural and targeted code review**, not an assertion that every line in all 300 files was independently executed or audited. Preserve these limits in release decisions.
