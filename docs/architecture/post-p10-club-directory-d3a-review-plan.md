# Post-P10 Directory D3A — Evidence-led club identity & coverage review (dry run only)

**Owner programme:** [Directory source provenance and verified coverage #99](https://github.com/pdomoney/team-manager/issues/99). Builds from last verified `main` containing [D1 PR100](https://github.com/pdomoney/team-manager/pull/100); D2 source-rights [PR101](https://github.com/pdomoney/team-manager/pull/101) remained **open/unmerged** when this D3A branch was created. These two workstreams are deliberately independent. Reconcile D3A with updated main after D2 merges and rerun exact-head/main tests.

## Why

The public static catalogue is **275 unverified research candidates** (143 Rugby league, 132 Oztag), not a list of current club registrations. The older NRL pilot's **TAS=0**, **QLD=14** figures describe research coverage gaps, not the number of real clubs. D2 host-level rights triage cannot grant permission to reproduce directories or confirm a club's governing-body membership.

This stage creates only a **deterministic evidence-review plan** that can be used by an authorised reviewer before any future corrective data PR. It **does not verify a single club** or modify any web content.

## Operator commands

```bash
node scripts/plan-directory-verification.mjs

# Optional: separately prepared, sanitised array of club review proposals;
# never private participant records or unpublished contracts.
node scripts/plan-directory-verification.mjs --stdin < /private-safe-path/d3a-review-proposals.json

npm test
npm run test:browser
```

The default prints a compact JSON summary of eight jurisdictions with actual research-*candidate* counts. `--stdin` evaluates a JSON array of proposed reviews, without saving anything. It accepts **no pathname arguments** and never fetches a website or accesses the coach workspace. Output omits raw evidence URLs, reviewer name, proposed contacts and source texts, retaining only candidate ID, state/sport, proposed field **names**, reason codes and review state.

### Sanitised input schema (example is entirely fictional)

```json
[
  {
    "directoryId": "fictional-existing-candidate-id",
    "sport": "Rugby league",
    "state": "NSW",
    "sourceKind": "governing_body_club_directory",
    "evidenceUrl": "https://governing.example.org/clubs/fictional",
    "evidenceRef": "evidence-ref:fictional-review-no-proof",
    "rightsDecisionRef": "evidence-ref:fictional-review-no-consent",
    "reviewer": "Example Reviewer",
    "reviewedAt": "2026-10-26",
    "officialClubId": "FICTIONAL-CLUB-1",
    "proposedFields": {
      "suburb": "Example suburb"
    }
  }
]
```

The `directoryId` must exactly match an entry **in the current reference catalogue**. The example above will be **blocked** unless that ID exists. If it does exist and all required fields pass syntactic validation, it still only reaches `awaiting_independent_owner_decision`. References are **not checked for truth** by an offline parser; an authorised reviewer must validate the governing-body source, actual current affiliation, precise reuse permission for each field, identity conflicts and approval. No `verified` state can be entered as a direct proposal; doing so fails.

## Mandatory protections

- Never change existing `ws.clubs`, teams, role memberships, branding, officials, players, publications, encrypted backups or owner permissions.
- No automatic catalogue updates, source fetches, guessed MySideline club IDs, third-party logos, or unsupported affiliation assertions.
- Preserve different clubs with the same name across jurisdictions. Block same-sport/state collisions, duplicate directory IDs, forged player/role fields, direct `verified` assertions and attempted publish/grant flags.
- Reject missing/old/future review evidence. The default staleness bound is 180 days from the fixed reference date and may need adjustment when actually implemented.
- Source rights clearance is still **unresolved for the live published catalogue**; neither a plausible `rightsDecisionRef` nor D2 tooling constitutes approval.
- This PR's scope cannot finish D3 overall: real authoritative evidence gathering, explicit human source-rights decisions, controlled data correction proposals and macOS Safari review remain future gates.

## Review and release

Run exact PR-head Node + full Chromium including capacity, then owner reviews/merges separately. Follow with merged-main Tests + Publish checks. If D2 merged in the meantime, reconcile main before accepting D3A and run all relevant regressions again. A passing D3A audit means the **review planner is functioning**, not that any club or reuse rights have been verified.

Rollback is isolated: remove its pure module, CLI, Node tests and this document. No data/schema migration needed.
