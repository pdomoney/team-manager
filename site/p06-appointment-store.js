// P06F — appointments remain in the existing encrypted coach workspace.
// They are NOT login roles, invitations sent to a person or match eligibility.
const rows = x => Array.isArray(x) ? x : [];
const word = x => typeof x === 'string' ? x.trim() : '';
export const APPOINTMENT_STATES = Object.freeze(['proposed','invited','accepted','suspended','ended']);
export const APPOINTMENT_SCOPES = Object.freeze(['association','club','team']);
export const APPOINTMENT_STATUS_LABELS = Object.freeze({
  proposed:'Proposed',invited:'Invitation recorded (not sent)',
  accepted:'Accepted (manually recorded)',suspended:'Suspended',ended:'Ended'
});

export function normalizeVolunteerAppointments(input) {
  const seen = new Set();
  return rows(input).filter(x => x && typeof x === 'object' && !Array.isArray(x)).map(x => ({
    id:word(x.id).slice(0,80),personId:word(x.personId).slice(0,80),
    scopeType:word(x.scopeType).slice(0,30),scopeId:word(x.scopeId).slice(0,80),
    role:word(x.role).slice(0,80),status:word(x.status).slice(0,30)
  })).filter(a => {
    if (!a.id || seen.has(a.id)) return false;
    seen.add(a.id); return true;
  });
}
// Returns a new collection. Do not mutate or silently reuse an appointment ID
// from a different person or scope. A suspended/inactive person can't be made active.
export function upsertVolunteerAppointment(existing, draft, people, allowedScope) {
  const id=word(draft?.id), personId=word(draft?.personId),
    scopeType=word(draft?.scopeType),scopeId=word(draft?.scopeId),
    role=word(draft?.role), status=word(draft?.status);
  if (!id || id.length>80 || !personId || personId.length>80) return {error:'Select an existing volunteer'};
  if (!APPOINTMENT_SCOPES.includes(scopeType) || scopeType!==allowedScope?.type ||
      !scopeId || scopeId!==allowedScope?.id) return {error:'Appointment scope does not match selected club'};
  if (!role || role.length>80) return {error:'Enter a role (up to 80 characters)'};
  if (!APPOINTMENT_STATES.includes(status)) return {error:'Choose a valid appointment status'};
  const person=rows(people).find(p=>p?.id===personId);
  if (!person) return {error:'Select an existing volunteer'};
  if (person.active===false && status==='accepted') return {error:'Inactive volunteer cannot have an accepted appointment'};
  const records=normalizeVolunteerAppointments(existing);
  const original=records.find(a=>a.id===id);
  if (original && (original.personId!==personId || original.scopeType!==scopeType || original.scopeId!==scopeId))
    return {error:'Cannot reassign an existing appointment to another person or scope'};
  const appointment={id,personId,scopeType,scopeId,role,status};
  return {records: original ? records.map(a=>a.id===id ? appointment : a) : [...records,appointment]};
}
