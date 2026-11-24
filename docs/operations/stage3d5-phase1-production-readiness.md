# Phase 1 consolidated operational completion and release qualification

Status: SOURCE CANDIDATE / INSTALLATION HOLD. Owner-approved development scope,
not authority to apply production SQL, upload or activate a Worker.

## Baseline and evidence

PR289 merged source d22cf23b074d60d99a93c0c9912e8ba1d299ce42.
Owner-supplied read-only backup/preflight completed 24 November 2026.
All eight legacy encrypted assets matched the data branch and the live Worker.
The logical database archive passed full read/integrity checks, not a restore.
The live asset manifest is older than merged source. Cloudflare automatic
production builds were disabled. The existing Worker and project are retained.

Five Stage 3D.5 tables and the staff/admin/team functions were observed, but the
Stage 3D.5 migration ledger had no entries. The curated Player RPC was absent
from the reported function inventory. Do not infer exact schema equivalence
from table names, ledger absence or GitHub CI.

## Source compatibility

The new 20261124040000 migration derives from the latest founder-aware
20261121010000 and fixture-aware 20261124020000 function bodies. Earlier
versions are immutable. It does not recreate tables, reset roles, bootstrap
users or replace a provider. Preserve service-only grants and exact-team
checks. SQL tests exercise cancellation readback, official fixture protection,
Coach fallback and Manager takeover, Player cancellation denial and existing
journeys. The CI fingerprint checkpoint prints only catalog definition hashes
and privileges for the relevant functions. Compare with the owner-held
preflight on a compatible PostgreSQL version; a hash difference is a HOLD
for review, not permission to repin or overwrite a live definition.

## Recovery and installation gate

1. Finish functional source work and pass exact-head Node, PostgreSQL,
   Chromium and WebKit. Record omitted features and accepted journeys.
2. Reuse the private verified archive; confirm checksum before opening it.
   Rehearse recovery on an isolated loopback-only disposable PostgreSQL
   instance, never against Supabase. Source server is PostgreSQL 17;
   archive was made by pg_dump 19. Confirm restore compatibility, extension
   availability, provider-managed schemas/roles and actual recovery limits.
   A full Supabase project cannot be recovered solely from a logical dump.
   No production passwords or real records leave the operator's workstation.
3. Compare live/restored table columns, constraints, RLS, grants, triggers
   and RPC bodies against exact versioned source, including definition
   fingerprints. Mark objects ALREADY_PRESENT_EQUIVALENT,
   PRESENT_DIFFERENT, MISSING or UNKNOWN. Reconcile historical manual
   SQL without rerunning create-table migrations or falsifying the ledger.
4. Rehearse only necessary migrations in the isolated restore. Apply the
   latest equivalent RPC definition once where approved; verify the missing
   Player RPC and new operational migration and preserve accounts and data.
   Test real-format synthetic positive and negative journeys separately.
5. Build exact merged source using existing Worker build/check scripts,
   approved public bindings and the unchanged eight protected ciphertext
   files. Preserve owner admin mode via wrangler.stage3d4-existing.jsonc;
   compare effective configuration, perform a dry run, and record exact
   package hashes. No secrets in bundle.
6. Recheck current live version, data hash, schema and backup freshness at
   cutover. Obtain explicit owner installation approval for exact migration
   set and candidate. Apply qualified DB changes first, then existing Worker.
   Verify actual version and recovery/rollback procedure; restore only under
   separate explicit approval if needed. No destructive reset.
7. Verify real adult accounts on desktop and physical iPhone; owner accepts
   the actual Coach, Manager, Player, messaging, notices and tournament
   workflows. Tactics/Plays and Reports remain deferred.

## Remaining functionality

Match lineup and score recording must preserve the original product's
sport-specific rule confirmation; a generic invented formation or official
scoring authority is not an acceptable substitute. Complete these and the
remaining tournament, onboarding/jersey/volunteer and notice journeys before
the Phase 1 completion gate. Existing functional capability is not the same
as owner acceptance or an installed release.
