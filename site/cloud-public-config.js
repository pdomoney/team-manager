// Public by design. This key is not a database secret or a service-role key.
// Existing-account sign-in only. The main Team Manager app remains demo-only.
export const CLOUD_SUPABASE = Object.freeze({
  url: 'https://uyjxvaobshaahzipzzds.supabase.co',
  publishableKey: 'sb_publishable_8PDTyf-b1ro34cK9dB8_dQ_GQlDBNLT'
});

// The standard GitHub Pages demonstration is not a connected staging release.
export const CLOUD_STAGE3C_MODE = false;
// Stage 3D.2 provider methods remain DISABLED on the historical public demo.
// Only an independently approved connected build in 3D.3 may enable them.
export const CLOUD_STAGE3D2_AUTH_ENABLED = false;
// Only the isolated 3D.3 connected build enables real policy enforcement.
export const CLOUD_STAGE3D3_POLICY_REQUIRED = false;
