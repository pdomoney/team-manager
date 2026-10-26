# Historical pilot handoff and remaining national club verification work

## Objective

**Historical objective (20 October 2026):** add a read-only national club reference catalogue without silently modifying a coach's managed clubs.

**Already implemented (26 October 2026):** [PR39](https://github.com/pdomoney/team-manager/pull/39) shipped the **research-candidate** directory and explicit copy-to-managed-club workflow. Subsequent linking work provides an explicit coach-confirmed `directoryMatch` to fill only missing sourced fields without overwriting existing `ws.clubs` identity, branding, notes or permissions. The current public catalogue has **143 rugby league** and **132 Oztag** entries. This historical PR contains **documentation only** and does not publish the original ZIP/SQLite/CSV.

**Still unresolved:** source reuse/publication terms; positive verification of current registration or affiliation; missing jurisdictions/regions; per-row provenance and refresh cadence; audit of the already-public research-derived data. Do not call the present directory registration-verified or licensed solely because it is deployed. New authoritative datasets require separately reviewed provenance and approvals.

See [CURRENT_STATE_AND_NEXT_PHASE.md](CURRENT_STATE_AND_NEXT_PHASE.md) for specific next-phase gates.

## Existing Team Manager architecture to preserve

The current `site/model.js` `normClub()`, `clubOf()` and `clubTeams()` methods operate on the owner's editable `ws.clubs`, where `clubId` ties teams to the managed club. The app's `site/vault.js` `teamView()` publishes carefully allowlisted club fields with a team. Do **not** replace this model or globally share a coach's notes, branding edits, club officials or permissions.

Create a distinct national catalogue with its own stable identity (`directory_club_id`) and source metadata, separate from local `club.id`. Keep original public source ID(s) and aliases available for future deduplication.

## Scope

**In:** club name, alternate name, official identifier where verified, state, governing region and association where verified, suburb/postcode, public ground/address, website, general contact phone/email, published club registration URL, publication-approved logo (if licensed), source URL, review date, confidence and status.

**Out:** teams, competitions, matches, seasons, people/officials' names, personal mobile numbers, participant details, team registration, coaches' roles and permission assignment, automatic creation of local clubs.

Do not derive NRL registration status merely from being named in competition pages, old news or third-party directories.

## Original stages and their current status

1. **Acquisition and licensing — OUTSTANDING:** Review terms and licence/reuse permission for current public research catalogue as well as future NRL, MySideline and governing-body sources; retain exact URL, date and approval evidence. Remove, restrict or replace any records if permission is not supported.
2. **Coverage and identity — PARTIAL:** Reconcile all jurisdictions and regions. Treat `TAS=0` and QLD major-clubs-only as known gaps. Deduplicate by verified official ID, followed by normalized name + locality/state only when non-conflicting. Do not silently merge conflicting MySideline IDs.
3. **Validation pipeline — OUTSTANDING:** Offline, deterministic source audit/dry-run report; idempotent ingest; explicit approval for aliases/conflicts; no overwrite of verified values with blanks, candidate assertions or older records. Store versioned catalogue and audit/coverage report.
4. **User experience — RESEARCH-LEVEL LIVE, AUTHORITATIVE UPLIFT OUTSTANDING:** Current PR39+ supports candidate search, explicit copy and coach-confirmed linking. A result is not an access grant. Preserve candidate labels, reveal last checked date, and only show authoritative registration when independent source proof has been reviewed.
5. **Storage and deployment — PARTIAL:** A public static 275-row candidate catalogue already ships separately from the encrypted coach workspace. No raw ZIP has been committed. Audit data-rights provenance and set a refresh/removal process before expanding it to thousands of verified entries. Never auto-import a directory candidate into coach data.
6. **Regression and controlled release — EXISTING TESTS, ADDITIONAL SOURCE GATES:** PR39+ unit/browser checks protect team switching, branding, manual consent and private player projections. New authoritative claims or source data still require their own rights/coverage review, negative security tests, offline/real Safari review and owner approval.

## Mandatory acceptance gates

- Zero teams, matches, seasons, people or permissions imported from the directory.
- Existing coach-managed club `ws.clubs` and `clubId` relationships survive upgrade unchanged.
- Import twice is idempotent; every source row traces to a source, status and check date.
- Same-name clubs in different states are preserved; differing verified IDs are never silently unified.
- All 143 pilot entries remain **unverified** until specific authoritative registration proof is recorded; there is no '143 registered clubs' claim.
- Search cannot grant administrator, manager or volunteer privileges, even when club details match.
- Browsing and preview do not mutate local or published team data.
- Privacy tests confirm player copies exclude private notes, contact details and access controls.
- The **historical raw pilot archive** remains absent from public GitHub Pages/repo. Separately, a research-derived public directory already ships from PR39; its source licences and publication permissions remain subject to explicit audit. No extra raw source dump, new images or permission-dependent data is to be published.
- Automated unit and browser checks pass; manual Safari review; explicit approval before merging into production.

## Recover and verify the original research archive

Owner must provide `NRL_Australia_Club_Directory_PILOT_v0.1.0.zip` from separately controlled storage, then:

```sh
sha256sum NRL_Australia_Club_Directory_PILOT_v0.1.0.zip
unzip -t NRL_Australia_Club_Directory_PILOT_v0.1.0.zip
unzip NRL_Australia_Club_Directory_PILOT_v0.1.0.zip -d ./nrl-club-pilot
cd ./nrl-club-pilot
python3 - <<'PY'
import csv, sqlite3
con=sqlite3.connect("NRL_Australia_Club_Directory_PILOT.sqlite")
assert con.execute("pragma integrity_check").fetchone()[0]=="ok"
assert con.execute("select count(*) from clubs").fetchone()[0]==143
assert con.execute("select count(*) from clubs where registration_status!='unverified'").fetchone()[0]==0
with open("NRL_Australia_Club_Directory_PILOT.csv",newline="",encoding="utf-8-sig") as f:
    assert len(list(csv.DictReader(f)))==143
print("Research pilot validation PASS")
PY
```

Archive SHA-256 must equal the hash recorded in `PILOT_MANIFEST.json`. Check individual archive member hashes against the manifest before using the data in any implementation.
