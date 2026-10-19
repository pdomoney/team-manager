# Architecture stabilisation: publishing credentials and team setup reuse

**Status:** Development candidate on `fix/architecture-stabilisation-credentials-team-setup-20261019`; not merged or accepted.
**Base:** `main` at `6d62e83d2a1d67db2698c7aa1da4cb9ca5a8fd38` (PR #15 merged).
**Type:** Additive security and reliability correction; no schema/encryption format change, live publishing or data migration.

## Findings and bounded corrections

### GitHub publishing token

The app previously wrote the entire GitHub publishing configuration, including the bearer token, to durable browser `localStorage` unconditionally. The publishing form also echoed the existing token into a password input's HTML value.

A new `site/github-settings.js` module owns credential retention: the token defaults to `sessionStorage` for this tab's browsing session, while non-sensitive repository preferences remain in `localStorage`. Older stored tokens are loaded once then removed from durable settings on application startup. The settings screen never pre-fills the token field, retains it when the field is blank, offers a removal action, and explicitly lets a coach opt in to longer retention **on a trusted personal device**. The opt-in is not enabled by default. Without a token, encrypted edits remain locally and require reconnection before publication.

**Limits:** Session storage is still readable by scripts running in the app's origin. This is a risk reduction, not a substitute for preventing XSS, limiting token scopes, using trusted devices, protecting browser profiles and revoking compromised credentials. Previously exported browser backups are outside this migration; old GitHub Pages and repository history remain unchanged. No GitHub account or data branch is changed by this candidate.

### Team setup reuse

`site/team-setup.js` centralises the safe copy-field allowlist and the same-club/effective-sport guard for **both** explicit settings reuse and optional shared-library imports. A coach may still create a blank team in another club/sport, and library imports remain opt-in. Players, staff, contacts, passwords, jersey/season history and competition identity are excluded from the allowed copy fields. This does not add individual-coach permissions to the shared workspace.

### Incremental module extraction

The UI and orchestration still live in `site/app.js` (approximately 6,000 lines). This release extracts the credential persistence policy and team-template policy as independent modules rather than performing a high-risk controller rewrite. `src/build.js` version-stamps the new module imports to avoid stale-cache mixtures during a Pages update.

Subsequent low-risk extractions, each with its own PR and complete regression gate:
1. Separate pure form validation and initial-value construction from UI rendering for club/team/player forms.
2. Separate jersey screens from jersey history rules while preserving existing `jerseyCorrections` and `jerseys`.
3. Isolate publish orchestration and three-way conflict UX only after actual authenticated GitHub publishing acceptance.
4. Move tactics and SVG editor rendering last; it has the broadest regression surface.

Do not rewrite `model.js`, alter schema or encryptions, change login models, introduce a server or modify existing team/season/player IDs in this stabilisation series.

## Qualification gates

- Run `npm test`, including new `test/github-settings.test.js` and `test/team-setup.test.js`.
- Run all browser suites with synthetic GitHub, including `fresh_team_setup.py`, `live_publishing.py` and 30/60/100-photo capacity tests. Verify no JavaScript exceptions, cross-club/sport library-only rejection, session-only token migration, repeat publishing and conflict resolution.
- Review the exact PR head and recorded GitHub Actions evidence; passing CI is not by itself an owner sign-off.
- **Manual acceptance still required:** real macOS/iOS Safari storage behaviour, closing/reopening Safari after token expiry, deliberate long-term credential opt-in on a trusted device, recovery from encrypted backup on physical devices and genuine authenticated GitHub publication with approved test data.

No merge, deployment, live team-data edits or production credential testing without owner approval.
