// Transient document host. Same-origin separation is for DOM/lifecycle reuse,
// not an authentication boundary. The signed-in parent owns all API transport.
import {validConnectedE5Play} from './cloud-e5-payload.js';
export const CHANNEL='tm-connected-e5-v1';
export function classifyE5Message(event,{source,origin,nonce,mode,mounted,pending}){
 if(event.source!==source||event.origin!==origin)return null;
 const m=event.data;if(!m||m.channel!==CHANNEL)return null;
 if(m.type==='ready'&&!mounted&&!pending)return {type:'ready'};
 if(m.nonce!==nonce)return null;
 if(m.type==='mounted'&&!mounted&&!pending)return {type:'mounted'};
 if(!mounted||pending)return null;
 if(m.type==='close')return {type:'close'};
 if(m.type==='save'&&mode==='edit')return validConnectedE5Play(m.play)?{type:'save',play:structuredClone(m.play)}:{type:'invalid'};
 return null;
}
export function mountConnectedE5(host,{mode,play,sport,teamLabel,style={},scope,onSave,onClose,onError}){
 if(!host||!['view','edit'].includes(mode)||(play===null?mode!=='edit':!validConnectedE5Play(play))||
 !scope?.current()||typeof onClose!=='function'||typeof onError!=='function'||(mode==='edit'&&typeof onSave!=='function'))throw Error('invalid-play');
 const origin=location.origin,nonce=crypto.randomUUID(),frame=document.createElement('iframe');
 frame.title=mode==='edit'?'Play Editor':'Watch and Learn';
 frame.style.cssText='display:block;width:100%;height:85dvh;min-height:460px;border:0;border-radius:10px';
 let disposed=false,mounted=false,pending=false,initialised=false;
 const init={type:'init',mode,play:structuredClone(play),sport,teamLabel,style};
 function send(m){if(!disposed)frame.contentWindow?.postMessage({channel:CHANNEL,nonce,...m},origin);}
 async function receive(event){
  if(disposed||!scope.current()||!frame.isConnected)return;
  const msg=classifyE5Message(event,{source:frame.contentWindow,origin,nonce,mode,mounted,pending});
  if(!msg)return;
  if(msg.type==='ready'){if(!initialised){initialised=true;send(init);}return;}
  if(msg.type==='mounted'){if(initialised)mounted=true;return;}
  if(msg.type==='close'){onClose(false);return;}
  if(msg.type==='invalid'){send({type:'save-failed',message:'Unsupported play. No draft saved.'});return;}
  pending=true;
  try{const saved=await onSave(msg.play);if(!disposed&&scope.current()&&saved?.stillCurrent)onClose(true);}
  catch(e){if(!disposed&&scope.current())send({type:'save-failed',message:onError(e)||'Draft was not saved.'});}
  finally{pending=false;}
 }
 function destroy(){disposed=true;window.removeEventListener('message',receive);frame.remove();}
 window.addEventListener('message',receive);frame.src='cloud-e5-workspace.html'+new URL(import.meta.url).search;host.append(frame);
 return Object.freeze({destroy,editing:mode==='edit',pending:()=>pending});
}
