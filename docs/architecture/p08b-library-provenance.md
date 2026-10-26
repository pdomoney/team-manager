# P08B — Local play library origin and deliberate copying

**Base:** [PR83](https://github.com/pdomoney/team-manager/pull/83) merge `8a42a850285fd88e32b92167df51081bd1a4d6af`.

## Current-platform boundary

The library belongs to a **single trusted coach workspace** encrypted locally and published through the existing GitHub Pages/data-branch workflow. It is not a club/association tenant, and a source sport/club label is not access permission or proof of origin. Independent association and club libraries remain a post-P10 backend requirement (#55) requiring authentication and server-enforced authorisation.

## Additive change

- New library saves record `libraryOrigin: {scope:'coach-workspace', teamId,clubId,sport}`. This is descriptive metadata in the already encrypted library record; no change to schema version, team record IDs, rule packs or library export format.
- When updating a library item, its existing origin remains stable, and the library revision increments normally; edited team copies remain untouched, while unedited linked copies follow updates as before.
- Entries predating P08B or imported without a valid source remain **unknown provenance**. They are never silently claimed to be the current club's or sport's content. Imported files still require manual trust review.
- The coach library screen shows source sport, local scope and review prompts. An explicit **Add to this team** action requires additional confirmation for unknown source, different club or different sport. A matching local source has the previous one-click add behaviour.
- When the coach explicitly asks to include library content when making a new team, **only source entries from the same club and sport** may be automatically copied. Other entries are retained in the library for later review, not deleted. The new team's own plays and setups are unchanged.
- Existing linked copies made before the upgrade remain available with their current revision state; no rewrite or unlink migration. Library import/export and backup remain backwards compatible.

## Deliberate cautions

- Source fields are unverified local metadata, not immutable forensic provenance or a source licence. An imported JSON can supply them. This feature improves operator decisions, **not real cross-tenant security**.
- A coach who deliberately links a different-code play must review mechanics, score/restart laws, field layout and terminology. An existing unedited linked copy continues to receive updates when the source play is saved to the library. Detach the copy to preserve a team-specific adaptation.
- A library's exported JSON contains plays, game systems and diagram labels. The owner must still review the contents for accidental personal information before sending it outside the workspace.
- Historical player names, guardians, volunteer accreditation and results are not added to provenance.

## Automated and manual qualification

- `test/p08b-library-provenance.test.js`: new/legacy/malformed imported origin, strict same-club/sport auto selection, revisions, no mutation and person-data boundary.
- `test/browser/p08b_library.py`: mobile/desktop library labelling and explicit cross-sport copy review using fictional source entries.
- Existing library linked-copy/version/import, new-team-setup, safeguarding, Node and full browser suites remain required; do not update assertions simply to silence a real regression.
- Owner should test: (1) two teams in the same club/sport, (2) two teams in different clubs, (3) touch team vs Oztag play, (4) imported pre-P08B library file, (5) edited local copy after a source revision, (6) backup/restore on Safari. Record real-device evidence before P08 phase acceptance.

## P08 delivery sequencing

P08A [PR83] merged. P08B is this scoped PR. P08C will separately address code-aware tactic and teaching presentation. Physical Safari, post-merge Tests/Publish and explicit P08 acceptance remain open.

## Rollback

Revert this PR to merge `8a42a850285fd88e32b92167df51081bd1a4d6af`. Older versions ignore `libraryOrigin` and keep existing plays and revisions. No database migration or service rollback is needed. Reversion restores older broad library auto-copy behaviour, so existing data must remain backed up.
