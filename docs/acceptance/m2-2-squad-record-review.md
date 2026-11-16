# M2.2 | Coach-only Squad record suggestions and reported adult review

Status: **source candidate, unmerged**. Based on `main` `827014cac19ad761d46383711bffb744a8edaa12`, PR #250. Exact-main Node and WebKit completed successfully when scoped; Chromium and full post-merge release qualification were still running. Do not merge this milestone before that prerequisite is green.

## Representative journey

A Head Coach selects an assigned team using the established **Home** picker, opens **Team → Squad**, and expands a compact **Player record review** disclosure. For the active team, the view lists roster members whose **optional** jersey number or preferred-position details are absent. Each suggested review opens the existing player edit form, and cancelling leaves all records unchanged.

The view also shows how many **existing, explicitly reported adult/helper-to-player relationship reviews** for this team are recorded, reversed or need their source checked. It uses the existing People/guardian source index, does not infer guardian relationships from names, shared teams or missing records, and does **not** grant access or verify legal guardian identity.

This is **not a checklist for legal registration, child safeguarding certification, fees, competition eligibility, match selection or medical clearance**.

## In-scope

- A collapsed, native Squad disclosure for the trusted Coach/fictional Owner or active exact-team Head Coach. No changes to app navigation, roster data schema, team selection or the play engine.
- Read-only summaries from the active season's actual player lens and the current workspace's existing guardian review view. Unknown guardian source context is displayed as unavailable rather than as zero records.
- Optional detail suggestions for blank name, jersey number or preferred positions. Missing contact/phone, DOB, guardian linkage, medical records or identity is **not** treated as a required field.
- Coach opens only the already permitted exact-player editing form; the new review feature itself does not save or modify records.
- Manager, Club Admin, Player, Guardian, revoked/unassigned roles and published Player views receive no new review panel or private source information.

## Source and UX acceptance

- `test/squad-record-review.test.js`: exactly scoped suggestions, stale/foreign/duplicate row handling, guardian record states, non-authorisation, no player-export leakage.
- `test/browser/m2_2_squad_record_review.py`: 390/1280 px Head Coach view, optional detail suggestions, existing edit/cancel journey, negative role checks and overflow.
- Exact-head Node, full Chromium and existing WebKit must pass before an owner-reviewed merge; exact-main post-merge CI and Pages publication must then pass separately.
- Physical iPhone Safari, VoiceOver keyboard/announcement checks, owner UX judgement and actual encrypted backup/restore remain **manual acceptance**, not inferred from Chromium or Linux WebKit.

## Deferred separately

Real adult/child linking, relationship verification, consent, invitations, server-side tenancy, record retention/deletion policy, external club registration/payment verification and grace-period competition rules remain outside M2.2. See [#55](https://github.com/pdomoney/team-manager/issues/55), [#154](https://github.com/pdomoney/team-manager/issues/154), D09/D14/D17/D21/D23 and existing P04D guardian review architecture.

No new backend, login, stored sensitive fields, historical migration, fixtures or publisher changes.
