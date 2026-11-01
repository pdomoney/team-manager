# P13C — Executable security acceptance contract (offline harness only)

**Status: CANDIDATE, NOT ACCEPTED AS REAL BACKEND SECURITY.** Based on [PR134](https://github.com/pdomoney/team-manager/pull/134) merged `main` `3c9d401ed30d03c3a8c97155bfc4ec29765ef249` on 1 November 2026.

Related: [P13B 60-scenario source](p13b-provider-neutral-security-test-contract-20261101.md), [P13A provider scorecard](p13a-backend-provider-security-scorecard-20261101.md), [#55 real identity implementation approval gate](https://github.com/pdomoney/team-manager/issues/55).

## Purpose

Turn the previously accepted **60 security requirements** into a stable, machine-readable, reviewable contract suitable for future *approved* backend adapters. Test the **harness** now without creating a vendor account, a live account, hosted datastore, service, paid subscription, API key or real child/player data.

The only application artifacts in this PR are under `test/` and `docs/`. There is **no change to `site/`, `src/`, GitHub Pages routing, login/auth, encrypted team storage, publishing, role selector, current players or club data**.

## Files

- `test/fixtures/p13b-security-vectors.json`: exact ordered IDs `ID-001` .. `ID-060` extracted from the approved [P13B source](p13b-provider-neutral-security-test-contract-20261101.md). Includes original human attempt wording, expected text, outcome, audit flag, runtime classification and `UNTESTED` state. It explicitly says `NO_BACKEND`.
- `test/support/p13b-contract-harness.js`: Node-only future adapter interface with strict evidence validation and mock isolation.
- `test/p13b-contract-harness.test.js`: enforces source↔manifest agreement, sequential IDs, 60 required cases, negative/positive result classifications, privacy data-leak counters, audits, approval safety, replay/race properties, manual historical-blob risk and fail-on-cleanup. Uses **invented mock evidence solely to test the test harness**, not to establish security.
- This document describes integration requirements and independent review.

### Outcome matrix

| Expected outcome | Count | Future source of truth |
| --- | ---: | --- |
| `DENY` | 47 | Actual API and DB denial, no forbidden records, fields, grants or writes; no existence leakage |
| `ALLOW-LIMITED` | 8 | Exact authenticated scope, permitted projection and zero foreign fields/records |
| `REVIEW` | 2 | Awaiting independent approval; never automatic production grant or match eligibility |
| `ATOMIC-ONE` | 1 | Transaction race permits one legitimate transition without duplicate grants |
| `ONE-TIME` | 1 | Single-use invitation, valid redemption once, zero replay success |
| `MANUAL-RISK` | 1 | Historic GitHub encrypted blobs cannot be retroactively revoked; separate owner risk decision |
| **Total** | **60** | **All UNTESTED against real server** |

### How it will be used after explicit authorisation

A future isolated provider-specific adapter implementing:

```js
const adapter = {
  environment: {
    kind: 'isolated-server',
    provider: '<chosen provider>',
    project: '<isolated test project reference>',
    region: '<confirmed region>',
    commit: '<exact deployment code commit>'
  },
  async prepare(vector) {
    // Reset only fake accounts, synthetic clubs and exact grants for scenario.
  },
  async execute(vector) {
    // Make real authenticated API/DB requests, inspect actual status,
    // field projection, writes, audit and race/replay effects, and return
    // measured structured evidence. NEVER use expected value as the result.
  },
  async cleanup(vector) {
    // Delete isolated synthetic fixtures and verify no test residue.
  }
};
const report = await runP13Contract(adapter, manifest, {requireServer: true});
```

**Do not mistake this example for working backend code.** No adapter exists or is connected in this PR.

Actual server evidence must include trust boundary and request/response provenance, exercise unauthenticated and authenticated principals, policy enforcement under real HTTP/DB requests, cross-tenant and child/guardian negative cases, protected media/downloads, revoked cached sessions and atomic concurrent writes. A vendor-specific adapter must never satisfy the contract by returning the desired expected outcome without performing the real operation.

The harness will refuse default execution without an adapter. Mock executions require explicit `{requireServer:false}`; their report **always** sets `serverEvidenceQualified:false` and `securityAccepted:false`. Even if all 59 automated checks eventually pass on an isolated server, security and privacy sign-off, ID-060 historical-data risk acceptance, physical Safari/VoiceOver review and provider selection are still **separate** required gates.

## Review and quality gates

- [ ] Node unit tests pass with all P13C manifest/self-test regressions.
- [ ] Full Chromium browser suite passes for untouched app.
- [ ] Owner reviews that all 60 P13B cases are preserved, explicitly `UNTESTED` for real backend, and that no changes to real player/guardian records or privacy rules occurred.
- [ ] Owner alone merges after accepted PR-head tests; exact-main post-merge Tests and Publish reviewed.
- [ ] Real backend authorization, provider billing, Australian regional/subprocessor handling and data migration remain unapproved in #55.

### Next technical milestones, subject to approval

1. Obtain owner decision on provider, cost and Australian processing plus guardian/sensitive-data scope from P13A D1–D7.
2. Create **separate** provider-specific *isolated, fabricated-data-only* adapter PR and actual environment, with provider contracts and credentials managed securely.
3. Only call an operation server-enforced after the adapter and independent evidence both verify its denial/allow behavior. **No amount of mock harness testing proves production access control.**
4. After authorisation, proceed to real account linking, invites and revocation, then controlled data migration and physical device/security release testing.
