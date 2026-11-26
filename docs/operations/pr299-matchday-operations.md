# PR299 consolidated Match Day candidate — development in progress

Owner decision 26 November 2026: Head Coach approves sporting decisions; Manager and Assistant Coach may record match events. Target: 2027 NSW Senior State Championships Mixed 20. Competition-specific rules must be verified before enabling persistent lineup or scoring. This is not a grant or an installation approval.

Accepted baseline: PR297 application f80c2ce4a67098598f53208699e0eddf577eb844; PR298 control 487862b1a71602faef72793b6e53ed680f7bebfa; 22 prior migrations and eight encrypted assets unchanged. Owner accepted 16/16. Source branch only, no provider changes.

## Source references and gate

- Australian Oztag 2025 national rulebook: https://oztag.com.au/ao/wp-content/uploads/2025/09/2025-AO-RULEBOOK-FINAL.pdf (reference, not tournament approval).
- National event calendar: https://api.oztag.com.au/events/ (19–21 March 2027).
- St George representative information: https://www.nswoztag.au/rep-info.
- Prior conditions of entry: https://oztag.com.au/ao/nswoztag/wp-content/uploads/sites/9/2022/09/Conditions-of-entry-2025.pdf (historical only).
- 2026 tournament 10/50 announcement: https://oztag.com.au/ao/nswoztag/blog/new-rule-introduction-10-50/ (not evidence of the exact 2027 edition).

The current target is a pending reference, not an approved competition-entry link. Confirm organiser edition/effective dates, divisions, scoring, field/bench/interchange, match periods, eligibility, forfeits, pool points and finals. Obtain owner approval of exact version. Never infer player category from name or appearance. Preserve adult-only scope.

## Current source increment

MD1: Existing Schedule match row opens Match Day preparation; retains navigation, branding and existing squad/availability paths.
MD2: Reconcile current selection, available named participants and omissions. No fabricated arrival, eligibility or scoring data.
MD8: Reuse existing selected-squad communication workflow; no automatic messages. MD9: Player sees only existing published squad and own availability. Assistant Coach currently sees schedule only (existing backend grant does not allow private squad reads). MD10: Existing server checks remain mandatory; no new write RPCs or roles. Reuse P11E checklist, explicitly mark target not linked and no rule approval. Cancelled/stale/cross-team fixture and revoked scope fail closed.

MD3–MD7 and new event-recording/approval/publication authority remain incomplete and unenabled: implement a separate server-side, exact-team/fixture/rules-version contract with concurrency, audit and tests once competition requirements are established. Match arrival persistence also needs an explicit server contract; do not reuse training attendance as match arrivals. Existing historical records must not be changed. No fake official results.

One consolidated PR intended. Before opening for merge, reconcile the release path against accepted PR297/298 artifacts; the existing controller is specifically pinned to PR297. No modification of historical evidence or migration pins. Local qualification before merge, no Docker or restore rehearsal, one fresh backup at authorised cutover. No production action is authorised by this candidate.
