# Play Engine 2.0 — E3 sport and formation contract (owner review)

**Status:** PROPOSED, NOT APPROVED. This is an architecture checkpoint, not an enabled formation renderer, published rule pack, schema change or permission to migrate existing plays.

**Programme:** [#166](https://github.com/pdomoney/team-manager/issues/166), E3.  
**Product source:** `main` `023fa5a83057c3b447c73136bcd41c4361b668c0` (after merged E1 #167 and E2 #168).  
**Development guidance:** Walking Comet framework `c6adabc42d903d4eba63410abfff510e68048cb5`, existing-product, web-frontend, P1 synthetic UI safeguards.

## 1. What remains true today

- Oztag: existing working eight-slot geometry, starter IDs `quickie-in` / `quickie-out` (display names **Step In** / **Step Out**), editor, Learn/Watch, mirroring, shared library and encrypted workspace.
- Rugby League, League Tag and other codes: `p08-sport-capabilities.js` and `p08-play-compatibility.js` explicitly restrict their diagrams to **eight-slot teaching concepts**. A sporting code tag or position list alone does not verify a whole-team formation.
- `rules.js` has sourced sport/grade rule-pack values, but those are **rules/reference data**, not approved formation coordinates, lineup legality, team membership or current local competition acceptance.
- `model.js` has workspace schema 4, team-specific squad/player IDs and active role/group context. The proposed contract is **not** a workspace schema upgrade.

## 2. Proposed separation of concerns

| Domain | Owned by | Must not be inferred from |
| --- | --- | --- |
| Sport/format | Versioned immutable formation profile catalogue | Team name, play diagram, arbitrary labels |
| Rule set and local competition overrides | Existing source-backed `rules.js` and explicit local review | Formation graphics |
| Formation | Profile-specific tactical scene with *explicit* actor positions and provenance | Squad size, jersey numbers or generic sport positions list |
| Squad registration | Existing team/season/player records | Placeholder actor icon |
| Match lineup | Existing authorised selection and roster approval workflow | Concept diagram or animation |
| Tactical play | Existing legacy play data or future versioned scene reference | Match lineup approval |
| Ball/defence sequence | Future E4–E6 explicit graph and timed authoring | Drawing order or a guessed rule interpretation |

An actor slot in a tactic is **not a registered player**. An optional future assignment from slot to person/team is a distinct, authorised record and must not be added by E3.

## 3. Proposed versioned profile contract (not yet implemented)

A profile is a **declarative, immutable definition**, independent of a team:

```js
{
  contractVersion: 1,
  profileId: '...',             // stable namespaced ID: sport/format/edition
  sport: '...',                 // canonical existing SPORTS value
  format: '...',                // grade/competition/variant explicitly chosen
  provenance: {
    sourceTitle: '...',
    sourceEdition: '...',
    sourceUrl: '...',
    reviewedAt: '...',
    reviewedBy: '...'           // owner/domain reviewer, not automatically inferred
  },
  field: {
    lengthM: null, widthM: null, orientation: 'attack-up',
    // unavailable dimensions remain null; never convert the legacy 50×80
    // diagram units to metres without a documented transform
  },
  attackingSlots: [
    // { slotId, roleId, label, start: { x, y } }
    // start uses defined normalised coordinates with tested boundaries;
    // each slot ID is stable within this profile
  ],
  defensiveSlots: [],
  markerRoleIds: [],
  actions: {
    // explicitly reviewed permitted/limited action categories,
    // NOT a universal legal-move evaluator
  },
  status: 'concept-only',       // concept-only | reviewed-teaching | match-ready
  applicableRuleSetIds: [],
  reviewNotes: []
}
```

**Proposed status semantics:**

- `concept-only`: incomplete, unverified, cross-code, unknown-competition or legacy visualisation. Always shown with a prominent concept-only label. Never usable as proof of a complete match formation.
- `reviewed-teaching`: the profile's sport, age/format, slot count/labels, field convention and provenance have undergone owner/domain review. Still not a certified match lineup and does not establish eligibility, permits or by-laws.
- `match-ready`: reserved for a **separate future accepted decision** with actual competition/grade verification, authorisation, roster eligibility and lineup approval. **No E3 profiles should have this status.**

**Resolution is fail-closed:** missing profile ID, unsupported `contractVersion`, wrong sport/grade, incomplete slot list, unreviewed rule mismatch or unknown format returns `concept-only` with a machine-readable reason. Do not substitute the Oztag renderer or silently assign 13 generic positions. Profile selection must be explicit in the coach journey.

## 4. Proposed rollout boundaries

| Candidate | Current known source | E3 decision gate |
| --- | --- | --- |
| Oztag eight-slot | Native editor and Oztag rule pack | Preserve the original 50×80 teaching geometry; approve whether new profile represents a tactical *slice* or complete eight-player formation |
| Rugby League 13 | Existing Rugby league rule pack, 13-player reference, position labels | Domain owner approves **actual named slots and coordinates**, attack/defence shapes and competition context; do not treat a 13-name list as a formation |
| Rugby League junior modified formats | `rules.js` junior grades include variations | Verify exact selected age/competition format and player count independently; one 13-player preset cannot stand in for junior formats |
| League Tag | Existing League tag rules/reference | Verify target age/competition/format and complete slots; preserve concept-only display until approval |
| Touch football / Rugby union / others | Concept transfer guidance only | Separate later designs and source review; **not** generated by remapping Rugby League or Oztag |

The existing rule-pack values are **candidate evidence**, not a substitute for approval of dimensions, formation or permitted actions. No governing-body branding/assets are to be copied.

## 5. Compatibility and rollback proposal

1. **Read compatibility first:** treat legacy `moves[].pts`, eight slots, old play IDs and custom coaching text as opaque saved source. Construct any new teaching scene in memory only. Do not mutate original plays upon opening, previewing or switching sport.
2. **Explicit optional upgrade later:** introduce new `playSceneVersion` only after E3/E4 shapes and adapter are accepted. Store old source alongside a new scene, or in a reversible structured backup, with deterministic source hash and user-visible before/after preview.
3. **On unsupported versions:** show original supported legacy illustration with an honest warning, or an explanatory unavailable state; never drop actor links or silently downgrade data on save.
4. **Rollback:** first ship a read-only compatibility adapter, no persistence change. Before any storage upgrade, run synthetic old→new→old/restore rehearsals, encrypted export compatibility, and failure injection; obtain explicit owner approval.
5. **Release separation:** source CI, actual Safari/phone visual approval, GitHub Pages publication, and owner acceptance are independent gates.

## 6. E3 acceptance cases before enabling profiles

- **Positive legacy:** Step Out (ID `quickie-out`) opened, copied, previewed, animated, saved, reloaded and mirrored; geometry, authored words, library links and original remain identical.
- **Positive scoped:** an explicitly selected and reviewed Oztag profile only uses its approved slots; training concept does not become a registered team lineup.
- **Negative sport:** Rugby League selection with a legacy eight-slot diagram stays `concept-only` with a clear notice; no phantom 13-player board.
- **Negative junior:** Rugby League under-age format without approved player count/field/slots is refused as a complete formation.
- **Negative cross-code:** League Tag or Touch cannot reuse an Oztag formation ID as if it were native.
- **Negative provenance:** rule-pack mismatch, unknown competition, unknown grade, invalid field dimensions, duplicate actor IDs, coordinates outside bounds, unsupported contractVersion all fail closed with reasons.
- **Recovery:** unknown new scene/profile data never overwrites historical plays on edit/save; a failed optional conversion leaves the input unchanged.
- **Boundaries:** no new credentials/login, permissions, roster assignment, personal/health data, new database or club-fixture reset.

**Expected test approach after approval:** pure Node validation tests for profile resolution and malformed profiles; existing P08 sport-compatibility, saved-play and library regressions; synthetic old/new serialization and rollback checks; browser coach/player read-only and mobile/desktop cases; manual Safari sporting and visual review. Do not call CI results user acceptance.

## 7. Owner approval decisions required before implementation

1. Confirm rollout **Oztag 8 → Rugby League 13 → explicitly selected junior modified formats → League Tag**. Touch and Union remain separate follow-on work.
2. Confirm whether Oztag's eight native slots are an *illustrative tactical arrangement* or a **complete formally reviewed** formation. Default: illustrative unless reviewed.
3. Approve the initial *specific* Rugby League and junior target formats (grade and competition), plus who verifies named slots, coordinates and permitted actions.
4. Accept `concept-only` / `reviewed-teaching` separation and **defer match-ready** until competition and roster approval are independently defined.
5. Confirm a **lossless, opt-in versioned adapter**, without any migration of existing saved plays in the initial E3 implementation.

**Next bounded PR after this decision:** add the pure versioned profile validator/resolver and synthetic positive/negative tests, preserving the current renderer and saved-play schema. A subsequent separate PR may add one approved profile and its coach selector, followed by browser acceptance. Do not merge a speculative 13-player editor.
