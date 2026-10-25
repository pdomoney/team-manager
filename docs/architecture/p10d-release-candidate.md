# P10D — Release-candidate evidence and final decision

**Scope:** current GitHub Pages app with the existing encrypted single coach workspace. **No** Supabase, production tenant access, identity migration, billing, release tag or new persona switcher. Post-P10 tenancy and persona QA remain [#55](https://github.com/pdomoney/team-manager/issues/55) and [#62](https://github.com/pdomoney/team-manager/issues/62).

## Owner decision carried in

On **25 October 2026**, the owner stated **“P10 user acceptance is fine.”** This is recorded in [P10 issue #52](https://github.com/pdomoney/team-manager/issues/52) as acceptance of the **P10A–P10C user-facing behaviour** at accepted main baseline `3a46fcffad7805afa1e0b4c209ab17dbb03b029d`. It is **not** a physical Safari test result, a waiver of private-data protection, confirmation of a real-device encrypted restore, nor the **final stable-release sign-off** for an as-yet-unmerged P10D commit.

## Automated release summary

```bash
npm test
npm run test:browser
node scripts/check-p10d-release.mjs
# Final release reviewer only: pipe a separate sanitised completed ledger through stdin
node scripts/check-p10d-release.mjs --stdin < /private-safe-path/p10d-sanitised-evidence.json
```

- `npm test` executes P10D fail-closed unit tests as well as all existing tests.
- PR Chromium should run all suites (including capacity); main push may intentionally exclude capacity.
- `node scripts/check-p10d-release.mjs` reads the **checked-in, deliberately pending** `config/p10d-release-evidence.json`, prints JSON and returns **exit code 1 when blocked**, 0 only if all cases and gates have evidence. For final assessment, `--stdin` accepts a separately held **sanitised JSON evidence ledger** (never a private backup or credential); no file path arguments are accepted. Invalid or oversize input is rejected.
- Evidence completeness is checked mechanically; a valid-looking entry is not proof the underlying test was performed. An owner reviewer must inspect all evidence links and decide whether claims are accurate. Never fabricate a passing device result or a risk waiver.

## Filling the release ledger

1. `config/p10d-release-evidence.json` remains the **pending source-controlled template**. Once a P10D PR head is frozen, **outside the Git branch** make a separate sanitised copy and record the P10D PR number, tested **head SHA** (`candidate.headSha`) and, after owner-reviewed merge, the final **main SHA** (`candidate.mergeSha`). **Do not commit this completed copy**: committing the SHA into the SHA being attested would change the commit under test indefinitely. Submit the completed copy through `--stdin` and store its sanitised outcome/evidence references in issue #52 for reviewer inspection.
2. For **each** of 36 Safari cases `P06-V1…V8`, `P07-S1…S10`, `P08-S1…S10`, `P09-R1…R8`, run the original case from [P06–P09 closure worksheet](../architecture/p06-p09-closure-worksheet.md) on a real iPhone/macOS Safari with **fictional** workspace data. Record `status: passed`, exact `testedCommit` (merged main SHA), `deviceModel`, `osVersion`, `safariVersion`, `observedAt` and a private-safe `evidenceRef`. If a case fails, leave it blocked and link the defect.
3. Non-critical Safari cases can use `status: waived` **only** after a **separate** explicit owner approval with `owner`, `reason`, `riskDecision` and `decidedAt`. A broad “UAT is fine” or “accept all” is **not** a case-specific waiver. The checker refuses waivers for the named privacy/safeguarding cases; investigate any additional serious privacy, data-loss or child-safety failure as a release blocker.
4. Supply evidence (date, `testedCommit` and redacted `evidenceRef`) for **all** non-waivable `releaseGates`:
   - `PR_HEAD_NODE`, `PR_HEAD_BROWSER`: exact P10D PR-head CI; include capacity suite in browser qualification.
   - `MAIN_NODE_BROWSER`, `MAIN_PUBLISH`: exact merged P10D **main** workflows (publishing code does **not** by itself prove data publishing).
   - `DEVICE_ENCRYPTED_RESTORE`: actual fictional encrypted full-workspace export/import, password rejection, repeated restore and no data loss.
   - `DEVICE_STALE_CONFLICT`: two authorised test devices with stale encrypted SHA, review and preserved edits; no silent overwrite.
   - `PRIVACY_BOUNDARY`: verify coach vs restricted player, WWCC/guardian/medical/private contact and invalid club context; not real tenant auth.
   - `FICTIONAL_LIVE_PUBLISH`: authorised encrypted fictional data branch round-trip and deployed second-device read. **Never** use live child/private data or share PATs.
   - `FINAL_RELEASE_APPROVAL`: an **explicit final owner decision on the exact P10D main SHA**, once other criteria pass.
5. Retain a separate, private audit trail as needed; record only **sanitised references**, not phone numbers, passwords, tokens, children’s identities, uploaded archives, or real medical/WWCC data in GitHub.
6. Re-run the evaluator **with the separate final evidence ledger supplied via `--stdin`**, confirm all recorded SHA references match actual GitHub Actions, and inspect the **actual** evidence. Only an all-green result plus human review permits a final tag/release; the evaluator cannot attest the truth of external entries. Completion of PR93 does **not** automatically close P10 issue #52 or authorise tagging.

## Rollback, stops and related docs

Use [current-platform runbook](../operations/current-platform-runbook.md) for encrypted backup, restore, publishing, two-device conflict and separate **code vs data rollback**. Stop on private data leakage, false eligibility, stale-device silent overwrite, failed encrypted recovery or corrupt history. Maintain last known-good encrypted backups. A code rollback **cannot** recover destroyed encrypted data; preserving GitHub history is also not equivalent to revoking old decryptable keys.

CI completion and functional UAT are valuable **distinct** evidence streams, neither alone proves release safety. P10D should be approved and merged separately by the owner; a final stable tag or issue closure follows only the real remaining gates, not the opening of this PR.
