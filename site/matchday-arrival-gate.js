// P11K: non-Oztag, coach-only check-in gate over the existing match.arrived map.
// Arrival is venue presence, NOT eligibility, registration, fitness or lineup.
import {findSeason,seasonLens,teamSport} from './model.js';
const frozen=Object.freeze,word=v=>typeof v==='string'?v.trim():'';
const unavailable=(reason)=>frozen({
  mode:'blocked',reason,playerIds:frozen([]),seasonId:'',seasonName:'',
  matchDate:'',mayRecord:false,mayApproveEligibility:false,noWrites:true
});
export function matchArrivalGate(data,match,club=null,today=''){
  if(!data||typeof data!=='object'||Array.isArray(data)||
      !match||typeof match!=='object'||Array.isArray(match)||!word(match.id))
    return unavailable('Match or team unavailable.');
  if(teamSport(data.team,club)==='Oztag')
    return unavailable('Oztag uses its established Match Day arrival controls.');
  const season=findSeason(data,word(match.seasonId));
  if(!season)return unavailable('Set a valid fixture season before recording arrivals.');
  const roster=seasonLens(data,season.id).players||[];
  const ids=frozen([...new Set(roster.filter(p=>p&&word(p.id)).map(p=>p.id))]);
  const shared={seasonId:season.id,seasonName:word(season.name),
    playerIds:ids,matchDate:word(match.date),mayApproveEligibility:false,noWrites:true};
  if(season.status!=='active')return frozen({...shared,mode:'read-only',mayRecord:false,
    reason:'This season is not active. Historical arrival records are read-only.'});
  if(match.status!=='scheduled')return frozen({...shared,mode:'read-only',mayRecord:false,
    reason:'Only a scheduled fixture can record arrivals. Existing records remain visible.'});
  if(!word(today)||word(match.date)!==word(today))return frozen({...shared,mode:'read-only',mayRecord:false,
    reason:'Record arrivals on the fixture date only. Existing records remain visible.'});
  return frozen({...shared,mode:'editable',mayRecord:true,
    reason:'Coach-recorded venue check-in only, not playing eligibility.'});
}
