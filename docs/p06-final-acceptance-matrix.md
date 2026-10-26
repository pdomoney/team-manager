# P06H — Final workflow and negative-case acceptance matrix

**Scope:** P06 issue #48, current trusted coach-owned GitHub Pages encrypted workspace. This is a regression and data-safety corrective, **not** a new login/role permission system, governing-body verification feed, or production association roster.

## Automated evidence to require on exact PR head

| Scenario | Expected | Evidence |
|---|---|---|
| Rugby League trainers versus Oztag/Touch | Yellow/green/blue/orange are league-specific; no cross-sport role inheritance | `test/p06h-negative-cases.test.js` |
| Unverified or expired WWCC/accreditation | Cannot mark fixture covered; qualification action raised | P06H Node cases |
| External revocation | **Unknown** without official integration; coach must mark status unverified and re-check with governing body | Node negative case + manual limitation |
| Inactive assigned staff | Remains in history, is ineligible for new coverage and prompts availability review | Node + `match_crew.py` |
| Deleted volunteer with match/appointment references | Hard-delete blocked, even if appointment ended; deactivate instead | P06H Node + mobile/desktop browser |
| Unknown assigned person | Historical match remains, explicit missing-person action raised | P06H Node |
| Overlapping confirmed fixtures | Both affected fixtures flagged; separate dates not falsely flagged | P06H Node |
| Distinct staff minima | Cannot count one volunteer for two mandatory roles | P06H Node |
| Unknown sport/season/competition policy | Unverified; never invent requirements | P06H Node |
| Parent also recorded as helper | Historical helper task remains; never auto-merge by matching a name | P06H Node; identity unification explicitly outstanding |
| Club scoping | No outside-workspace club access; no personal data in aggregate | P06G tests |
| Unauthorised viewer | Existing player-preview hides private crew roster. This is **not** an authentication boundary | `match_crew.py` + post-P10 #55 |
| Offline and legacy backup | No schema changes; earlier encrypted workspace and merge regressions remain | Existing P04/P06F suites |

## Required manual product-owner acceptance

- Verify a real representative club's current sporting-body rules independently for Rugby League, Oztag and Touch, including any age/grade/season distinctions. Do not treat test fixture rules as official.
- On mobile Safari and desktop Safari, open match-day staff, club readiness, appointments and multi-club overview; switch teams and sports; ensure no horizontal overflow, hidden fields, trapped focus or incorrect badges.
- Record acceptance of volunteer deactivation with an **already confirmed future match** and an **ended appointment**. Confirm historical assignments and organisation records survive; explicitly reassign future staff.
- Test a real parent/helper who also volunteers. The existing helper ledger is separate; the app must **not silently identify the person by name**. Confirm task/transport/BBQ history remains intact.
- Independently confirm revoked or lapsed credentials with the governing body and manually update status. The app does **not** poll revocation feeds or issue an official clearance decision.
- Check that a viewer without coach editing privileges cannot access private volunteering UI in the existing preview. Production enforcement across organisations is deferred to post-P10 #55.

## Release gates

- Exact-head Node and browser regression pass at recorded SHA; publish/backup checks as applicable.
- No acceptance of P06 issue #48 simply because PR76 merges; capture the real Safari/manual results and explicit product-owner acceptance first.
- No Supabase migration, new identity provider, external invitation dispatch or persona selector in this PR.
