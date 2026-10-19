# PR23: Club-first volunteer intake foundation

## Product decision
A volunteer is a person first, with independently reviewed club memberships, team allocations and qualifications. The PR22 team-first add wizard solved the sport-specific trainer issue but was not the long-term model.

## Three entry routes from Team > Match staff > Add person
1. Existing volunteer: select someone recorded in this encrypted coach workspace and link their existing ID to another club and optionally to a team. Never auto-merge names or query other club accounts. This is not a global user search.
2. Email invitation: compose an email through the administrator's mail application. The message is a personal enquiry. No user accounts, enrolment URL, delivery tracker or automated invitation exists yet. Team Manager does not mark any message sent.
3. Add manually: enter name and optional email, choose a club and optionally a team. A club-only record has no team or accreditation. If a team is selected, a separate sport-specific role/registration form is offered after saving the directory entry. No qualifications are assumed.

The club defaults to the currently selected team's club, or another club in the same coach workspace. The Match staff page can browse club directories; match staffing requirement rules remain tied to the actual active team.

## Model compatibility and privacy
- Keep matchOfficials and existing clubId, teamIds, roles, rolesBySport, registrationBySport, safeguarding information and historic match assignments.
- Add optional normalized email and additive clubIds membership, preserving older single-club records.
- Team match readiness still requires specific role, independent sport/season registration, team association, WWCC and required accreditation. Club membership alone never means ready.
- Email and all staff records remain private to the encrypted coach workspace and must not appear in player-facing copies.
- Workspace clubIds is not a multi-tenant authorization grant; future global identities need a secure backend and consent to share records across tenants.

## Not in PR23
User accounts, claimed profiles, global club search, invitation links or token delivery, multi-tenant access rules, authenticated registration checks and self-service enrolment. These require a backend. Do not imply that those workflows exist.

## Acceptance
Existing PR22 roles, legacy records and match allocations retained. Oztag never displays rugby league shirt categories. Manual volunteer can remain club-only and unqualified. Existing person linking retains ID without duplicating. Email route opens only a mail draft. Run unit and browser suites, vault/publishing privacy regressions and versioned build checks at exact PR head. Safari owner acceptance before merge, no auto deployment.
