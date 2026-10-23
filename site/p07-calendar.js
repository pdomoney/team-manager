// P07B: privacy-minimised, read-only calendar over records already in ONE coach workspace.
// No implied organiser ownership, live external fixture feed or cross-tenant access.
import { teamsOf, clubOf, teamSport, arr } from './model.js';
import { fixtureAuthority } from './p07-fixture-authority.js';
const word = v => typeof v === 'string' ? v.trim() : '';
const day = v => {
  const x=word(v);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(x))return '';
  const n=new Date(x+'T12:00:00Z');
  return Number.isNaN(n.getTime())||n.toISOString().slice(0,10)!==x?'':x;
};
const time = v => /^([01]\d|2[0-3]):[0-5]\d$/.test(word(v)) ? word(v) : '';
const safe = (v,max=120) => word(v).slice(0,max);

export function localWorkspaceCalendar(ws, opts={}) {
  const requestedClub=safe(opts.clubId,80), requestedTeam=safe(opts.teamId,80),
    sport=safe(opts.sport,80), from=day(opts.from), to=day(opts.to);
  const clubIds=new Set(arr(ws?.clubs).map(c=>word(c?.id)).filter(Boolean));
  const events=[];
  for(const team of teamsOf(ws)) {
    if(team?.archived || !word(team?.id))continue;
    const clubId=word(team?.team?.clubId);
    if(requestedClub && (clubId!==requestedClub || !clubIds.has(clubId)))continue;
    if(requestedTeam && team.id!==requestedTeam)continue;
    const teamName=safe(team?.team?.name || 'Unnamed team');
    const currentSport=teamSport(team.team,clubOf(ws,team));
    if(sport && currentSport!==sport)continue;
    const push=(kind,rec,details={})=>{
      if(!rec || !word(rec.id) || !day(rec.date))return;
      const date=day(rec.date);
      if((from && date<from)||(to && date>to))return;
      events.push(Object.freeze({
        key:JSON.stringify([team.id,kind,rec.id]),teamId:team.id,
        clubId,teamName,sport:currentSport,kind,
        recordId:word(rec.id),date,start:time(rec.start),end:time(rec.end),
        venue:safe(rec.venue || rec.place),
        cancelled:rec.cancelled===true||rec.status==='cancelled',
        ...details
      }));
    };
    for(const m of arr(team.matches)){
      const authority=fixtureAuthority(ws,team.id,m?.id);
      push('match',m,{
        title:safe(m?.opponent ? 'Match vs '+m.opponent : 'Match (opponent TBC)'),
        provenance:'local-coach-workspace',
        entryStatus:authority?.entryStatus||'none',
        authorityReview:!!authority?.reviewRequired,
        officialFixture:false
      });
    }
    for(const s of arr(team.sessions))push('training',s,{
      title:safe(s?.focus ? 'Training · '+s.focus : 'Training')
    });
    // Existing team task entries cover BBQ, lifts, equipment and volunteer duties.
    // Deliberately omit task people, contact details and private task notes.
    for(const t of arr(team.tasks))push('duty',t,{
      title:safe(t?.title || 'Team duty')
    });
  }
  events.sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start)||
    a.teamName.localeCompare(b.teamName)||a.key.localeCompare(b.key));
  const totals={events:events.length,matches:0,training:0,duties:0,cancelled:0,review:0};
  for(const e of events){
    if(e.kind==='match')totals.matches++;
    else if(e.kind==='training')totals.training++;
    else totals.duties++;
    if(e.cancelled)totals.cancelled++;
    if(e.authorityReview)totals.review++;
  }
  return Object.freeze({
    scope:'existing-encrypted-coach-workspace',
    timeInterpretation:'local-clock-as-recorded-no-zone-conversion',
    externalVerification:false,
    totals:Object.freeze(totals),events:Object.freeze(events)
  });
}
