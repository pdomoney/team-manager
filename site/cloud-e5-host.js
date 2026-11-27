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
 if(m.type==='mount-failed'&&!mounted&&!pending)return {type:'mount-failed'};
 if(!mounted||pending)return null;
 if(m.type==='close')return {type:'close'};
 if(m.type==='save'&&mode==='edit')return validConnectedE5Play(m.play)?{type:'save',play:structuredClone(m.play)}:{type:'invalid'};
 return null;
}
export function mountConnectedE5(host,{mode,play,sport,teamLabel,style={},scope,onSave,onClose,onError}){
 if(!host||!['view','edit'].includes(mode)||(play===null?mode!=='edit':!validConnectedE5Play(play))||
 !scope?.current()||typeof onClose!=='function'||typeof onError!=='function'||(mode==='edit'&&typeof onSave!=='function'))throw Error('invalid-play');
 const origin=location.origin,nonce=crypto.randomUUID(),frame=document.createElement('iframe');
 // E5 was designed for a full viewport. A shorter iframe inside a scrolling
 // management card clips the fixed editor footer in Chromium. Native modal
 // top-layer hosting gives the original workspace its actual screen area and
 // prevents background navigation while an editor holds unsaved changes.
 const dialog=document.createElement('dialog');
 dialog.className='cloud-e5-dialog';dialog.setAttribute('aria-label',mode==='edit'?'Play Editor workspace':'Watch and Learn workspace');
 frame.title=mode==='edit'?'Play Editor':'Watch and Learn';
 frame.setAttribute('referrerpolicy','no-referrer');
 frame.className='cloud-e5-frame';
 const startup=document.createElement('section');startup.className='cloud-e5-startup';
 const status=document.createElement('p');status.setAttribute('role','status');status.textContent='Opening play workspace…';
 const back=document.createElement('button');back.type='button';back.className='btn';back.textContent='Back to plays';
 startup.append(status,back);dialog.append(startup,frame);
 let disposed=false,mounted=false,pending=false,initialised=false,failed=false,timer=null;
 function fail(){
  if(disposed||mounted||failed)return;
  failed=true;clearTimeout(timer);
  status.textContent='The play workspace could not start. Return to plays and try again. No changes were saved.';
  status.setAttribute('role','alert');
 }
 back.addEventListener('click',()=>{if(!disposed&&!pending){if(mounted)send({type:'request-close'});else onClose(false);}});
 const init={type:'init',mode,play:structuredClone(play),sport,teamLabel,style};
 function send(m){if(!disposed)frame.contentWindow?.postMessage({channel:CHANNEL,nonce,...m},origin);}
 async function receive(event){
  if(disposed||failed||!scope.current()||!frame.isConnected)return;
  const msg=classifyE5Message(event,{source:frame.contentWindow,origin,nonce,mode,mounted,pending});
  if(!msg)return;
  if(msg.type==='ready'){if(!initialised){initialised=true;send(init);}return;}
  if(msg.type==='mount-failed'){if(initialised)fail();return;}
  if(msg.type==='mounted'){if(initialised){mounted=true;clearTimeout(timer);startup.hidden=true;dialog.classList.add('cloud-e5-mounted');}return;}
  if(msg.type==='close'){onClose(false);return;}
  if(msg.type==='invalid'){send({type:'save-failed',message:'Unsupported play. No draft saved.'});return;}
  pending=true;
  try{const saved=await onSave(msg.play);if(!disposed&&scope.current()&&saved?.stillCurrent)onClose(true);}
  catch(e){if(!disposed&&scope.current())send({type:'save-failed',message:onError(e)||'Draft was not saved.'});}
  finally{pending=false;}
 }
 const previousOverflow=document.body.style.overflow,previousFocus=document.activeElement;
 function destroy(){
  if(disposed)return;
  disposed=true;clearTimeout(timer);window.removeEventListener('message',receive);
  if(dialog.open)dialog.close();dialog.remove();
  document.body.style.overflow=previousOverflow;
  if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});
 }
 // Escape must use the original editor's dirty-check, never native dismissal.
 dialog.addEventListener('cancel',e=>{
  e.preventDefault();
  if(!pending){
   if(mounted)send({type:'request-close'});
   else onClose(false);
  }
 });
 window.addEventListener('message',receive);
 frame.src='cloud-e5-workspace.html'+new URL(import.meta.url).search;
 host.append(dialog);
 try{dialog.showModal();document.body.style.overflow='hidden';timer=setTimeout(fail,15000);}
 catch(e){destroy();throw e;}

 return Object.freeze({destroy,editing:mode==='edit',pending:()=>pending});
}
