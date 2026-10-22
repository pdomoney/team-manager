// P06E — advisory organisational appointment lifecycle, separate from match assignments.
// Deliberately read-only: no implied invitations, permissions or credential verification.
const values = (x) => Array.isArray(x) ? x : [];
const word = x => typeof x === 'string' ? x.trim() : '';
const STATES = new Set(['proposed','invited','accepted','suspended','ended']);
const SCOPES = new Set(['association','club','team']);
export function reviewVolunteerAppointments(people, appointments, scope) {
  const known = new Set(values(people).map(p=>word(p?.id)).filter(Boolean));
  const seen = new Set();
  return Object.freeze(values(appointments).filter(a=>a && a.scopeId===scope?.id && a.scopeType===scope?.type).map(a=>{
    const personId=word(a.personId), id=word(a.id), state=word(a.status), role=word(a.role);
    const issues=[];
    if (!id || seen.has(id)) issues.push('Duplicate or missing appointment reference');
    seen.add(id);
    if (!known.has(personId)) issues.push('Person link requires review');
    if (!SCOPES.has(a.scopeType) || !word(a.scopeId)) issues.push('Appointment scope is invalid');
    if (!role) issues.push('Appointment role is missing');
    if (!STATES.has(state)) issues.push('Appointment status is unknown');
    if (state==='invited') issues.push('Invitation is a manual record, not evidence of acceptance');
    if (state==='suspended' || state==='ended') issues.push('Appointment is not active');
    return Object.freeze({id,personId,scopeType:a.scopeType,scopeId:a.scopeId,role,status:state,
      active:state==='accepted' && issues.length===0,issues:Object.freeze(issues)});
  }));
}
