# Team Manager privacy decision register

**Status:** Open questionnaire. **TM-PR-001 through TM-PR-016 answered; 2 questions remain unanswered. All sixteen responses are pending review.** TM-PR-006's verifying actor is clarified as the **appointed team Manager**, but evidence standards and independent privacy approval remain open. No supplier selection, verified legal entity/controller allocation, guardian policy, legal approval, or authority for production personal-data processing has been recorded. Created 17 November 2026, based on `main` `0f1b34617a905c6e051b1f1866d87a558870ef51`.

**Canonical structured register:** [`config/privacy-decision-register.json`](../../config/privacy-decision-register.json).

**Player field inventory:** [`config/privacy-player-field-inventory.json`](../../config/privacy-player-field-inventory.json). Contains proposed field requirements only, with **no actual personal records** and no approved production collection.

## Current recorded answers

| ID | Owner response | Status | Practical consequence |
| --- | --- | --- | --- |
| TM-PR-001 | First team **includes players under 18** (owner-confirmed, 17 November 2026) | **Answered, pending review** | Keep junior account, verified guardian, age transition, privacy notice and safeguarding decisions open. No real junior records or access can be processed until separate approvals. |
| TM-PR-002 | **Platform-led policy responsibility.** The platform decides privacy/data controls and will lead breach reporting; Team Managers and clubs may be required to collect and provide information (owner-confirmed, 17 November 2026). | **Answered, pending review** | Formalise the actual accountable legal entity, delegated team/club duties, incident escalation, controller/processor agreements and notification procedures. Neither this preference nor an in-app designation discharges applicable statutory obligations. |
| TM-PR-003 | **Registration email, proposed Sign in with Apple/Google, emergency contacts, and guardian contact candidates** for under-18 players. Active guardian accounts are **not mandatory**; adult players may opt into a linked account. Clarified by TM-PR-005 on 17 November 2026. | **Answered, pending review; earlier wording corrected with history retained** | Distinguish recorded guardian details from verified authority and active accounts; no automatic invitation, access or activation. Review privacy, consent, emergency purpose, identity-provider handling and retention. |
| TM-PR-004 | **Proposed mandatory:** full name, date of birth, phone number, residential address and photo. **Proposed optional:** social media accounts, other clubs, other sports, profession, education level and education institution (owner-confirmed, 17 November 2026). | **Answered, pending review** | See the separate field inventory for machine-readable field identifiers. Mandatory fields require necessity/minimisation justification, particularly for juniors. Optional profile information is not permission to market to children or publicly reveal a school, photo, address or handle. |
| TM-PR-005 | **Each under-18 player should have their own login. Guardian details must be recorded as a potential account, but an activated guardian account is not required.** Activate on request only after separately defined verification/permission checks (owner-confirmed, 17 November 2026). | **Answered, pending review** | A guardian candidate is not a verified guardian, logged-in user, consent or access grant. Specify how juniors sign up, verify guardian relationships, request activation, withdraw approval and handle age transitions. |
| TM-PR-006 | **The team's appointed Manager** is the proposed verifier of guardian relationships and account activation requests (explicitly clarified by owner, 17 November 2026). | **Answered, pending detailed policy and review** | A policy nomination is not an operational permission. Define acceptable evidence, prevention of self-approval, separate independent review when needed, recorded rationale, revocation, audit, and dispute escalation before activating access. |
| TM-PR-007 | **Emergency contact details only** for the first release. Exclude medical conditions, allergies, injury and concussion history, return-to-play restrictions, clinical files and safeguarding case records (owner-confirmed, 17 November 2026). | **Answered, pending privacy and access review** | Emergency contact access must be limited by purpose, team/role, verification and audit. Separate later approval is required before collecting health/safeguarding data. No actual contact data is committed to this public repository. |
| TM-PR-008 | **Read access for appointed Team Managers and Club Admins** to their assigned team's or administered club's player personal details and emergency contact details (owner-confirmed, 17 November 2026). | **Answered, pending detailed access-policy and privacy review** | No cross-team or cross-club access outside explicit grants; require individual verified role, field/purpose limits and audit. Editing, bulk export, Coach/Trainer, guardian and platform operator access remain undecided. |
| TM-PR-009 | **Privacy notice acknowledgement in account acceptance**, alongside a **separate, optional marketing opt-in**, with permission to disable marketing later in Settings (owner-confirmed, 17 November 2026). | **Answered, pending legal/child privacy review** | Marketing must not be required or preselected for participation. Define the notice, purposes/channels, consent evidence, withdrawal and age-appropriate guardian rules before actual outreach. Account notices and essential team communications must be distinguished from marketing. |
| TM-PR-010 | **Keep the backend and authentication supplier under evaluation** until cost, security and privacy reviews are complete. No provider, service plan or hosting region is selected (owner-confirmed, 17 November 2026). | **Answered: provider selection deferred, pending review** | No paid subscription, Australian location assertion, external account, backend provisioning or personal-data migration is authorised. Preserve #55, D21 and L0 release HOLD until a separately evaluated and explicitly approved proposal. |
| TM-PR-011 | **Australian hosting/processing preferred but not mandatory; international storage and processing permitted in principle.** Supplier location remains an evaluation criterion, not an exclusion (owner-confirmed, 17 November 2026). | **Answered, pending independent privacy/security review** | Do not infer a legal exemption because data is not government or financial. Check applicable Privacy Act/APP requirements, overseas recipient contract and subprocessor controls, minors/guardians, support, backups and logs. No international processor or transfer is production-authorised. |
| TM-PR-012 | **Permit limited, auditable player-data sharing with verified sporting association administrators** strictly for competition registration, eligibility and fixture administration (owner-confirmed, 17 November 2026). | **Answered, pending specific disclosure and privacy review** | Require minimum necessary fields and individual verified association scope; prohibit unrestricted export, unrelated clubs and third-party marketing by default. Messaging, actual fields, child/guardian protections, notice, lawful basis, onward disclosure and retention remain open. |
| TM-PR-013 | **On membership departure: mark inactive, then archive after 12 months; do not automatically delete the record** (owner-confirmed, 17 November 2026). | **Answered, pending category-specific retention and legal review** | Archiving restricts operational access; it is not a privacy-law exemption or consent to indefinite retention of emergency contacts and identifying fields. Define archived access, correction/deletion requests, exceptional legal holds, backup expiry and eventual secure disposal separately. |
| TM-PR-014 | **The Team Manager platform operator owns requests for team or club records; authenticated players can edit their own contact email, mobile phone and residential address in their profile** (owner-confirmed, 17 November 2026). | **Answered, pending rights procedure and privacy review** | Enforce verified self-service updates with email/identity safeguards and access audit. Define identity checks, response timelines, copy/export/deletion request pathways, minors and guardian authority, disputes and legal retention exceptions separately. |
| TM-PR-015 | **The Team Manager platform operator owns backup restoration and recovery. Club Admins and appointed Team Managers must not restore the hosted database** (owner-confirmed, 17 November 2026). | **Answered, pending security and privacy review** | Specify administrator authentication, least-privilege restoration, encrypted backups, retention, approved locations, testing, recovery audit, erasure and provider exit separately. No live backup or restore rights were granted. |
| TM-PR-016 | **No in-app privacy/security incident-reporting function is required in the initial release** (owner-confirmed, 17 November 2026). | **Answered, pending incident-response procedure and privacy review** | Preserve platform-led investigation, breach assessment and reporting under TM-PR-002. Specify an alternative reporting channel, escalation timing, account-access audits and least-privilege support access before handling real personal data. |

TM-PR-017 through TM-PR-018 remain unanswered. TM-PR-006 has an explicit response and a resolved verifier-role clarification, but the operational verification and privacy policy remains open. TM-PR-004 identifies the owner's requested fields, but purpose, necessity and lawful collection for each field remain unapproved. TM-PR-005 defines the proposed junior self-login model; TM-PR-006 guardian verification, activation and child consent (decision detail incomplete), TM-PR-007 emergency-contact-only scope (with detailed access still unapproved), TM-PR-008 Manager/Club Admin read scope (fine-grained permissions still undecided), TM-PR-009 notice and marketing preference direction is recorded but detailed legal, child/guardian and consent-evidence rules remain pending; TM-PR-010 provider evaluation is explicitly deferred (no supplier or plan chosen); TM-PR-011 permits overseas processing in principle with Australia preferred, not mandatory, and independent review still required; TM-PR-012 supports narrow association disclosure only (exact fields and authority still unapproved); TM-PR-013 defines inactive-then-archive lifecycle, but category-specific retention and legal exceptions remain unapproved; TM-PR-014 allocates team/club records requests to the platform and player profile-contact corrections to the player, but other rights procedures remain open. TM-PR-015 assigns hosted database restoration and recovery to the platform operator alone, while detailed backup retention, deletion and recovery controls remain pending. TM-PR-016 defers an in-app incident-reporting feature, while alternative reporting, access audit and platform-led breach response procedures must still be defined. In particular, a junior may not have a personal phone, and a residential address or identifying photo may not be necessary for every role or age group. Recorded policy direction is not a verified legal-controller allocation, provider contract, completed privacy review or release approval.

**Breach notification note:** The OAIC's NDB guidance allows affected entities to coordinate assessment and notification, but each covered entity holding relevant personal information must be able to demonstrate its own compliance. The platform may coordinate and submit notices under an agreed arrangement; an assignment in Team Manager cannot remove a club's or association's independent legal duties where they apply. See [OAIC: NDB scheme and multi-entity responsibility](https://www.oaic.gov.au/privacy/notifiable-data-breaches/preventing-preparing-for-and-responding-to-data-breaches/data-breach-preparation-and-response/part-4-notifiable-data-breach-ndb-scheme).

## Incident reporting outside the application (TM-PR-016)

The owner said that an **in-app incident reporting function is not necessary at this stage**. Therefore the first release does **not** need an incident-reporting form, button, ticket or dashboard merely to implement privacy governance. Do **not** interpret omission of that UI function as permission to omit the incident response process.

The previously accepted platform responsibility under TM-PR-002 stands: the **Team Manager platform operator** leads investigation, triage, escalation, and relevant breach assessment/reporting, with team/club stakeholders providing information under an agreed process. Statutory reporting obligations of any covered legal entities still need separate assessment; this owner decision is not an assumption that the platform can absorb every other entity's legal obligations.

Before processing real personal information, determine and publish a reachable **alternative reporting channel** (for example a formally designated support/privacy email or equivalent, not selected here), clear escalation ownership, relevant urgency/notification requirements, evidence handling without exposing junior data, and an auditable incident record. Keep **personal-information access logging** and privileged support-access controls as separate design requirements; neither has been rejected by the user's decision to omit an in-app reporting feature.

Structured policy: `inAppIncidentReportingRequiredInitialRelease:false`, `alternativeReportingChannel:"undecided-must-be-defined-before-live-use"`, `platformBreachAssessmentAndNotificationLead:true`, `productionIncidentProcessApproved:false`. No security incidents, personal details or internal contacts are stored in the public questionnaire.

## Backup restoration and recovery authority (TM-PR-015)

The owner expressly assigned **backup restoration and recovery to the Team Manager platform operator**. The **appointed human team Manager** and **Club Admin** must not be able to restore the hosted database or assume platform backup-administrator credentials. This decision is distinct from their proposed scoped read access to player information under TM-PR-008.

Recovery design requirements remain **subject to independent review and provider selection**: strong operator authentication, a documented restore approval and audit trail, encrypted copies and verified key control, appropriate backup retention and expiry, isolated restore rehearsals, regional/subprocessor assessment, and secure supplier exit. Restore points must account for personal-information deletion/correction requests, including whether older backups could reintroduce removed data. Normal team exports, club copies, GitHub repositories or repository history must not become substitutes for authorised backup storage.

This decision does **not** approve any particular platform administrator, retention interval, restore plan, cloud account, live backup, deletion policy or deployment. The structured register uses `restoreAndRecoveryOwner:"team-manager-platform-operator"`, denied database restoration for `club-admin` and `appointed-team-manager`, and `productionBackupOrRestoreAuthorised:false`. The 12-month inactive-then-archive preference does not establish indefinite backup retention.

## Individual profile corrections versus team/club record requests (TM-PR-014)

The owner distinguished two separate responsibilities:

- **Player-owned profile contact details:** an authenticated player can correct their **own email address, mobile phone number and residential address** directly. This does not authorise edits to another player's record, privileged role, club data, emergency contacts, guardian relationships, date of birth, or approved team/club histories. Changing a login or identity-provider email must use a verified account-email change procedure, preserve account continuity and avoid account takeover.
- **Team- or club-related records:** the **Team Manager platform operator owns the formal request process**, including appropriate decisions about corrections or other rights relating to team and club information. The appointed team Manager and Club Admin do not automatically gain final decision authority merely because they have team/club read access (TM-PR-008).
- **Still to design:** identity proof, request intake, ownership of individual account deletion and copies of profile data, verification/handling of guardian and minor requests, lawful grounds for response, timelines, correction conflicts, portability/export controls, audit and notification, exceptions for valid legal holds, archive reactivation and secure erasure under TM-PR-013/015.

This is a **product-level owner direction**, not an operational privacy-rights procedure or authority to remove records. Do not infer that the platform can deny a legally valid access or correction request, that archived records are excluded, or that player self-service can bypass account security. The structured `proposedRightsWorkflow` has `productionRightsWorkflowAuthorised:false` and all unselected rights paths remain pending.

## Membership lifecycle: inactive for 12 months, then archive (TM-PR-013)

The owner set a lifecycle requirement for players and other team records after they leave:

1. **Membership ends:** transition the record from active to **inactive**, retaining only narrowly justified team/administrative access.
2. **12 months inactive:** transition to **archived**. The exact start date and behaviour for return/re-registration still need detailed acceptance.
3. **No automatic deletion:** do not run a scheduled record-deletion process merely because the inactive period has elapsed. Archive must be a real restricted state, not simply a hidden item that all existing users can still query.
4. **Explicit exception paths:** reviewed access/correction/deletion requests, statutory duties, valid legal holds, safeguarding obligations and provider/backup retention need their own recorded rules, not an implicit promise that all personal information is stored forever.

The instruction **not to automatically delete a record** must **not** be turned into unconditional permanent retention of residential addresses, junior photographs or emergency contact details. For each field class, separately decide whether to anonymise, minimise, redact or securely delete personal content after it is no longer required, while preserving a non-identifying historical team-membership record where lawful. Those decisions remain open under TM-PR-014 (rights) and TM-PR-015 (backup/deletion). Access to archived emergency contacts and guardian candidates must not automatically carry over from active membership.

The structured policy records `membershipEnds: mark-inactive`, `inactivePeriodMonths: 12`, `afterInactivePeriod: archive` and `automaticRecordDeletion: false`, with `productionLifecycleAuthorised: false` pending detailed privacy review. No actual application records have been altered.

## Narrow sporting association sharing, not blanket directory access (TM-PR-012)

The owner agreed to let **verified sporting association administrators** receive only the **minimum information required** for competition registration, team eligibility and fixture administration. The proposal is deliberately narrower than blanket personal-detail access, general exports, communications or third-party marketing.

Before implementing any disclosure, define the precise data projection for each purpose, verify the recipient's role and competition/association relationship, restrict both data read and downstream sharing to that explicit scope, log recipient/purpose/time/fields (without writing private details into public GitHub), and document privacy notice and applicable lawful collection/use/disclosure grounds. Junior and guardian-linked records require particular field minimisation and privacy review.

**Not approved by this answer:** association-wide browsing, unbounded cross-team or unrelated-club access, copying/bulk export, automated external sync, unrestricted WhatsApp/email disclosures, disclosure of emergency contacts outside a justified emergency purpose, or sharing optional marketing profiles for promotional use. Coach/volunteer/guardian access remains separately unresolved under TM-PR-008.

The structured register sets `unrestrictedExportsPermitted:false`, `thirdPartyMarketingPermitted:false`, `unrelatedClubsPermitted:false`, `automaticExternalSyncPermitted:false`, `auditDisclosureRequired:true`, `individualFieldsApproved:[]` and `productionSharingAuthorised:false`. This is an owner product preference, **not** authorisation to send live participant data.

## International data processing: Australia preferred, not required (TM-PR-011)

The owner confirmed that **local Australian hosting should be prioritised, but is not mandatory**; international storage and processing are acceptable in principle. The decision expands backend evaluation rather than approving any particular country, cloud vendor, subcontractor, transfer or data migration.

**Important distinction:** the absence of government or financial records does not itself establish an exemption from Australian privacy duties. Team Manager proposes to hold personal information about children, guardians, addresses and emergency contacts. Subject to the entity's actual Privacy Act coverage and the facts of each hosting arrangement, APP 8 and other privacy principles can apply to disclosures overseas. OAIC guidance confirms overseas cloud processing is generally allowed while the applicable APP responsibilities remain. The OAIC distinguishes remote storage/processing from disclosure in some circumstances, so assess the actual contractual and technical arrangement rather than assuming every overseas storage operation is identical: [OAIC overseas cloud guidance](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/handling-personal-information/sending-personal-information-overseas) and [OAIC APP 8 guidance](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-8-app-8-cross-border-disclosure-of-personal-information).

Review before selection: exact countries for primary data, authentication, email, logs, backups, operational support and subprocessors; contractual protections and incident escalation; access and encryption; secure deletion and supplier exit; child and guardian safeguards; whether cross-border disclosures occur and which legal obligations apply. Record concrete supplier facts in a separate evaluated decision, never infer approved international transfers from this preference.

The structured policy stores `australiaPreferred: true`, `australiaMandatory: false`, international hosting/processing permitted **in principle**, and `productionCrossBorderTransferAuthorised: false` / `regulatoryExemptionAssumed: false`. TM-PR-010 provider selection remains deferred, and #55/L0 production processing gates remain HOLD.

## Backend/identity supplier: evaluation only (TM-PR-010)

The owner selected **further evaluation**, **not** a particular backend or identity provider, after considering Supabase, Firebase, and Australian-hosted PostgreSQL with a dedicated API. This is a genuine product decision to defer procurement until evaluation, not an unrecorded answer to the interview.

The evaluation must compare the projected full operating cost and budget, verified role/tenant security and junior safeguards, applicable privacy obligations, actual hosting and all authentication/log/backup/support/subprocessor locations, contract terms, disaster recovery and safe exit. An Australian primary database alone does not establish Australian-only processing. **TM-PR-011** separately decides acceptable cross-border processing.

The structured register expressly holds `selectedProvider`, `selectedPlan`, `selectedPrimaryRegion` and `commercialOwner` at **null**, and `procurementAuthorised`, `provisioningAuthorised`, `personalDataMigrationAuthorised` and `productionProcessingAuthorised` at **false**. Do not treat the owner answering this privacy interview, the merge of its document PR, or CI passes as release/processor authorisation under [#55](https://github.com/pdomoney/team-manager/issues/55) or [#252](https://github.com/pdomoney/team-manager/issues/252).

## Registration acceptance and marketing preferences (TM-PR-009)

The owner agreed that the registration/account acceptance experience should include the privacy notice and marketing preferences. Treat them as **distinct controls**:

1. **Privacy collection notice/acknowledgement:** clearly present what the platform collects, purposes, relevant sharing and rights, and record which notice version was shown and acknowledged. Acknowledgement must **not** be mistaken for consent to every form of personal-data processing.
2. **Marketing communications:** a separate, affirmative **opt-in** in the acceptance experience. Leave it **off by default**, do not require it to join a team and do not infer it from registering, optional social/education/profile details, or accepting the privacy notice.
3. **User settings:** let the account holder turn marketing consent **off** later without losing their account or team membership. Record the preference change and stop subsequent marketing. A later opt-in requires a fresh affirmative action; withdrawal must not silently switch back on.
4. **Under-18s:** do **not** assume a minor can consent to all promotional uses or that a dormant guardian candidate supplies consent. The exact age thresholds, guardian role and permitted promotional purposes require independent review; marketing remains disabled for juniors until authorised.
5. **Operational versus promotional communication:** necessary account, security and team-operation messages are different from promotional messages. Define the boundary, senders, channels and suppression handling before implementation.

The structured register records proposed `marketingDefault: false`, `marketingRequiredForParticipation: false`, `withdrawalSupported: true`, and `productionUseAuthorised: false`. **No real marketing preference, consent history, direct-contact data or campaign details belong in this public repository.**

## Player and emergency contact read access (TM-PR-008)

The owner selected **read access** to player personal details and emergency contact details for two real, individually assigned roles:

- **Appointed team Manager:** players associated with the Manager's **explicitly assigned team**, not unrelated teams or clubs.
- **Club Admin:** players inside the **explicitly administered club**, not the same person's unrelated club or another organisation.

This is a **role-and-scope proposal**, not production access permission. It cannot be implemented by trusting a browser role selector or shared coach password: a backend must establish the authenticated actor and active assignment, check person/team/club membership, restrict the actual fields by purpose, and audit access where appropriate. For emergency contact information, reconcile the permitted ordinary read purpose with D01's active-emergency policy before enabling a contact projection. Bulk downloads, copying/exporting, self-role escalation and cross-club discovery are not authorised by this answer.

The owner **did not yet decide** editing permissions, Player self-service visibility, verified guardian read access, Coach/Trainer emergency-only access, volunteers' access or exceptional platform operator support access. Do not silently extend this answer to those roles, give every Club Admin access to all associations, or disclose optional social/education data to marketing users. The proposed access is represented by `proposedReadAccess` with `productionAccessAuthorised: false` in the register, pending detailed review.

## Emergency contact only for initial release (TM-PR-007)

**Owner policy direction:** collect emergency contacts as the only safety-related information in the first release. Do not introduce allergy, medical-condition, injury-history, concussion, return-to-play, clinical-record or safeguarding-case inputs, uploads, exports, or staff-facing summary fields as an incidental extension to an emergency contact form. A separate future review and owner approval must precede any such scope.

**Access remains restricted and unapproved for real users.** The emergency use case must establish an actual emergency purpose, the recipient's active team responsibility, a minimal contact projection and an auditable decision. The platform and club must separately decide who may collect, edit, view or disclose contact details, how minors and guardian candidates affect the contact relationship, appropriate privacy notices, accuracy, retention and correction. Do not interpret contact presence as general directory visibility or make it available in an unrestricted team download.

The structured register stores `proposedInitialScope`, `excludedFromInitialScope` and `collectionApproved: false` to ensure this owner requirement does not silently create a production data entitlement.

## Guardian verification actor clarification (TM-PR-006)

The owner first responded **"Team manager"**. They subsequently clarified that this means the **team's appointed Manager**, not the Team Manager platform operator. The structured register now has `verifyingActor: "appointed-team-manager"` and a retained earlier response in `revisionHistory`. This remains **answered-pending-review**. No production identity-verification authority or access grant is implemented by this document.

Regardless of the selected actor, a candidate contact is not a legally verified guardian, consent grant or account; the verifier needs an approved evidence/approval process, separation-of-duties rules, scoped access, dispute resolution, revocation and audit. Do not enter actual family relationships or proofs into the public repository.

## Guardian contact versus account, policy direction only

The owner clarified the previous TM-PR-003 wording in TM-PR-005. The earlier answer is retained in the structured record's `revisionHistory`, while the current policy requirement is:

- **Under-18 Player account:** the player can have an individual login; the platform must separately resolve age-appropriate onboarding and consent/verification, and must not assume that account creation means junior data processing is already approved.
- **Guardian candidate details:** record enough information, once the collection basis is approved, to offer a future invitation for an under-18 player. The **guardian account may remain unactivated indefinitely** without blocking the player's participation. Candidate details should be separately scoped and retained for a defined period.
- **Guardian activation:** only on request, through the independently approved identity, relationship and authority workflow. No automatic sign-in credential, invitation, data access, or verified-parent label merely because the contact has been entered.
- **Adult player:** any associated adult account is optional and subject to the adult player's explicit approval and later withdrawal, with restricted permissions defined separately.
- **Open questions:** TM-PR-006 guardian identity and approval workflow, whether any child age bands need different onboarding, safeguarding notifications, contact verification, and exact guardian read/write privileges. These remain HOLD for real users.

The public GitHub register stores **policy only**, not guardian names, addresses, emails, documents, child details or invitations.

## Initial player-field collection policy (pending independent review)

| Owner proposes mandatory | Owner proposes optional |
| --- | --- |
| Full name | Social media accounts |
| Date of birth | Other clubs |
| Phone number | Other sports |
| Residential address | Profession |
| Profile photo | Education level |
| | Education institution |

Registration email, email/Apple/Google sign-in options, emergency contacts and linked guardian accounts are recorded under TM-PR-003. These should not be silently duplicated or interpreted as consent to share more data.

**No player profile field is approved for actual collection merely because it is marked mandatory.** For each field, the platform must decide why it is needed, which participants it applies to, any alternate route for juniors, how to secure it, which exact roles can access it, when it is deleted and whether a less intrusive substitute is possible. Any child photo, precise residential address or education/school name needs particular protection against public discovery, broad team exports and unnecessary sharing.

The six optional fields are **profile proposals, not promotional consent**. Do not make them required for registration, infer consent from completion, preselect marketing opt-in, share social handles or school affiliation to other teams, or use them for profiling/direct marketing without a separate lawful-purpose, age-appropriate permissions and withdrawal decision.

## Purpose and provenance

The owner requested a repeatable way to ask privacy and data-governance questions, capture policy responses and later turn the process into a first-class Team Manager feature. This is a **policy decision register**, not a register of real players, consent forms, privacy complaints, security incidents or data-subject access requests.

**Repository is public.** Put only generic policy choices, non-identifying summaries, statuses, and safe approval references into this GitHub register. Never put player/guardian names, account emails, phone numbers, medical facts, identity documents, children’s dates of birth, individual consent evidence, raw support tickets, credentials, personal audit logs, or club-confidential documents into the repo, issues, CI output or PR comments. Redact any such details from proposed answers. Any eventual in-app privacy/case register that holds sensitive records must use a private server datastore with exact roles, encryption, retention and audit; it must not synchronise those records back to this public file.

## How to conduct the interview

Ask **one clear owner question per turn**, beginning with TM-PR-001 (whether the first team includes anyone under 18). Record only what the owner actually answers; never convert an assistant recommendation, a prior question, a PR merge or general agreement to "continue" into an approval.

Each question has a stable ID and retains a human-readable question. The structured record stores:

| Field | Meaning |
| --- | --- |
| `id`, `topic`, `question`, `answerType`, `allowedValues` | Stable user-facing decision identity and expected response format |
| `status` | `unanswered`, `answered-pending-review`, `approved`, `rejected` or `superseded`; do not treat a response as approved |
| `responseCode`, `responseSummary` | Owner's actual non-identifying answer, coded and briefly summarised; may be `null` |
| `respondedOn`, `responseEvidenceRef` | Date and safe provenance reference, not a fabricated cryptographic attestation |
| `reviewState`, `reviewerRole`, `reviewedOn`, `reviewEvidenceRef` | Independent legal/privacy/owner review state and safe reference; **must** be completed before `approved` |
| `applicable` | `undetermined`, `yes`, `no`, `review-needed`; conditional child/guardian questions must not disappear because the first team is adult-only |
| `implementationGate` | The affected release gate, initially L0; **not** proof the gate passed |

Workflow:

1. **Ask:** Identify the next unanswered decision and explain the practical effect, using accepted Team Manager role/UX decisions.
2. **Record:** After an explicit owner response, update the exact row on a review branch to `answered-pending-review` with a short coded or sanitised response, date and safe conversation reference. Retain previous approved versions through Git/PR history; preserve existing IDs. A policy answer may be “needs further assessment”; do not force a made-up decision.
3. **Review:** Distinguish owner preference from a legal applicability opinion, controller commitment, processor contract, safeguarding verification, cost approval and deployment authorisation. Where necessary an independent competent reviewer must evaluate the decision before marking it `approved`. Legal advice and private records remain off-repo.
4. **Reconcile:** Check that answer, privacy notice, security requirements, supplier/region, data inventory, retention/deletion, user rights and age/guardian model are coherent. Record blockers and only then seek separate L0 owner release approval in the existing gate ledger.
5. **Implement later:** The future private app can render questions, collect responses, obtain approvals, keep immutable decision history, ask for review on policy/supplier changes, and provide role-filtered, redacted audit exports. Do not expose private evidence to public clients or editable QA role selectors.

**Answer format:** For a `single` question, use exactly one listed machine code. For `review` questions, record `responseCode: "requires-detailed-policy"` with a concise non-identifying summary of the owner's direction, or `"no-decision"` if the owner cannot yet decide. Do not substitute a free-text individual record. If the proposed option is missing, amend the options transparently on a separate reviewed source change rather than misclassifying the response.

## Already accepted product principles, not new privacy approvals

- [D01](../architecture/owner-future-role-decisions-20261103.md): Platform operators do not routinely receive private content; emergency contacts require purpose-bound, permissioned access and audit.
- [D09](../architecture/owner-future-role-decisions-20261103.md): Under-18 guardian relationships must be independently verified. The initial team age group and exact child-account policy remain unknown.
- [D10](../architecture/owner-future-role-decisions-20261103.md): Injury/safety alerts require strict consent, scope and evidence; full clinical records are not automatically accessible.
- [D16](../architecture/owner-future-role-decisions-20261103.md): A player or verified guardian may record own availability; a Manager may transcribe an external response with provenance.
- [D18](../architecture/owner-future-role-decisions-20261103.md): Aggregate reports need small-cohort protection.
- [D21](../architecture/owner-future-role-decisions-20261103.md): The owner agreed to have retention, legal-hold, access, correction, export and deletion controls, **but their actual parameters remain unset**. No production personal-data release is authorised by D21.
- [#55](https://github.com/pdomoney/team-manager/issues/55) and [#252](https://github.com/pdomoney/team-manager/issues/252): Real backend, provider/budget, guardian and privacy decisions remain conditional. PR #258 is separate backend source work and must not be conflated with this register.

## Question sequence

### Who is involved and why

| ID | Decision | What it determines |
| --- | --- | --- |
| TM-PR-001 | First team age group | Whether junior safeguarding and guardian-access review is in-scope for the first release |
| TM-PR-002 | Responsible data controller | Who determines the purpose, notice, access responses, processing authority and incident ownership |
| TM-PR-003 | First live use and purpose | One team only, management breadth and later multi-club expansion |
| TM-PR-004 | Minimum data categories | Which registration, contact, player availability, roster, media and volunteer information is necessary |
| TM-PR-005 | Child login model | Guardian-led, limited child login subject to new review, or exclusion until safeguards |
| TM-PR-006 | Guardian verification and revocation | Proof, scope, custody disputes, expiry and audit without unsafe guessing |
| TM-PR-007 | Sensitive and emergency information | Whether health, injury, emergency contact, WWCC or safeguarding data is excluded or separately approved |

### Who can access and where it goes

| ID | Decision | What it determines |
| --- | --- | --- |
| TM-PR-008 | Role-by-data visibility | Exactly what Coach, Manager, Player, Guardian, Volunteer and Operator may see or update |
| TM-PR-009 | Notices, consent and withdrawal | Transparent collection and privacy information at each role's onboarding |
| TM-PR-010 | Backend provider and plan | Agreement owner, region, cost, authentication supplier and service responsibilities |
| TM-PR-011 | Overseas processors | Whether all services must stay in Australia or reviewed overseas processing is acceptable |
| TM-PR-012 | Messaging and external sharing | Email, WhatsApp, exports, association/club transfers and third-party disclosures |

### How data is protected and eventually removed

| ID | Decision | What it determines |
| --- | --- | --- |
| TM-PR-013 | Retention and deletion | Separate periods by record, end-of-season lifecycle, legal holds and backups |
| TM-PR-014 | People’s rights | Verified access, correction, deletion and export requests without cross-person disclosure |
| TM-PR-015 | Recovery and historic encrypted data | Legacy GitHub history risks, key rotation, backups, restore and supplier exit |
| TM-PR-016 | Audit and incidents | Who can inspect records, detect misuse, respond to incidents and assess notifications |
| TM-PR-017 | Legal/children's code applicability | Competent assessment of Privacy Act/APP and emerging Children's Online Privacy Code applicability |
| TM-PR-018 | Final authorisation | Distinct controller, privacy/legal reviewer and product-owner sign-offs before production use |

## Australian regulatory context for reviewer assessment

- [OAIC Australian Privacy Principles guidelines](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines): especially APP 1, 3, 5, 6, 8, 10, 11, 12 and 13 where the entity is subject to the Privacy Act.
- [OAIC guidance on collection and minimisation, updated 13 May 2026](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-3-app-3-collection-of-solicited-personal-information).
- [OAIC Children's Online Privacy Code](https://www.oaic.gov.au/privacy/privacy-registers/privacy-codes/childrens-online-privacy-code): as at 17 November 2026, scheduled for final registration **by 10 December 2026**. Assess scope, applicability and final form; **do not assume it applies to Team Manager** solely because a junior team may use it.
- The applicable law and actual legal controller obligations require case-specific professional review. This register documents questions, responses and review states, not a legal compliance certification.

## Launch guard

Before any actual personal-data production release, reconcile all applicable register decisions, verified external agreements, processor details, real security tests and #55/#252 owner release approvals. An answered question or a merged document PR does **not** change the existing L0–L6 `HOLD` status or the 0/8 qualified first-team journeys.
