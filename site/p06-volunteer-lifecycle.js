// P06H — preserve volunteer identity/history through the manual deactivation lifecycle.
// Coach-only workspace helper, not a permission system or official eligibility verification.
const rows = value => Array.isArray(value) ? value : [];
export function volunteerRemovalCheck(ws, personId) {
  const id = typeof personId === 'string' ? personId : '';
  const person = rows(ws?.matchOfficials).find(p => p?.id === id);
  if (!person) return Object.freeze({allowed:false,reason:'not-found',matches:0,appointments:0});
  const teams = [ws,...rows(ws?.teams)].filter(Boolean);
  const matches = teams.reduce((n,t)=>n+rows(t.matches).filter(m=>
    rows(m?.crew).some(a=>a?.personId === id)).length,0);
  // Even a manually ended appointment remains part of organisational history.
  const appointments = rows(ws?.volunteerAppointments).filter(a=>a?.personId === id).length;
  return Object.freeze({allowed:matches === 0 && appointments === 0,
    reason:matches ? 'match-history' : appointments ? 'appointment-history' : '',
    matches,appointments});
}
