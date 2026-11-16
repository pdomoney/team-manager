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

**Do not infer approval from the word “continue” or from PR merging.** The production backend/identity gate #55 remains unapproved. Supabase is one proposal, not a selected vendor. This PR uses no network connection, service keys, account provisioning, paid service, or real records.

## Owner-required participant and plays scope (16 November 2026)

The owner expanded the requested first-team operational launch to include **players, volunteers and existing plays**, in addition to Coaches/Managers. A Coach/Manager-only pilot no longer meets that request. Preserve the accepted E5 tactics viewer/editor, phase instructions, paths, timings, animations, Quick Look and legacy compatibility. E6–E8 remain deferred; no play re-authoring or blind conversion.

| Required journey | Expected first-team experience and security boundary |
| --- | --- |
| Coach/Manager exact team | Sign in as an individual; manage only authorised team roster, schedule, match tasks and team operations; no arbitrary competition fixture authorisation |
| Player own availability | See team schedule and submit own RSVP/availability (or through a separately verified guardian for a minor), never browse another player’s private contact/attendance |
| Player published play view | Watch/learn/animate **published** team plays on iPhone Safari; never view coach drafts, private library content or another team’s plans |
| Volunteer own duty | Sign in as an individual and see only independently assigned team/fixture roles; sporting duty/accreditation is not a software grant |
| Volunteer own response | Reply to own duty/task or availability requests, not edit the squad, certify eligibility, or publish results/plays |
| Coach E5 play editing and publishing | Authorised coaching role can edit and publish a reviewed play without modifying historical diagrams, phase/event state, paths or timing; Player/Volunteer may not publish |
| E5 lossless recovery | Restored plays match source versions, including animations, instruction text and play/library provenance; no automatic migration into incompatible schema |
| Revocation and foreign-team denial | Withdrawn/revoked, unauthorised roles, foreign team, direct URL and offline replay all denied by real server; no permission inferred from membership |

**Privacy decision:** record whether the first team includes under-18 players. When minors participate, approved privacy and **verified adult guardian-account linkage** are mandatory, not a guessed relationship or a shared minor password. Individual player sign-in model, age policy and consent must be approved independently. All live minor/medical/safeguarding data remains prohibited until the necessary owner and controller decisions.

The evaluator records these eight additional mandatory journeys in `launchJourneys`, separately from seven operational release gates. Every positive journey requires exact-source evidence; a successful synthetic fixture or unverified evidence URL still **cannot** prove actual server authorization, rights, backup quality or real iPhone success.

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
| L2 | Coach/Manager, Player, Volunteer and Plays live read/write journeys, including individual identities, exact team permissions and denied cross-team access | HOLD |
| L3 | P13B/C 59 actual server tests and separate ID-060 history risk acceptance | HOLD |
| L4 | Separate backup/restore, rollback and actual staging release verification | HOLD |
| L5 | Real iPhone and Mac Safari for player Watch/Learn animation, volunteer replies, coach editing and recovery; VoiceOver and two devices | HOLD |
| L6 | Exact deployed commit, production health, privacy authority and owner acceptance | HOLD |

Target: conditional rollout no later than **Saturday 28 November 2026 (AEDT)** for the first team on **Sunday 29 November**. This date does not authorise cutting security, data handling or recovery controls. If any mandatory evidence is unavailable, run a **fictional-data rehearsal**, not a live personal-data launch.
