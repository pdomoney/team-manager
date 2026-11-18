// Read-only Stage 2 cloud preview. E5 authored geometry and timing are never
// mutated. The accepted original editor/Watch renderer remains authoritative.
import {studyCards} from './play-study.js';
import {publishedPlayEventTimeline} from './play-event-persistence.js';
import {evaluatePlayEventTimeline} from './play-event-timeline.js';
const NS='http://www.w3.org/2000/svg';
const el=(tag)=>document.createElementNS(NS,tag);
const validPoint=p=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isFinite(n)&&n>=0&&n<=80);
export function previewCloudPlay(play,host,{phase=0,atMs=0}={}){
  host.replaceChildren();
  if(!play||typeof play!=='object')return;
  const phases=[play,...(Array.isArray(play.phases)?play.phases:[])];
  const item=phases[Math.min(Math.max(phase,0),phases.length-1)];
  const text=(tag,value,parent=host)=>{let n=document.createElement(tag);n.textContent=String(value||'');parent.append(n);return n;};
  const field=document.createElement('div');field.className='cloud-play-field';host.append(field);
  const svg=el('svg');svg.setAttribute('viewBox','0 0 400 480');
  svg.setAttribute('role','img');
  svg.setAttribute('aria-label','Read-only authored phase diagram');
  field.append(svg);
  const make=(name,attrs)=>{let n=el(name);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,String(v)));svg.append(n);return n;};
  make('rect',{x:10,y:10,width:380,height:460,rx:5,fill:'#22603d',stroke:'#b4dac0','stroke-width':2});
  for(let y=50;y<470;y+=80)make('line',{x1:10,y1:y,x2:390,y2:y,stroke:'#9dccb3','stroke-opacity':'.38'});
  const pos=p=>[10+p[0]*7.6,10+p[1]*5.75];
  for(const move of Array.isArray(item?.moves)?item.moves:[]){
    const pts=(Array.isArray(move.pts)?move.pts:[]).filter(validPoint);
    if(pts.length<2)continue;
    make('polyline',{points:pts.map(p=>pos(p).join(',')).join(' '),fill:'none',
      stroke:move.t==='pass'?'#fff':'#ffd24d','stroke-width':3.5,
      'stroke-dasharray':move.t==='pass'?'8 6':'none'});
  }
  for(const [slot,p] of Object.entries(item?.players||{})){
    if(!validPoint(p))continue;
    const [cx,cy]=pos(p);
    make('circle',{cx,cy,r:13,fill:'#fff5dc',stroke:'#1a3e2e','stroke-width':2});
    let label=make('text',{x:cx,y:cy+4,'font-size':10,'text-anchor':'middle',fill:'#173826'});
    label.textContent=slot.slice(0,3);
  }
  for(const p of Array.isArray(item?.defence?.line)?item.defence.line:[]){
    if(!validPoint(p))continue;
    const [cx,cy]=pos(p);make('circle',{cx,cy,r:8,fill:'#ce4960',stroke:'#fff','stroke-width':1.5});
  }
  if(phases.length>1){
    const nav=document.createElement('div');nav.className='cloud-phase-nav';host.append(nav);
    phases.forEach((ph,i)=>{
      const b=document.createElement('button');b.type='button';b.className='cloud-btn';
      b.textContent=ph.title||'Phase '+(i+1);b.setAttribute('aria-pressed',String(i===phase));
      b.addEventListener('click',()=>previewCloudPlay(play,host,{phase:i,atMs}));
      nav.append(b);
    });
  }
  const cues=studyCards(play,typeof play.steps==='string'?play.steps.split(/\r?\n/).filter(Boolean):[]);
  const selected=cues.filter(x=>x.phase===phase);
  for(const c of selected){const d=document.createElement('div');d.className='cloud-step';
    text('strong',c.title,d);text('p',c.text,d);host.append(d);}
  if(!selected.length&&play.steps)text('p',play.steps);
  const timeline=publishedPlayEventTimeline(play);
  if(timeline){
    const duration=Math.max(0,...timeline.events.map(e=>e.atMs));
    const box=document.createElement('div');box.className='cloud-card';host.append(box);
    text('strong','Authored event timeline',box);
    const progress=document.createElement('input');progress.type='range';progress.min='0';
    progress.max=String(Math.max(1,duration));progress.value=String(Math.min(atMs,duration));
    progress.setAttribute('aria-label','Seek through the authored event timeline');
    const note=text('p','',box);note.className='cloud-muted';box.append(progress);
    const update=()=>{const at=Number(progress.value);const state=evaluatePlayEventTimeline(timeline,at);
      note.textContent=state.status==='evaluated'?at+' ms · authored timing available'
        :'Timeline blocked: no inferred animation';};
    progress.addEventListener('input',update);update();
  }
  text('p','Cloud preview uses authored positions and steps without rewriting the source E5 play. The original E5 Watch/Editor remains the accepted full renderer.').className='cloud-muted';
}
