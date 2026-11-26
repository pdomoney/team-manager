// Connected play-library presentation and exact-team draft revision transport.
// Does not create a legacy workspace, grant permissions, or alter E5 geometry.
import {roleForAction} from './cloud-team-contexts.js';
const ID=/^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$/;
const text=x=>typeof x==='string'?x.trim():'';
const lower=x=>text(x).toLocaleLowerCase('en-AU');
const safeError=code=>Object.assign(new Error(code),{code});
const recordOk=r=>r&&ID.test(r.playId||'')&&ID.test(r.revisionId||'')&&
  Number.isSafeInteger(r.version)&&r.version>=0&&r.play&&typeof r.play==='object'&&
  !Array.isArray(r.play)&&text(r.play.name);
const category=r=>text(r.play.category)||'Other';

// Two views deliberately remain separate. A published revision and its newer
// draft are distinct records even when they share a play ID.
export function connectedPlayLibrary(records,{query='',filter=''}={}){
  if(!Array.isArray(records))throw new TypeError('invalid-play-library');
  const reasons={invalidRecord:0,duplicateRevision:0,filtered:0};
  const unique=new Set(),valid=[];
  for(const record of records){
    if(!recordOk(record)){reasons.invalidRecord++;continue;}
    const key=record.playId+'\0'+record.revisionId;
    if(unique.has(key)){reasons.duplicateRevision++;continue;}
    unique.add(key);valid.push(record);
  }
  const categories=[...new Set(valid.map(category))].sort((a,b)=>a.localeCompare(b,'en-AU'));
  const q=lower(query),rows=valid.filter(r=>{
    const p=r.play;
    const found=(!filter||category(r)===filter)&&(!q||
      [p.name,p.headline,p.when,p.category,p.sport,...(Array.isArray(p.tags)?p.tags:[])].some(x=>lower(x).includes(q)));
    if(!found)reasons.filtered++;
    return found;
  });
  return {eligible:records.length,shown:rows.length,rows,categories,reasons};
}

// Capture the actual navigation context and epoch, rather than using whatever
// team happens to be selected when an asynchronous import/editor callback fires.
// The existing client and trusted SQL still recheck the role and version.
export function capturePlayScope({context,epoch,current,operation,mutationId}){
  if(context?.kind!=='team'||!ID.test(context.teamId||'')||
     typeof current!=='function'||typeof operation!=='function'||typeof mutationId!=='function')
    throw safeError('scope-denied');
  const currentScope=()=>{const s=current();return s.context===context&&s.epoch===epoch&&s.tab==='tactics';};
  async function mutate(action,resource,expectedVersion,detail){
    if(!currentScope())throw safeError('scope-denied');
    if(!['play.draft.edit','play.publish'].includes(action)||!ID.test(resource||'')||
       !Number.isSafeInteger(expectedVersion)||expectedVersion<0||
       !detail||typeof detail!=='object'||Array.isArray(detail)||
       Object.keys(detail).some(k=>!['command','revisionId'].includes(k)))
      throw safeError('invalid-play');
    const role=roleForAction(context,action);
    if(!role)throw safeError('role-denied');
    // Detach from mutable editor data before an asynchronous request starts.
    const payload={...JSON.parse(JSON.stringify(detail)),expectedVersion,mutationId:mutationId()};
    const result=await operation({...context,role},action,resource,payload);
    return {result,stillCurrent:currentScope()};
  }
  return Object.freeze({mutate,current:currentScope});
}
