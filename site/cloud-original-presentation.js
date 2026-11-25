// Original site/app.js NAV, viewMessages, working context, Home spotlight,
// action list and competition-card structures adapted to DOM nodes. Original
// styles.css supplies the design system. No legacy demo app or permissions.
export const ORIGINAL_NAV_ART=Object.freeze({
  "home": "<path d=\"M3.5 11 12 4l8.5 7v9h-5.5v-6h-6v6H3.5z\"/>",
  "schedule": "<rect x=\"3.5\" y=\"5\" width=\"17\" height=\"15.5\" rx=\"2\"/><path d=\"M3.5 10h17M8 3v4M16 3v4\"/>",
  "team": "<circle cx=\"9\" cy=\"8\" r=\"3.5\"/><path d=\"M2.5 20c.8-3.6 3.3-5.5 6.5-5.5s5.7 1.9 6.5 5.5\"/><circle cx=\"17\" cy=\"9\" r=\"2.5\"/><path d=\"M16.5 14.5c2.5.1 4.2 1.8 5 5\"/>",
  "tactics": "<rect x=\"5\" y=\"2.5\" width=\"14\" height=\"19\" rx=\"1.5\"/><path d=\"M5 12h14M5 5.5h14M5 18.5h14\"/>",
  "more": "<path d=\"M4 6.5h16M4 12h16M4 17.5h16\"/>"
});
const TROPHY="<svg width=\"26\" height=\"26\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M8 4h8v5a4 4 0 0 1-8 0z\"/><path d=\"M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4\"/></svg>";
export function navArt(key){
 const path=ORIGINAL_NAV_ART[key];
 if(!path)throw new TypeError('unknown-navigation-icon');
 return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+path+'</svg>';
}
export function initials(label){return String(label||'Team').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();}
export function originalSection(h,parent,title,cls=''){
 const section=h('section',{className:'sec '+cls,parent});
 const heading=h('div',{className:'sec-h',parent:section});
 h('h2',{text:title,parent:heading});
 return {section,heading};
}
export function originalColumns(h,parent,cls=''){
 const grid=h('div',{className:'cols '+cls,parent});
 return [h('div',{className:'col',parent:grid}),h('div',{className:'col',parent:grid})];
}
export function originalWorkingContext(h,parent,{team,club,meta,onHome}){
 const section=h('section',{className:'working-context',attrs:{'aria-label':'Current working context'},parent});
 const copy=h('div',{className:'working-context-copy',parent:section});
 h('span',{className:'working-context-kicker',text:'Working context',parent:copy});
 const label=h('span',{className:'working-context-team',parent:copy});
 h('strong',{text:team,parent:label});
 if(club)h('span',{className:'working-context-club',text:' · '+club,parent:label});
 h('span',{className:'working-context-meta',text:meta,parent:copy});
 const button=h('button',{className:'working-context-home',text:'Teams on Home',attrs:{type:'button'},parent:section});
 button.addEventListener('click',onHome);return section;
}
export function originalCompetitionCard(h,parent,entry,{onOpen}={}){
 const c=h('section',{className:'comp-live',parent});
 const head=h('div',{className:'cl-head',parent:c});
 const art=h('span',{className:'cl-trophy',parent:head});art.innerHTML=TROPHY;
 const grow=h('div',{className:'grow',parent:head});
 h('p',{className:'cl-k',text:[entry.status,entry.format].filter(Boolean).join(' · '),parent:grow});
 h('h2',{text:entry.name,parent:grow});
 h('p',{className:'cl-sub',text:[entry.division,entry.venue,entry.beginsOn,entry.endsOn].filter(Boolean).join(' · '),parent:grow});
 h('p',{className:'cl-sub',text:'Team-recorded entry · Official draw and results not verified',parent:c});
 if(onOpen){const b=h('button',{className:'btn sm on-dark cl-open',text:'Open competition',attrs:{type:'button'},parent:c});b.addEventListener('click',onOpen);}
 return c;
}
