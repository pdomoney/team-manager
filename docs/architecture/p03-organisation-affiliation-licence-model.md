# P03 — Organisation, affiliation and licence scenario model

**Status:** Initial **draft for review and testing**, not accepted or merged.  
**Tracks:** [P03 Issue #45](https://github.com/pdomoney/team-manager/issues/45), [master roadmap #41](https://github.com/pdomoney/team-manager/issues/41).  
**Baseline:** P02 merge to `main`, commit `43d7c467acbed115f40692c11bfeef71710537f3`.  
**Platform:** Keep current GitHub Pages site, encrypted coach data branch, schema-4 team roots, and shared coach/team passwords until after P10. Separate backend/security work is [post-P10 #55](https://github.com/pdomoney/team-manager/issues/55).

## 1. Existing application versus proposed relationship model

| Concept | Current application | P03 proposal and boundaries |
| --- | --- | --- |
| Club record | `ws.clubs[]` in one trusted coach workspace | Preserve ID, sport, logo, colours, approved palette, research provenance and team links. No new independent club tenant. |
| Team club membership | `team.team.clubId` for root team and `ws.teams[]` | Create safe *read-only* per-club index and list unresolved references. Never relabel orphan teams or change clubs silently. |
| League/association | Currently not an independent account or data owner | Define association organisation candidate and proposed club affiliation; **no** official verification inferred. |
| Official club research | PR #39/#40 public reference directory, explicit user-confirmed reconciliation | The club reference link remains research provenance, not proof of legal affiliation, active registration or permission. |
| Purchaser/licence | No commercial product entitlements or billing | Model individual/club/association **fictional purchase scenarios** with configurable modules/caps. No prices, charging, purchases or access grants. |
| Permission | P02 unwired role definitions; current shared coach-password workspace | Affiliation/licence proposal **never** creates access grants. Real cross-tenant permissions deferred to #55. |
| Personal coach library | `ws.library` inside coach workspace | Preserve it untouched: a club/association licence model never takes ownership of personal plays. |

## 2. Code and change boundaries

- [site/organisation-model.js](../../site/organisation-model.js) is **not imported by the running application**. Its functions build immutable-by-convention local/provisional objects, review proposals, scenario feature/capacity previews, safe in-workspace club/team reference summaries, and aggregated fictional association counts.
- [test/organisation-model.test.js](../../test/organisation-model.test.js) tests all four requested ownership use cases, independent club namespaces, mutual review, revoked proposals, no implied admin rights, no unsanctioned private fields and no real subscription authorisation.
- No source data is saved or sent. No new `site/app.js`, `site/model.js`, `site/vault.js`, `site/github.js`, `src/build.js` or `data` branch changes.
- All club palette/style metadata uses the **existing validated colour/palette function**; no automatic club brand replacement or third-party logo retrieval. The model's `hasLogo` is informational and the full image remains in the accepted workspace.
- The `describeManagedOrganisations` output contains **only** managed club references, validated display branding, team identifiers/names/sports/archival state and unresolved team IDs. It excludes player records, coach-only notes, club executive contact records, WWCC evidence and coaching library content. It is still a **private workspace preview**, not a public API.
- Aggregated association preview accepts **only** `clubId` and `teamCount`, and only for fictional `reviewed` affiliation candidates; this does **not** establish legitimacy or privacy-safety for real aggregates.

## 3. Affiliation lifecycle: carefully distinguished states

1. A local association and club are identified by their exact IDs and origin workspace namespace. A public directory candidate **does not** supply these rights.
2. An affiliation proposal is created with `status: proposed`. It contains no access grants, no verified official link, no data sharing and no independent association/club sign-in.
3. Fictional parties `association` and `club` can register *local proposed approval*. Until both review, state remains `proposed`.
4. When both have reviewed the proposal, state is `reviewed` — **not officially verified, not secure membership and not an authorisation token**.
5. Declining or ending a proposal stays local. Future verified invitation workflows, signer identity, two-party consent/audit and real revocation are deferred to #55.

A malicious caller can fabricate a `reviewed` proposal: P03 **never** treats it as an authentication or database permission. Future production implementation must independently verify both parties and enforce deny-by-default resource access.

## 4. Licence scenario design

The prototype declares three categories: `individual` linked to a personal-owner scope, `club` linked to a club purchaser, and `association` linked to an association purchaser. These are **data model scenarios**, not marketed or purchased plans. `modules` and `limits` are provided explicitly by the test/user — P03 invents no commercial plan prices, seat counts or included modules.

`previewLicenceFeature` reports illustrative feature availability as `{simulated: true, wouldOffer: bool}` rather than `allowed`. It does not gate UI, authentication or source data export. A full subscription lifecycle must not automatically grant access to private member records or prevent lawful backup/data retrieval.

| Scenario | Fictional scope example | P03 simulation only |
| --- | --- | --- |
| Association pays for affiliated clubs | Association A, club A and club B proposed/reviewed | Manage proposed affiliates, count only safe synthetic aggregates; no browsing clubs' private records |
| Club pays for all teams | Club A with multiple Rugby League / League Tag teams | Preserve exact club/team links and matching sport context; no independent club admin login |
| Independent coach | Coach's personal workspace with multiple sports | Existing coach team switching and private tactics remain intact |
| Person coaches/manages across clubs | One P02 conceptual Person with two independent potential team appointments | Roles are still separately scoped and simulated; no individual identity login/cross-tenant access |

## 5. Safety and acceptance requirements

- [ ] New P03 tests pass alongside every existing Node test on exact PR head.
- [ ] Full Chromium/browser suite including PR synthetic capacity passes; evidence retained.
- [ ] `site/app.js`, encrypted publishing, accepted player-only projection and original model stay byte-for-byte unchanged in this PR.
- [ ] Team-to-club mapping exact, archived team context respected, bad/missing IDs preserved for review and no name-based club merge.
- [ ] Same club ID in two different private coach workspaces never implies a shared data owner.
- [ ] No private people/notes/accreditation/WWCC/coaching-content leakage through a reference preview or summary.
- [ ] P03 does not authorise official affiliation, commercial licensing, production data access or Supabase.
- [ ] Owner reviews model, flags any real-world assumptions, accepts PR; then merge and confirm post-merge main CI.
- [ ] Update P03 issue #45 and master #41 only after accepted merge and passing evidence.

## 6. Rollback and follow-up

As P03 only adds unused pure helper code, regression tests and this note, rollback consists of reverting these files; no data or migrations need restoring. P04 will unify Person and guardian records in the **existing encrypted coach workspace**, still without new individual login. P10 concludes the current-app improvements; #55 is a separate, owner-approved future workstream for real backend accounts, subscriptions and tenant isolation.

**P03 is not complete merely because its first draft PR exists.**
