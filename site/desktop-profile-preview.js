// Fictional profile picker for the signed-in Coach workspace. No real account impersonation.
// Available at phone, tablet and desktop widths after Coach unlock. Every
// selection maps to a fixed fictional P12 fixture, never production records.
// It does NOT authenticate an Owner or grant any ability to impersonate users.
import {P12_QA_PROFILES,p12QaView} from './p12-qa-profiles.js';

const GROUPS=Object.freeze([
  Object.freeze({label:'Owner and associations',ids:['qa-01','qa-02','qa-03']}),
  Object.freeze({label:'Clubs',ids:['qa-04','qa-05','qa-06']}),
  Object.freeze({label:'Team coaches and managers',ids:['qa-07','qa-08','qa-09','qa-10']}),
  Object.freeze({label:'Match-day staff',ids:['qa-11','qa-12','qa-13']}),
  Object.freeze({label:'Players, guardians and helpers',ids:['qa-14','qa-15','qa-16','qa-17']}),
  Object.freeze({label:'Multiple roles and access edge cases',ids:['qa-18','qa-19','qa-20']})
]);

export function desktopProfileAvailable({role,playerPreview=false,width=0}={}){
  return role==='coach'&&playerPreview===false&&Number.isFinite(width)&&width>=320;
}

export function desktopProfileChoices(){
  return GROUPS.map(g=>({
    label:g.label,
    profiles:g.ids.map(id=>{
      const p=P12_QA_PROFILES.find(x=>x.id===id);
      return p?{id:p.id,label:p.label,fictional:true}:null;
    }).filter(Boolean)
  }));
}

export function resolveDesktopProfile(id){
  if(typeof id!=='string'||!P12_QA_PROFILES.some(x=>x.id===id))return null;
  const view=p12QaView(id);
  return view?.mode==='SYNTHETIC_ONLY_NO_AUTHORIZATION'?view:null;
}
