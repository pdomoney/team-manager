# Product-owner future-role decisions — 3 November 2026

**Authoritative input:** product-owner edited `Team_Manager_Future_Role_Feature_Permissions_Matrix_Clarified_Decisions_updated.xlsx`, **Decisions** rows D01–D24. The complete, owner-held workbook contains the response and conditions; this document is a minimised technical interpretation, not a replacement for the original. No personal/health data is committed.

**Status:** 18 Agree, 4 Agree with changes (D01, D04, D08, D10), 1 Disagree (D17), 1 Need discussion (D15). Treat *Agree* with a written condition (e.g. D03/D06/D12/D14/D21) as conditional, not unconditional signoff of detail. This is product policy direction, **not** approval to migrate to a backend or release real accounts. [Deferred production work #55](https://github.com/pdomoney/team-manager/issues/55) remains deferred.

## Decisions and implementation interpretation

| ID | Owner response | Implementable rule / remaining question | Sequencing |
|---|---|---|---|
| D01 | Agree with changes | Platform operators have no routine private-content access. Approved team admin/Coach/Manager/Trainer should be able to reach minimal next-of-kin information for a genuine emergency with player/guardian permission; collect communication email and phone, optional channels only by preference. Audit use. Do not equate operations access with team emergency access. | Safety policy first, real disclosure later |
| D02 | Agree | Person selects **one** active role and exact group; never pool grants when they hold several roles. | Foundation |
| D03 | Agree, with detail | Club Admin manages club administration. Accreditation-required sporting duties, including first aid, trainer, first responder, grounds manager and safety officer, need verified sport/competition credentials as applicable. Accreditation alone conveys no app role. | Foundation + credential verification |
| D04 | Agree with changes | Coach or Manager can nominate **and approve team placement**; Club Admin verifies final club/financial registration separately. Single-team owner-approved, auditable self-approval exception may replace Club Admin step, but not verified registration/payment evidence. | Foundation, then native roster workflow |
| D05 | Agree | Assistant Coach can edit training and draft selection; Head Coach approves/publishes lineups. | Coaching |
| D06 | Agree, with detail | Official draw changes require a competition-authorised person, who may be a Team Manager or another designated senior role. **Authority is a specific approved delegation**, not automatically inherited from organisational hierarchy. Team staff without that delegation can propose only. | Foundation, then competition workflow |
| D07 | Agree | Coach and Manager may manage friendlies in assigned team; never edit official draw through friendly permissions. | Foundation, then fixture workflow |
| D08 | Agree with changes | Approved volunteer or Team Manager may record **provisional** results. Independent match official confirmation and designated competition authority required before official publication. | Foundation, then scoring |
| D09 | Agree, with detail | Verified guardian relationship for under-18s; no general right to other children’s private profiles. Specific age/transition settings to be defined. | Child protection |
| D10 | Agree with changes | With specific player/verified guardian permission, a serious-injury safety alert can follow a verified participant across sports, clubs and eligible association contexts. Coaches/Managers/Club/Association staff should receive actionable restriction and relevant serious injury summary within authorised scope. **Full clinical files are not automatically disclosed.** Verify consent, identity, recipients, expiry and health-role qualification separately. Concussion workflows need sport-specific medical return-to-play rules. | Safety policy, then secure backend integration |
| D11 | Agree | Safeguarding Officer is a separately appointed protected-data role, not inherited by Coach or Club Admin. | Child protection |
| D12 | Agree, with detail | Trainer can request fixture-bounded acting role; Team Manager or Club Admin may approve if qualified and conflict-checked. Time-limited; no permanent role grant. | Fixture duty |
| D13 | Agree | Volunteer Coordinator manages rota and screening **status**, not screening evidence, medical files or coaching data. | Volunteers |
| D14 | Agree, with detail | Youth rosters private by default; Coach, Manager and Trainer may see relevant **top-level** player information within assignments, never unlimited private files. Senior/public roster setting configurable. | Roster visibility |
| D15 | **Need discussion** | Do not enable WhatsApp or Snapchat API messaging yet. Define vendor API feasibility, moderation, age/guardian permissions, recording, storage and consent before building. | **Blocked** |
| D16 | Agree | Player or verified guardian records own availability; Manager may transcribe external replies with source, timestamp and provenance. | Availability |
| D17 | **Disagree with suggested restriction** | Owner wants a *grace period* for registration/financial status: Coach may add player to match-day team; Manager can approve provisional participation once details are captured. **Must not mark official competition eligibility as verified without an authorised rule/source.** Exact grace duration, competition/age restrictions and who assumes risk are not yet specified. Implement **selection/proposal** first, not a blanket safety or competition override. | **Conditional pending sport/competition rule design** |
| D18 | Agree | Aggregated/redacted reports with small-cohort protection; individual reports require scoped purpose. | Reporting |
| D19 | Agree | Sport + competition rules drive match formats, scoring and duty qualifications. Do not apply Oztag scoring to other sports. | Sport rule engine |
| D20 | Agree | Independent club/team/role grants, each separately approved and revocable. UI shows the selected role's authorised portfolio only. | Foundation |
| D21 | Agree; detail unset | Record-level retention, legal hold, access, correction, export and deletion policy **not yet defined**. Do not enable production personal-data workflows until settled. | **Policy parameters open** |
| D22 | Agree | Verify official directory provenance, logos, copyright/brand rights and update authority. | Directory |
| D23 | Agree | Separate finance roles, approval and provider transaction references; never store card numbers. | Finance |
| D24 | Agree | Sporting membership, accreditation, fixture appointment and account access role are four independent facts. Temporary match duty does not elevate digital privileges. | Foundation |

## Delivery batches (not claims of completion)

1. **PR153: Policy foundation.** Pure deterministic, *fictional-only* role-context/qualification/registration/competition/safety decision helpers and negative tests. **No production UI, access or personal health data.** Implements testable decision boundaries D01, D02, D03, D04, D06, D07, D08, D09, D10, D20, D24. Open D17 is *not* automatically resolved.
2. **Roster/registration UI.** D04, D16, conditional D17. Create explicit team-approved, club-registered, financially verified, and provisional match-day selection states. Audit each approval and exception in existing native Squad/Matches. Do not equate a team nomination with official eligibility.
3. **Fixture and match-day workflows.** D05, D06–D08, D12, D19: coach/assistant drafts, Manager friendlies and provisional scoring, verified match-duty assignments, competition delegation, independent confirmation.
4. **Privacy and participant experience.** D01, D09–D11, D13–D14, D16, D18, D20–D21, D24: verified guardian links, sport qualifications, restricted health alerts with explicit consent, emergency contact access and minimal projections, retention policy.
5. **Organisation, directory, finance and communications.** D03, D13, D18, D22–D23. D15 remains blocked until a separate approved communication architecture, including WhatsApp/Snapchat API viability and child protections.

## Safety rules carried into every PR

- No actual player medical/health, child, emergency-contact or safeguarding payload in repository, sample data, PR description, CI logs or public GitHub Pages data. Use invented test identifiers.
- Exact scope, active role and approved grant are distinct from membership, accreditation and match duty. No cross-club automatic grant inheritance.
- Approval logs are append-only in the ultimate service. Pure functions model the decisions but cannot secure browser-held encrypted data.
- Every sensitive workflow needs a trusted server and explicit controller/storage/privacy approval before real deployment; issue #55 remains an explicit dependency.
- No WhatsApp/Snapchat API credentials or integration until D15 is resolved.
- D17's financial grace period may support **selection** while financial status is pending, but sport-specific official match eligibility/medical clearance may not be inferred. No automatic return-to-play clearance from an injury alert.

## Public guidance for subsequent design verification

- OAIC APP 6: https://www.oaic.gov.au/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-6-app-6-use-or-disclosure-of-personal-information
- Australian Sports Commission community/youth concussion guidance: https://www.ausport.gov.au/concussion

These are design references, not a legal opinion or a substitute for the requirements of a governing body, competition or health practitioner.
