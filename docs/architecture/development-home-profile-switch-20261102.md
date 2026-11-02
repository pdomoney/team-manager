# Development Home profile switcher (PR143)

**Owner directive (2 November 2026):** No passwords in the development environment. Profile switching belongs on Home, not in a separate sign-in or permission-matrix screen.

## Development behaviour

- The published GitHub Pages development site at `https://pdomoney.github.io/team-manager/` opens directly into a password-free **local fictional workspace**, even if the repository still contains encrypted team files or the device has saved encrypted Coach/Player credentials.
- A **Switch profile** button is at the top of the Home page and on each fictional person's role Home. Selecting a person updates the role-specific workspace. **Back to Home** restores the sandbox.
- Profiles are synthetic P12 fixtures. No real sign-in or production authorization is implied.
- Editing inside the development workspace is browser-local only, at `tm-persona-sandbox-v1`; its remembered team key is `tm-persona-sandbox-team`.
- Old `tm-auth`, `tm-test-data`, draft records and published `coach.enc.json` / `team*.enc.json` are not decrypted, migrated, overwritten or deleted by startup.
- Password creation, publishing and **Go live** are unavailable in this development sandbox.

## Separate regression path

Local automated browser tests still exercise the prior encrypted application behaviour at `localhost`/`127.0.0.1`. To exercise the public development experience locally, use `?sandbox=1`. This parameter cannot disable the sandbox on the public development hostname.

## Acceptance checks

1. Fresh iPhone and desktop open Home without **Team password** or **Coach password**.
2. **Switch profile** displays 20 fictional people.
3. Player, Manager and Coach each enter different assigned role scopes, navigation and team records, and can switch repeatedly.
4. No production records, passwords or authorization state change.
5. Normal Node and full Chromium regression, plus dedicated development-login bypass tests pass before merge.
6. Owner tests physical iPhone Safari and desktop browser before accepting. No production migration or authentication decision is in this PR.

## Production boundary

A future production environment must use a separate approved deployment and server-enforced identity/role permissions. **Do not repurpose this password-free development deployment as production**, and do not treat the P12 synthetic role preview as an authentication layer.
