# Implementation handoff: national club directory (future PR)

## Objective

Add a **read-only, searchable national club reference catalogue**, populated only from publication-approved, club-level data. Integrate with the Team Manager existing club setup by explicitly offering to **copy selected public club metadata** into a new privately-managed club record, rather than allowing direct edits to the national source.

This document archives the implementation requirements only. No production implementation is authorized by this branch.

## Existing Team Manager architecture to preserve

The current `site/model.js` `normClub()`, `clubOf()` and `clubTeams()` methods operate on the owner's editable `ws.clubs`, where `clubId` ties teams to the managed club. The app's `site/vault.js` `teamView()` publishes carefully allowlisted club fields with a team. Do **not** replace this model or globally share a coach's notes, branding edits, club officials or permissions.

Create a distinct national catalogue with its own stable identity (`directory_club_id`) and source metadata, separate from local `club.id`. Keep original public source ID(s) and aliases available for future deduplication.

## Scope

**In:** club name, alternate name, official identifier where verified, state, governing region and association where verified, suburb/postcode, public ground/address, website, general contact phone/email, published club registration URL, publication-approved logo (if licensed), source URL, review date, confidence and status.

**Out:** teams, competitions, matches, seasons, people/officials' names, personal mobile numbers, participant details, team registration, coaches' roles and permission assignment, automatic creation of local clubs.

Do not derive NRL registration status merely from being named in competition pages, old news or third-party directories.

## Stages for a subsequent implementation PR

1. **Acquisition and licensing:** Secure reusable club-only upstream data (NRL, MySideline, governing bodies) with permission to store and publish it; review the terms. Retain exact source URL, publication date, fetch/review date and terms/permissions record.
2. **Coverage and identity:** Reconcile all jurisdictions and regions. Treat `TAS=0` and QLD major-clubs-only as known gaps. Deduplicate by verified official ID, followed by normalized name + locality/state only when non-conflicting. Do not silently merge conflicting MySideline IDs.
3. **Validation pipeline:** Offline, deterministic import with dry-run report; idempotent ingest; explicit approval for aliases/conflicts; no overwrite of verified values with blanks, candidate assertions or older records. Store versioned catalogue and audit/coverage report.
4. **User experience:** Add search/select by club name, aliases, state, region and suburb. A result is not an access grant. Show last verified date and 'unverified' or 'details need checking' status. Require explicit confirmation to copy supported fields into a new managed club.
5. **Storage and deployment:** Serve approved read-only directory data separately from encrypted, mutable coach workspace records. No autoload into every user's local storage or private team file. Prefer paged or indexed search that performs well across thousands of entries. Define ownership and refresh policy.
6. **Regression and controlled release:** Protect team switching, branding, team-specific permissions, private coach contacts, offline use and player copy privacy; verify licence approvals, scope and completeness before production publication.

## Mandatory acceptance gates

- Zero teams, matches, seasons, people or permissions imported from the directory.
- Existing coach-managed club `ws.clubs` and `clubId` relationships survive upgrade unchanged.
- Import twice is idempotent; every source row traces to a source, status and check date.
- Same-name clubs in different states are preserved; differing verified IDs are never silently unified.
- All 143 pilot entries remain **unverified** until specific authoritative registration proof is recorded; there is no '143 registered clubs' claim.
- Search cannot grant administrator, manager or volunteer privileges, even when club details match.
- Browsing and preview do not mutate local or published team data.
- Privacy tests confirm player copies exclude private notes, contact details and access controls.
- No raw third-party source dataset appears in public pages or repo before permission to republish.
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
