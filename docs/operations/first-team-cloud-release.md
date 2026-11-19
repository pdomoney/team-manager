# First-team cloud release, L0–L6 (29 November 2026)

**Status: SOURCE PREPARATION ONLY. Live-team release: HOLD.** Related [#252](https://github.com/pdomoney/team-manager/issues/252), [#55](https://github.com/pdomoney/team-manager/issues/55), P13B/C and the existing [encrypted-workspace operating runbook](current-platform-runbook.md).

## What is currently hosted

The static Team Manager frontend is published at https://pdomoney.github.io/team-manager/. Its existing GitHub `data` branch/encrypted shared-password workflow and P12 role selector **are not real user authentication or server-enforced team separation**. Neither a green Pages build nor successful mock security tests makes it safe to share private junior, medical or guardian data across independent users. Existing play and team workflows are untouched by this preflight.

## The go-live decision

The owner needs to make explicit decisions for **one team** before any provider purchase/provisioning, real account creation, personal-data import or cloud cutover:

1. Backend vendor/plan/budget, Australian server and processor locations; independently check contract and backups.
2. Individually authorised **Coaches, Managers, Players and Volunteers**, with exact team grants, invitation/recovery and revocation. Real player/volunteer access is mandatory for the 29 November requested experience, not a post-launch option.
3. Data controller, privacy notice, permitted personal-data classes, explicit minor/guardian exclusion or independently approved inclusion, and retention/export/deletion decisions (D21). Health, safeguarding, payment, unverified guardian links and broader cross-club access remain outside this limited scope.
4. Backup and restore ownership/targets, historical Git ciphertext risk, migration choice, rollback and release authority.
5. Actual iPhone/macOS Safari, accessibility, two-device and owner acceptance.

**Do not infer approval from the word “continue” or from PR merging.** The production backend/identity gate #55 remains unapproved. Supabase is a candidate, not a provisioned/qualified live identity backend. Source changes do not themselves send emails, provision an environment, import records, purchase services or authorise real users.

## Owner-approved management-only initial release (19 November 2026)

**The current Stage 3 release scope supersedes the 16 November plays-required candidate.**
The owner approved a management-first programme: 3A individual accounts and profiles,
3B operational management, 3C controlled real-user staging and 3D management-only
production rollout. The existing E5 Tactics and Play Editor are **Stage 4, only after
management go-live and stabilisation**. Preserve existing E5 code, authored plays,
drawings and encrypted demo; do not make its Worker integration, animation, editor,
migration or iPhone Watch qualification a Stage 3 release dependency.

| Management-only release journey | Required behaviour |
| --- | --- |
| Coach/Manager exact team | Independently approved role can manage only the selected team's roster, training and delegated activities |
| Player own availability | Verified participant replies to their own team training, never another person's records |
| Individual invite activation | Independently proposed and approved invitation, verified email, account setup and credential recovery |
| Volunteer own duty | Verified volunteer sees only directly assigned duties, never arbitrary team records |
| Volunteer own response | Assigned volunteer accepts, declines or completes only their own assigned duties |
| Profile/person-link approval | Individual edits permitted profile fields; separate authorised reviewer verifies account-to-person linkage |
| Role grant and recovery | Exact team/role granted, suspended/revoked with independently tested recovery; no implicit Owner/private access |
| Revocation and foreign-team denial | Foreign team, revoked roles, forged grants, direct calls and stale/offline use denied by real server |

**Privacy decision remains HOLD:** first team may include under-18 players, with
individual accounts and guardian-candidate details only if independently approved.
Verified relationship, age-appropriate policy, data controller and approved privacy
evidence are mandatory for actual minor-data processing; an activated guardian account is optional per the recorded owner direction. Do not treat proposed guardian
information as permission, proof of consent or automatic team access.

The source evaluator now requires these **eight management-only journeys**.
All seven original L0–L6 hard release gates remain in place, including provider,
data/controller approval, real independent security testing, backup and recovery,
physical iPhone/macOS Safari and explicit owner go-live acceptance. Published
source and synthetic test success do not satisfy these external gates.

## Source-only release evaluator

- `config/first-team-cloud-release-evidence.json` is an intentionally **blocked** committed ledger: all L0–L6 pending, no provider, no deployed source SHA, no real server, no physical evidence.
- `src/first-team-cloud-release.js` evaluates seven hard gates. It requires an immutable source SHA identical to installed runtime SHA, individual server authentication, owner supplier/cost/privacy authorisation, an actual 59-case server security report with separately accepted historical Git risk, physical Safari/VoiceOver/two-device proof and final owner go-live acceptance.
- `scripts/check-first-team-cloud-release.mjs` defaults to non-zero (blocked). It accepts **only a sanitised JSON record through stdin** for a later independent gate assessment. It refuses file paths, and the committed ledger must stay pending.
- Node CI uses `--assert-source-blocked` to detect anyone claiming an unapproved production release in Git. **A successful CI check here proves only that the committed ledger correctly remains blocked.**
- The evaluator is a decision aid. It cannot authenticate GitHub links, externally held `evidence-ref:` documents, an identity provider, RLS, an installed release or physical device. A passing manufactured fixture is **not** go-live proof. Independent human review is mandatory; never use synthetic evidence as production signoff.

### Commands

```bash
npm test
node scripts/check-first-team-cloud-release.mjs --assert-source-blocked
node scripts/check-first-team-cloud-release.mjs            # expected exit 1: HOLD
node scripts/check-first-team-cloud-release.mjs --stdin    # later: pipe a sanitised externally verified JSON record
```

Do not commit filled release evidence containing internal URLs, patient/player details, backups, credentials, invite links, decrypted data, personal information or one-time tokens. Store operational evidence in a protected, separately managed record with benign references. The exact future PR-head and installed SHA must be observed after the code is frozen, not self-referenced in the changing source tree.

## Seven hard, nonwaivable gates

| Gate | Evidence needed | Current |
| --- | --- | --- |
| L0 | Explicit scope/provider/finance, controller, privacy/retention and minors decision | HOLD |
| L1 | Approved isolated actual backend, identity and exact team grant enforcement | HOLD |
| L2 | Coach/Manager, Player, Volunteer and account onboarding live read/write journeys, including individual identities, exact team permissions and denied cross-team access | HOLD |
| L3 | P13B/C 59 actual server tests and separate ID-060 history risk acceptance | HOLD |
| L4 | Separate backup/restore, rollback and actual staging release verification | HOLD |
| L5 | Real iPhone and Mac Safari for sign-in, profile, management, player/volunteer actions and recovery; VoiceOver and two devices | HOLD |
| L6 | Exact deployed commit, production health, privacy authority and owner acceptance | HOLD |

Target: conditional rollout no later than **Saturday 28 November 2026 (AEDT)** for the first team on **Sunday 29 November**. This date does not authorise cutting security, data handling or recovery controls. If any mandatory evidence is unavailable, run a **fictional-data rehearsal**, not a live personal-data launch.
