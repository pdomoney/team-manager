# First-team individual identity and exact-team server boundary (source-only)

**Status, 16 November 2026:** Owner endorsed the next priority: individually authenticated Coach, Manager, Player and Volunteer access for the first team, including plays and availability. This **does not approve** a backend vendor or plan, a subscription, production or staging infrastructure, real personal/minor data ingestion, migration or live release. Product gates: [#55](https://github.com/pdomoney/team-manager/issues/55), [#252](https://github.com/pdomoney/team-manager/issues/252), [D01–D24](owner-future-role-decisions-20261103.md) and [P13 contract](production-role-data-contract-20261101.md).

Source baseline before the branch: `main` `f0cd0b84d67825e33554523ecb4a30a73d398875` after PR #255, with exact-main Node/Chromium/WebKit and Pages publication PASS. Existing GitHub Pages remains the frontend, using encrypted data-branch files, team/Coach shared passwords and a **synthetic** role picker.

## What this implementation provides

`src/first-team-server-boundary.js` is a **provider-neutral, backend-only transactional access boundary**. It is not imported by `site/`, not served by `src/serve.js`, and cannot be called as a live API. It depends on a backend adapter with `transaction(fn)` that keeps identity, record, exact-team grants and the authorised operation inside the same rollback-capable consistency boundary. The server supplies its own clock.

For each protected action, the boundary:

1. Validates a bounded request and **one selected team and role**, rejecting caller-supplied account/person/grant/trust fields.
2. Requires `tx.verifySession(token)` to return an **independently cryptographically verified**, active and unexpired account. The future adapter must actually verify issuer, signature, audience, expiry, revocation and session state; a boolean alone is not real authentication.
3. Loads the resource from a trusted datastore by resource ID and type, derives its canonical team, and requires that it exactly matches the selected team. Cross-club affiliation, a player surname and the browser role dropdown are never grants.
4. Blocks unknown, private, minor, health or safeguarding classes until separate approved purpose-limited controls exist. No guardian impersonation or minor direct login has been implemented.
5. Reads current **active, independently approved exact-team grants** under fixed policy version 1, and uses only the currently selected role, never a pooled union.
6. For a Player, additionally requires an independently verified account→person link and **active recorded team participation**; own RSVP requires the resource person ID match. A name or team membership alone does not create a digital grant.
7. For a Volunteer, additionally requires an independently verified person link and current **assigned/confirmed duty**. Duties do not confer Coaching or roster editing privileges. A separate `team_play_viewer` grant can be assigned if volunteers should explicitly watch published tactics, but is not inferred.
8. For plays, Player/Viewer may read only a backend-identified **published revision**; Coach/Assistant Coach can read/edit drafts, but only Coach can initiate publishing. These checks do not replace server-side publication workflow, revision consistency, payload validation or the accepted E5 editor.
9. Requires `tx.auditDecision` to explicitly return boolean `true`, then calls `tx.executeAuthorized` inside the same rollback-capable transaction. The operation must return `{success: true}` (optionally with an adapter-approved least-privilege response). Missing, false or error-shaped acknowledgements cause a throw so the real transaction can roll back both audit and operation work. A failure returns a generic denied result, never a client-visible exception, SQL or token. An acknowledgement is necessary but **not proof of durable persistence**: the real adapter's commit, isolation and readback must be tested independently.

The supported action set is deliberately **not** a generic data API: schedule read/edit, roster edit, published-play read, draft-play read/edit/publish, Player own availability reply, Volunteer own duty read/reply and Manager duty assignment. No medical lookup, global search, exports, payment, self-approval, club-wide admin, arbitrary file downloads or credential management is available through this interface.

## Trust and integration gaps that explicitly remain

**This module and synthetic Node tests are not production authorization or completed L1.** Real deployment would require all of the following, within separately approved provider/region/budget/privacy and release authority:

- An actual identity provider integration that verifies account sessions cryptographically and checks invitation, disabled state, password reset, MFA where required, account linking and revocation. **Never** accept the mocked `verified:true` test input from a browser or client.
- A transactional persistent database/API adapter enforcing tenant and row access rules at the storage boundary (e.g. deny-by-default RLS), correct isolation and optimistic concurrency so resource/grant reads and writes cannot race. A faulty adapter can defeat this library; do not claim it is itself a row-security engine.
- Whitelisted, action-specific input schemas and **least-privilege output projections** in the adapter, including validated E5 published revision and per-person availability; the `payload` and `tx.executeAuthorized` contracts here do not validate sporting event content, apply a database migration or guarantee response redaction.
- Durable decision/audit records including **DENY** outcomes, rate limiting, errors, replay/idempotency handling and monitoring. The present library records an ALLOW intent before the operation inside one transaction; missing audit acknowledgement or operation success must abort that transaction. Durable committed ALLOW, DENY and failure audit handling remain obligations of the actual provider adapter.
- Explicit owner decisions for initial team ages, guardian authority (D09), privacy/data classes/retention (D21), data controller, notices, backup/restore, historical GitHub encrypted blobs, external supplier and cost.
- Actual [P13B/C 59-server-case](p13b-provider-neutral-security-test-contract-20261101.md) qualification plus historical blob risk review, distinct test identities and clubs, real device Safari/VoiceOver, exact-source staging, rollback rehearsal, installed build and owner acceptance. Tests here count as **0 real-server security cases**.

## Backend adapter acknowledgement contract (17 November 2026 correction)

The source boundary now explicitly **rejects false-success responses**. A provider integration must make `tx.auditDecision` return exactly `true` only when the audit entry is accepted in the **same transaction**, and `tx.executeAuthorized` must return an object with `success: true` only after applying the action-specific policy, schema, row filters and version checks. No returned value, `false`, `{success:false}`, or `{ok:true}` is a valid success acknowledgement.

On failure, the boundary **throws inside** the supplied transactional callback, causing the outer boundary to respond `{allowed:false,code:'trusted-backend-failure'}` without leaking provider internals. A real adapter **must roll back** audit and resource changes on such a throw. The synthetic adapter test rehearses rollback of its in-memory counters; this is **not a database transaction or a durable commit test**. A future provider connection must prove isolation, fault rollback and exact committed record changes independently.

A correct acknowledgement can still be produced by an incorrect or hostile adapter. Therefore none of these source tests proves cryptographic identity verification, production RLS, output redaction, or successful actual storage. These remain P13B/C and L1–L6 gates.

## Synthetic acceptance and regression coverage

`test/first-team-server-boundary.test.js` exercises:

- Positive exact-team coaching, Manager, assistant draft editing, Player schedule/published play/own RSVP, Volunteer own duty/reply, and explicitly granted play viewer.
- Wrong role, wrong team, direct foreign resource, unauthenticated/disabled/expired account, forged browser claims and missing backend adapters.
- Proposed, revoked, expired, future, unapproved, self-approved, cross-club and wrong-policy grants, including a replay with the same session token after revocation.
- Player self/other-availability, missing person link or participation; Volunteer unassigned/expired/foreign duty; draft versus published play boundaries.
- Medical, safeguarding and minor/private record class deny, missing policy store, failed audit and failed backend execution.

No personal, medical, real team member, invite, secret, credential, storage connection or production data is used in the tests.

## Release preservation and next milestone

**Preserve:** existing Home team selector; Squad/Training/Matches/Reports/Tactics navigation; synthetic P12 QA behaviour; accepted E5 play editing, timeline and Coach publishing; encrypted backup and existing Pages publication. No production server, database, GitHub token, play schema, registration, volunteer approval, guardian link or saved workspace is modified in this PR.

**Next, after vendor and data-policy approvals:** implement **one selected real backend adapter and a narrow end-to-end staging journey**: individually invited Coach publishes an approved E5 revision; individually invited Player of that exact team sees Watch/Learn and records own RSVP; independently invited Volunteer sees/responds only to their assigned fixture duty. Verify cross-team and revoked identities against a real server, then complete L2–L6.

The launch target remains **28 November preparation for 29 November first-team use**. No release-gate status can be advanced from this source work alone: **0/7 release gates, 0/8 first-team journeys**.
