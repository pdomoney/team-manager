# P10C — Migration readiness, risk register and release handoff

**Stage:** P10C scoped design/operations qualification; **no migration authorised**.  
**Input baseline:** owner-merged [P10B PR91](https://github.com/pdomoney/team-manager/pull/91), merge `ef21dff53bd8b987f79c60174648a1a6dc1eabf7`, 25 October 2026 Sydney time.  
**Related:** [P10 #52](https://github.com/pdomoney/team-manager/issues/52), [P01 canonical-domain proposal](p01-canonical-domain.md), [P01 schema-4 mapping](p01-schema4-migration-and-dryrun.md), [P10A release gates](p10a-release-qualification.md), [P10B encrypted recovery](p10b-recovery-qualification.md), [current-platform runbook](../operations/current-platform-runbook.md).

## 1. Decisions and scope

The accepted current application remains **GitHub Pages + encrypted coach workspace + encrypted GitHub data branch**. `site/model.js` exports schema `4`. It stores the root team's ID in the workspace root and additional teams under `ws.teams[]`, with a shared coach-owned library, clubs, competitions, review ledgers and historical team/season records.

P10C adds a deterministic **design-only mapping and release risk manifest**. There is no login migration, tenant permissions, production backup decryption, remote API access, schema change, identity search or backend deployment. Future independently authenticated organisation and guardian access belongs in [post-P10 #55](https://github.com/pdomoney/team-manager/issues/55); header persona switching in [post-P10 #62](https://github.com/pdomoney/team-manager/issues/62).

The manifest is a planning inventory, **not an extractor**. It describes expected path-to-candidate mappings without iterating actual workspace data. `src/migration-readiness.js` imports only the existing `SCHEMA` constant and creates an in-memory static JSON document. `scripts/print-migration-readiness.mjs` **refuses all command-line arguments** so it cannot accidentally be pointed at private backups. It makes no network calls and prints no personal records.

```bash
node scripts/print-migration-readiness.mjs
npm test
npm run test:browser
```

The first command prints a design-time JSON mapping to the terminal. Do not paste a real workspace, decrypted file, personal record, API token or password into the command.

## 2. Legacy reference and ownership constraints

The future import contract, **subject to post-P10 design review**, uses

```js
sourceKey = JSON.stringify([sourceWorkspaceId, sourceRecordKind, ...sourcePathIds])
```

Every legacy ID must remain **namespaced to its original source workspace**. Source identity is never joined across unrelated clubs or coaches merely because names, dates, email addresses or phone numbers match. Explicit `personId` links may group provisional records *only within the same authorised original workspace*, subject to review. No Person is automatically an Account, guardian, association administrator, club administrator or licensed seat.

The manifest has explicit mappings covering:
- Workspace and candidate DataSpace ownership, local clubs and team identity (root first team plus additional teams).
- Seasons, participation, historical registration/position/jersey issue/return/corrections and archived team preservation.
- Provisional players, helpers, club officials, team staff, match officials, volunteer appointments and unresolved person/guardian review ledgers.
- Competitions and entries, coach-recorded matches, auditable fixture revisions, training, tasks, notices and communications.
- Team plays and personal library revision/ownership.

The `candidate` field does **not** assert an authorised tenant or verified actor. Club-directory matches are research provenance, not affiliation; an organiser name is not an official feed; sports accreditation and WWCC statuses remain coach-recorded and unverified. Guardian review is a safeguarding workflow, not a grant of access. A paid association licence does not grant its officers access to affiliated clubs' private information.

## 3. Privacy and security gap disposition

| Gap / risk | Current status | Required before post-P10 deployment |
| --- | --- | --- |
| Shared coach password across clubs | One trusted local workspace; **not** tenant separation | Individually authenticated accounts, server-side default-deny DataSpace and scoped grants, revocation and audit |
| Youth contacts, medical information and safeguarding evidence | Encrypted coach file only; allowlisted team projections | Sensitivity labels, lawful retention and consent, independent access-denied tests, no public/leaky reporting |
| Guardian and Person linking | Local review/candidate model only | Verified individual claim, child-specific authority, expiry and dispute/revocation policy |
| Match officials, first aid and shirt trainers | Coach-entered registration and qualifications | Sport/grade/season rules and confirmed accreditation/WWCC evidence, independent source and expiry/revocation checks |
| Competition/fixture information | Coach-recorded; provenance may be unverified | Source-controlled organiser authority and explicit fixture amendment history |
| Team/club/play library ownership | Shared personal coach workspace and local content copies | Rights and ownership reconciliation, club consent, copy/update semantics, no silent disclosure |
| Remote edits on two devices | Client-side merge/review, not a shared transactional backend | Real stale-write/device tests in P10; per-tenant transactional revision and concurrency design post-P10 |
| Public GitHub encrypted file history | Old ciphertext persists in history | Password rotation cannot erase old read access; retention/disclosure risk documented |
| Loss of coach password or export | No password recovery guarantee | Real encrypted test-backup restore, offline access controls, secure escrow policy, incident/runbook |

**High-severity stop conditions:** Unexpected disclosure to another club/player, safeguarding leakage, corrupted encrypted backup, lost historic ID/kit/result record, silent stale-version overwrite, unverified guardian privilege, or accidentally published plaintext/token.

## 4. Rollback and migration decision

P10C changes no application runtime. Reverting its docs, manifest and synthetic Node tests leaves coach data, passwords, GitHub data branch and current Pages deployment untouched.

A **future** provider migration requires an independently approved post-P10 RFC specifying: source workspace ownership; legal basis and privacy assessment; data residence/support/backup destinations; explicit consent and authority; reversible ID mapping with `LegacyReference`; complete preflight/hash and decrypt/restore check; dry-run duplicate/orphan/reconciliation report; transaction and live write freeze; audited cutover; backed-up rollback, immutable evidence and decommission plan. These are **design requirements, not features implemented by P10C**.

The existing `data` branch stores role-labelled encrypted JSON and older history; site/build rejects unexpected plaintext. Code rollback and data rollback are **different operations**. Do not force reset the `data` branch or restore to live coaches without approved backups and a documented client-device reconciliation.

## 5. P10D handoff and evidence backlog

- **Already automated:** P10B synthetic AES-GCM restore, wrong-password/tamper failure, identity/history and team privacy tests; P10A progress semantics. P10C adds deterministic mapping/safety regression. These checks do not simulate real Safari or production transactions.
- **Still mandatory:** Physical iPhone/macOS Safari on P06 V1–V8, P07 S1–S10, P08 S1–S10 and P09 R1–R8; actual encrypted backup and independent restore; malformed/wrong-password failure; stale-device publish conflict; private player/coach projection; accessibility and large-workspace performance; approved live data-branch publish **using fictional data only**. Record environment, device version, exact commit, result and defect ID.
- **Approval:** Owner must separately accept the exact P10D release candidate and its disposition of each outstanding case. Owner's earlier “Accept all” P06–P09 implementation approval is *not* blanket release/test acceptance. No public stable-release tag before all blocking results or documented case-specific risk decisions.
- **CI:** Exact-head full Node and Chromium, retained test artifact, then independently verify post-merge `main` Tests and Publish.

**P10C exit criteria:** owner-reviewed scoped PR, executable static manifest deterministic and sensitive-data-free, documented runbook, passing Node/browser, merged SHA and post-merge verification. P10 overall progress increases only on merge; P10D still handles final real-device qualification and release decision.
