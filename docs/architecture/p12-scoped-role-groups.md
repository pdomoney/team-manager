# P12A/B — Approved scoped groups, roles and memberships (synthetic foundation)

Status: **owner-approved architecture**, proposed implementation in draft PR; **not production permissions**.

Tracking: [P12 issue #124](https://github.com/pdomoney/team-manager/issues/124), related [#35](https://github.com/pdomoney/team-manager/issues/35), [#55](https://github.com/pdomoney/team-manager/issues/55), [#31](https://github.com/pdomoney/team-manager/issues/31).

## Core model

1. A **Person** is a sporting participant. A future **Account** is a separately verified login mapped to that person; juniors do not need an account just to participate.
2. A **Group/Resource** identifies `personal`, `association`, `club`, `team`, or one `fixture`; a group has a stable ID. Sport, season and competition can qualify the resource context and official participation.
3. A **Membership** records a person's relationship with a group (member, player, helper, staff or guardian). Membership is not itself permission to read private records or administer anything.
4. A **Scoped role grant** records the identity/account, the role, exact group ID, approval state, approver and validity dates. Each grant is independent.
5. **Sporting appointments** (coach, trainer, helper, manager, scorekeeper) and qualifications/registrations are distinct from access roles. A coach appointment does not create a login permission.
6. A **Temporary Match Appointment** refers to one fixture, an appointed sporting duty, an optional replaced staff member and independent approval/qualification status. It must not alter permanent grants, silently prove accreditation or double-count required staff.

**No implicit privilege inheritance:** association admin does not gain child club or team rights; club admin does not gain team roster rights without an explicit grant; player and trainer membership do not imply private record access. Parent/child topology and affiliation are organisational information, not a source of automatic authorisation.

## Model responsibilities and files

- `site/role-model.js`: existing P02 legacy simulator, unchanged for compatibility.
- `site/p12-role-groups.js`: new P12 pure data and explicit-scope synthetic decision primitives. May be imported by future QA fixtures, but **not by production app permission gates**.
- `test/p12-role-groups.test.js`: deterministic acceptance/negative matrix covering QA-18 multi-role, cross-club restrictions, expiry/revocation, unknown grants, fixture staff, medical-data failure-close and zero mutation.
- No changes to `site/app.js`, `site/model.js`, real encrypted workspace, public club catalogue, publishing, team IDs or schema.

## QA-18 sample: one person, independently scoped assignments

| Role / relationship | Target | Expected |
| --- | --- | --- |
| Association Viewer | Association East | Read only relevant association information; no club administration |
| Club Administrator | Rangers (Club A) | Club A configuration only; does not infer Club B |
| Coach | Rangers U16 (Team A) | Team A rosters/tactics, not unrelated teams |
| Team Manager | Comets Mixed (Team B) | Team B fixture/staff operations, not its club administration |
| Helper membership | Comets (Club B) | Membership is not an app grant |
| Player membership | Comets Mixed | Personal sporting participation, not other player records |
| Trainer appointment | Match A | Requires separately verified sport and match requirements; no automatic app grant |

## Match-day substitutions — approved concept, not yet implemented enforcement

- The same person **may be registered as Coach and Trainer** for relevant sport/season/competition. Registration, appointment and qualification must be verified separately.
- If an existing Trainer steps in as Acting Coach, create a fixture-bounded acting-coach proposal without modifying their permanent Team/Club role. If a mandatory safety staff position is vacated, propose an independently eligible replacement.
- A Team Manager may be proposed as a fixture Trainer; their management role remains in history, but conflicting active duties need resolution.
- When an approved competition policy requires distinct people in simultaneous required duties, one multi-qualified person must not count twice.
- The current module **only creates pending, unverified fixture-duty proposals**. P12F must implement approved policy-source-aware eligibility, coverage and overlap checks, and require appropriately authorised human confirmation. Never hardcode a universal NSWRL, Oztag or Touch rule based only on a role label.

## Sequence

P12A/B: pure model and deterministic tests (this PR).
P12C: synthetic multi-person/context profile switcher.
P12D: synthetic disposable workflow fixtures and UI wiring.
P12E: governance/approval/audit/expiry test harness and real Safari/VoiceOver manual acceptance.
P12F: fixture-level temporary role substitution and verified competition policy constraints.

## Explicit release safety

GitHub Pages remains a static app with the existing encrypted coach workspace and shared legacy access modes. Local simulated permissions cannot prevent a malicious browser or forged API request. Production multi-tenant identity, tenant isolation, parent/guardian proofs, personal-data permission enforcement and a chosen server/database remain deferred to independently approved #55. There is no Supabase requirement or migration in P12.

**Merge gate:** owner review, exact PR-head Node + full Chromium green. After merge, exact merged-main Tests and Publish must be checked separately. A successful unit test does not establish actual registration, licensing, competition eligibility or Safari device results.
