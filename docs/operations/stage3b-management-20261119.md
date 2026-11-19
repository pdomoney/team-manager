# Stage 3B: Team management, shared authenticated workflows

**SOURCE ONLY.** Initial management production release remains blocked by L0–L6
and eight real-user journeys. All current migrations are applied only to
disposable CI PostgreSQL until the operator separately approves a real provider,
minimum permitted data, backups, version/schema preflight and rollback.

## Exact team member journeys

- **3B.1 Home:** Coach/Manager/Player receive only their selected team's
  upcoming schedule and published, audience-appropriate notices. Volunteer
  sees assigned duties and their audience's notices. Platform Owner receives
  no automatic private team data.
- **3B.2 Squad:** Coach or Manager approves a pending roster nomination for
  *team placement only*, with an optimistic revision. Club registration,
  financial verification, D17 provisional competition eligibility, transfers
  and official competition rules are not implied.
- **3B.3 Schedule:** Existing training editing and Player RSVP remain.
  Coaches/Managers create and reschedule **team-controlled** activities
  or friendly matches. Server tracks `management_origin` and denies
  attempted edits to externally controlled official fixtures.
- **3B.4 Attendance and availability:** Coach/Manager can mark roll-call for
  enrolled team players. Manager may transcribe a reply supplied externally,
  choosing phone/in-person/email; server records reviewer and timestamp.
  Later Player self-reply supersedes external provenance. No raw contact
  details are collected.
- **3B.5 Volunteer/match helper duties:** Manager can inspect exact-team duty
  board, classify non-accredited help (setup, equipment, scorer support),
  and withdraw assignments; volunteer still replies only to their own
  grant-bound duty. Trainer, first aid, match official and competition
  accreditation or temporary sporting delegation remain independently gated.
- **3B.6 Notices and Reports:** Coach/Manager creates a targeted notice draft
  and must publish it to its defined audience. Player/Volunteer cannot read
  drafts, publish or view another audience's notice. Reports show team-scoped
  sessions, RSVP, attendance and confirmed duties; totals for 1–4
  participants are suppressed. Per-person attendance is limited to selected
  Coach/Manager, linked from Schedule and Reports.

## Access and compatibility boundary

Existing tabs Home, Schedule, Team, Tactics, More remain preserved. Notices
appear in Home and More; Reports/Attendance are in More, while a practical
roll-call shortcut remains on each training session. No generic dashboard
or new sign-in model. Existing accepted Home club/team navigation and native
demo remain unchanged. Tactics is not newly developed here and stays
out of the initial management-only release acceptance; Stage 4 integrates
E5 after Stage 3 production rollout and stabilisation.

Stage 3B route: `/api/stage3b/v1/operation` through the existing Worker
verified-token, exact-role, same-origin and private PostgreSQL RPC contract.
SQL migration: `supabase/migrations/20261119050000_stage3b_management.sql`.
The schema has forced RLS for `team_attendance` and `team_notices`;
only Worker service role may call the transactional `tm_stage3b_operation`.
Each write has a unique mutation ID, SHA256 request digest, expected version,
append-only audit event and replay receipt. Reads have strict team/role scope.
No provider keys or private rows are committed.

**Qualification:** Node API/contract tests, disposable PostgreSQL
multi-actor journey and actual Chromium/Linux WebKit browser tests using
invented team records. Real iPhone/macOS Safari, approved individual
accounts, subscription plan, data/controller/privacy approvals, junior and
guardian rules, encrypted backup/restore, security qualification and owner
go-live signoff remain open.

**Deferred deliberately:** automated email/push reminders; WhatsApp/Snapchat
APIs (D15), official fixture/result publication (D06/D08/D19),
registration/payment and grace-period (D17/D21/D23), per-member contact
fields, certified/safeguarding roles, association/club admin expansion,
E5 plays (Stage 4). These are not silently marked complete by 3B.
