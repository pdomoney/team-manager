// M2.2: Read-only review suggestions for an existing team squad.
// Jersey and positions are optional coaching details, NEVER registration,
// medical, financial, guardian authority, or competition eligibility.
const str=x=>typeof x==='string'?x.trim():'';
const list=x=>Array.isArray(x)?x:[];
const names=Object.freeze({
  name:'Name not recorded',number:'No jersey number',positions:'No preferred positions'
});
const SOURCE_STATUSES=new Set(['recorded','changed-source','missing-source','reversed']);
const childRef=reference=>{
  try{
    const parts=JSON.parse(reference);
    return Array.isArray(parts)&&parts.length===4&&
      typeof parts[0]==='string'&&parts[1]==='player'&&
      typeof parts[2]==='string'&&typeof parts[3]==='string'?
      {teamId:parts[2],playerId:parts[3]}:null;
  }catch{return null;}
};

export function squadRecordReview(team,visiblePlayers,reportedReviews=null) {
  if(!team||!str(team.id)||!Array.isArray(team.players)||
     !Array.isArray(visiblePlayers))return null;
  const byId=new Map(list(team.players).filter(p=>str(p?.id)).map(p=>[p.id,p]));
  const seen=new Set(),items=[];
  let total=0;
  for(const row of visiblePlayers){
    const id=str(row?.id);
    if(!id||!byId.has(id)||seen.has(id))continue;
    seen.add(id);total++;
    const p=byId.get(id);
    const suggestions=[];
    if(!str(p.name))suggestions.push(names.name);
    if(!str(p.number == null ? '' : String(p.number)))suggestions.push(names.number);
    if(!list(p.positions).some(x=>str(x)))suggestions.push(names.positions);
    if(suggestions.length)items.push(Object.freeze({
      id,name:str(p.name)||'Unnamed player',
      suggestions:Object.freeze(suggestions)
    }));
  }
  // People reviews may be unavailable when a coach workspace has no valid
  // local source namespace; that is UNKNOWN, not "no guardian relationship".
  const relationships=reportedReviews===null?null:{
    recorded:0,needsSourceReview:0,reversed:0
  };
  if(relationships){
    for(const r of list(reportedReviews)){
      const ref=childRef(r?.childPlayerRef);
      if(!ref||ref.teamId!==team.id||!SOURCE_STATUSES.has(r.status))continue;
      if(r.status==='reversed')relationships.reversed++;
      else if(r.status==='recorded'&&byId.has(ref.playerId))relationships.recorded++;
      else relationships.needsSourceReview++;
    }
    Object.freeze(relationships);
  }
  return Object.freeze({
    teamId:team.id,total,reviewCount:items.length,
    items:Object.freeze(items),relationships,
    // A missing reported relationship is not inferred or treated as a gap.
    legalGuardianVerified:false,grantsAccess:false,
    registrationVerified:false,competitionEligible:null
  });
}
