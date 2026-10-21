# Confirming an existing managed club against directory research

## What the coach sees

In **More → Clubs and teams → Find a club**, each public research candidate still has **Use details**. A candidate that resembles an existing managed club now opens a **Confirm club match** panel, rather than a duplicate club editor. The separate **Match existing club** action works even when a spelling, abbreviation or club nickname prevents automatic name matching. Editing a managed club also offers **Find or review directory details**.

The coach chooses their actual managed club, reviews:
- the publicly sourced research record, sport and source link;
- blank details that would be added;
- populated details that would be left unchanged, even if the directory disagrees;
- the number of existing teams retaining their club ID.

Nothing is written until the coach clicks **Confirm same club**. **Not the same** opens a new, editable club draft, and **Cancel** leaves the workspace untouched.

## Merge rules

The managed club is authoritative. Its identity (ID), name, short name, default sport, existing contacts, ground and registration values, logo, theme, officials, private notes, teams, competition links, access and staff records are never overwritten by catalogue data.

Only missing, directly sourced details are filled: founding year, website, public email, public phone, single ground, location (only if a suburb is sourced), and an unambiguous registration link. The directory's unverified colour words are optional and only fill an empty colour-description field, never club styles or logos. Multi-venue associations and multi-registration listings never automatically choose a ground or registration portal. No generic 'affiliation to confirm' text is copied to the club's governing body.

The managed club records a private `directoryMatch` containing the research candidate ID, cited source URL, research review date, linking time and `user_confirmed_same_club_research_candidate` classification. This association is **not a current-registration verification** or permission grant. Attempting to link a record already linked to another research ID is blocked pending a separate explicit correction workflow. Repeating a link never overwrites a populated field.

The coach's own record stays in `ws.clubs`; there is no duplicate creation, migration, merging of team records or modification to encrypted GitHub publishing. `clubForPlayers` uses an allowlist, so `directoryMatch`, private notes and officials are not included in the player-facing projection.

## Verification / rollout

1. Run `npm test` and `npm run test:browser:smoke` on the exact pull-request head.
2. In the synthetic test library, search for **Engadine Dragons** and verify it proposes the existing **Engadine Dragons JRLFC**, with an email/founding year addition preview.
3. Confirm and check that exactly one managed Engadine club remains, all team relationships persist, its existing website, phone, logo and colours remain, and the source metadata is private.
4. Search for an unrelated club and check **Use details** still creates only an editable new draft. Test **Match existing club**, **Not the same**, cancellation, different-sport rejection and multi-venue associations.
5. Perform iPhone Safari visual acceptance and simulated plus real encrypted publishing acceptance before approving a merge. This PR does not publish or merge by itself.

Research data remains unverified. Do not use the link as proof of active 2026 governing-body registration or branding rights.
