# National rugby league club directory: deferred Team Manager implementation

**Status:** historical research pilot `v0.1.0`, 20 October 2026, being archived as documentation. **The raw pilot ZIP/database was not authorised for public redistribution or checked into this repository.** This folder is not a new production feature.

## Current application status as of 26 October 2026

**Important supersession note:** The original handoff predates [merged PR #39](https://github.com/pdomoney/team-manager/pull/39). The current application already has a **public, read-only research reference catalogue** in `site/club-directory-data.js` (`143` rugby league candidates and `132` deduplicated Oztag candidates), search/filter controls in `site/club-directory.js`, and coach-confirmed linking to locally managed clubs in `site/club-link.js` ([linking guide](../../club-research-linking.md)).

These deployed references are **unverified research candidates**: they are not official live registration totals, evidence of club affiliation, source-licensing approval, or permission grants. The presence of the **separately derived 275-record public catalogue** must not be confused with the **uncommitted historical pilot's raw CSV/SQLite/ZIP**. The absence of the raw archive from GitHub does **not** by itself resolve any publication/reuse rights in the currently deployed derivative dataset.

Do **not** merge this PR expecting it to add new clubs or implement search. Those functions are already present. The useful remaining follow-on work is **source terms/permission review, record-level provenance quality, authoritative verification, coverage reconciliation and source freshness**, tracked separately. See [CURRENT_STATE_AND_NEXT_PHASE.md](CURRENT_STATE_AND_NEXT_PHASE.md).

## Purpose and strict boundary

Provide a **national directory of clubs only** for future Team Manager discovery and club onboarding. No team, player, staff member, match, season or competition data is to be imported. A national club listing must be separate from the club and team records created by coaches and club administrators. Simply finding or selecting a club **must not** confer admin access, club ownership, membership or any ability to edit a third-party club.

## Where the source pilot currently lives

The original archive prepared for this project is named:

`NRL_Australia_Club_Directory_PILOT_v0.1.0.zip`

Contents:
- `NRL_Australia_Club_Directory_PILOT.sqlite`
- `NRL_Australia_Club_Directory_PILOT.csv`
- `NRL_Australia_Club_Directory_PILOT.json`
- `NRL_Club_Directory_README.md`
- `build_nrl_club_directory.py`
- `import_nrl_club_feed.py`
- `NRL_Club_Import_Template.csv`
- `NRL_Club_Directory_MANIFEST.json`

**The raw database, source archive and importer are intentionally NOT committed to this public GitHub repository** because applicable source-data redistribution permission has not been confirmed. The project owner should retain the ZIP separately in controlled storage, or establish a new **private, Team Manager-specific** GitHub repository for its archival copy. Do not use an unrelated private repository. Use `PILOT_MANIFEST.json` to verify a recovered archive against this handoff.

Archive SHA-256: `73683ebdc933cbc1a7597c9644c5e1c4151eecfaf4c724f1ea98b65fbe27a5eb`

## Data actually collected

143 preliminary distinct club candidates, from ACT 6, NSW 70, NT 15, QLD 14, SA 6, VIC 5 and WA 27. Tasmania has 0 records **because authoritative coverage is not yet obtained**, not because Tasmania lacks clubs. These totals are **pilot coverage**, not national registered-club totals.

All 143 records have `registration_status=unverified`; **none** has independently confirmed current NRL registration. MySideline club identifiers were not guessed. Some NSW records come from club-like names observed in public competition listings; ACT examples include third-party regional directory references. Regions ending in 'candidate' are provisional collecting groups, not verified governing associations.

The research source list is captured in the pilot's `sources` table and JSON export. Representative sources include NRL WA, NRL SA, NRL NT, QRL, NRL Victoria and MySideline public competition pages. Public directory discovery is not proof of current affiliation.

## Proposed fields

`club_id, club_name, state_territory, region, association, locality, postcode, home_ground, website, club_email, club_phone, public_registration_url, mysideline_club_id, club_category, registration_status, verification_status, last_checked, source_urls, note`.

Keep provenance and evidence separately for multiple references and review history; avoid unverified or inferred registration claims. For the target import contract see [PRODUCTION_HANDOFF.md](PRODUCTION_HANDOFF.md).

## Publication and access rules

1. Do not add the **unreleased raw pilot archive and importer** to the public `site/` build output, JavaScript bundle, GitHub Pages static assets or published coach/player encrypted data files. The separately prepared **public research candidates** in `site/club-directory-data.js` already exist (PR39); review that material's provenance and reuse rights separately.
2. Do not silently populate `ws.clubs` or existing editable club records.
3. Do not copy logos, brand assets or bulk MySideline/NRL-derived directories to a public asset until permitted.
4. If authorized for publication, place only reviewed and publication-approved **club-level** fields in a versioned, read-only directory; no personal contacts or participant data.
5. Promotion of any **additional raw-source fields or authoritative registration claims** requires a subsequent explicit PR with record-level verification, source/reuse review and owner approval. Existing research-level search from PR39 must not be represented as authoritative registration.

See the manifest and implementation handoff for integrity checks and acceptance criteria.
