# Contextual match staffing and complete volunteer profile

## Requirement
Follow-up to PR23 field review, 19 October 2026. Match day requirements must correspond to **sport, age group, gender/category, division, competition and season**. Volunteer profiles need contact details, private picture, years with each club, role accreditation dates and first qualification year.

## Rule context and verification
- Policy values are entered by an authorised coach after checking the competition's official rules. The app does not scrape or invent minimum role counts.
- A reviewed policy is stamped with its exact sport, team age group, gender/category, division and competition ID. A match in a different group or competition cannot be shown as ready on the old policy.
- Team-level policies apply to their selected competition; match-specific overrides remain possible. Friendly/unlinked matches are their own policy context.
- No minimum or readiness status is inherited silently from a different category. The UI requires a source, season and context.
- Legacy policies remain in the encrypted data for review, but are not considered applicable to teams with additional distinguishing context that they did not record. The upgrade does not discard historical assignments or staffing records.
- Competition/age group/gender combinations need a verified rule source before displaying a positive status. **Do not claim these requirements are sourced from NRL/MySideline/Oztag automatically.**

## Volunteer profile
- Private coach-only profile: name, email, phone, compressed portrait (existing image-processing approach), optional first club membership year recorded per club, current availability and sport-specific qualification summary.
- First qualification year and expiry are recorded per sport and role. Existing legacy expiry fields remain readable; new edits use sport-specific fields.
- Do not store WWCC numbers, identity document uploads or birth dates. WWCC checked status and expiry remain separate and manually verified.
- Entry methods from PR23 (manual, local existing person, mail draft) stay available; a local volunteer is still not an authenticated platform account.

## Regression acceptance
- New contextual policy rejects rules for wrong sport, age/gender, division, competition or season.
- Junior girls, junior boys and mixed categories do not share inferred minima.
- Oztag never inherits rugby league shirt roles.
- Person photo/contact/qualification records stay private in coach workspace and do not leak to player projection.
- Historic personnel IDs and match assignments remain intact.
- Node and browser workflows succeed at final head, including mobile 390px and desktop 1280px. Real Safari validation and owner approval required prior to merge.

Deferred CSS component cleanup remains separate under GitHub Issue #24.
