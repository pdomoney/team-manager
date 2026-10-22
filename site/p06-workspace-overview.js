// P06G: a local, read-only view across clubs already present in ONE encrypted coach workspace.
// This is not an association directory, cross-tenant access, official staffing rule feed or permission grant.
import { fixtureReadinessIndex } from './p06-readiness.js';
import { reviewVolunteerAppointments } from './p06-appointments.js';

const rows = v => Array.isArray(v) ? v : [];
const word = v => typeof v === 'string' ? v.trim() : '';
const zero = () => ({fixtures:0,covered:0,attention:0,unverified:0});

export function workspaceCrewOverview(ws, options = {}) {
  const knownClubs=rows(ws?.clubs).filter(c=>c && word(c.id));
  const allowed=new Set(knownClubs.map(c=>c.id));
  // Caller may restrict the list. A supplied filter never adds a club to the workspace.
  const requested=Array.isArray(options.clubIds) ? new Set(options.clubIds) : null;
  const sport=word(options.sport);
  const clubs=[];
  const totals=zero();
  for(const club of knownClubs) {
    if(!allowed.has(club.id) || (requested && !requested.has(club.id)))continue;
    const index=fixtureReadinessIndex(ws,club.id);
    const fixtures=index.fixtures.filter(f=>!sport || f.sport===sport);
    if(sport && !fixtures.length)continue;
    const counts=zero();
    for(const f of fixtures){counts.fixtures++;if(f.state==='covered')counts.covered++;
      else if(f.state==='attention')counts.attention++;else counts.unverified++;}
    const appointments=reviewVolunteerAppointments(rows(ws?.matchOfficials),
      rows(ws?.volunteerAppointments),{type:'club',id:club.id});
    const manualAccepted=appointments.filter(a=>a.active).length;
    const requiringReview=appointments.filter(a=>!a.active).length;
    Object.keys(totals).forEach(k=>totals[k]+=counts[k]);
    clubs.push(Object.freeze({
      clubId:club.id,clubName:word(club.name).slice(0,120),
      ...counts,manualAcceptedAppointments:manualAccepted,appointmentsNeedingReview:requiringReview
    }));
  }
  return Object.freeze({
    scope:'single-encrypted-workspace',
    sport,
    totals:Object.freeze(totals),
    clubs:Object.freeze(clubs)
  });
}
