# Team Manager privacy decision register

**Status:** Open questionnaire. **TM-PR-001 through TM-PR-009 answered; 9 questions remain unanswered. All nine responses are pending review.** TM-PR-006's verifying actor is clarified as the **appointed team Manager**, but evidence standards and independent privacy approval remain open. No supplier selection, verified legal entity/controller allocation, guardian policy, legal approval, or authority for production personal-data processing has been recorded. Created 17 November 2026, based on `main` `0f1b34617a905c6e051b1f1866d87a558870ef51`.

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

TM-PR-010 through TM-PR-018 remain unanswered. TM-PR-006 has an explicit response and a resolved verifier-role clarification, but the operational verification and privacy policy remains open. TM-PR-004 identifies the owner's requested fields, but purpose, necessity and lawful collection for each field remain unapproved. TM-PR-005 defines the proposed junior self-login model; TM-PR-006 guardian verification, activation and child consent (decision detail incomplete), TM-PR-007 emergency-contact-only scope (with detailed access still unapproved), TM-PR-008 Manager/Club Admin read scope (fine-grained permissions still undecided), TM-PR-009 notice and marketing preference direction is recorded but detailed legal, child/guardian and consent-evidence rules remain pending; TM-PR-013 retention is still unanswered. In particular, a junior may not have a personal phone, and a residential address or identifying photo may not be necessary for every role or age group. Recorded policy direction is not a verified legal-controller allocation, provider contract, completed privacy review or release approval.

**Breach notification note:** The OAIC's NDB guidance allows affected entities to coordinate assessment and notification, but each covered entity holding relevant personal information must be able to demonstrate its own compliance. The platform may coordinate and submit notices under an agreed arrangement; an assignment in Team Manager cannot remove a club's or association's independent legal duties where they apply. See [OAIC: NDB scheme and multi-entity responsibility](https://www.oaic.gov.au/privacy/notifiable-data-breaches/preventing-preparing-for-and-responding-to-data-breaches/data-breach-preparation-and-response/part-4-notifiable-data-breach-ndb-scheme).

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
