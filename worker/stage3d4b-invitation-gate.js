// Stage 3D.4B: the only two onboarding requests allowed before policy acceptance.
// An invitation can be CLAIMED, but neither action grants team access, reads
// team records, approves adults, or activates an exact-team role.
// This is just a router exception; the normal Worker handler still verifies
// GoTrue identity and the private RPC binds list/claim to its verified email.
const INVITE=/^invite-[0-9a-f]{32}$/;
export async function prePolicyInvitationAction(request,env){
  if(env?.STAGE3D3_REGISTRATION_MODE!=='required'||
     env?.STAGE3D4_OWNER_ADMIN_MODE!=='enabled'||
     env?.STAGE3D3_EXISTING_SHARED_WORKER_MODE!=='preserve-legacy-pages'||
     request.method!=='POST')return false;
  const url=new URL(request.url);
  if(url.pathname!=='/api/stage3/v1/onboarding'||url.search||url.hash||
     request.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json')
    return false;
  try{
    // Never consume the original request: the protected handler parses it later.
    const body=await request.clone().text();
    if(body.length>2048)return false;
    const value=JSON.parse(body);
    if(!value||typeof value!=='object'||Array.isArray(value))return false;
    const keys=Object.keys(value).sort().join(',');
    if(value.action==='list.mine')return keys==='action';
    if(value.action==='claim')return keys==='action,invitationId'&&
      typeof value.invitationId==='string'&&INVITE.test(value.invitationId);
  }catch{/* fail closed to the ordinary policy gate */}
  return false;
}
