// Fixed fictional fixture records for testing team and season journeys.
// No network requests, official fixtures, real people or production publishing.
export const PERSONA_SEASONS=Object.freeze([2024,2025,2026]);
export const PERSONA_CURRENT_SEASON=2026;
const BASE={
  2024:{date:'2024-09-21',opponent:'Example Northern Team',venue:'Example Sports Ground',status:'completed'},
  2025:{date:'2025-09-20',opponent:'Example Southern Team',venue:'Example Sports Ground',status:'completed'},
  2026:{date:'2026-11-14',opponent:'Example Opposition',venue:'Example Sports Ground',status:'scheduled'}
};
export function personaFixture(team,record={},year=PERSONA_CURRENT_SEASON){
 if(!team||!PERSONA_SEASONS.includes(year))return null;
 const base=BASE[year];
 const edit=year===PERSONA_CURRENT_SEASON && record?.fixtures?.[String(year)];
 const source=edit&&typeof edit==='object'?edit:base;
 return {
  id:'example-fixture-'+team.id+(year===PERSONA_CURRENT_SEASON?'':'-'+year),
  teamId:team.id,team:team.name,clubId:team.clubId,sport:team.sport,
  title:'Example match',season:'Example '+year+' season',year,
  date:source.date,opponent:source.opponent,venue:source.venue,
  status:base.status,fictional:true
 };
}
export function validatePersonaFixture(value,year=PERSONA_CURRENT_SEASON){
 if(year!==PERSONA_CURRENT_SEASON)return {error:'Historical seasons are read-only'};
 if(!value||typeof value!=='object')return {error:'Fixture details required'};
 const date=typeof value.date==='string'?value.date.trim():'';
 const opponent=typeof value.opponent==='string'?value.opponent.trim():'';
 const venue=typeof value.venue==='string'?value.venue.trim():'';
 if(!/^\d{4}-\d\d-\d\d$/.test(date)||!date.startsWith(String(year)+'-')||
    Number.isNaN(Date.parse(date+'T00:00:00Z'))||
    new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)
   return {error:'Enter a valid date within the selected current season'};
 if(opponent.length<2||opponent.length>80)
   return {error:'Opponent must be 2 to 80 characters'};
 if(venue.length<2||venue.length>120)
   return {error:'Venue must be 2 to 120 characters'};
 return {fixture:{date,opponent,venue}};
}
