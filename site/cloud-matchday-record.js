// Connected match record: only server-returned, fixture-pinned rules enable
// controls. There is no client-side activation, score calculation or grant.
const showTime=ms=>Math.floor(ms/60000)+':'+String(Math.floor(ms/1000)%60).padStart(2,'0');
export function renderMatchDayRecord({record,ctx,fixture,access,current,ui,commit,refresh,onMessage}){
 const {h,card,info,button,actions,form,field,selectField}=ui;
 if(!record||typeof record.state!=='string')throw Error('invalid-matchday-record');
 if(!access.proposedRecord){
   const panel=card('Starting lineup and result');
   if(Array.isArray(record.startingPlayers)&&record.startingPlayers.length){
     info('Approved starting lineup',panel);
     for(const p of record.startingPlayers)if(typeof p.displayName==='string')info(p.displayName,panel);
   }else info('No current approved starting lineup.',panel);
   if(record.state==='published')info('Team-recorded final result: '+record.homeScore+' – '+record.awayScore,panel);
   else info('No published team result.',panel);
   return;
 }
 if(record.state==='historical-published'){
   const panel=card('Historical published result');
   info('Team-recorded final result: '+record.homeScore+' – '+record.awayScore+'. The current squad or rules have changed. This result is read-only.',panel);
   return;
 }
 if(record.state==='blocked'){
   const panel=card('Match controls');
   info(record.reason==='squad-unavailable'?'Publish a current match squad within the verified competition limits first.':
     record.reason==='rules-unapproved'?'Competition rules awaiting organiser evidence and owner approval.':
     'The fixture, squad or approved profile has changed. Review before recording any match events.',panel);
   return;
 }
 if(record.fixtureVersion!==fixture.version||!record.rules?.id||!Array.isArray(record.players)||!Array.isArray(record.fieldIds)||
    !Array.isArray(record.events)||!Number.isSafeInteger(record.version)||typeof record.canEdit!=='boolean')
   throw Error('invalid-matchday-record');
 const roles=ctx.roles||[],coach=roles.includes('team_coach'),manager=roles.includes('team_manager'),assistant=roles.includes('team_assistant');
 const r=record.rules, state=record.state;
 const pMap=new Map(record.players.map(p=>[p.personId,p.displayName]));
 const name=id=>pMap.get(id)||'Unavailable participant';
 const run=(action,input={})=>void commit(action,input);
 const panel=card('Match controls');
 info('Team-recorded information, not the official competition result. Rules edition: '+r.edition,panel);
 const score=h('h3',{text:record.homeScore+' – '+record.awayScore,parent:panel});
 score.setAttribute('aria-label','Team score '+record.homeScore+', opponent '+record.awayScore);
 const clock=h('p',{text:'Period '+record.period+' of '+r.periodCount+' · '+showTime(record.elapsedMs)+' / '+showTime(r.periodSeconds*1000),parent:panel});
 info('Record status: '+state,panel);
 if(record.running){
   const started=performance.now();
   const timer=setInterval(()=>{
     if(!current()||!clock.isConnected){clearInterval(timer);return;}
     clock.textContent='Period '+record.period+' of '+r.periodCount+' · '+showTime(Math.min(r.periodSeconds*1000,record.elapsedMs+performance.now()-started))+' / '+showTime(r.periodSeconds*1000);
   },250);
 }
 button('Refresh match record',refresh,actions(panel));
 if(coach||manager){
   if(['ready','playing','finished','approved','published'].includes(state))
     button('Prepare lineup message',()=>void onMessage('lineup'),actions(panel));
   if(state==='published')button('Prepare result message',()=>void onMessage('result'),actions(panel));
 }
 if(['none','draft','ready'].includes(state)&&record.canEdit&&(coach||assistant)){
   const line=card('Starting lineup');
   info('Use independently verified competition scoring categories. This does not certify player eligibility.',line);
   info('On field: '+r.fieldMin+'–'+r.fieldMax+' · maximum '+r.categoryALabel+' '+r.categoryAMax+' · minimum '+r.categoryBLabel+' '+r.categoryBMin,line);
   const controls=[];
   const f=form(line,async()=>{
     const lineup=controls.map(({id,cat,cb})=>({personId:id,category:cat.value,onField:cb.checked}));
     if(lineup.some(p=>!['a','b'].includes(p.category)))return ui.message('Confirm the category for every selected participant.',true);
     await commit('matchday.lineup.save',{lineup});
   });
   for(const p of record.players){
     const row=h('div',{className:'cloud-list-item',parent:f});
     h('strong',{text:p.displayName,parent:row});
     const cat=selectField(row,'Verified competition category for '+p.displayName,'category-'+p.personId,
       [['','Choose category'],['a',r.categoryALabel],['b',r.categoryBLabel]]);
     cat.value=record.categories?.[p.personId]||'';
     const label=h('label',{className:'cloud-checkbox-row',parent:row});
     const cb=h('input',{attrs:{type:'checkbox'},parent:label});cb.checked=record.startingIds.includes(p.personId);
     h('span',{text:'Start on field',parent:label});
     controls.push({id:p.personId,cat,cb});
   }
   h('button',{className:'cloud-btn primary',text:'Save lineup draft',attrs:{type:'submit'},parent:f});
 }
 if(state==='draft'&&coach&&record.canEdit)button('Approve and publish starting lineup',()=>{
   if(confirm('Confirm the competition scoring categories and approve this starting lineup for verified Players?'))run('matchday.lineup.approve',{confirmed:true});
 },actions(panel));
 if(record.fieldIds.length){
   const participation=card('Player participation');
   for(const p of record.players)info(p.displayName+' · '+(record.fieldIds.includes(p.personId)?'On field':'Reserve')+
     ' · recorded time '+showTime(record.playedMs?.[p.personId]||0),participation);
   info(record.interchanges+' interchanges recorded',participation);
 }
 if(record.canEdit){
   const a=actions(panel);
   if(record.canStart===true&&(state==='ready'||state==='playing')&&!record.running&&record.elapsedMs<r.periodSeconds*1000)
     button(state==='ready'?'Start match clock':'Resume clock',()=>run('matchday.clock.start'),a);
   if(state==='playing'&&record.running)button('Pause clock',()=>run('matchday.clock.pause'),a);
   if(state==='playing'&&!record.running&&record.elapsedMs>=r.periodSeconds*1000&&record.period<r.periodCount)
     button('Next period',()=>run('matchday.period.next'),a);
   if(state==='playing'&&!record.running&&record.elapsedMs>=r.periodSeconds*1000&&record.period===r.periodCount&&coach)
     button('Finish match',()=>run('matchday.finish'),a);
   if(state==='playing'||state==='finished'){
     const scores=card(state==='finished'?'Correct unpublished score':'Record scoring event');
     const home=form(scores,async d=>commit('matchday.score.record',{side:'home',personId:String(d.get('scorer')),
       ...(state==='finished'?{reason:String(d.get('reason')).trim()}:{})}));
     selectField(home,'Team try scorer','scorer',[['','Choose scorer'],...(state==='finished'?record.players.map(p=>p.personId):record.fieldIds).map(id=>[id,name(id)])]);
     if(state==='finished')field(home,'Correction reason','reason',{max:200});
     h('button',{className:'cloud-btn',text:'Record team try',attrs:{type:'submit'},parent:home});
     const away=form(scores,async d=>commit('matchday.score.record',{side:'away',category:String(d.get('category')),
       ...(state==='finished'?{reason:String(d.get('reason')).trim()}:{})}));
     selectField(away,'Opponent scoring category','category',[['','Choose category'],['a',r.categoryALabel],['b',r.categoryBLabel]]);
     if(state==='finished')field(away,'Correction reason','reason',{max:200});
     h('button',{className:'cloud-btn',text:'Record opponent try',attrs:{type:'submit'},parent:away});
   }
   if(state==='playing'&&record.fieldIds.length&&record.players.some(p=>!record.fieldIds.includes(p.personId))){
     const changes=card('Interchange');
     const f=form(changes,async d=>commit('matchday.interchange',{outId:String(d.get('outId')),inId:String(d.get('inId'))}));
     selectField(f,'Player leaving field','outId',record.fieldIds.map(id=>[id,name(id)]));
     selectField(f,'Player entering field','inId',record.players.filter(p=>!record.fieldIds.includes(p.personId)).map(p=>[p.personId,p.displayName]));
     h('button',{className:'cloud-btn',text:'Record interchange',attrs:{type:'submit'},parent:f});
   }
   if(state==='finished'&&coach)button('Approve team-recorded result',()=>{
     if(confirm('Confirm this result has been checked against the referee or organiser result. Publish separately.'))run('matchday.result.approve',{confirmed:true});
   },a);
   if(state==='approved'&&(coach||manager))button('Publish approved result',()=>{
     if(confirm('Publish the approved team-recorded result to verified Players?'))run('matchday.result.publish');
   },a);
   if(['approved','published'].includes(state)&&coach){
     const f=form(panel,async d=>commit('matchday.result.reopen',{reason:String(d.get('reason')).trim()}));
     field(f,'Reason for reopening result','reason',{max:200});
     h('button',{className:'cloud-btn',text:'Withdraw and reopen result',attrs:{type:'submit'},parent:f});
   }
 }
 const audit=card('Match event history');
 info('Latest 40 events. Earlier events remain in the private append-only record.',audit);
 for(const e of record.events){
   const row=h('div',{className:'cloud-list-item',parent:audit});
   info('#'+e.version+' · '+e.action.replace('matchday.','')+' · period '+e.period+' '+showTime(e.elapsedMs)+' · '+e.role,row);
   if(e.action==='matchday.score.record')info((e.homeDelta?'Team +'+e.homeDelta:'Opponent +'+e.awayDelta)+(e.voided?' · voided':''),row);
   if(e.payload?.reason)info(e.payload.reason,row);
   if(record.canEdit&&['playing','finished'].includes(state)&&e.action==='matchday.score.record'&&!e.voided){
     const f=form(row,async d=>commit('matchday.score.void',{targetVersion:e.version,reason:String(d.get('reason')).trim()}));
     field(f,'Reason for voiding event '+e.version,'reason',{max:200});
     h('button',{className:'cloud-btn',text:'Void scoring event '+e.version,attrs:{type:'submit'},parent:f});
   }
 }
}
