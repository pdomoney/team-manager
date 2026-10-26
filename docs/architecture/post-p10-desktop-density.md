# Post-P10 desktop display density — compact dashboard

## Design motivation

Based on two product-owner screenshots on **26 October 2026**: normal Safari Actual Size versus two browser zoom-out steps. The zoomed-out version displays more of **Outstanding actions, Coming up and at-a-glance team metrics** at once, but browser zoom is not an appropriate global app setting; it affects accessibility, browser preferences, input sizes, responsive breakpoints, diagrams and mobile users.

Instead, add an **opt-in compact desktop density** with no `zoom`, `transform:scale`, viewport meta, or artificial browser zoom changes.

## User behaviour

- On desktop in **Auto/Wide layout at CSS viewport width ≥1000px**, header shows an unobtrusive quick button: **Compact** in comfortable mode and **Comfortable** when compact is active.
- In **Settings → Screen layout → Display density**, buttons **Comfortable** (default) / **Compact** switch the same mode.
- Compact reduces generous header/status padding, wide sidebar space, main gutter/column gaps, card paddings and heights, large headings, action-list rows and statistic cells. Text stays legible; desktop primary buttons retain a minimum 40px height. The browser zoom remains unchanged.
- State stored under **`tm-density` only on this device**, never in the team/workspace schema, GitHub data branch, encrypted backups, or publishing credentials. Refresh restores the setting.
- Narrow screens, phone-layout preference and widths under 1000 CSS pixels retain comfortable spacing even if compact was previously selected on a larger screen. Returning to wide brings compact back.
- The toggle is hidden before login, in a locked session and in fictional persona QA previews. Existing pages and their form data are unchanged. No new backend, migration, record edits or authentication change.

## Acceptance and regression

`npm test` covers density preference validation and wide/narrow fallback, including rejecting unrecognised values. `npm run test:browser` includes `desktop_density.py`, checking desktop widths 1280/1660; visible quick toggle, reduced computed sidebar/main/font metrics, persistence after reload, Setting controls, visual no-overflow, unchanged team JSON, breakpoint fallback and mobile 390 safeguards. Full PR head should include capacity suite; post-merge main tests and Publish are separate.

**Manual validation still needed:** compare screenshot at Safari 100% zoom in comfortable versus compact with 16:9 desktop window; verify at narrow laptop widths, macOS Safari/VoiceOver and iPhone Safari. Do not claim real Safari tests passed from Chromium. Density does not guarantee an exact browser-zoom equivalent, and can be tuned based on direct observation.

Rollback: revert the density branch; users fall back to comfortable styling with no data migration. The harmless `tm-density` browser setting can be ignored if the code is reverted.
