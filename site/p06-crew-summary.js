// P06B: safe, concise wording for the existing sport-contextual match-crew engine.
// Never infer official requirements from sport names or treat an invitation as coverage.
export function crewCoverageSummary(report) {
  const c = report || {};
  if (!c.configured) return Object.freeze({
    state: 'unverified', headline: 'Requirements not verified for this fixture',
    explanation: 'Review the current sport, competition, grade and season requirements before relying on coverage.',
    required: null, confirmed: null, missing: null
  });
  const demands = Array.isArray(c.shortages) ? c.shortages : [];
  const required = demands.reduce((n,r)=>n+Math.max(0,Number(r.min)||0),0);
  const confirmed = demands.reduce((n,r)=>n+Math.max(0,Number(r.have)||0),0);
  const missing = demands.reduce((n,r)=>n+Math.max(0,Number(r.missing)||0),0);
  const ready = c.ready === true && missing === 0;
  return Object.freeze({
    state: ready ? 'covered' : 'attention',
    headline: ready ? 'All configured roles covered (coach-recorded)' : 'Match-day staffing needs attention',
    explanation: ready ? 'Coverage is based on recorded confirmations and manually checked credentials, not live governing-body verification.'
      : 'Check missing roles, confirmations, eligibility and any overlapping fixtures.',
    required, confirmed, missing
  });
}
