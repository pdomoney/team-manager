# D3E batch reviewer handoff (Issue #120 / #99)

This package composes the existing exact-ID D3C packets into an offline, bounded set of up to 30 independently reviewed **research candidates**. It does not update the public directory, certify current club affiliation, approve any rights/terms, grant club administration privileges, or touch an encrypted workspace.

Use `node scripts/prepare-directory-batch.mjs --ids rlc_c4d2672383f09c,rlc_1004b6ffaa6d1e --json` to produce a review-only JSON report on stdout. IDs must be exact public research IDs; never pass a coach data path or private person records. The output contains groups by state/sport and separate blank human review decision templates for each candidate. Use D3A dry-run tools only after independently validated source, rights, identity and owner decisions are documented.

The `inspectDirectoryBatchDecisions` helper lists incomplete fields; even fabricated 'complete' text **never** returns publication permission. Separate authorised human/legal source-rights assessment, governing-body current club verification, record-level approved diff and real-device testing are prerequisites to any production update. Candidate counts/progress in #99 remain unchanged until those gates actually pass.

Acceptance: run Node tests and existing browser suites, confirm a valid two-sport batch yields zero writes, malformed/duplicate IDs fail entirely, absent/forged fields never count as approvals, and no new public club assets, logos or source material appear in the app.
