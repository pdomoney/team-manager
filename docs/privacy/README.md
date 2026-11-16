# Team Manager privacy decision register

**Status:** Open questionnaire. **TM-PR-001 answered (under-18s included), pending review; 17 questions remain unanswered.** No supplier selection, controller determination, guardian policy, legal approval, or authority for production personal-data processing has been recorded. Created 17 November 2026, based on `main` `0f1b34617a905c6e051b1f1866d87a558870ef51`.

**Canonical structured register:** [`config/privacy-decision-register.json`](../../config/privacy-decision-register.json).

## Current recorded answers

| ID | Owner response | Status | Practical consequence |
| --- | --- | --- | --- |
| TM-PR-001 | First team **includes players under 18** (owner-confirmed, 17 November 2026) | **Answered, pending review** | Keep junior account, verified guardian, age transition, privacy notice and safeguarding decisions open. No real junior records or access can be processed until separate approvals. |

TM-PR-002 through TM-PR-018 remain unanswered. A response is not controller, legal, privacy, provider or release approval.

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
