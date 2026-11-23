# Stage 3D.5 | Unified connected management and release qualification

**Status: SOURCE CANDIDATE. NO LIVE DEPLOYMENT OR SUPABASE SCHEMA CHANGE YET.**

## Product acceptance / no artificial profile changes
The Product Owner's accepted November 23 behaviour supersedes the older D02 explicit active-role selector **for team navigation**:
- A person signs in **once**. Supabase returns independently approved, active, non-expired team grants; the Owner's platform grant is separate.
- Platform Owner automatically opens the Platform dashboard; an ordinary Manager/Coach/Player/Volunteer automatically opens their first authorised team. No profile switch, fresh login, or role dropdown.
- Club chips group authorised teams. A team chip selects the **exact team** and immediately changes the authorised navigation, records and actions.
- A person with Coach in Team A, Manager in Team B and Volunteer in Team C has the corresponding functions only on the selected team. A person with two grants for the same team sees the combined **eligible functions**, but **each individual operation carries one matching grant**. The server rechecks the latest grant and rejects foreign, forged, revoked, expired, registration-incomplete and wrong-role requests.
- Platform Owner views organisation administration, team status, invitations, approvals, verified-adult review, role activation/revocation. Owner authority itself confers no roster/contact visibility. Selecting an independently granted Coach team reveals Coach functions.
- Existing development-style team chip and desktop/mobile navigation is retained. The connected Home now shows actual selected-team sessions, squad placements, notices and actionable empty-state links, never fictional Comets data.

## Exact existing environment
- Supabase: `uyjxvaobshaahzipzzds`. The existing verified Owner account, `stgeorge-mixed20` St George Oztag Mixed 20 (2027), Coach grant and approved current adult policy are **preserved**. No owner/team/person creation SQL is part of this UI change.
- Cloudflare: **existing** Worker `team-manager`, origin `https://team-manager.paul-domoney.workers.dev`; no new Worker, Supabase project, auth provider, email system or storage location.
- Source baseline before Stage 3D.5: `5db7db0df5ebc5f5158fafd737a56030074c48a6`, merged PR #283. The owner subsequently confirmed actual login and two separate authorised contexts by screenshots; the precise installed Worker version, live asset hashes, rollback version and all host credentials have **not** been independently verified.
- Preserve the eight existing encrypted demonstration files, legacy `index.html`/`app.js`, accepted E5 plays. Do not import them as live St George records. Stage 4 Tactics/Plays remain deferred and hidden in the real first-team build.
- No migration is necessary for club/team chip selection: the existing `tm_my_team_context`, `tm_my_operator_context` and exact-team Worker operations are reused. Do **not** manufacture a Supabase migration simply to show a deployment.

## Implemented source changes
- `site/cloud-team-contexts.js`: pure grant grouping, duplicate collapse, conflict denial, per-operation matching role, visible navigation.
- `site/cloud-team.js`: automatic Owner/team landing, club/team chips, use per-action role, preserve no-data-on-Owner scope, embedded Owner review/invitation workflow, management Home action cards and richer team navigation.
- `site/cloud-team.html` and `site/cloud-team.css`: existing brand and navigation restored as desktop sidebar + mobile tabs. Responsive accessible chips, 44px touch targets.
- `test/stage3d5-team-contexts.test.js`: normal and adversarial grant matrix, same-team multi-role and foreign-team denial.
- `test/browser/stage3d5_team_chips.py`: synthetic Owner/Coach/Manager/Volunteer journeys on mobile and desktop, exact server role per operation, invitation issue, no cross-team leak. Existing Stage 2 and 3D.4 browser expectations updated for owner/team landing.
- No real user data, production credential or policy approval evidence added to source.

## Acceptance gates
1. Source branch rebased/merged from verified latest `main` without unrelated changes. CI Node, isolated PostgreSQL, Chromium and WebKit must all PASS at exact feature head. Browser simulation alone is **not** physical iPhone Safari acceptance.
2. Confirm connected package from the **merged SHA** via `scripts/stage3d3-existing-worker-build.mjs` and `scripts/stage3d3-existing-worker-release-check.mjs` plus the owner-approved Stage 3D.4 Worker target configuration. Before installing, verify actual installed Worker version, secret bindings by **name only**, encrypted-demo hashes (all eight), rollback candidate, backup state and no conflicting host build. Do not repin or overwrite protected hashes.
3. Deploy to the existing Worker only after all release preflights and a release-qualified PR merge. There is **no new Supabase schema deployment**: keep the already active current policy and grants unchanged.
4. Live owner acceptance: one login defaults to Platform, full invitation controls, click St George team chip and manage Coach-only activity; Manager invitation and acceptance then Manager direct login into correct team; Volunteer duties, Player self-availability, Coach/Manager/Volunteer across separate teams, same-team multi-role, revocation and wrong-team denial. Empty-state UX, desktop/iPhone Safari and documented rollback.
5. A verified adult Manager or Player is **not** the same as a minor/guardian record. Under-18, emergency/medical details, play distribution and unapproved free-account play reuse remain blocked by their separate privacy/safety gates.

## Caveat about parity
This change restores management navigation and currently implemented **connected** operations, but does not turn every fictional/development-only feature into a live backend. In particular, unsupported legacy competition/event features, rich roster details requiring additional approved personal-data schemas, and Stage 4 Tactics remain unavailable. Do not claim full legacy/production parity or a complete multi-club Owner API without implementing those backend contracts.
