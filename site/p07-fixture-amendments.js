// P07C — explicit, local-coach fixture amendment plan + append-only coach-only audit.
// This is NOT organiser-verified fixture data and does not alter linked tasks itself.
const safe = v => typeof v === 'string' ? v.trim() : '';
const validDay = v => {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
  const d=new Date(v+'T12:00:00Z');
  return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v;
};
const validTime = v => !v || /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const statuses=new Set(['scheduled','played','forfeit','postponed','cancelled']);
const FIELDS=Object.freeze(['date','start','venue','field','status']);
export function fixtureSnapshot(match) {
  const values=Object.fromEntries(FIELDS.map(k=>[k,safe(match?.[k])]));
  values.status=values.status||'scheduled';
  return Object.freeze(values);
}
export function planFixtureRevision(match,proposed) {
  if(!match || typeof match.id !== 'string' || !match.id)return Object.freeze({error:'Existing fixture is required'});
  const before=fixtureSnapshot(match);
  const after=fixtureSnapshot({...before,...proposed});
  if(!validDay(after.date))return Object.freeze({error:'Choose a valid fixture date'});
  if(!validTime(after.start))return Object.freeze({error:'Choose a valid start time'});
  if(!statuses.has(after.status))return Object.freeze({error:'Choose a valid fixture status'});
  if(after.venue.length>160 || after.field.length>80)return Object.freeze({error:'Fixture venue or field is too long'});
  const changed=FIELDS.filter(k=>before[k]!==after[k]);
  const warnings=[];
  if(changed.length && (before.status==='played'||before.status==='forfeit'))
    warnings.push('Recorded match result is preserved; check it still belongs to this fixture');
  if(changed.length && (match.crew?.length||match.lineupId||Object.keys(match.rsvp||{}).length))
    warnings.push('Existing lineups, staffing and RSVPs stay linked and require manual rechecking');
  if(after.status==='postponed')warnings.push('A postponement does not create a replacement match or confirm a new date');
  if(after.status==='cancelled')warnings.push('Cancellation remains on record; linked tasks need an explicit choice');
  return Object.freeze({changed:changed.length>0,fields:Object.freeze(changed),
    before,after,warnings:Object.freeze(warnings)});
}
export function commitFixtureRevision(match,proposed,approval) {
  const plan=planFixtureRevision(match,proposed);
  if(plan.error)return {error:plan.error};
  if(!plan.changed)return {error:'No fixture date, time, venue, field or status changes to record'};
  if(!approval?.confirmed)return {error:'Explicit fixture change confirmation is required'};
  const reason=safe(approval.reason);
  if(reason.length<3 || reason.length>200)return {error:'Record a reason between 3 and 200 characters'};
  if(!approval.expectedBefore || FIELDS.some(k=>plan.before[k]!==approval.expectedBefore[k]))
    return {error:'Fixture changed after review. Reopen it before saving'};
  const disposition=safe(approval.taskDisposition) || 'none';
  if(!new Set(['none','move','detach','keep','cancel']).has(disposition))
    return {error:'Choose a safe linked-task disposition'};
  const at=safe(approval.at);
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(at)||Number.isNaN(Date.parse(at)))
    return {error:'Missing amendment timestamp'};
  const prior=Array.isArray(match.fixtureRevisions)?match.fixtureRevisions:[];
  const entry=Object.freeze({
    id:`rev-${at}-${prior.length+1}`,at,source:'local-coach-workspace',
    reason,before:plan.before,after:plan.after,taskDisposition:disposition
  });
  // Unrelated historic fields (result, lineups, crew, RSVPs, seasonId, entryId) stay intact.
  Object.assign(match,plan.after);
  match.fixtureRevisions=[...prior,entry];
  return {entry,changed:plan.fields};
}
