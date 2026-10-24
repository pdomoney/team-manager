# Team Manager — Current-platform operating and recovery runbook (P10C)

**Operator audience:** owner / authorised coach in the **existing** GitHub Pages encrypted single-workspace application. This is *not* independent club or guardian access, backend tenancy or a new login model. **P10D real-device validation remains pending**; these are controlled instructions, not a claim they have been physically validated.

## 0. Preflight / stop rules

1. Record test date, device/model, Safari version, site URL, app version (`meta[name=app-version]` or deployment commit), and whether the workspace is **test mode** or encrypted live mode.
2. Use **fictional teams, contacts, guardians, volunteers and health notes** for release testing. Do not use actual young-person or medical records. Never paste a coach/team password, invite link, GitHub personal access token or decrypted backup into issues or chat.
3. Confirm that a coach has their password saved independently in a password manager. Passwords are not recoverable by this app; existing GitHub encrypted history may still be readable with old passwords.
4. Check for pending local changes, automatic publishing, offline status, storage-full warnings and a possible multi-device conflict **before** any import or overwrite.
5. **Stop and escalate** if an encrypted export cannot reopen, a player view exposes private records, a safeguarding review appears as real access, another device publishes stale data without review, or any plaintext/private file is about to be committed to the public repository.

## 1. Routine synthetic regression and safe development

On the selected branch/commit in a disposable local checkout:

```bash
npm test
npm run test:browser
node scripts/print-migration-readiness.mjs
npm run build
```

The last command assembles the static site from source; when run without an authorised encrypted `data` directory, it is not a real encrypted data-branch publish or recovery test. Real CI uses `.github/workflows` and records `Tests` and `Publish` runs for the specific SHA. Retain browser qualification artifacts before sign-off.

In the published app, **test mode** can load `Settings → Test data → Load a fresh test library`. Confirm before replacing any existing **test** records. The sample includes fictional and research-reference names, not official fixtures. Test mode is local and **its exported backups are not encrypted**, even when they contain manually entered phone numbers; treat them as private.

## 2. Coach backup and recovery (controlled manual acceptance)

1. On a dedicated **fictional** encrypted coach workspace, open `More → Settings → Backup → Export backup`. Store the downloaded JSON off-device in a private location.
2. Record the timestamp, source workspace context, app version and **checksum of the encrypted backup**. On macOS use `shasum -a 256 path/to/backup.json` with the actual downloaded filename. Do not add it to the Git repository. Never put a real password/token in a test ticket.
3. Create or select a disposable *authorised test* workspace/device. Record a second encrypted backup **before** importing anything; an import may replace the whole workspace.
4. Use `More → Settings → Backup → Import backup`. For sealed files, the app prompts for the backup's coach password if the currently remembered coach lock cannot decrypt it. Test successful import with the known test password and rejection with a wrong test password.
5. **Inspect the confirmation choices carefully:** `Replace everything with it` overwrites the current local teams, seasons, clubs, competitions and library. On single-team imports the app may instead offer replacement or adding a new team. Check the list of team counts first. Only select full replacement on a disposable test copy.
6. Validate restored IDs and history using the UI: both clubs and teams, archived teams, older/current seasons, players across teams, preferred sport positions, jersey issued/returned history, volunteer appointments and warnings, match results and fixture revisions, coach-owned play/library provenance and private vs player projections. Record the same results after a **repeat** restore.
7. Corrupt an **independent disposable copy** of the test encrypted archive and confirm rejection without modifying the intact source file. Do not ever alter the only copy of a backup.
8. Keep independent original and restored archive checksums. Record PASS/FAIL for each check; Node-only P10B tests are not substitutes for this device workflow.

## 3. Published data and GitHub workflow

- Current code runs on GitHub Pages. The coach's phone encrypts a full `coach.enc.json` for the coach password and `team.enc.json` plus `team-<id>.enc.json` for active teams using their separate passwords, then writes to the **`data` branch** in one commit. The Pages build allows only role-valid encrypted data filenames. An archived team is removed from the **current published set**, not necessarily from Git history.
- GitHub publishing credentials are stored on the coach's own device. The fine-grained repository token requires **Contents: Read and write** and **Actions: Read and write** only for the required repository. Never disclose it in screenshots/logs. Rotate/revoke on suspected exposure.
- The app then dispatches the `Publish` workflow from its configured default branch. **A successful data commit can precede a failed workflow dispatch**; distinguish “saved on GitHub” from “Pages update finished.” Verify GitHub Actions and Pages availability separately.
- A GitHub `Publish` success proves build/deploy workflow completion, **not** browser decryption on an actual second device. For P10D test only with fictional records and explicitly authorised GitHub access.

## 4. Conflict between two devices

1. Use two independent test devices/browsers, both starting at the same encrypted remote revision, with a recorded `data` commit SHA.
2. Make **different fictional edits** on each; publish device A first. Device B should detect that GitHub's remote SHA moved and present conflict review before publishing.
3. Review record-by-record local vs remote differences. Where both changed the same match/session, explicitly choose the intended complete record; do not assume transparent merge or last-write-wins safety.
4. Preserve both independent encrypted backups, the original remote SHA, conflict screenshot with no private data, decisions and the final accepted SHA. Verify older seasons/jerseys and privacy do not disappear after reconciliation.
5. Do **not** bypass a conflict by force-pushing `data`, overriding a branch ref, clearing browser storage or replacing the coach copy. A retry without review is not an accepted recovery method.

## 5. Failure diagnosis and recovery

| Symptom | Safe operator action | Escalation/stop criterion |
| --- | --- | --- |
| Wrong coach password | Verify correct vault and role, password manager and keyboard; use a separately retained authorised known-good backup and its password | No brute force, magic recovery claim or unsecured override |
| Browser offline or no GitHub response | Preserve phone's encrypted local draft; reconnect; compare remote SHA before attempting publish | No local purge, no blind overwrite from stale device |
| Storage full / draft not saved | Export a verified backup; stop editing until safe storage/recovery route is confirmed | Never clear application storage as first response |
| Publish workflow not dispatched | Confirm `data` commit exists; inspect Actions token permission and default branch; authorised owner may retry Publish workflow | Do not re-publish or overwrite unreviewed remote data |
| Unexpected plaintext in `data` | Stop publication, revoke exposed secrets, investigate exposure; builder is designed to reject invalid unencrypted filenames | Incident-response review; published old history requires separate consideration |
| A player can view other teams or private medical/contact/WWCC records | Halt release; preserve sanitized evidence and mark severity critical | No P10 release until privacy boundary fixed and retested |
| Two-device conflict | Use explicit compare/reconciliation view on both synthetic states; preserve both snapshots | No automatic force-push or suppression of conflict warning |
| Browser UI regression on Safari | Record actual device OS/browser version, synthetic steps and screenshots, then open a corrective issue | PR Chromium PASS alone cannot close Safari defect |

## 6. Rollback and release approval

A GitHub Pages code rollback and an encrypted data rollback are **not** interchangeable. Restoring an old code commit can change UI behavior but does not restore deleted or overwritten coach data. A separate encrypted backup may be necessary. Git `data` history can retain ciphertext that old passwords still decrypt; no security or erasure guarantee follows simply from changing a password.

**Before any release:** require final P10D exact-head Node/Chromium and push main CI, real iPhone/macOS Safari P06–P09 acceptance, encrypted physical-device export/import, offline and two-device conflict review, and the owner's explicit final release decision. If a case is waived, log an individual waiver, reason, risk and owner in issue #52; do not declare the unperformed case PASS. Serious privacy, child-safety or destructive recovery failures are release blockers.

**Change control:** P10C is documentation plus a deterministic read-only migration design manifest, safe to revert without modifying app runtime. Do not migrate a production workspace or provision an auth/backend service within P10.
