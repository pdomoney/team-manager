import {TEAM_MESSAGE_TEMPLATES,trainingReminderText,trainingCancellationText,
  availabilityRequestText,projectedCloudSession,nextCloudTraining,
  cloudAvailabilityEvents} from './shared-team-messages.js';
import {originalJerseyReportFromCloud,originalJerseyInventoryFromCloud,
  originalTeamCompetitionsFromCloud} from './cloud-original-model-adapter.js';
// Stage 3D.5 connected management surfaces. Uses the established Team Manager
// menu vocabulary and exact-team server records, never the fictional demo vault.
// The Host owns navigation state; each async screen discards stale team results.
export function createCloudManagementExperience({
  api,getContext,getSchedule,getTeamLabel,publishMessageNotice,ui,onBack,onReport,onNotices,onTeam
}){
  const {h,card,info,button,actions,form,field,selectField,title,clear,message,explain}=ui;
  const permitted=()=>getContext()?.kind==='team'&&
    getContext()?.roles?.some(r=>r==='team_coach'||r==='team_manager');
  const ensure=(ctx)=>ctx?.key===getContext()?.key;
  const text=x=>String(x??'');
  const report=error=>message(explain(error),true);
  const place=(section,ctx)=>{
    clear();title(section,ctx.club+' · '+ctx.season);
    const a=actions();
    button('All management tools',()=>onBack(),a);
    button('Team',()=>onTeam(),a);
  };
  async function query(ctx,action,input={}){
    if(!ensure(ctx))throw Error('scope-denied');
    const data=await api.call(ctx,action,input);
    if(!ensure(ctx))throw Error('scope-denied');
    return data;
  }
  async function use(ctx,action,input,next,done){
    try{await query(ctx,action,input);message(done||'Saved for this team.');await next();}
    catch(e){report(e);}
  }
  async function open(section){
    const ctx=getContext();
    if(!permitted()||!ctx)return;
    place(section,ctx);
    const loading=info('Loading '+section.toLowerCase()+' for this team…');
    try{
      const rights=await query(ctx,'admin.status');
      const canAdmin=rights.canAdmin===true;
      if(section==='Settings')await settings(ctx,loading,canAdmin);
      if(section==='Jerseys')await jerseys(ctx,loading,canAdmin);
      if(section==='Competitions')await competitions(ctx,loading,canAdmin);
      // A Coach keeps coaching communications after a Manager takes over
      // administrative duties; the server still revalidates the selected grant.
      if(section==='Messages')await messages(ctx,loading,
        ctx.roles?.some(r=>r==='team_coach'||r==='team_manager'));
      if(section==='Volunteer tally')await duties(ctx,loading,canAdmin);
      if(section==='People')await people(ctx,loading);
      if(section==='Clubs and teams')await teams(ctx,loading);
    }catch(e){
      if(ensure(ctx)){loading.textContent=explain(e);report(e);}
    }
  }
  async function settings(ctx,loading,canAdmin){
    const x=await query(ctx,'settings.read');
    loading.remove();
    const c=card('Team settings');
    info('These are shared settings for '+ctx.club+' · '+ctx.season+'. Your personal screen preferences stay on this device.',c);
    if(canAdmin){
    const f=form(c,async d=>use(ctx,'settings.save',{
      teamLabel:text(d.get('teamLabel')).trim(),
      trainingVenue:text(d.get('trainingVenue')).trim(),
      trainingStart:text(d.get('trainingStart')).trim(),
      trainingEnd:text(d.get('trainingEnd')).trim(),
      contactName:text(d.get('contactName')).trim(),
      contactEmail:text(d.get('contactEmail')).trim(),
      jerseyLoan:!!d.get('jerseyLoan'),expectedVersion:x.version
    },()=>open('Settings'),'Team settings saved.'));
    field(f,'Team display name','teamLabel',{value:x.teamLabel||'',required:false,max:100});
    field(f,'Training venue','trainingVenue',{value:x.trainingVenue||'',required:false,max:120});
    field(f,'Usual training start','trainingStart',{type:'time',value:x.trainingStart||'',required:false});
    field(f,'Usual training finish','trainingEnd',{type:'time',value:x.trainingEnd||'',required:false});
    field(f,'Team contact name','contactName',{value:x.contactName||'',required:false,max:80});
    field(f,'Team contact email','contactEmail',{type:'email',value:x.contactEmail||'',required:false,max:254});
    const label=h('label',{parent:f});
    const check=h('input',{attrs:{type:'checkbox',name:'jerseyLoan',value:'yes'},parent:label});
    check.checked=!!x.jerseyLoan;
    h('span',{text:' Jerseys are lent and must be returned',parent:label});
    h('button',{className:'cloud-btn primary',text:'Save team settings',
      attrs:{type:'submit'},parent:f});
    }else{
      info('An approved Team Manager now handles shared team settings. You can still view the current settings.',c);
      info('Training: '+(x.trainingVenue||'Not set')+' '+(x.trainingStart||'')+
        '–'+(x.trainingEnd||'')+' · Contact: '+(x.contactName||'Not set'),c);
    }
    const layout=card('Screen layout');
    info('A visual preference on this device. It does not modify team data or permissions.',layout);
    const a=actions(layout);
    for(const [value,label] of [['comfortable','Comfortable'],['compact','Compact']]){
      const b=button(label,()=>{
        document.body.classList.toggle('cloud-density-compact',value==='compact');
        try{localStorage.setItem('tm-cloud-density',value);}catch{}
        for(const el of a.querySelectorAll('button'))el.setAttribute('aria-pressed','false');
        b.setAttribute('aria-pressed','true');
      },a);
      b.setAttribute('aria-pressed',document.body.classList.contains('cloud-density-compact')===
        (value==='compact')?'true':'false');
    }
  }
  async function jerseys(ctx,loading,canAdmin){
    const [members,issued]=await Promise.all([
      query(ctx,'team.members'),query(ctx,'jerseys.read')]);
    loading.remove();
    const c=card('Jersey numbers and issue history');
    info('Jerseys are assigned to an existing active player for this team and season. Issuing a jersey does not verify sporting eligibility.',c);
    // Reuse the ORIGINAL Team Manager model for season and outstanding
    // inventory, rather than rebuilding counts in the connected interface.
    const projection={context:{...ctx,teamName:getTeamLabel(ctx)},members,
      jerseys:issued};
    const original=originalJerseyReportFromCloud(projection);
    const inventory=originalJerseyInventoryFromCloud(projection);
    const totals=card('Jersey inventory');
    if(!inventory.complete){
      info('Some jersey issues cannot be linked to a team person record. Inventory is incomplete; reconcile these records before relying on the totals.',totals);
      info(inventory.omissions.length+' outstanding record(s) need identity review.',totals);
    }else{
      info('Season '+ctx.season+': '+original.out+' issued and outstanding, '+
        original.returned+' returned. Total outstanding across seasons: '+
        inventory.outstanding+'; held by former team members: '+
        inventory.formerPlayers+'.',totals);
    }
    const active=members.filter(m=>m.status==='active');
    if(active.length&&canAdmin){
      const f=form(c,async d=>use(ctx,'jerseys.issue',{
        personId:text(d.get('personId')),jerseyNo:text(d.get('jerseyNo')).trim()
      },()=>open('Jerseys'),'Jersey issued.'));
      selectField(f,'Player','personId',active.map(m=>[m.personId,m.name||m.personId]));
      field(f,'Jersey number','jerseyNo',{max:3});
      h('button',{className:'cloud-btn primary',text:'Issue jersey',
        attrs:{type:'submit'},parent:f});
    }else if(!active.length)info('No active players yet. Add and approve a player in Team before issuing jerseys.',c);
    else info('Jersey allocation is currently handled by the approved Team Manager.',c);
    const history=card('Current and historical issues');
    if(!issued.length)info('No jerseys issued yet.',history);
    for(const item of issued){
      const row=h('div',{className:'cloud-list-item',parent:history});
      const member=members.find(m=>m.personId===item.personId);
      h('strong',{text:'#'+item.jerseyNo+' · '+(member?.name||item.personId),parent:row});
      info('Season '+item.season+' · '+(item.returnedAt?'Returned':'Issued'),row);
      if(!item.returnedAt&&canAdmin)button('Mark returned',()=>void use(ctx,'jerseys.return',{
        issueId:item.issueId,expectedVersion:item.version
      },()=>open('Jerseys'),'Jersey return recorded.'),actions(row));
    }
  }
  async function competitions(ctx,loading,canAdmin){
    const [competitions,fixtures]=await Promise.all([
      query(ctx,'competitions.read'),query(ctx,'competitions.fixtures')]);
    if(!ensure(ctx))return;
    const entries=originalTeamCompetitionsFromCloud({
      context:{...ctx,teamName:getTeamLabel(ctx)},competitions});
    loading.remove();
    const c=card('Create a league, tournament or carnival');
    info('Record this team’s entry and local fixtures. Official competition draws and eligibility must be confirmed by the competition authority.',c);
    if(canAdmin){
    const f=form(c,async d=>use(ctx,'competitions.create',{
      name:text(d.get('name')).trim(),format:text(d.get('format')),
      division:text(d.get('division')).trim(),organiser:text(d.get('organiser')).trim(),
      venue:text(d.get('venue')).trim(),beginsOn:text(d.get('beginsOn')),
      endsOn:text(d.get('endsOn')),status:'planned'
    },()=>open('Competitions'),'Competition saved for this team.'));
    field(f,'Competition name','name',{max:120});
    selectField(f,'Format','format',[
      ['league','League'],['tournament','Tournament'],['carnival','Carnival'],
      ['friendly-series','Friendly series']]);
    field(f,'Division or grade','division',{required:false,max:100});
    field(f,'Organiser','organiser',{required:false,max:120});
    field(f,'Venue','venue',{required:false,max:120});
    field(f,'Starts','beginsOn',{type:'date',required:false});
    field(f,'Ends','endsOn',{type:'date',required:false});
    h('button',{className:'cloud-btn primary',text:'Create competition',
      attrs:{type:'submit'},parent:f});
    }else info('A verified Team Manager is currently responsible for team competition entries.',c);
    const list=card('Team entries and competitions');
    info('The original Team Manager season-entry model confirms '+entries.length+
      ' entered or withdrawn competition record(s) for this team. Planned competitions do not imply an official team entry.',list);
    if(!competitions.length)info('No tournaments or leagues recorded for this team yet.',list);
    for(const entry of competitions){
      const row=h('section',{className:'cloud-list-item',parent:list});
      h('strong',{text:entry.name,parent:row});
      info(entry.format+' · '+entry.season+' · '+(entry.division||'No grade')+
        ' · '+entry.status,row);
      const localFixtures=fixtures.filter(item=>item.competitionId===entry.competitionId);
      if(!localFixtures.length)info('No team-recorded fixtures for this competition.',row);
      for(const item of localFixtures){
        const fixtureRow=h('div',{className:'cloud-list-item',parent:row});
        h('strong',{text:item.title||'Team fixture',parent:fixtureRow});
        info((item.startsAt?new Date(item.startsAt).toLocaleString('en-AU',
          {dateStyle:'medium',timeStyle:'short'}):'Time TBC')+
          (item.locationLabel?' · '+item.locationLabel:'')+
          ' · '+item.status,fixtureRow);
        info('Team-recorded fixture, not an official competition draw',fixtureRow);
      }
      if(canAdmin){
      const f=form(row,async d=>use(ctx,'competitions.update',{
        competitionId:entry.competitionId,name:entry.name,format:entry.format,
        division:entry.division||'',organiser:entry.organiser||'',
        venue:entry.venue||'',beginsOn:entry.beginsOn||'',
        endsOn:entry.endsOn||'',status:text(d.get('status')),
        expectedVersion:entry.version
      },()=>open('Competitions'),'Team competition entry updated.'));
      selectField(f,'Participation','status',[
        ['planned','Planning'],['entered','Entered'],
        ['withdrawn','Withdrawn'],['completed','Completed']
      ]).value=entry.status;
      h('button',{className:'cloud-btn',text:'Save entry status',
        attrs:{type:'submit'},parent:f});
      const fixture=form(row,async d=>{
        const date=new Date(text(d.get('startsAt')));
        if(!Number.isFinite(date.valueOf()))throw Error('invalid-request');
        await use(ctx,'competitions.fixture',{
          competitionId:entry.competitionId,opponent:text(d.get('opponent')).trim(),
          startsAt:date.toISOString()
        },()=>open('Competitions'),'Local team fixture added, not an official draw.');
      });
      field(fixture,'Opponent for team-recorded match','opponent',{max:120});
      field(fixture,'Starts','startsAt',{type:'datetime-local'});
      h('button',{className:'cloud-btn',text:'Add team-recorded fixture',
        attrs:{type:'submit'},parent:fixture});
      }
    }
  }
  // The established ten-template vocabulary is shared with the original app.
  // Only templates backed by verified connected event data are active here.
  const templates=Object.entries(TEAM_MESSAGE_TEMPLATES).filter(([key])=>
    ['reminder','availability','match','cancelled','blank'].includes(key));
  async function messages(ctx,loading,canAdmin){
    const [history,schedule]=await Promise.all([
      query(ctx,'messages.read'),getSchedule(ctx)]);
    if(!ensure(ctx))return;
    loading.remove();
    const c=card('New message');
    info('Prepare a WhatsApp message for your team group, or Share/Copy it. Team Manager cannot automatically send messages or confirm WhatsApp delivery.',c);
    if(canAdmin){
    const f=form(c,async d=>{
      const body=text(d.get('body')).trim();
      const audience=text(d.get('audience'));
      const postNotice=d.get('postNotice')==='yes';
      const noticeBody=body.replace(/[\r\n]+/g,' ').replace(/ {2,}/g,' ');
      if(postNotice&&noticeBody.length>1000){
        message('The noticeboard allows up to 1,000 characters. Shorten the message or untick noticeboard before preparing it.',true);
        return;
      }
      const saved=await query(ctx,'messages.prepare',{
        audience,channel:'whatsapp',body
      });
      if(!ensure(ctx))return;
      let noticeStatus='not requested';
      if(postNotice){
        try{
          const outcome=await publishMessageNotice(ctx,{
            title:TEAM_MESSAGE_TEMPLATES[selected.value]||'Team message',
            body:noticeBody,audience
          });
          noticeStatus=outcome.status;
        }catch{
          noticeStatus='unavailable';
        }
      }
      if(!ensure(ctx))return;
      message('Message prepared and logged. '+(noticeStatus==='published'?
        'A notice was published for the selected team. ':
        noticeStatus==='draft-only'?'The notice was saved as a draft but could not be published. ':
        noticeStatus==='unavailable'?'The notice was not confirmed; review Noticeboard. ':'')+
        'Open WhatsApp and confirm manually whether it was sent.',
        noticeStatus==='draft-only'||noticeStatus==='unavailable');
      const preview=card('Prepared message');
      h('p',{text:body,parent:preview});
      const a=actions(preview);
      button('Open in WhatsApp',()=>{
        window.open('https://wa.me/?text='+encodeURIComponent(body),'_blank','noopener');
      },a,{primary:true});
      button('Copy',()=>void navigator.clipboard.writeText(body)
        .then(()=>message('Copied.')).catch(()=>message('Copy unavailable.',true)),a);
      if(navigator.share)button('Share',()=>void navigator.share({text:body})
        .catch(()=>{}),a);
      button('Yes, sent',()=>void use(ctx,'messages.confirm',{
        messageId:saved.messageId,status:'sent',expectedVersion:0
      },()=>open('Messages'),'Message manually confirmed sent.'),a);
      button('Not sent',()=>void use(ctx,'messages.confirm',{
        messageId:saved.messageId,status:'not-sent',expectedVersion:0
      },()=>open('Messages'),'Message marked not sent.'),a);
    });
    const selected=selectField(f,'Message type','template',templates);
    selectField(f,'Audience','audience',[
      ['all','Whole team'],['players','Players'],['volunteers','Volunteers']]);
    const label=h('label',{text:'Message',parent:f});
    const area=h('textarea',{attrs:{name:'body',maxlength:1500,required:true,rows:6},parent:label});
    const teamName=getTeamLabel(ctx);
    const clock=new Date();
    const training=schedule.filter(s=>s.kind==='training'&&
      Number.isFinite(new Date(s.startsAt).getTime()))
      .sort((a,b)=>a.startsAt.localeCompare(b.startsAt));
    const next=nextCloudTraining(training,{now:clock});
    const current=next||training.find(s=>s.status==='cancelled')||null;
    const sessionSelect=selectField(f,'Training session','sessionId',
      training.map(s=>[s.sessionId,
        projectedCloudSession(s)?.dateLabel||'Unscheduled training']));
    const compose=()=>{
      const kind=selected.value;
      const session=training.find(s=>s.sessionId===sessionSelect.value)||current;
      const projected=projectedCloudSession(session);
      if(kind==='reminder')return trainingReminderText({
        teamName,session:projected,dateLabel:projected?.dateLabel||'',
        timeLabel:projected?.startLabel||'',venue:projected?.venue||'',
        focus:projected?.focus||'',notes:projected?.notes||''
      });
      if(kind==='cancelled')return trainingCancellationText({
        session:projected,dateLabel:projected?.dateLabel||'',
        timeLabel:projected?.startLabel||''
      });
      if(kind==='availability')return availabilityRequestText({
        teamName,events:cloudAvailabilityEvents(schedule,{now:clock})
      });
      if(kind==='match'){
        const match=schedule.filter(s=>s.kind==='match'&&s.status!=='cancelled'&&
          s.status!=='postponed'&&new Date(s.startsAt)>=clock)
          .sort((a,b)=>a.startsAt.localeCompare(b.startsAt))[0];
        const p=projectedCloudSession(match);
        return p?'🏉 *'+teamName+' vs '+(match.opponent||'TBC')+'*'+
          '\n📅 '+p.dateLabel+', '+p.startLabel+'\n📍 '+(p.venue||'Venue TBC')+
          '\n\nReply *YES*, *NO* or *MAYBE* if you haven’t yet.':
          '🏉 *Next match — '+teamName+'*\n\n(Add a match and it will fill in here.)';
      }
      return '';
    };
    const populate=()=>{
      const isTraining=['reminder','cancelled'].includes(selected.value);
      sessionSelect.parentElement.hidden=!isTraining||!training.length;
      area.value=compose();
    };
    if(next)sessionSelect.value=next.sessionId;
    selected.addEventListener('change',populate);
    sessionSelect.addEventListener('change',populate);
    populate();
    const labelNotice=h('label',{parent:f,className:'cloud-checkbox-row'});
    const check=h('input',{attrs:{name:'postNotice',type:'checkbox',value:'yes'},parent:labelNotice});
    check.checked=true;
    h('span',{text:"Also post it on the app's noticeboard",parent:labelNotice});
    info('Noticeboard text uses the same content without line breaks. WhatsApp is not sent automatically.',f);
    h('button',{className:'cloud-btn primary',text:'Prepare and log message',
      attrs:{type:'submit'},parent:f});
    }else info('The appointed Team Manager handles new team messages. You can review the logged messages.',c);
    const log=card('Message log');
    if(!history.length)info('No messages prepared yet.',log);
    for(const item of history){
      const row=h('div',{className:'cloud-list-item',parent:log});
      h('strong',{text:item.audience+' · '+item.status,parent:row});
      info(item.body,row);
      info('WhatsApp and sharing are manual. Only your confirmation changes the status.',row);
      if(item.status==='prepared'&&canAdmin){
        const a=actions(row);
        button('Open in WhatsApp',()=>window.open(
          'https://wa.me/?text='+encodeURIComponent(item.body),'_blank','noopener'),a);
        button('Mark sent',()=>void use(ctx,'messages.confirm',{
          messageId:item.messageId,status:'sent',expectedVersion:item.version
        },()=>open('Messages'),'Manually confirmed sent.'),a);
        button('Mark not sent',()=>void use(ctx,'messages.confirm',{
          messageId:item.messageId,status:'not-sent',expectedVersion:item.version
        },()=>open('Messages'),'Marked not sent.'),a);
      }
    }
  }
  async function teams(ctx,loading){
    const status=await query(ctx,'admin.status');
    loading.remove();
    const club=card(ctx.club);
    info('You are viewing the exact approved team '+ctx.season+
      '. Team permissions are independent of Platform and Club administration.',club);
    info('Your working roles: '+ctx.roles.join(' / '),club);
    button('Open team and squad',()=>onTeam(),actions(club),{primary:true});
    if(status.canAdmin)button('Edit team settings',()=>void open('Settings'),actions(club));
    else info('A Team Manager now handles ordinary team membership and settings.',club);
    info('Creating other clubs or appointing a Club Administrator requires separately approved organisation authority.',club);
  }
  async function people(ctx,loading){
    const members=await query(ctx,'team.members');loading.remove();
    const c=card('Verified team people and squad');
    info('Names appear only after verified account-person linking. This is not a club registrar or eligibility certificate.',c);
    if(!members.length)info('No active or pending players recorded for this team.',c);
    for(const p of members){
      const row=h('div',{className:'cloud-list-item',parent:c});
      h('strong',{text:p.name||p.personId,parent:row});
      info('Team status: '+p.status,row);
    }
  }
  async function duties(ctx,loading,canAdmin){
    const [items,members]=await Promise.all([
      query(ctx,'duties.board'),query(ctx,'team.members')]);
    loading.remove();
    const c=card('Volunteer tally and assignments');
    info('An assigned, verified adult Volunteer is not automatically a Trainer, first aider or Match Official.',c);
    const byPerson=new Map();
    for(const d of items){
      if(!byPerson.has(d.personId))byPerson.set(d.personId,0);
      if(d.status==='completed')byPerson.set(d.personId,byPerson.get(d.personId)+1);
    }
    if(!items.length)info('No volunteer assignments yet.',c);
    for(const d of items){
      const row=h('div',{className:'cloud-list-item',parent:c});
      const p=members.find(p=>p.personId===d.personId);
      h('strong',{text:p?.name||d.personId,parent:row});
      info(d.type+' · '+d.status+' · completed '+byPerson.get(d.personId),row);
      if(canAdmin&&['assigned','confirmed'].includes(d.status))
        button('Withdraw',()=>void use(ctx,'duties.withdraw',{
          dutyId:d.dutyId,expectedVersion:d.version
        },()=>open('Volunteer tally'),'Volunteer duty withdrawn.'),actions(row));
    }
    const volunteers=await query(ctx,'volunteers.list');
    const sessions=(await getSchedule(ctx)).filter(s=>s.status==='planned');
    if(canAdmin&&volunteers.length&&sessions.length){
      const f=form(c,async d=>use(ctx,'duties.assign',{
        sessionId:text(d.get('sessionId')),personId:text(d.get('personId')),
        type:text(d.get('type'))
      },()=>open('Volunteer tally'),'Verified volunteer duty assigned.'));
      selectField(f,'Session','sessionId',sessions.map(s=>[
        s.sessionId,(s.title||s.kind)+' · '+(s.startsAt||'Time TBC')]));
      selectField(f,'Verified volunteer','personId',
        volunteers.map(v=>[v.personId,v.name||v.personId]));
      selectField(f,'Non-accredited task','type',[
        ['general_help','General help'],['setup','Setup'],['equipment','Equipment'],
        ['scorer_support','Scorer support']]);
      h('button',{className:'cloud-btn primary',text:'Assign duty',
        attrs:{type:'submit'},parent:f});
    }else info('Add a training session and approve a verified adult Volunteer before assigning duties.',c);
  }
  return Object.freeze({open,permitted});
}
