# P02 — Existing-app identity and role-model foundation

**Phase:** [P02 Issue #44](https://github.com/pdomoney/team-manager/issues/44) · [Master Roadmap #41](https://github.com/pdomoney/team-manager/issues/41)  
**Base:** P01 accepted merge `b5fd4e3f0a399808347e72f2b86ba7d3003ee579`.  
**Status:** Design and synthetic model candidate, **not owner-accepted or merged**.

## 1. The operating boundary we must preserve

The existing Team Manager is a trusted single-coach workspace with a shared coach password, per-team player views and encrypted local drafts/GitHub data-branch publishing.

**No Supabase, identity provider, remote database, API, real invitation delivery or new login is introduced in P02.** We will not install or configure a backend until at least P10 has been completed, and then only through separately approved [post-P10 Issue #55](https://github.com/pdomoney/team-manager/issues/55).

A hypothetical `RoleGrant`, `Account` or `Person` in P02 is a model, **not an authenticated session** or a right to browse another club's records. There is no safe client-side implementation of independent club tenant boundaries. Existing sharing and exports remain governed by today's encrypted workspace, and private junior/contact data must remain within the coach view.

## 2. Code scope

- [site/role-model.js](../../site/role-model.js): **pure, non-wired model** of future access-role definitions, scope matching, proposal creation, invitation drafting, and a clearly labelled **synthetic decision simulator**. There is **no import of it in the running app**. No storage, fetch, authentication, mail, side effects or cryptographic functions.
- [test/role-model.test.js](../../test/role-model.test.js): fictional role/club/person samples, deny-by-default policy simulations and regression proof that invitation drafts do not grant access.
- Existing [site/app.js](../../site/app.js), [site/model.js](../../site/model.js), [site/vault.js](../../site/vault.js), [site/github.js](../../site/github.js) and [src/build.js](../../src/build.js) are unchanged.
- A future P02 follow-up may provide **non-interactive/synthetic concept previews** for layouts, but do not expose real role-grant buttons or independent organisation login.

This initial P02 candidate intentionally starts with **definitions + tests**, not a security feature. More work, tests and explicit acceptance may be needed before P02 closure.

## 3. Model separation

| Object | Current-app P02 representation | **Not** implied |
| --- | --- | --- |
| Account | Future account ID in synthetic fixtures | Real sign-in or identity verification |
| Person | Existing local player/helper/crew/official records remain authoritative | Automatic equality based on name/email/phone |
| Membership | Future club/association membership facts | Authorised read/write access |
| Access RoleGrant | Proposed role and exact scope, separate from job | Activated remote permission |
| Sporting Appointment | Head coach, manager, match trainer, secretary, BBQ helper, guardian relationship candidate | Authentication or eligibility |
| Sport Qualification | Accreditation/registration status and evidence managed by sport | Administrative capability or live match attendance |
| Guardian Relationship | Future verified child-specific authority | Helper link or contact implies child access |
| Licence/Subscription | Future entitlement model (P03) | Access to private club records |

## 4. Context and capabilities (proposal)

Every access proposal has an explicit `scope.type` and `scope.id`. No right propagates from a league to a club, from a club to its teams or between two teams **just because of naming, hierarchy or licence purchase**.

| Future account role | Required scope | Illustrative permitted operation in *synthetic* model |
| --- | --- | --- |
| Personal owner | personal workspace | Manage private play library |
| Association administrator/viewer | association | Association directory, affiliated club proposal management and aggregate compliance |
| Club administrator/support | club | Club administration or limited club view |
| Team coach | team | Team roster, training and tactics |
| Team manager | team | Team roster, schedule and match staff; not necessarily tactics edit |
| Team viewer | team | Team published activity |
| Guardian, player, helper, match trainer | Specialist relationship or appointment, **not an access grant by default** | Future permissions must be separately designed and verified |

Club-wide visibility of its authorised teams is a future backend-owned relationship-policy rule, not automatically assumed by a scope string. Exact-scope checks in the simulator are intentionally conservative.

## 5. Representative journeys (design, not running account workflows)

### Association-owned licence
Association admin uses an approved association context and sees the approved club register and aggregate event/compliance data. Real access to different clubs' private participant data will require independently scoped permissions and server-side checks **after P10**. No association-wide coach workspace is automatically created from the subscription.

### Club-owned licence
Club admin sees their own teams and staff in a future authenticated club view. Within P02–P10, only the existing trusted coach workspace can display multi-team data; proposed club role labels are design/test data, not active security.

### Independent coach/manager
One trusted operator may already switch among teams/sports/clubs **within their own existing encrypted workspace**. The future person/account design must allow independent, revocable team-role assignments without wiping personal coaching content.

### One person employed/volunteering across clubs
One Person may hold coach, manager, trainer or executive appointments simultaneously. Each future access right requires a separate authorised scope; revoking club A access must leave club B appointments and personal library intact. No identity linking or cross-club people lookup in P02.

### Junior guardian
A helper who has a text relation to a child is **not** an approved guardian. P04 will model guardian relationships while preserving helpers; real child-specific access must wait for verified identity/authority and backend enforcement after P10.

## 6. Proposed invitation lifecycle (not live)

1. Owner selects a club/team context and desired future access role, with sponsor and purpose.
2. `prepareInvitationDraft()` creates **only an unsent draft**, with `sent:false`, `accepted:false`, `accountId:null`, `roleGrant:null`.
3. In the future backend, a verified club admin may issue an invite, recipient verifies identity, owner approves, an immutable audit logs the action and only then may an active scoped grant be issued.
4. Revoke/expire must be enforced by the server. A local draft status or change of UI role cannot revoke actual access in the current prototype.

No email action, invitation link with credentials, invite token, user search or cross-club join operation is introduced here.

## 7. Demonstrator limitations and security notice

The synthetic policy function `simulateGrantDecision()` accepts in-memory inputs from its caller, including `approvedBy`. Therefore an attacker could forge inputs and obtain an `allowed:true` result. That is **expected** for a design simulator and absolutely **not** acceptable as an access-control implementation.

**NEVER:** wire this simulator to real UI gating; use it as an authorisation middleware; use returned `allowed` for sensitive data export; advertise it as a validated privacy boundary; permit an admin/team/guardian user to browse another person's encrypted workspace.

**Until post-P10 #55 is accepted:** production access remains the existing shared-password prototype; independent tenant-level organisation/guardian accounts are unavailable.

## 8. Test plan and acceptance

| Test class | Required proof |
| --- | --- |
| Existing Node suite | No regression to P00/P01, sport roles, person links, seasons, jerseys, clubs, tactics, vault |
| Existing browser suite | All current app journeys remain unchanged, including publishing and mobile-style checks |
| Synthetic model tests | Valid and invalid scopes/roles, dual-club roles, association not inheriting club rights, revocation/expiry, no implicit club-to-team grants |
| Role separation | Match trainer, club secretary, parent/guardian and coach appointment alone do not confer login or admin |
| Invitations | Drafts never create accounts, mail, grants, tokens or acceptance |
| Privacy | Every sensitive synthetic record category is blocked in this simulator, even for an otherwise valid general role; actual access pending backend |
| Manual review | Owner acknowledges no real login, grant enforcement, guardian self-service or Supabase is implemented |
| Merger | Exact-head CI, explicit owner acceptance, merged main and post-merge workflow verified |

## 9. Rollback / future handoff

No persistent records, app routes, encryption formats or schema have been modified. Rollback is deletion/revert of the new **unused** role-model module and its test/doc; no user-data migration is required.

P03 may use the vocabulary to model association/club and subscription metadata **without wire-up of live user permissions**. P04 handles user-confirmed person linkage. P10 accepts the consolidated existing app. [Post-P10 #55](https://github.com/pdomoney/team-manager/issues/55) implements verified individual identity, invitation acceptance, backend permission enforcement and data migration only after a distinct approval.

**No change to the existing coach/password user interface is asserted by this PR.**
