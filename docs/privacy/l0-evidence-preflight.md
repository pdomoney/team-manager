# L0 privacy evidence readiness: source-only reconciliation

**SOURCE-ONLY / NOT AN APPROVAL.** Verified source baseline: Team Manager `main` `3bda0b212f6ae1faa1c172d35781e624369cb08b` following merged PR #262. The current public-safe policy register records **18/18 owner answers**, but **0/18 independently approved**. The player inventory has **11 proposed fields and zero approved for collection**. Existing first-team release qualification remains **L0–L6 0/7, live journeys 0/8**. No hosted identity provider, real personal data or runtime is approved.

This document explains `src/privacy-l0-evidence.js` and `scripts/check-privacy-l0-evidence.mjs`. It reconciles, without modifying:
- `config/privacy-decision-register.json`: 18 owner decisions and independent review state;
- `config/privacy-player-field-inventory.json`: 5 requested mandatory and 6 optional player-profile categories;
- `config/privacy-launch-readiness-plan.json`: one control and required independent evidence for every privacy decision;
- `config/first-team-cloud-release-evidence.json`: actual owner/backend and L0–L6/participant-journey evidence.

## Practical workflow

Use `node scripts/check-privacy-l0-evidence.mjs --assert-source-blocked` as a **positive test of the current HOLD**, not as production qualification. It returns exit code 0 **only when** all 18 responses remain recorded, no decisions or fields are independently approved, the existing source ledger is blocked and all live gates/8 journeys remain at zero. Without arguments it prints a structured report and returns code 1 because the policy is not ready. It rejects supplied filenames or private participant records.

Output contains *only* decision identifiers, field keys, short reason codes and gate/approval counts. It does not echo raw source inputs, names, phone numbers, private approval notes or security evidence. Each decision has a reason-coded list of missing independent policy and control review. Each player field is individually blocked until a separately authorised field/privacy review exists. It rejects missing, duplicate or mismatched 18 decision IDs, 18 mapped control IDs and 11 field keys rather than silently counting a partial register as complete.

A local `independentlyReviewedL0Candidate:true` in a future **synthetic fixture** would indicate that all metadata review fields are populated and can be submitted for independent human checking. It would **not** establish a valid signature, real reviewer authority, lawful collection, installed backend, security test or production release. The tool always returns `actualEvidenceVerified:false`, `productionProcessingAuthorised:false` and `productionReleaseAuthorised:false`. The original [first-team release evaluator](../operations/first-team-cloud-release.md) stays the authoritative protected release gate.

## Risk and owner decisions preserved

- Registered and independent review are **separate**: merging a PR or accepting terms does not approve legal obligations, junior data, guardian access or first-team launch.
- Team Manager's selected team/role behaviour, Coach/Player/Guardian interactions and the E5 play engine are unchanged. This block does not add a generic dashboard, registration screen, provider or storage.
- The owner's **optional guardian account activation** remains compatible with required identity/relationship/privacy evidence. The appointed **human team Manager** is still the proposed verifier for guardian requests.
- Volunteer WWCC identifier capture still requires a future private design and verified jurisdiction-specific clearance. A recorded number must never be interpreted as a verified clearance.
- Australia remains preferred but international processing is not pre-authorised; provider/contract/controller, processing fields, age-specific rights, backup retention and out-of-app incident report route still require review.

## Tests and next gate

`test/privacy-l0-evidence.test.js` verifies all 18/11/7/8 counts, positive and negative **synthetic** review pairs, proof-field mismatches, marketing and public-visibility denial, duplicate/omitted entry detection, malformed records and CLI exit behaviour. These tests do not contact any private user, organisation or server.

**Next meaningful owner action after source CI passes:** review the L0 report and make the *separately evidenced* provider, legal-controller, field-minimisation, guardian/WWCC and independent reviewer decisions. Do not mutate the blocked launch ledger or mark policy approved before genuine evidence and explicit operator authorisation.
