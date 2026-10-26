// P11H — pure coach-only participant-record consistency review for existing
// P11G roster snapshots. Conflicting RSVP, arrival and player-status records
// require human checking; this does NOT decide playing eligibility, change a
// lineup, contact a player or write to the workspace.
const frozen=Object.freeze;
const defs=frozen({
  arrivedDeclined:'Marked arrived but replied No',
  arrivedNoReply:'Marked arrived with no reply',
  arrivedUnsure:'Marked arrived but replied Unsure',
  arrivedUnavailable:'Marked arrived but recorded as injured or unavailable',
  acceptedUnavailable:'Replied Yes but recorded as injured or unavailable'
});
export const ROSTER_REVIEW_REASONS=defs;
const reasonsFor=p=>{
  const issues=[];
  if(p.arrived && p.reply==='no')issues.push('arrivedDeclined');
  if(p.arrived && p.reply==='none')issues.push('arrivedNoReply');
  if(p.arrived && p.reply==='maybe')issues.push('arrivedUnsure');
  if(p.arrived && p.status!=='available')issues.push('arrivedUnavailable');
  if(p.reply==='yes' && p.status!=='available')issues.push('acceptedUnavailable');
  return issues;
};
export function rosterRecordReview(readiness){
  if(!readiness||readiness.state!=='view-only'||!Array.isArray(readiness.groups))
    return frozen({state:'unavailable',total:0,players:frozen([]),noWrites:true,
      eligibleToPlay:null,requiresHumanReview:false,canAutoResolve:false});
  const people=[];
  const seen=new Set();
  for(const group of readiness.groups){
    if(!group||!Array.isArray(group.players))continue;
    for(const p of group.players){
      if(!p||typeof p.name!=='string'||typeof p.playerId!=='string'||!p.playerId.trim())continue;
      // Only stable IDs distinguish players; names, jerseys and replies can be
      // identical, especially for siblings or shared/generic sample names.
      if(seen.has(p.playerId))continue;
      seen.add(p.playerId);
      const issueCodes=reasonsFor(p);
      if(!issueCodes.length)continue;
      people.push(frozen({
        playerId:p.playerId,
        name:p.name,number:p.number,
        issues:frozen(issueCodes.map(code=>frozen({code,label:defs[code]})))
      }));
    }
  }
  people.sort((a,b)=>a.name.localeCompare(b.name)||a.number.localeCompare(b.number));
  return frozen({
    state:'review-only',total:people.length,players:frozen(people),
    noWrites:true,eligibleToPlay:null,requiresHumanReview:people.length>0,
    canAutoResolve:false
  });
}
