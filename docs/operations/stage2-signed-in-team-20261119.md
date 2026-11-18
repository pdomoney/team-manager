# Stage 2A–2E: signed-in team workspace (19 November 2026)

**SOURCE REVIEW CANDIDATE ONLY. Draft PR #267, not merged, installed or owner accepted.**
Base main \`6b3dbcd08ff963033f771fd225be0f6406766d34\` from PR #265.
The original Home/Schedule/Team/Tactics/More encrypted demonstration, Home working
team selector, role QA previews and accepted E5 editor/Watch, diagrams, paths,
timing, Quick Look, Undo/Redo, field artwork and legacy encrypted publishing
remain unchanged. The new cloud route is separate.

## Stage 2 user-visible functions

- **2A | Identity and context:** One Supabase verified login can hold an independently
  approved \`platform_owner\` grant **and** an exact team \`team_coach\` grant.
  These are distinct records. With several grants, the user must choose one
  active role and exact team; roles are never pooled. Revocation is rechecked
  before every cloud operation. Owner mode is read-only and has no team private
  data or automatic role assignment. Stronger MFA/step-up will be required
  before actual privileged operator functions are introduced.
- **2B | Home/Schedule:** Authorised Coach, Manager or Assistant can create,
  change and cancel training; Player sees only own RSVP alongside team
  session details and can reply Yes/No/Maybe. Optimistic versions, server replay
  receipts and atomic audit are inherited from Stage 1.
- **2C | Squad/duties:** Coach/Manager can record pending player nominations,
  see status and withdraw; cannot claim registrar verification or sporting
  eligibility. Manager can assign independently verified volunteers to a
  scheduled team duty. Volunteers see and respond only to their own duties.
- **2D | E5 plays:** Coach/Assistant can import an existing authored E5 JSON
  play into a private draft and amend teaching text without rewriting
  geometry/event timing. Only Coach can publish a selected reviewed revision;
  Players and explicitly granted Play viewers receive published projections
  only, with an E5 top-level field allowlist matching the original team export.
  Server validates authored event timeline before sending it to Player.
  Revisions use optimistic versions, exact scope, once-only mutation receipts
  and audit. **Important acceptance gap:** the cloud play presentation is a
  read-only *authored field preview*, NOT the existing full E5 Watch renderer,
  nor is the full advanced diagram editor cloud-connected. The existing editor
  remains authoritative, unchanged, and can work with local demo data. The
  Stage 2 PR is NOT full E5 editing acceptance until that integration is
  completed, reviewed and physically tested.
- **2E | Account and interaction:** Existing brand tokens and five section
  labels. Signed-in account identity, explicit role choice, refresh, sign-out,
  error, conflict and offline-not-saved messages. No encrypted demo data
  becomes a shared cloud record automatically.

## Data boundary

- Cloudflare Worker \`worker/index.js\` routes only trusted \`/api/stage1/\`
  and \`/api/stage2/\` operations. Other requests pass to the existing
  static asset binding. Never put service-role keys in \`site/\` or Git.
- \`worker/stage1-api.js\` and \`worker/stage2-play-api.js\` verify an
  individual bearer with Supabase Auth, then call service-role-only RPCs.
  The database authorises the verified account and *selected* exact team
  grant for every operation; no browser or operator grant can make itself
  a team grant.
- The schema migration filenames are:
  \`20261118010000_first_team_private_foundation.sql\`,
  \`20261118020000_first_team_my_context.sql\`,
  \`20261118030000_stage1_team_operations.sql\`,
  \`20261119010000_stage2_operator_context.sql\`,
  \`20261119020000_stage2_play_revisions.sql\`.
  All migration files are **source only**; no live target has been touched.
- **No initial owner grant is auto-created.** A separately approved operator
  must provision the verified account and independent, non-self approved
  operator/team grants after authorisation and real environment qualification.
- Direct \`anon\`/\`authenticated\` private table privileges remain denied,
  forced RLS is retained and all SQL trusted mutations remain service-role-only.

## Reproducible tests

- \`npm test\` includes prior Node coverage plus \`test/stage2-cloud.test.js\`:
  operator/Coach single account, denial and redacted API, browser-owned
  publishable key only, source bundle, prior demo and role isolation.
- \`.github/workflows/test.yml\` uses disposable PostgreSQL 16 and
  \`supabase/tests/stage1_bootstrap_disposable.sql\`, then applies the five
  migrations in order, two foundation ACL suites and both Stage 1 and Stage 2
  fictional cross-client journeys. Both transaction journey scripts end in
  \`ROLLBACK\`. No linked Supabase service or personal data is accessed.
- \`python3 test/browser/stage2_cloud.py\` is included in the existing
  Chromium full suite with mocked accounts and APIs. It exercises explicit
  Owner/Coach switch, Coach training persistence, Player own availability,
  draft/published separation and assigned Volunteer response.
- Original Chromium and WebKit E5/precision/touch regression remains mandatory.
  Record exact final-head SHA, run IDs, job totals, failures and skipped paths.

## Separate release authority and genuine user tests

The existing cloud identity preview is deployed as static assets, but neither
SQL migration nor API secret/production installation has been verified here.
Do not install, enable service secrets, enrol real people, migrate encrypted
files, enable production registration, import youth/guardian/health information
or change the live GitHub data branch without separate written owner
authorisation, data-handling approval, installer/schema preflight,
version-frozen backup+rollback and real host validation.

L0–L6 release gates remain HOLD, as do the eight real account/team/play user
journeys, supplier and controller decisions, D21 retention, minors/guardian
safeguards, independent full P13 server security tests, historical Git risk
and genuine iPhone/macOS Safari+VoiceOver+two-device acceptance.

The accepted **24-hour recovery point tolerance** is not a performed restore.
The conditional first-team 29 November target does not waive any gate.
