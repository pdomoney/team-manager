// P11J — non-Oztag Match Day RSVP roster boundary.
// The Oztag legacy RSVP workflow is deliberately unaffected.
// Never infer a current/active season when the fixture's season is unresolved.
import {findSeason,seasonLens,teamSport} from './model.js';
const frozen=Object.freeze,word=x=>typeof x==='string'?x.trim():'';
export function matchReplyRosterScope(teamData,fixture,club=null){
  if(!teamData||typeof teamData!=='object'||Array.isArray(teamData)||
     !fixture||typeof fixture!=='object'||Array.isArray(fixture)||!word(fixture.id))
    return frozen({mode:'blocked',reason:'No match or team is selected.',
      seasonId:'',playerIds:frozen([]),changesWorkspace:false,verifiedEligibility:false});
  if(teamSport(teamData.team,club)==='Oztag')
    return frozen({mode:'legacy-oztag',reason:'Existing Oztag RSVP workflow retained.',
      seasonId:'',playerIds:frozen([]),changesWorkspace:false,verifiedEligibility:false});
  const sid=word(fixture.seasonId),season=sid&&findSeason(teamData,sid);
  if(!season)
    return frozen({mode:'blocked',reason:'This fixture has no valid recorded season. Review the match season before recording replies.',
      seasonId:sid,playerIds:frozen([]),changesWorkspace:false,verifiedEligibility:false});
  const players=seasonLens(teamData,sid).players||[],seen=new Set();
  for(const p of players)if(p&&word(p.id))seen.add(p.id);
  return frozen({
    mode:'fixture-season',reason:'Only players in this fixture’s recorded season are shown.',
    seasonId:sid,seasonName:word(season.name),playerIds:frozen([...seen]),
    changesWorkspace:false,verifiedEligibility:false
  });
}
