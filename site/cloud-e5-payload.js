// Strict non-mutating gate for untrusted connected renderer inputs. Unsupported
// historic/custom records remain intact; no automatic lossy conversion.
import {loadPlayEventDraft} from './play-event-persistence.js';
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const id=x=>typeof x==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,99}$/.test(x)&&!['constructor','prototype','__proto__'].includes(x);
const str=(x,max=4096)=>typeof x==='string'&&x.length<=max;
const list=(x,fn,max=256)=>Array.isArray(x)&&x.length<=max&&x.every(fn);
const map=(x,fn,max=64)=>obj(x)&&Object.keys(x).length<=max&&Object.entries(x).every(([k,v])=>id(k)&&fn(v));
const pt=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=0&&p[0]<=50&&p[1]>=0&&p[1]<=80;
const keys=(x,a)=>obj(x)&&Object.keys(x).every(k=>a.includes(k));
const opt=(x,k,fn)=>!Object.hasOwn(x,k)||fn(x[k]);
const bool=x=>typeof x==='boolean';
const side=x=>['l','r','a','b','c','al','ar','bl','br','cl','cr',''].includes(x);
const view=v=>keys(v,['x0','x1','y0','y1'])&&[v.x0,v.x1,v.y0,v.y1].every(Number.isFinite)&&v.x0>=0&&v.x1<=50&&v.y0>=0&&v.y1<=80&&v.x1-v.x0>=0.5&&v.y1-v.y0>=0.5;
const move=m=>keys(m,['t','pts','key','opt','curve','moveId','linkVersion','actorLinks'])&&
 ['run','pass','kick','dummy','shift'].includes(m.t)&&list(m.pts,pt,128)&&m.pts.length>=2&&
 ['key','opt','curve'].every(k=>opt(m,k,bool))&&opt(m,'moveId',id)&&opt(m,'linkVersion',x=>x===1)&&
 opt(m,'actorLinks',x=>keys(x,['start','end'])&&Object.values(x).every(id))&&
 (!Object.hasOwn(m,'linkVersion')||(id(m.moveId)&&obj(m.actorLinks)));
const study=s=>keys(s,['title','text','moves','roles'])&&str(s.title,200)&&str(s.text)&&list(s.moves,x=>Number.isSafeInteger(x)&&x>=0&&x<256)&&list(s.roles,id,32);
const note=n=>keys(n,['text','side'])&&str(n.text)&&opt(n,'side',side);
const label=l=>keys(l,['at','text','side','dot'])&&pt(l.at)&&str(l.text)&&opt(l,'side',side)&&opt(l,'dot',bool);
const phaseKeys=['players','defence','moves','focus','ghost','notes','labels','view','tags','title','study'];
const rootKeys=[...phaseKeys,'id','name','sport','category','headline','when','steps','side','builtin','rev','edited','phases','set','setDef','who','rules','eventTimeline'];
const builtinSets=new Set(['oztag','league']);
const slotKeys=new Set(['LW','LL','LR','LM','RM','RR','RL','RW']);
const safeRoleCode=c=>typeof c==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,3}$/.test(c)&&!['__proto__','constructor','prototype'].includes(c);
function validSetDefinition(p){
  if(!p.set||builtinSets.has(p.set))return !Object.hasOwn(p,'setDef');
  const d=p.setDef;
  if(!id(p.set)||!keys(d,['name','labels','slots'])||!str(d.name,120)||!d.name.trim()||
     !list(d.labels,l=>keys(l,['code','name'])&&safeRoleCode(l.code)&&str(l.name,120)&&l.name.trim()&&
       !['__proto__','constructor','prototype'].includes(l.name.toLowerCase()),32)||!d.labels.length)return false;
  const codes=new Set(d.labels.map(l=>l.code));
  if(codes.size!==d.labels.length)return false;
  if(Object.hasOwn(d,'slots')&&(!map(d.slots,c=>codes.has(c),8)||
     Object.keys(d.slots).some(k=>!slotKeys.has(k))))return false;
  if(Object.hasOwn(p,'who')&&(!map(p.who,c=>codes.has(c),8)||Object.keys(p.who).some(k=>!slotKeys.has(k))))return false;
  return true;
}
function phase(p,root=false){
 return keys(p,root?rootKeys:phaseKeys)&&map(p.players,pt,32)&&list(p.moves,move)&&
 opt(p,'defence',d=>keys(d,['marker','line'])&&opt(d,'marker',x=>x===null||pt(x))&&opt(d,'line',x=>list(x,pt,32)))&&
 ['focus','ghost'].every(k=>opt(p,k,x=>list(x,id,32)))&&opt(p,'notes',x=>map(x,note))&&
 opt(p,'labels',x=>list(x,label,128))&&opt(p,'tags',x=>map(x,v=>str(v,80)||(Number.isSafeInteger(v)&&v>=0&&v<=99)))&&
 opt(p,'view',view)&&opt(p,'title',x=>str(x,200))&&opt(p,'study',x=>list(x,study,128));
}
function timeline(t){
 return keys(t,['version','actors','events'])&&t.version===1&&list(t.actors,a=>
  keys(a,['actorId','type','phases'])&&id(a.actorId)&&['attacker','defender'].includes(a.type)&&
  list(a.phases,p=>keys(p,['phaseIndex','slotKey'])&&Number.isSafeInteger(p.phaseIndex)&&p.phaseIndex>=0&&id(p.slotKey),32),64)&&
  list(t.events,e=>keys(e,['eventId','atMs','sequence','kind','actorId','movementId','receiverId'])&&id(e.eventId)&&id(e.actorId)&&
  Number.isSafeInteger(e.atMs)&&e.atMs>=0&&e.atMs<=3600000&&Number.isSafeInteger(e.sequence)&&e.sequence>=0&&str(e.kind,32)&&opt(e,'movementId',id)&&opt(e,'receiverId',id),512);
}
export function validConnectedE5Play(p){
 try{
  if(!phase(p,true)||!id(p.id)||!str(p.name,120)||!p.name.trim()||
    !['sport','category','headline','when','steps'].every(k=>opt(p,k,x=>str(x)))||
    !opt(p,'side',x=>['left','right'].includes(x))||!opt(p,'builtin',bool)||!opt(p,'edited',bool)||
    !opt(p,'rev',x=>Number.isSafeInteger(x)&&x>=0)||!opt(p,'set',id)||!validSetDefinition(p)||
    !opt(p,'who',x=>map(x,id,32))||!opt(p,'rules',x=>list(x,id,128))||!opt(p,'phases',x=>list(x,ph=>phase(ph),31))||
    !opt(p,'eventTimeline',timeline))return false;
  if(Object.hasOwn(p,'eventTimeline')&&loadPlayEventDraft(p).status!=='ready')return false;
  return new TextEncoder().encode(JSON.stringify(p)).length<=60000;
 }catch{return false;}
}

/** Read a single authored play or a legacy library export. Never import a
 * workspace backup, automatically choose a play, or carry local team links.
 * Existing setDef is the authoritative exported definition. */
export function authoredPlayImportCandidates(value){
  if(validConnectedE5Play(value))return [{name:value.name,play:JSON.parse(JSON.stringify(value)),reason:null}];
  if(!obj(value)||value.format!=='team-manager-library'||value.version!==1||
    !obj(value.library)||!Array.isArray(value.library.plays)||value.library.plays.length>200||
    Object.keys(value).some(k=>!['format','version','exportedAt','library'].includes(k)))return [];
  return value.library.plays.map(item=>{
    if(!obj(item))return {name:'Unsupported play',play:null,reason:'invalid-record'};
    const {at,libraryOrigin,lib,...candidate}=item;
    // Known local library bookkeeping is not a cloud permission or play field.
    // Nothing within diagram, instructions, roles or timing is rewritten.
    const ok=validConnectedE5Play(candidate);
    return {name:str(item.name,120)?item.name:'Unsupported play',play:ok?JSON.parse(JSON.stringify(candidate)):null,
      reason:ok?null:'unsupported-play-payload'};
  });
}
