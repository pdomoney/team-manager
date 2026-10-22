# National rugby league club directory: deferred Team Manager implementation

**Status:** archived research pilot, `v0.1.0`, 20 October 2026. **Not approved for production or redistribution.** This folder is a future-implementation handoff, not an app feature.

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

1. Do not add the pilot to the public `site/` build output, JavaScript bundle, GitHub Pages static assets or published coach/player encrypted data files.
2. Do not silently populate `ws.clubs` or existing editable club records.
3. Do not copy logos, brand assets or bulk MySideline/NRL-derived directories to a public asset until permitted.
4. If authorized for publication, place only reviewed and publication-approved **club-level** fields in a versioned, read-only directory; no personal contacts or participant data.
5. Promotion to production requires an explicit subsequent PR with test evidence, licensing review and owner approval.

See the manifest and implementation handoff for integrity checks and acceptance criteria.
