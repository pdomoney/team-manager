# PR300 Match Day operations — source candidate, not installed

Approved 26 November 2026: complete the PR299 scope in one consolidated block; Head Coach approves sporting decisions; Manager and Assistant Coach record events; first target 2027 NSW Senior State Championships Mixed 20. Do not deploy PR299 separately. Accepted production is PR297/298, owner 16/16. The 2027 organiser-specific rules remain unverified.

## Connected functionality

- Existing Schedule → Match Day and exact team context; current squad and availability reconciliation; match-day venue arrival recording, Player own check-in, corrections and history.
- Additive private rule, match-record and event tables. No profile seeded, no browser rule activation, no change to prior migrations. Explicit approved competition-version profile, linked fixture and current published squad required for sporting writes. A reviewed future activation migration must include exact organiser evidence, owner approval, source checksum and a supported format. No inference of category, eligibility, extra time, forfeit, bonus-box or ladder rules.
- Starting lineup draft by Coach/Assistant; explicit Coach confirmation publishes lineup. Team clock, score events with server-derived points, interchange and playing time, correction by append-only void, Coach finish/approval and Coach/Manager publication, Coach reopen with reason. Player reads approved lineup names and published aggregate only. Competition summaries use published current fixture results, distinguish cancelled/ambiguous/unpublished; no official ladder or finals progression inferred. Existing manual WhatsApp composer rechecks match revision and publication.
- Rules-independent arrival records may be written on fixture date. Arrival, squad selection and sporting eligibility are distinct. All new data is service-only and exact-team scoped; no new roles or permissions elsewhere.
- Supported engine format is standard try periods only. Extra-time/drop-off, forfeits, non-try scoring, numerical field positions and official ladder progression are explicitly not enabled or guessed. Confirm actual organiser rules before deciding whether extensions are required.

## Release

Use config/releases/pr300.json as the accepted baseline and additive transition contract. The new forward_release_plan.py and forward_release.py reuse existing archive, transport, catalogue, backup, asset and browser helpers without editing prior controllers or repinning historical evidence. The controller is reusable for later reviewed additive releases using a new explicit spec; it fails closed on any old schema changes or new relation mismatch. Source CI alone does not verify archived local helpers or live compatibility.

1. Exact candidate CI and visual artifacts. Prepare candidate plan locally with pinned prior accepted installation evidence and exact remote branch, Git ancestry and migration hashes. Qualify on the existing Mac with the previous helper archives, PostgreSQL 17 and libpq 19; no provider access or restore.
2. Only after candidate qualification, use a normal merge preserving exact candidate tree and parents. Prepare merged plan with exact candidate, PR and post-merge CI.
3. Use the same controller install mode to recheck live baselines, request explicit visual/maintenance/install approvals, create one fresh backup, apply only the additive migrations with old row/schema guards and empty new tables, deploy once, verify all assets and the expected anonymous denial. Separate preflight mode is optional; verification mode never deploys.
4. A failed provider checkpoint must be reconciled, not retried. Browser attestation uses the same strict installed-version and nonce checks as PR298. No historic exception is transferred. Owner functional acceptance follows separately.

No live provider actions or rule activation authorised by this document.

## PR301 release-only sequencing correction

The accepted PR297/298 baseline and PR300 application source remain unchanged. Qualification may occur before the application PR merges or after its exact normal merge, without provider writes. A post-merge qualification plan binds the application candidate, merge parents, equal tree, all three application CI runs and actual current main. If main is an approved separate control merge, its contract must pin the application identities and exact release-only paths; verify both merge parents, equal control tree and three additional control CI runs. No arbitrary later main, squash merge, data drift or application change is accepted. `config/releases/pr300-control.json` is the reviewed PR301 contract. `forward_release_run.py qualify` creates one private qualification handoff; `preflight`, `install` and `verify` use that same handoff and do not regenerate an existing merged plan. Install remains separately authorised. No previous controller or historical evidence is rewritten. The controller still builds PR300, not PR301.
