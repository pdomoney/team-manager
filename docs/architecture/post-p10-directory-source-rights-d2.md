# Post-P10 D2 — Source-host reuse rights and freshness triage

**Scope:** issue #99, phase D2. Based on already-merged [D1 PR100](https://github.com/pdomoney/team-manager/pull/100), which inventories 275 *research candidates* (143 rugby league, 132 Oztag). No new clubs or registration claims are published in this PR.

## Findings and rights controls

`config/directory-source-rights.json` creates a **13-host source registry** with status `pending` or `terms_identified_review_required`. **All permission decisions are unresolved**. Nothing has been declared approved or licence-cleared.

An official [NRL Terms of Use](https://www.nrl.com/terms-of-use/) page was reviewed on **26 October 2026**, with a published page update date of **12 December 2017**. Its copyright section restricts reproduction or publication of NRL Network material without prior written consent except where relevant law permits. A [NRL licensing contact](https://www.nrl.com/contact-us/) is published. The page should be evaluated by an authorised source-rights reviewer for its applicability to specific `nrl.com` records; do not assume the NRL Network Terms automatically cover independent `prl.mysideline.com.au`, region-level websites or that every isolated club-name fact is copyright protected. No legal conclusion or redistribution permission is issued by this repository.

Australian Oztag publicly hosts [competition/location information](https://oztag.com.au/ao/loc_aust/) and currently uses a [competition search](https://www.oztag.com.au/), but a public listing is **not** permission to reproduce a bulk directory or an assurance that its historical contacts are still current. We have not identified an authoritative blanket commercial republication licence. Each relevant source/host must be reviewed.

**Do not conflate:** publicly accessible names; a club being officially registered; ability to process public contact information; copyright/database/bulk extraction reuse rights; any actual ownership/admin role within Team Manager. These are separate decisions.

## Offline audit commands

```bash
node scripts/audit-source-rights.mjs
node scripts/audit-source-rights.mjs --json
npm test
npm run test:browser
```

The CLI scans **only** the static directory already shipped in `site/club-directory-data.js`. It performs no web fetch, club/team import, private workspace access or writes. Its JSON is aggregate-only (source hostname, counts, source classes, fields, warning indices), not raw source URLs, private people or contacts.

For each source hostname, the audit reports source classes (e.g. third-party listing, historical location, official registration portal), sports and counts; current terms lead; stale-review count and any concatenated source URLs. The current reference date is 26 October 2026 and the default candidate review freshness limit is 180 days. **One combined URL value** is flagged for manual normalization after source review. All 275 candidate records currently lack complete documented publication-rights sign-off in the deployed source registry.

### What constitutes an explicit host scope decision

A source may be represented as `approved` **only following independent legal/source owner review**, with `reviewedBy`, `decisionDate`, a traceable `licenceOrConsentRef`, applicable `termsUrl`, `intendedUse: public_read_only_directory`, all `permittedSourceClasses` and `permittedFields` that cover actual published records, plus an optional expiry date. A record with missing fields, expired consent or a narrow permission is still **blocked**.

Technical test fixtures demonstrate this gate without granting real permission. Even when complete synthetic evidence is provided, the CLI's status remains `TECHNICAL_EVIDENCE_PRESENT_HUMAN_SIGNOFF_REQUIRED`, not "cleared for production." Do not put actual confidential contracts or people details in this public GitHub repository. Use a private, reviewer-controlled evidence store and only an appropriately redacted reference in public metadata.

## Prioritised review

1. **Third-party and inferred records first:** `bartv.com.au`, `prl.mysideline.com.au`, historical Oztag location sources and multiple/compound source URLs. Establish whether publication rights exist, what fields are permitted and whether any existing public content needs suppression while under review.
2. **Governing-body and registration portal references:** `oztag.com.au`, `nrlwa.com.au`, `nrlnt.com.au`, `qrl.com.au`, `nrlsa.com.au`, `nrlvic.com`, `nrl.com`. An official host does not constitute consent to republish.
3. **Regional and municipality one-offs:** `actoztag.com.au`, `nswoztag.au`, `melton.vic.gov.au`. Check current URL validity, names/contacts and original reuse conditions.
4. **Governance:** assign the human permission reviewer and cadence; record approval/exception/denial and any planned non-destructive suppression in a **separate, owner-reviewed PR**, with privacy and regression tests. The present PR makes **zero automatic publication or suppressions**, because that would change already-visible data without a decision.

## What remains after D2

**D3**: evidence-backed verified club identity, regions, Queensland/Tasmania coverage, deduplication and controlled non-destructive source refresh. Real permissions and official NRL/association status remain unverified until reviewed per record. Do not infer current registration from an official-looking domain or historical fixture listing.

**Acceptance:** exact-head Node/full Chromium (capacity included) PASS; no change to records, workspace, encrypted GitHub data or publishing. Owner merges this triage separately. The fact a tool executed and a rights registry exists is **not** legal approval or final directory readiness.
