# PR295 consolidated release controller

Source candidate only. No provider changes have been authorised. PR294 and PR295 are intended to be installed together against the existing PR293 Worker and the 19-migration Supabase baseline.

The controller reuses the checksum-pinned PR292 production installer helpers and PR293 release evidence. It does not run their old entry points. Its two new migrations are applied only as a single guarded transaction. The original 19 migration hashes and eight encrypted assets must match exactly. It checks the real catalogue against the synthetic PostgreSQL 17 reference, preserves the four previously reviewed ACL differences, and compares all existing application/Auth data and sequences across the migration (excluding only the five new lifecycle columns). The one fresh backup uses the verified libpq 19 procedure, checks the archive inventory and fully decodes it without restoring. This is not a full Supabase recovery test.

**Release preparation:** after exact-source CI, merge and visual approval, generate an immutable release plan with the actual merged SHA, CI evidence, exact two migration hashes, known previous Worker identity, unchanged data ref and confirmed script-provenance evidence. Pin its SHA-256 separately. Do not substitute a guessed SHA or self-certify CI. Do not install until the PR293 unexpected script is resolved. The final handover will include the two previously verified helper archives (or reuse exact local copies), the controller from the merged source, the release plan and the tested command for the existing MacBook environment.

`python3 -B scripts/release/consolidated_release.py --repo ~/src/team-manager --pg-bin <verified-postgresql-17-bin> --plan <qualified-plan.json> --plan-sha256 <approved-plan-digest> --preflight-only`

The default mode performs qualification, prompts once for exact installation authority, takes one fresh backup, applies the guarded SQL, uploads the exact dry-run Worker bundle, then reports all public-asset failures and anonymous API status. It prepares the standalone browser check before making verification requests. Use a maintenance window; disable automatic Git builds and prevent application writes. No Docker or new provider.

An attempted-but-unknown migration or upload is a reconciliation HOLD, not a retry. Never run the normal installation entry point again after an attempted live write. Use the existing recorded evidence and check the actual schema/version first. The verification-only entry point is for an already recorded installed checkpoint; it never deploys or connects to Supabase. No automatic database restore, credential logging, hard deletion, re-pinning or live provider setup.

No live backup, migration, Worker upload or real-user acceptance has been performed by this source change.
