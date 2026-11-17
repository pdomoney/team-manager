// L1 backend-only request shape guard for first-team operations.
// This is NOT authorization, domain validation, an idempotency store or RLS.
// It rejects unknown mutation envelopes before they reach a future server adapter.
const reads=new Set(['schedule.read','play.published.read','play.draft.read','duty.read']);
const replies=Object.freeze({
  'availability.reply':new Set(['yes','no','maybe']),
  'duty.reply':new Set(['yes','no','done'])
});
const writes=new Set(['schedule.edit','roster.edit','play.draft.edit',
  'play.publish','availability.reply','duty.reply','duty.assign']);
const own=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const keys=(x,allowed)=>Object.keys(x).every(k=>allowed.includes(k));
const stableId=x=>typeof x==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,99}$/.test(x);
const mutationId=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{15,79}$/.test(x);
const version=x=>Number.isSafeInteger(x)&&x>=0&&x<=2147483647;

// Authorship, dates, person and team IDs must always be derived from verified
// server context. Never allow clients to put them into a mutation envelope.
// Opaque Coach/Manager command detail still REQUIRES additional trusted schema
// validation by the future provider adapter; a valid envelope alone proves nothing.
export function validateFirstTeamActionPayload(action,raw={}){
  if(!record(raw))return null;
  if(reads.has(action))return Object.keys(raw).length===0?
    Object.freeze({kind:'read',payload:Object.freeze({})}):null;
  if(!writes.has(action)||!mutationId(raw.mutationId)||!version(raw.expectedVersion))
    return null;
  const base={mutationId:raw.mutationId,expectedVersion:raw.expectedVersion};
  if(own(replies,action)){
    if(!keys(raw,['mutationId','expectedVersion','response'])||
       !replies[action].has(raw.response))return null;
    return Object.freeze({kind:'write',payload:Object.freeze({...base,response:raw.response})});
  }
  if(action==='play.publish'){
    if(!keys(raw,['mutationId','expectedVersion','revisionId'])||
       !stableId(raw.revisionId))return null;
    return Object.freeze({kind:'write',payload:Object.freeze({...base,revisionId:raw.revisionId})});
  }
  if(!keys(raw,['mutationId','expectedVersion','command'])||
     !record(raw.command)||Object.keys(raw.command).length===0)return null;
  let serialized;
  try{serialized=JSON.stringify(raw.command);}catch{return null;}
  if(typeof serialized!=='string'||serialized.length>65536)return null;
  return Object.freeze({kind:'write',payload:Object.freeze({...base,
    command:JSON.parse(serialized)})});
}

export const FIRST_TEAM_READ_ACTIONS=Object.freeze([...reads]);
export const FIRST_TEAM_WRITE_ACTIONS=Object.freeze([...writes]);
