# P07C — Controlled fixture amendments, history and linked duties

P07C is an additive, coach-only workflow for schedule revisions in the **existing encrypted GitHub Pages workspace**. Existing local matches and competition entries remain the source of truth for the coach, *not* authoritative organiser feeds.

## User workflow
1. Open an existing match and select **Edit match**.
2. Change date, start time, venue, field or status. Enter a reason (3–200 characters). A normal notes/opponent edit without schedule changes retains the legacy simple save flow.
3. A **Review fixture change** sheet presents a before/after comparison, the coach-recorded reason, and warnings about existing results, lineups, confirmed staff and RSVPs. **Cancel** leaves the match untouched.
4. On **Confirm fixture change**, linked tasks trigger the existing explicit choice: move tasks with the fixture; or keep on the old day and unlink. Cancellation can keep the tasks or mark them cancelled, never silently delete historical tasks in this new workflow.
5. A confirmed revision appends a coach-only `fixtureRevisions` entry containing before/after scheduling snapshots, locally recorded reason, UTC timestamp, and linked task disposition. Source is always `local-coach-workspace` and must never be presented as organiser verified. No messages/invitations are dispatched automatically.
6. Reopen **Edit match** to view recent history. A new revision preserves match ID, season, competition entry link, results, lineup, crew, player RSVP, and other original records; staff and availability must be rechecked manually.

## Protection and limitation
- Invalid dates, 24-hour clock times, unknown status, missing reason, stale reviewed snapshot, and destructive linked task removal are rejected before any match amendment.
- The result of a completed match is **not erased** when its fixture dates/status are corrected. The operator must review contextual consistency manually.
- The current source of official fixture changes, third-party approvals and external feed verification are **not** present. Coach-entered statements about an organiser do not become independent confirmation.
- Coach-only history is kept within the encrypted workspace. The existing `site/vault.js` team/player projection explicitly whitelists public match fields and does **not** include `fixtureRevisions`, reason, coachNotes, crew or RSVP.
- Preexisting edits made through other specialist workflows (e.g. result entry) are still separate. P07C records amendments made through the existing **Edit match** form. P07D acceptance must check these boundaries and cross-device collisions.
- The existing linked-task action may still permit task deletion in other, older delete flows, but the P07C fixture-revision route never offers deletion and explicitly rejects it even if forged.
- No data migration is needed. Existing fixtures have no revision log until their next controlled edit. Rollback means reverting these new additions without altering existing matches or their IDs. Undo is a **new explicit revision**, not a silent history edit.

## Acceptance
Synthetic Node cases validate explicit confirmation, stale previews, status transitions, cancelled fixtures, preservation of roster/history, privacy export and input validation. Browser `m4_matches.py` validates before-confirmation no-write, linked task disposition, and two recorded amendments. Real Safari device testing and owner phase acceptance remain later gates.

P07D, P06 closure and any authenticated association-level tenancy remain separately tracked.
