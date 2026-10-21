// P06A: evidence-bound match staff coverage. Pure advisory evaluation, no grants or data writes.
// Requirements must be explicitly supplied from verified sport/competition/season/grade policy.
// An appointment, qualification, availability or invitation alone never confirms match coverage.
const rows = x => Array.isArray(x) ? x : [];
const value = x => typeof x === 'string' ? x.trim() : '';
const dateOk = (day, ends) => !ends || ( /^\\d{4}-\\d{2}-\\d{2}$/.test(ends) && ends >= day );

/**
 * A requirement: {role, count}; an assignment: {personId, role, status,
 * available, qualificationStatus, registrationStatus, expiresOn}.
 * All status fields are asserted evidence, not inferred from personal information.
 */
export function evaluateMatchCoverage({ sport, matchDate, policy, assignments } = {}) {
  const scope = { sport: value(sport), matchDate: value(matchDate) };
  const requirements = rows(policy?.requirements);
  const configured = !!value(policy?.source) && !!value(policy?.version) &&
    !!value(policy?.sport) && policy.sport === scope.sport &&
    /^\\d{4}-\\d{2}-\\d{2}$/.test(scope.matchDate) &&
    requirements.length > 0 && requirements.every(r => value(r.role) && Number.isInteger(r.count) && r.count > 0);
  if (!configured) return Object.freeze({
    status: 'unverified-policy', ...scope,
    reason: 'Verified role requirements, sport, date, source and version must be supplied.',
    roles: Object.freeze([])
  });
  const required = new Map();
  for (const r of requirements) required.set(r.role, (required.get(r.role) || 0) + r.count);
  const used = new Set(), details = [];
  for (const [role, count] of required) {
    const eligible = rows(assignments).filter(a =>
      value(a?.role) === role && value(a?.personId) &&
      a.status === 'confirmed' && a.available === true &&
      a.qualificationStatus === 'verified' && a.registrationStatus === 'verified' &&
      dateOk(scope.matchDate, value(a.expiresOn)));
    const distinct = [];
    for (const a of eligible) {
      if (used.has(a.personId) || distinct.includes(a.personId)) continue;
      distinct.push(a.personId);
      if (distinct.length === count) break;
    }
    distinct.forEach(id => used.add(id));
    details.push(Object.freeze({role, required: count, confirmed: distinct.length, missing: count - distinct.length}));
  }
  const ready = details.every(r => r.missing === 0);
  return Object.freeze({
    status: ready ? 'coverage-confirmed-from-input' : 'coverage-gap',
    ...scope, policySource: policy.source, policyVersion: policy.version,
    roles: Object.freeze(details)
  });
}
