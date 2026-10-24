# P10B — Encrypted data recovery, legacy identity and release regression

**Candidate input:** P10A merge [PR90](https://github.com/pdomoney/team-manager/pull/90) `26943e5ade1eaf2655bc176aec5821ba9236e4e3`.
**Change boundary:** Additive **test-only** synthetic recovery qualification with documentation; no production runtime, encryption, schema, remote storage or auth modifications.

## Purpose

Build an executable qualification layer across P04–P09 data-preservation boundaries:

1. Upgrade a fictional schema-3 two-club/two-team workspace deterministically to schema-4; verify no mutation of the source, retained IDs, link integrity, fixtures/results, player jersey/season state and repeated migration idempotence.
2. Encrypt and restore a **full synthetic coach workspace** with two teams, amended-fixture audit history, historic returned jersey and provenance-bearing shared play library. Compare full backup contents after independent repeated restores.
3. Reject wrong passphrase, malformed container, ciphertext tampering and attempts to relabel a coach archive as a player/team archive. Verify the still-valid encrypted archive is usable afterward.
4. Project a restored coach workspace into player-visible scope; verify that private medical/contact, volunteer, match notes/RSVPs and other-team data do not escape the projection or player's encrypted team copy.
5. Compare older and newer independent encrypted archives with conflicting edits; verify snapshot integrity. **Do not claim** this is proof of automatic conflict resolution, a multi-device synchronisation guarantee, live GitHub publication, offline restoration or a production backup restore.

**All test people, clubs, medical strings, phone strings, records and key material are fictional.** CI PBKDF2 loops use 1,000 iterations for test efficiency; the application's production 600,000-iteration policy is untouched. No real account, GitHub token or network request is executed by the tests.

## Qualification gates

- [ ] Exact-head Node full suite PASS (including five new P10B recovery tests)
- [ ] Exact-head browser full suite PASS, with synthetic test-library capacity check
- [ ] Owner review and manual merge
- [ ] Main post-merge Node/browser PASS and Publish PASS
- [ ] Separately execute and record *real* Safari/mobile, encrypted export / restore from real test devices, stale device conflicts, old backups and recovery failure modes during P10D. GitHub Actions alone do not satisfy these physical tests.

## Known limits and next work

These are model/crypto unit-level simulated recovery checks. They do not prove live browser IndexedDB/localStorage, GitHub data-branch permissions, real production encryption key iteration performance, a physical phone's decryption behavior or safe resolution of two devices writing the same remote revision. They also do not create/restore official fixture feeds or live compliance credentials.

P10C remains the separate migration-readiness and operating-runbook PR; P10D retains physical device acceptance and final stable release. Cross-tenant auth is post-P10 #55; the header persona switcher remains post-P10 #62.

Rollback: revert this single test suite and document; no data migration or production code alteration.
