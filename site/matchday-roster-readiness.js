// P11G: coach-only, read-only match roster readiness summary for sports
// without a verified formation. Uses the match's recorded season, not whatever
// season is currently viewed or active. A reply/position is not eligibility.
import {findSeason,seasonLens,rsvpOf,teamSport} from './model.js';
const frozen=Object.freeze;
const word=x=>typeof x==='string'?x.trim():'';
const arr=x=>Array.isArray(x)?x:[];
const buckets=frozen([
  frozen({id:'attending',label:'Said yes · available'}),
  frozen({id:'needs-review',label:'Needs confirmation'}),
  frozen({id:'no-reply',label:'No reply'}),
  frozen({id:'declined',label:'Not attending'})
]);
const empty=why=>frozen({
  state:'unavailable',reason:why,
  sport:'',season:'',groups:frozen(buckets.map(b=>frozen({...b,players:frozen([]),count:0}))),
  total:0,readyForLineup:false,eligiblePlayersVerified:false,canEdit:false,
  approvedOnFieldCount:null,matchDataChanged:false
});
export function matchRosterReadiness(data,match,club=null){
  if(!data||typeof data!=='object'||Array.isArray(data)||
    !match||typeof match!=='object'||Array.isArray(match)||
    !word(match.id))return empty('This match or team is unavailable.');
  const sid=word(match.seasonId),season=findSeason(data,sid);
  if(!season)return empty('The match has no resolved season. Link it to the correct season before using this roster.');
  const sport=teamSport(data.team,club);
  const players=arr(seasonLens(data,sid).players).filter(p=>p&&word(p.id)&&word(p.name));
  const seen=new Set(),groups=Object.fromEntries(buckets.map(b=>[b.id,[]]));
  for(const player of players){
    if(seen.has(player.id))continue;
    seen.add(player.id);
    const reply=rsvpOf(match,player.id),state=word(player.status)||'available';
    const bucket=reply==='no'?'declined':reply==='yes'&&state==='available'?'attending':
      reply==='maybe'||reply==='yes'?'needs-review':'no-reply';
    const preferred=frozen([...new Set(arr(player.positions).filter(v=>typeof v==='string'&&v.trim()).map(v=>v.trim()))].slice(0,4));
    groups[bucket].push(frozen({
      // Internal coach-only identity for resolving an exact RSVP. Never use
      // display name or jersey number as a stable player identifier.
      playerId:player.id,
      name:word(player.name),number:word(player.number),
      reply:reply||'none',status:state,
      preferred,arrived:match.arrived?.[player.id]===true
    }));
  }
  return frozen({
    state:'view-only',reason:'Attendance and position preferences are not an approved lineup or eligibility decision.',
    sport,season:word(season.name),
    groups:frozen(buckets.map(b=>{
      const list=frozen(groups[b.id].sort((a,b)=>a.name.localeCompare(b.name)||a.number.localeCompare(b.number)));
      return frozen({...b,players:list,count:list.length});
    })),
    total:seen.size,readyForLineup:false,eligiblePlayersVerified:false,
    canEdit:false,approvedOnFieldCount:null,matchDataChanged:false
  });
}
