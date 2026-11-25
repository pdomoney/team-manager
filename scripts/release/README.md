# Connected release verification

This diagnostic module is a source candidate for the consolidated release workflow. It is not an installer. It must receive the exact candidate-manifest asset digests and the approved HTTPS origin from the release controller, never reconstructed source hashes.

- Collect every asset result, rather than stop at the first HTTP error.
- Accept an exact same-origin extensionless redirect for an HTML asset only.
- Record HTTP status, asset path, digest and Ray ID; distinguish edge/transport denial from genuine byte mismatch.
- If removal of one opaque same-origin script restores the original bytes, report a provenance HOLD. Never allowlist or execute an unexplained script.
- Generate one self-contained browser verification command that checks all assets and anonymous API denial. It requires no account sign-in, clipboard helper or second Python import.
- The generator's actual output is executed in the Node test with synthetic fetch responses; no provider or production data is used.

Run from this directory: `python3 -B -m unittest -v` and `node test_browser_generated.mjs`. The existing Node, PostgreSQL and Chromium/WebKit suites remain mandatory. Integration with the pinned backup, migration and Worker installer is a separate unfinished part of the same consolidated candidate; no deployment is authorised by this module.
