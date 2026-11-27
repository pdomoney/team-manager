// Import one explicitly selected play from the existing E5 library export.
import {validConnectedE5Play} from './cloud-e5-payload.js';
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const clone=x=>JSON.parse(JSON.stringify(x));
const bad=reason=>({ok:false,reason});
export function inspectPlayImport(file){
 if(!obj(file))return bad('invalid-file');
 if(file.format!=='team-manager-library'){
  return validConnectedE5Play(file)?{ok:true,rows:[{id:file.id,name:file.name,play:clone(file)}],omitted:[]}:bad('unsupported-play');
 }
 if(file.version!==1||!obj(file.library)||!Array.isArray(file.library.plays)||file.library.plays.length>200||
    (Object.hasOwn(file.library,'playerSets')&&!Array.isArray(file.library.playerSets)))return bad('invalid-library');
 const sets=file.library.playerSets||[],rows=[],omitted=[];
 const ids=new Map();for(const p of file.library.plays)if(obj(p))ids.set(p.id,(ids.get(p.id)||0)+1);
 for(const source of file.library.plays){
  if(!obj(source)||typeof source.id!=='string'||ids.get(source.id)!==1){
   omitted.push({reason:'invalid-or-duplicate-id'});continue;
  }
  const play=clone(source);
  // Do not transfer known local library bookkeeping or source team identity.
  for(const key of ['lib','libraryOrigin','at','rev','edited','builtin'])delete play[key];
  if(play.set&&!['oztag','league'].includes(play.set)&&!play.setDef){
   const matches=sets.filter(s=>obj(s)&&s.id===play.set);
   if(matches.length!==1){omitted.push({id:source.id,reason:'missing-or-ambiguous-role-set'});continue;}
   const {name,labels,slots}=matches[0];play.setDef={name,labels,...(slots===undefined?{}:{slots})};
  }
  if(!validConnectedE5Play(play)){omitted.push({id:source.id,reason:'unsupported-play'});continue;}
  rows.push({id:source.id,name:play.name,play});
 }
 return {ok:true,rows,omitted};
}
