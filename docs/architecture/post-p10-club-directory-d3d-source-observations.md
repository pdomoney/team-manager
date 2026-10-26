# D3D - Actual public official-source observations; no registration or rights approval

**Workstream:** [Directory verification issue #99](https://github.com/pdomoney/team-manager/issues/99). Based on the owner-merged D3C [PR104](https://github.com/pdomoney/team-manager/pull/104), main `6076fa1bc765eacc1afa99da0856cf83fe24b22a` (26 October 2026).

## What was independently located on 26 October 2026

The existing 275 public research records remain **unverified candidates**. A limited manual public-source lookup found two official *Play Rugby League* pages in Canberra Region Rugby League:

| Existing catalogue identity | Official-source page label | Official citation |
| --- | --- | --- |
| Belconnen United Sharks (`rlc_c4d2672383f09c`) | Belconnen United Sharks **Seniors** | https://www.playrugbyleague.com/Competitions/Club/belconnen-united-sharks-seniors-234911 |
| Gungahlin Bulls (`rlc_1004b6ffaa6d1e`) | Gungahlin Bulls **Seniors** | https://www.playrugbyleague.com/Competitions/Club/gungahlin-bulls-seniors-13450 |

The Canterbury/Canberra governing-region FAQ at https://www.raiders.com.au/crrl/about/faq-page/ specifically directs potential registrants to Play Rugby League and separately discusses juniors and seniors. This supplies **review leads**, not authoritative determinations by Team Manager. The Seniors qualifier may matter: a generic catalogue club and a specific seniors registration entity must **not** be silently equated, renamed, or merged with a junior club.

The official NRL Terms of Use https://www.nrl.com/terms-of-use explicitly restrict copying/publication without prior written consent except as permitted by law. Whether those terms govern each of these *Play Rugby League* URLs and the proposed use of names/links must be confirmed by the actual rights owner or qualified reviewer. NRL's https://www.nrl.com/contact-us/ advertises a licensing enquiry channel. No permission was obtained.

Australian Oztag has a publicly discoverable terms link at https://www.oztag.com.au/term_conditions and competition locator at https://www.oztag.com.au/locations, but this review session could not fetch the page content (HTTP 403). **Do not mark its terms reviewed or infer permission**. Competition locations may not be registered clubs.

## What the D3D branch changes

- `config/directory-source-observations.json`: two provenance-only records with public official page URLs, observed names, exact candidate IDs, observation dates and unresolved review hints. No club contact information, private records, logos or registration status.
- `site/club-directory-source-observations.js`: a strict, offline, fail-closed audit of exact candidate linkage, source URL/host, name differences, dates and unapproved rights.
- `scripts/audit-directory-source-observations.mjs`: bounded no-network reviewer display, optionally `--id` and `--json`. Never accepts arbitrary file paths.
- `test/club-directory-source-observations.test.js`: seven negative and positive safety regressions.

These **do not modify** `site/club-directory-data.js`, any managed club/team, encrypted coach data, roles, rights ledger, git data branch or published UI. No site assets from third parties are imported. A names-match result is still *not* a verified registration or copy permission.

## Reviewer acceptance and next actions

1. Independently check exact official registration/affiliation for the two entries, seniors/juniors split, current 2026 status, state, organisation ownership and whether original research names are too broad. Record specific evidence and reviewer.
2. Seek applicable scoped permission/licensing decision for public directory reuse and intended fields. Obtain explicit approval or legal review, rather than interpreting this code as clearance.
3. Use D3C exact record packets plus D3A syntax validation as a controlled handoff. Explicit identity and source rights sign-off are mandatory before any record-level publication/correction PR.
4. Verify Node and all Chromium test suites including capacity against PR head, then owner acceptance; verify merged-main Tests and Publish, then real-device Safari separately.

**Issue #99 remains open at 67% overall**, with real approvals and verified club data updates outstanding. Rollback affects only these four isolated review files.