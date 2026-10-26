# P04 — Local people reconciliation and guardian review foundation

**Status:** Draft foundation PR for [P04 #46](https://github.com/pdomoney/team-manager/issues/46), not accepted or merged.  
**Base:** Accepted P03 merge `c071ef3187a1fe81e67b90a2eb4847730f95d4a5`.  
**Platform decision:** GitHub Pages, encrypted coach workspace and schema-4 persistence through P10; actual individual identity, independent club/association access and production guardian self-service deferred to [post-P10 #55](https://github.com/pdomoney/team-manager/issues/55).

## Why this exists

The accepted model stores the same person's information in different shapes: team players, team helpers, match staff in the workspace, club officials, team staff and historical season staff. Presenting duplicate names as a single identity would incorrectly connect records and could disclose junior, health or private contact information between contexts.

### Scope of this candidate

[site/people-index.js](../../site/people-index.js) introduces a **pure, side-effect-free, not-wired-to-app** local index that reads all six shapes in the already-unlocked trusted coach workspace. It creates stable source-reference keys qualified by the explicit originating workspace namespace and **joins only player rows that already share the same explicit historical personId**. No matching by name, email, phone, photo, family surname, age or sporting role. Historical player ID, kit loan, availability and season records are not rewritten.

- `buildLocalPeopleIndex(workspace, namespace)`: produces a private *advisory* index of source paths, kind, display labels and candidate person grouping, plus possible guardian review prompts. It does **not** return raw contact, photo, medical, accreditation or library data.
- `proposeLocalPersonLink(index, references...)`: describes a human-requested person association between two distinct source records, retaining prior identity keys for reversibility. **It does not update the workspace.**
- `reviewLocalPersonLink(index, proposal, explicitConfirmation)`: records only a **local review acknowledgement**. Stale source identity references are rejected. It never creates official identity proof, changes old records, grants permissions, creates an account, or transfers data to another club.
- `undoLocalPersonLink(...)`: reverses the local proposed-review state without modifying history.
- `proposeGuardianReview(...)`: creates an explicit **unverified** guardian candidate for two source references; it never verifies legal guardian status or grants access to a child. A team helper's `playerId` remains a possible-guardian **review hint**, not authority.

The module is intentionally not imported by `site/app.js`. This **first PR does not claim** that real people have already been merged, that the saved app schema contains a canonical Person table, or that the coach has a new People screen. Those are **follow-up work inside P04** requiring separately reviewed design, user-confirmed UX and historical compatibility tests.

## Mapping and preservation decisions

| Old location | New advisory kind | Key scope | What remains untouched |
| --- | --- | --- | --- |
| `team.players[]` | player | Workspace/team/player ID; explicitly shared `personId` may group | Original local player ID, jersey ledger, number, positions, notes, injury, season roster, RSVP |
| `team.helpers[]` | helper | Workspace/team/helper ID | Task/transport assignments and linked player ID; **no automatic guardian status** |
| `workspace.matchOfficials[]` | match-official | Workspace/crew ID | Sport-specific qualifications, accreditation, badges, team/club assignments, WWCC check state |
| `club.officials[]` | club-official | Workspace/club/index | Club role, contact and historical label |
| `team.team.staff[]` | team-staff | Workspace/team/index | Team coach/manager roles and contact snapshot |
| `team.seasons[].staff[]` | season-staff | Workspace/team/season/index | Historical coach/manager appointment display and prior contact snapshot |

**Index-based legacy staff rows require special care**: they have no stable source ID and may be reordered. P04 implementation must attach stable IDs in a backwards-compatible controlled upgrade or revalidate the original row content/hash during review. The current prototype explicitly labels these references **advisory only**, not durable merged identities. Do not persist such a link across a reordering or grant access based on it.

**Player identity ownership:** Existing explicit `personId` may link team records within one trusted coach workspace even if their club labels differ; this does **not** create authentication or privacy access between independently owned club accounts.

## Guardian and junior privacy

Future GuardianRelationship should be a separate, evidence-backed link, with guardian and child IDs, club/team context, legal authority verification method, approval actor, effective/expiry periods, permitted operations, consent and revocation history. The current app has helper contact text and optional playerId, which is insufficient. **No current guardian self-service or access to juniors' records** is implemented or proposed in this PR.

Workflows involving actual users must not expose a global Person search or discover children in other clubs. Current team player copies continue using `site/vault.js`'s existing allowlisted projection; sensitive helper/crew/coach contact details remain in the coach workspace only.

## P04 continued work after this foundation

1. Owner reviews six source shapes and confirms who is permitted to approve person linking, correcting and unlinking within the trusted workspace.
2. Design and test stable IDs for staff snapshots and a durable **explicit-review ledger** stored in the existing encrypted workspace without changing live authorisation. Ensure idempotence, repeatable migrations, three-way merge, manual conflict handling and rollback.
3. Introduce a careful People/Staff entry point in existing coach UI, showing potential duplicates but never auto-merging and preserving role-specific forms and safeguards. Avoid breaking sport-specific crew and junior helper workflows.
4. Build relationships for one person coaching/managing/volunteering across multiple teams while retaining per-team and per-sport qualifications, assignment history and contact visibility.
5. Build guardian candidate intake/review for safeguarding data only; **no permission to enter a child's account or change their records** until post-P10 verified accounts and tenant enforcement.
6. Run full browser/Node, historical schema-4 fixtures, privacy projection, Mac/iPhone Safari, backup/publishing and owner acceptance before marking **P04** complete.

## Evidence and rollback

- Tests: [test/people-index.test.js](../../test/people-index.test.js) with synthetic multi-team, multi-sport, six-source, guardian and negative cases. No actual personal data or credentials.
- No runtime app code, URLs, data branch, schema, invitations, account permissions, encryption or cloud services changed. Rollback of this **initial draft** is a simple revert of its new unused module, test and document.
- **P04 should remain open after this foundation PR until its accepted in-app Person workflow is fully built and qualified.** A passing synthetic test does not mean current product's people are actually unified.

## User acceptance questions before persistence/UI work

- Who may authorise linking a club official to a player or volunteer, given no individual authenticated admin exists today?
- Should the current trusted coach approve all links within their single workspace, and how are corrections/accidental links logged and reversed?
- May a helper's historic relation text ever be shown in a combined profile, or should it remain confidential coach-only?
- Which staff contact fields should have one canonical value, and which are historical snapshots with their original context?
- Should a newly saved person entry without a team assignment remain visible to the coach's People directory, and what happens when the coach changes clubs?

**No action in this PR should be interpreted as granting actual association/club or guardian access.**
