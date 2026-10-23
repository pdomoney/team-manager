# P07B — Current-workspace calendar projection

P07B extends P07A without changing the existing team match, training session, task, competition, season or encrypted publishing records.

## Delivery

- New pure `localWorkspaceCalendar(ws, {clubId,teamId,sport,from,to})` combines locally recorded **matches**, **training** and **volunteer duties/team tasks** into date/time sorted read-only entries.
- Coach Schedule → Upcoming includes a compact, responsive, six-week cross-team summary and a club selector when multiple clubs are present in the same encrypted workspace. The existing per-team agenda follows unchanged.
- Every match remains a coach-recorded entry; links are checked against the P07A fixture provenance model. A competition entry never upgrades a fixture to organiser-verified.
- Cancelled entries remain visible in the read-only projection. Original IDs, times, results, teams, RSVP, attendance, match staff, helper/task people and historical links remain stored only in their existing source records.
- The projection omits private person, medical, attendance, contact and qualification fields. Team duty titles may be coach-entered descriptions, so **the combined view is coach-only** and is not rendered to a player preview.
- Local `YYYY-MM-DD` dates and `HH:MM` clock times are displayed as entered; the app does not infer a source timezone or convert dates on behalf of another organisation.
- Existing collections currently have no trusted club-event feed. We do not invent event dates or official fixture authority. Additional separate event models and actual organiser verification require their own future scope and test gates.

## Boundaries and rollback

No schema migration, new per-person permissions, Supabase, external API, event import, writes or asynchronous actions. Revert this PR to remove the projection and section. All original records remain intact. No cross-account or cross-tenant exposure: the list includes only teams already stored in the active coach workspace.

## Evidence

`test/p07b-calendar.test.js` covers chronology, scope, privacy, cancellation, withdrawn fixtures, dates, historical safety and source immutability. `test/browser/club_ux_crop.py` checks mobile and desktop UI, club filtering, provenance warning and viewport width.

Formal P07 completion still requires P07C controlled revisions, P07D negative cases, real Safari/mobile acceptance, owner approval and post-merge CI for every scoped PR.
