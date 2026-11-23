// Read-only founder readiness view for the initial adult-only first-team trial.
// This is NOT a team permission or policy acknowledgement. The trusted Worker
// verifies the session and the founder grant; no direct private-table access.
const IDENT=/^[a-z][a-z0-9-]{2,63}$/;
const SPORT=/^[a-z][a-z0-9-]{1,30}$/;
export async function verifiedOwnerSetup({identity,fetchImpl}={}){
  if(typeof identity?.verifiedBearer!=='function'||
    typeof fetchImpl!=='function')return null;
  try{
    const bearer=await identity.verifiedBearer();
    const res=await fetchImpl('/api/stage3d4/v1/owner',{
      method:'POST',mode:'same-origin',cache:'no-store',redirect:'error',
      credentials:'omit',
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+bearer},
      body:JSON.stringify({action:'status'})
    });
    if(!res?.ok)return null;
    const data=await res.json();
    if(data?.ok!==true||data.code!=='ready'||
      typeof data.coachAssigned!=='boolean'||
      typeof data.policyReady!=='boolean')return null;
    const team=data.team;
    if(team!==null&&team!==undefined&&
      (!IDENT.test(team.teamId||'')||
       typeof team.clubRef!=='string'||team.clubRef.length<3||
       team.clubRef.length>100||!SPORT.test(team.sportRef||'')||
       !/^20\d{2}$/.test(team.seasonRef||'')))return null;
    if(!team&&data.coachAssigned)return null;
    return Object.freeze({
      team:team?Object.freeze({
        teamId:team.teamId,clubRef:team.clubRef,
        sportRef:team.sportRef,seasonRef:team.seasonRef
      }):null,
      coachAssigned:data.coachAssigned,policyReady:data.policyReady
    });
  }catch{return null;}
}
