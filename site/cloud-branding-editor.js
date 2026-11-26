// Connected adapter for the original Settings club-branding and colour swatches.
// Reuses team-style.js and the original 160px raster logo conversion.
import {TEAM_STYLES,CLASSIC,normStyle,resolveStyle} from './team-style.js';
import {CONNECTED_LOGO_MAX,validConnectedLogo,validConnectedStyle,setConnectedCrest} from './connected-branding.js';
function readImage(file, px, max, valid, target = max) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) { reject(new Error('Pick an image file')); return; }
    if (file.size > 15e6) { reject(new Error('That image is too big. Try one under 15 MB.')); return; }
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const W0 = img.naturalWidth || px, H0 = img.naturalHeight || px, k = Math.min(1, px / Math.max(W0, H0));
      const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(W0 * k)); cv.height = Math.max(1, Math.round(H0 * k));
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      let out = '';
      try {
        out = cv.toDataURL('image/webp', 0.85);
        if (!/^data:image\/(webp|png)/.test(out)) out = cv.toDataURL('image/png');
        if (out.length > max) out = cv.toDataURL('image/jpeg', 0.8);
      } catch (e) { reject(new Error('That image can’t be used. Try a PNG or JPEG.')); return; }
      if (out.length > target) {
        for (const quality of [0.7, 0.5, 0.35]) {
          const smaller = cv.toDataURL('image/webp', quality);
          if (valid(smaller) && smaller.length <= target) { out = smaller; break; }
          const jpeg = cv.toDataURL('image/jpeg', quality);
          if (valid(jpeg) && jpeg.length <= target) { out = jpeg; break; }
        }
      }
      if (!valid(out) || out.length > target) { reject(new Error('That image cannot fit the phone storage target. Try a simpler or smaller PNG/JPEG.')); return; }
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That image can’t be read. Try a PNG or JPEG.')); };
    img.src = url;
  });
}

export function renderConnectedBranding({parent,ctx,value,ui,isCurrent,save,preview,restore,onBack,clubOnly=false}){
 const {h,card,info,button,actions,form,field,message}=ui;
 const swatches=[{id:'',name:'Classic',swatch:CLASSIC.swatch},...TEAM_STYLES];
 const choice=(f,style,defaultLabel,changed)=>{
  const initial=normStyle(style),id=initial?.palette||(initial?.custom?'custom':'');
  const grid=h('fieldset',{className:'style-grid',parent:f});
  h('legend',{className:'sr-only',text:'Colour style',parent:grid});
  const inputs=[];
  for(const s of [...swatches,{id:'custom',name:'Your own',swatch:[initial?.custom?.dark||CLASSIC.dark,initial?.custom?.action||CLASSIC.action]}]){
   const label=h('label',{className:'style-sw',parent:grid});
   const input=h('input',{attrs:{type:'radio',name:'palette',value:s.id},parent:label});input.checked=s.id===id;inputs.push(input);
   const sw=h('span',{className:'sw',attrs:{'aria-hidden':'true'},parent:label});
   for(const colour of s.swatch){const part=h('i',{parent:sw});part.style.backgroundColor=colour;}
   h('span',{className:'nm',text:s.id?s.name:defaultLabel,parent:label});
  }
  const custom=h('div',{className:'style-custom',parent:f}),colours=h('div',{className:'three',parent:custom});
  const values=initial?.custom||CLASSIC;
  const dark=field(colours,'Header','styleDark',{type:'color',value:values.dark});
  const action=field(colours,'Buttons','styleAction',{type:'color',value:values.action});
  const accent=field(colours,'Highlight','styleAccent',{type:'color',value:values.accent});
  const hint=info('',custom);hint.setAttribute('role','status');
  const selected=()=>inputs.find(x=>x.checked)?.value||'';
  const read=()=>selected()==='custom'?{custom:{dark:dark.value,action:action.value,accent:accent.value}}:selected()?{palette:selected()}:null;
  const update=()=>{
   if(!isCurrent())return;
   custom.hidden=selected()!=='custom';
   const next=read(),resolved=resolveStyle(next);
   hint.textContent=resolved?.adjusted?.length?'Colours adjusted for readable contrast.':'';
   changed(next);
  };
  for(const input of [...inputs,dark,action,accent])input.addEventListener('input',update);
  custom.hidden=id!=='custom';return read;
 };
 if(!clubOnly){
 const team=card('Team colours',parent);
 info('Use the club’s colours or choose a separate palette for '+ctx.season+'. These colours apply to all authorised roles.',team);
 if(value.canEditTeam){
  let read;
  const f=form(team,async()=>{
   if(!isCurrent())return;
   const style=read();if(!validConnectedStyle(style))throw Error('invalid-request');
   await save('branding.team.save',{style,expectedVersion:value.teamVersion});
  });
  read=choice(f,value.teamStyle,value.clubStyle?'Use club colours':'Classic',style=>preview(style,value.clubStyle,value.logo));
  h('button',{className:'btn primary',text:'Save team colours',attrs:{type:'submit'},parent:f});
 }else info('Your role can view these colours but cannot change them.',team);
 }
 const club=card('Club logo and colours',parent);
 const badge=h('span',{className:'crest big all',parent:club});
 setConnectedCrest(badge,value.logo,ctx.club.slice(0,2).toUpperCase());
 info('The club logo is shared with all its teams. Explicit team palettes take precedence.',club);
 if(!value.canEditClub){
  info(value.locked?'Club branding is locked by Platform administration.':'Club branding requires a separate authorised branding delegation. The first-club founder can explicitly authorise it in Platform administration.',club);
  button('Back to team settings',()=>{restore();onBack();},actions(parent));return;
 }
 let logo=value.logo,readClub,loadingLogo=false;
 const cf=form(club,async d=>{
  if(!isCurrent())return;
  if(loadingLogo){message('Wait for the logo preview to finish before saving.',true);return;}
  const style=readClub(),resetOverrides=d.get('resetOverrides')==='yes';
  if(!validConnectedStyle(style)||!validConnectedLogo(logo))throw Error('invalid-request');
  if(resetOverrides&&!window.confirm('Reset all team-specific colour choices in this exact club?'))return;
  await save('branding.club.save',{style,logo,resetOverrides,expectedVersion:value.clubVersion});
 });
 const imageLabel=h('label',{className:'field-l',parent:cf});
 h('span',{text:'Club logo',parent:imageLabel});
 const file=h('input',{attrs:{type:'file',accept:'image/png,image/jpeg,image/webp'},parent:imageLabel});
 const previewClub=()=>{if(isCurrent())preview(null,readClub(),logo);};
 file.addEventListener('change',async()=>{
  const selected=file.files?.[0];if(!selected||loadingLogo)return;
  if(!['image/png','image/jpeg','image/webp'].includes(selected.type)){message('Choose a PNG, JPEG or WebP logo.',true);file.value='';return;}
  loadingLogo=true;
  try{
   const out=await readImage(selected,160,CONNECTED_LOGO_MAX,validConnectedLogo);
   if(!isCurrent())return;
   logo=out;setConnectedCrest(badge,logo,ctx.club.slice(0,2).toUpperCase());previewClub();
  }catch(e){if(isCurrent())message(e.message,true);}
  finally{loadingLogo=false;file.value='';}
 });
 button('Remove logo',()=>{if(!isCurrent()||loadingLogo)return;logo='';setConnectedCrest(badge,'',ctx.club.slice(0,2).toUpperCase());previewClub();},actions(cf));
 info('Upload only an authorised logo. The image is resized to a small raster badge; no external image URL or SVG is accepted.',cf);
 readClub=choice(cf,value.clubStyle,'Classic (no club colours)',previewClub);
 const reset=h('label',{className:'check cloud-checkbox-row',parent:cf});
 h('input',{attrs:{type:'checkbox',name:'resetOverrides',value:'yes'},parent:reset});
 h('span',{text:'Apply club colours to every team by resetting their individual overrides',parent:reset});
 info('Leave unticked to preserve existing team overrides. New teams inherit the club colours automatically.',cf);
 h('button',{className:'btn primary',text:'Save club branding',attrs:{type:'submit'},parent:cf});
 button('Back to team settings',()=>{restore();onBack();},actions(parent));
}
