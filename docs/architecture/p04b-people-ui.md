# P04B — Coach-only People and guardian review interface

**Parent phase:** [P04 #46](https://github.com/pdomoney/team-manager/issues/46) · [Architecture roadmap #41](https://github.com/pdomoney/team-manager/issues/41)  
**Starting baseline:** merged P04A [PR #59](https://github.com/pdomoney/team-manager/pull/59), commit `b39acaeb84e6ed1083ad9abf2cb42877dd5c9536`.  
**Delivery:** separate draft UI PR requiring independent owner acceptance and full CI.

## 1. Coach-visible additions

- A coach-only **People** page is linked from **More → People**. It shows six kinds of existing local person records in the coach's currently unlocked workspace: player, helper, match official, club official, team staff and historic season staff.
- A search field filters source-record display labels by name, sport-associated role or club. Names are displayed **only in the coach session**, using output escaping; there is **no name-matched merge**.
- Existing cross-team player links made deliberately through `personId` remain indexed together. The interface does **not** amend player IDs, jersey allocations, attendance, coach notes, contacts, sporting roles or positions.
- An explicit two-select **Review and record link** form is limited to player/helper/match-official IDs, the only sources with stable IDs validated in P04A. The coach must confirm a second-stage explanatory dialog. The new review is saved through the existing coach workspace `save()`, encrypted draft, and normal encrypted GitHub publishing path. A reviewer value of `Shared coach workspace` is **not** a verified person/account identity.
- Existing reviews can be **reversed** with explicit confirmation. Undo records a tombstone that participates in existing three-way merge handling, without deleting original person histories.
- A read-only **Guardian relationship candidates** section shows helper-to-player associations that need investigation. A helper link is not legally verified guardianship; no credentials, self-service or child access are created.

## 2. Boundaries and design decisions

**Existing platform remains unchanged:** GitHub Pages, coach/password encrypted `coach.enc.json`, team/password player projections, local encrypted draft, and the existing data branch. No Supabase or new server until separately approved post-P10 work in #55.

- The page is coach-only in the current shared-coach-password sense; **not a guarantee of independent role identities or secure association/club delegation**.
- The review namespace derives consistently from `GitHub owner/repo` and coach-vs-trial context, not from a display name. It distinguishes separate repos, but does **not** constitute secure tenancy or proof of an organisation. The isolated sample mode uses its own fixed trial namespace when no repo is configured.
- Review proposals and their history are **advisory** only, not authoritative person identity or permission claims. Sensitive records and children do not become browsable across independent workspaces.
- The page does not offer durable links for snapshot staff rows with no stable IDs; those display **read only** with an explanation. A controlled legacy normalisation and durable staff ID migration will be required before this part of the full P04 acceptance can be claimed.
- The guardian section deliberately **does not persist verified family relationships or attestations**. Guardian relationship lifecycle, authorised actions, manual legal review and child safety rules still require a separate phase gate and future enforced identity (post-P10 #55).
- Reversed or stale reviews retain history. Source records missing or changed after review are labelled for follow-up instead of silently pointing to a different person.
- P04B **does not make the complete P04 phase automatically complete**. P04 stays open for the missing full staff lifecycle and guardian-authority workflow, manual Safari/mobile verification, owner approval and post-merge evidence. Any follow-up should be separately approved.

## 3. Regression and manual verification

Unit regressions in `test/people-ui.test.js` cover source scope and trial isolation, same-name collision, opt-in review, no legacy mutation, historic fields, invalid IDs, separate club workspaces, stale records, reverse and non-leakage to `teamView`.

Browser regression `test/browser/people_ui.py` exercises the real running app at 390 px: sample coach sign-in, More → People, coach-only layout, choose two existing stable records, confirm, verify encrypted-workspace field, reverse, search and player-preview restriction.

**Manual acceptance checklist** (not yet completed):

- [ ] Actual owner opens People in macOS Safari and mobile Safari; list and dropdowns usable and no unwanted horizontal scroll.
- [ ] Coach deliberately records and reverses a link between appropriate same-person records; no data fields accidentally joined.
- [ ] Privacy: player team encrypted file must not include `peopleReviews`, guardian hints, contact data or WWCC records.
- [ ] Existing jersey loans, player/season history, task allocations, club palette and match staff remain identical after review/reversal.
- [ ] Encrypted export/restore, GitHub publishing and two-browser conflicting review operations preserve ledger and user choices.
- [ ] Product owner explicitly accepts final PR head **for the actual implemented scope**, merge occurs, post-merge Tests/Publish PASS.
- [ ] Outstanding full-P04 staff identity/guardian relationship features are explicitly qualified before closing #46 or beginning P05.

## 4. Rollback

Export the encrypted coach workspace before rollback. The running UI may be reverted by removing the People page and `people-ui.js`, without deleting person data. P04A `peopleReviews` remains in the encrypted workspace. Restoring an app older than P04A may omit that field if it re-saves, so retain a copy of the encrypted backup and approved P04A/P04B version before reverting. Existing legacy sporting records remain unchanged.

**No automatic merges or live access grants.**
