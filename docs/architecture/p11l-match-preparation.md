# P11L · Integrated non-Oztag fixture preparation (Issue #120 / #31)

Built on merged PR118 venue presence, PR117 season-specific RSVP and P11F organiser evidence drafts. The new **Match preparation** view in Match details consolidates exact-season RSVP cohorts, human conflict count, recorded venue presence and unresolved rules questions. It links to existing **Squad readiness** and **Venue check-in** controls; opening either has no writes.

The pure helper `matchPreparationSummary` cannot authorise a lineup, scoring, health fitness, eligibility, registered membership or team selection. The existing read-only rules worksheet is still the place to seek organiser answers. Same-day check-in remains a local browser calendar operator feature, not a verified identity event. Orphan seasons fail closed; previous match results remain read-only and the Oztag editor is unchanged.

Test on 390px phone, 820px tablet, 1280px desktop and real iPhone/macOS Safari: four non-Oztag sports, active/future/completed/orphan seasons, direct disclosure navigation, arrival undo from PR118, identical names/jerseys, no hidden scores, no automatic data or messages. Owner approval and post-merge tests required. P11 M2/M3/M4/M5 remain open without independently verified competition-specific scoring/lineup policy and real Safari approval.
