// Reuse the original palette and contrast resolver. Only raster data URLs.
import {normStyle,resolveStyle,effectiveStyle,STYLE_VARS,styleVars,CLASSIC} from './team-style.js';
export const CONNECTED_LOGO_MAX=48000;
export function validConnectedLogo(value) {
 if(value==='')return true;
 if(typeof value!=='string'||value.length>CONNECTED_LOGO_MAX)return false;
 const m=value.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
 if(!m||m[2].length%4!==0)return false;
 try{
  const bytes=atob(m[2]),byte=i=>bytes.charCodeAt(i);
  return m[1]==='png'?bytes.length>=8&&[137,80,78,71,13,10,26,10].every((n,i)=>byte(i)===n):
    m[1]==='jpeg'?bytes.length>=3&&byte(0)===255&&byte(1)===216&&byte(2)===255:
    bytes.length>=12&&bytes.slice(0,4)==='RIFF'&&bytes.slice(8,12)==='WEBP';
 }catch{return false;}
}
export function validConnectedStyle(value){
 if(value===null)return true;
 let n;
 try{n=normStyle(value);}catch{return false;}
 if(!n||Object.keys(value).length!==1)return false;
 if(n.palette)return Object.keys(value)[0]==='palette';
 return Object.keys(value.custom).length===3&&Object.keys(value.custom).every(k=>['dark','action','accent'].includes(k));
}
export function applyConnectedStyle(teamStyle,clubStyle,doc=document){
 const resolved=resolveStyle(effectiveStyle({style:teamStyle},{style:clubStyle})),root=doc.documentElement;
 const vars=styleVars(resolved);
 STYLE_VARS.forEach(k=>{if(vars[k])root.style.setProperty(k,vars[k]);else root.style.removeProperty(k);});
 if(resolved)root.dataset.teamStyle=resolved.id;else delete root.dataset.teamStyle;
 const meta=doc.querySelector('meta[name=theme-color]');if(meta)meta.content=resolved?resolved.dark:CLASSIC.dark;
 return resolved;
}
export function setConnectedCrest(element,logo,fallback){
 const valid=!!logo&&validConnectedLogo(logo);
 element.replaceChildren();element.classList.toggle('logo',valid);element.classList.toggle('all',!valid);
 if(valid){const img=element.ownerDocument.createElement('img');img.src=logo;img.alt='';element.append(img);}
 else element.textContent=fallback;
}

export function validClubBranding(v){
 return !!v&&typeof v.clubRef==='string'&&v.clubRef.length>0&&v.clubRef.length<=120&&
 validConnectedLogo(v.logo)&&validConnectedStyle(v.style)&&Number.isSafeInteger(v.version)&&v.version>=0&&typeof v.locked==='boolean';
}
export function paintClubChip(el,brand,fallback){
 const style=validConnectedStyle(brand?.style??null)?resolveStyle(brand?.style??null):null;
 el.style.setProperty('--club-chip-dark',style?.dark||CLASSIC.dark);
 const crest=el.querySelector('.crest');if(crest)setConnectedCrest(crest,brand?.logo||'',fallback);
}
