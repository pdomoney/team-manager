# Play Engine 2.0 | E3.4.4 sport-specific rules reconciliation questions

**Date:** 10 November 2026 AEDT  
**State:** Source candidate for owner review; not independent local competition verification and not the actual formation implementation.  
**Initial product `main`:** `c914e5bd7aaebdf8192c3bb841c6ee7b759d464d`, owner-merged PR #202. Same-SHA GitHub [Tests #42734189168](https://github.com/pdomoney/team-manager/actions/runs/42734189168) and [Publish #42734188651](https://github.com/pdomoney/team-manager/actions/runs/42734188651) succeeded.  
**Framework `main`:** `cf557fb14a90e0f15a6de37d6a5ea002eff04ca3`.  
**Tracked programme:** [Issue #166](https://github.com/pdomoney/team-manager/issues/166), E3.4.4.

## Why this slice is justified

Merged E3.4.3 collects the exact reference, coach-entered league/grade/season, public HTTPS local source URL and possible rule edition. It does **not** explain the *sport-specific differences* that an independent reviewer must investigate, or verify the local league. That is a real workflow gap before owner-approved Rugby League/junior/League Tag formations. This PR adds **source-specific reconciliation questions** inside the existing coach-only review, without introducing another input form or pretending an authenticated sporting authority exists.

The E0 fictional Taren Point Titans junior example is **not** an approved specific league, grade or rules edition. There is no accepted sporting reviewer or approved complete field/actor positions in the application source. E3.4.4's actual local-rule acceptance gate is therefore HOLD even if this source slice passes CI.

## Authoritative references (checked 10 November 2026)

- [Play Rugby League Junior Laws, 6–12](https://www.playrugbyleague.com/laws-of-the-game-community/junior-league-laws-6-12s/): modified laws; explicitly consult the Local League for Under 9–12 formats.
- [Play Rugby League International 13+](https://www.playrugbyleague.com/laws-of-the-game-community/international-13splus-laws/): senior/international pathway. NSWRL notes the additional National Safeplay Code for Under 13–15.
- [Play Rugby League Other Laws](https://www.playrugbyleague.com/laws-of-the-game-community/other-laws-of-the-game/): League Tag distinct from International, Junior and 9/11 a-side reference pages; this source does **not** prove a particular local player count.
- [NSWRL Club Hub, Laws of the Game](https://clubhub.nswrl.com.au/support/solutions/articles/51000452816-laws-of-the-game): local league, age, Safeplay context.
- [Australian Oztag official rules](https://www.oztag.com.au/resources/rules): Oztag maximum on field is not approval of Team Manager's eight starter symbol locations.

These are **authoritative source entry points** but not evidence that a specific grade/competition adopts them unchanged. Do not infer real club affiliation or copy governing body logos.

## Scope implemented

1. **Pure source-specific crosscheck:** `site/play-format-local-crosscheck.js` picks *one of the four known E3.2 references* by validated exact ID, sport, source URL/title and original play sport. Its six stable questions require independently verifying league scope, on-field participant count, physical field, restarts/movement restrictions, age safety and complete teaching role positions. A distinct short focal warning for Oztag, Rugby League 13+, junior 6–12 and League Tag avoids using generic wrong-code instructions.
2. **Fail-closed boundary:** The crosscheck requires an E3.4.3 candidate assessment bound to the same reference, refuses forged/wrong-sport/unknown profile or unexpected review status, and returns only immutable `independent-review-pending` questions with `verified:false`, `canEnableProfile:false`, `matchReady:false`. It never accepts a reviewer name/checkbox as a sporting approval, accesses a private account, or mutates a team/roster/play.
3. **Non-intrusive coach experience:** The existing source review result adds a collapsed, keyboard-accessible **Questions for the local sporting reviewer** section. The copied reviewer packet appends the same pending questions and official source. A coach-entered local URL is labelled unverified and sanitized with the accepted E3.4.3 policy. Player preview never sees the coach-only action, questions or candidate local rules.
4. **Tests:** Positive and negative `test/play-format-local-crosscheck.test.js` covers all four sport variants, malicious/cross-sport profiles, missing source, immutability, sanitized URL and unchanged E0 golden. Existing `test/browser/play_e3_format_review.py` expands at 390px and 1280px to check closed/expanded disclosures, exact source specificity, all questions pending and unmodified old play/role journeys. Run exact-head Node, full Chromium and Linux WebKit before owner merge.

## Out of scope / release gates

No new/approved national or local rulebook; no 13-player or junior tactical scene; no permitted-move adjudicator; no complete formation coordinates, eligibility, match-ready roster, role/permission changes, persistent schema, installer, new credentials, public backend, data migration or deployment. Step Out/Step In IDs and eight-slot Oztag editor, custom plays, library, Coach Teach/Quick Look and player Learn/Watch remain unchanged.

The original E3.4.4 checkbox remains **OPEN** until the owner names the exact competition, local league, grade, season and current rules edition, and a genuinely authorised sporting reviewer independently confirms those rules and records any variations. E3.4.5 still requires approved field, participant count, every attacking/defensive/marker position and action meaning. E3.4.6 requires explicit owner approval. E3.5 and E3.6 are separate future stages.

**Progress denominator:** Merged E3.1–E3.3 100% each; merged E3.4.1–E3.4.3 3/6 = 50%; E3.5/E3.6 0% => overall E3 58.3% accepted checklist. This **preparatory PR does not increment that percentage**, even after source CI succeeds. Once genuine independent local sporting rules verification is completed, E3.4.4 may be ticked and the milestone count will increase to E3.4 4/6 = 66.7%, overall E3 61.1%. A source-only PR merge cannot produce that domain sign-off.
