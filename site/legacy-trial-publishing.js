// The historic shared-password publishing flow exists for local regression and
// old encrypted-workspace compatibility. Never offer it on a hosted demo as
// a way to activate a real team or create a user account.
export function legacyTrialPublishingAllowed(hostname) {
  return ['localhost', '127.0.0.1', '::1', '[::1]']
    .includes(String(hostname || '').toLowerCase());
}
