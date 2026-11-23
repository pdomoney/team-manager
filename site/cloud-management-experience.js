// Stage 3D.5 connected management surfaces. Uses the established Team Manager
// menu vocabulary and exact-team server records, never the fictional demo vault.
// The Host owns navigation state; each async screen discards stale team results.
export function createCloudManagementExperience({
  api,getContext,ui,onBack,onReport,onNotices,onTeam
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
      if(section==='Settings')await settings(ctx,loading);
      if(section==='Jerseys')await jerseys(ctx,loading);
      if(section==='Competitions')await competitions(ctx,loading);
      if(section==='Messages')await messages(ctx,loading);
      if(section==='Volunteer tally')await duties(ctx,loading);
      if(section==='People')await people(ctx,loading);
    }catch(e){
      if(ensure(ctx)){loading.textContent=explain(e);report(e);}
    }
  }
  async function settings(ctx,loading){
    const x=await query(ctx,'settings.read');
    loading.remove();
    const c=card('Team settings');
    info('These are shared settings for '+ctx.club+' · '+ctx.season+'. Your personal screen preferences stay on this device.',c);
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
  async function jerseys(ctx,loading){
    const [members,issued]=await Promise.all([
      query(ctx,'team.members'),query(ctx,'jerseys.read')]);
    loading.remove();
    const c=card('Jersey numbers and issue history');
    info('Jerseys are assigned to an existing active player for this team and season. Issuing a jersey does not verify sporting eligibility.',c);
    const active=members.filter(m=>m.status==='active');
    if(active.length){
      const f=form(c,async d=>use(ctx,'jerseys.issue',{
        personId:text(d.get('personId')),jerseyNo:text(d.get('jerseyNo')).trim()
      },()=>open('Jerseys'),'Jersey issued.'));
      selectField(f,'Player','personId',active.map(m=>[m.personId,m.name||m.personId]));
      field(f,'Jersey number','jerseyNo',{max:3});
      h('button',{className:'cloud-btn primary',text:'Issue jersey',
        attrs:{type:'submit'},parent:f});
    }else info('No active players yet. Add and approve a player in Team before issuing jerseys.',c);
    const history=card('Current and historical issues');
    if(!issued.length)info('No jerseys issued yet.',history);
    for(const item of issued){
      const row=h('div',{className:'cloud-list-item',parent:history});
      const member=members.find(m=>m.personId===item.personId);
      h('strong',{text:'#'+item.jerseyNo+' · '+(member?.name||item.personId),parent:row});
      info('Season '+item.season+' · '+(item.returnedAt?'Returned':'Issued'),row);
      if(!item.returnedAt)button('Mark returned',()=>void use(ctx,'jerseys.return',{
        issueId:item.issueId,expectedVersion:item.version
      },()=>open('Jerseys'),'Jersey return recorded.'),actions(row));
    }
  }
  async function competitions(ctx,loading){
    const competitions=await query(ctx,'competitions.read');
    loading.remove();
    const c=card('Create a league, tournament or carnival');
    info('Record this team’s entry and local fixtures. Official competition draws and eligibility must be confirmed by the competition authority.',c);
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
    const list=card('Team entries and competitions');
    if(!competitions.length)info('No tournaments or leagues recorded for this team yet.',list);
    for(const entry of competitions){
      const row=h('section',{className:'cloud-list-item',parent:list});
      h('strong',{text:entry.name,parent:row});
      info(entry.format+' · '+entry.season+' · '+(entry.division||'No grade')+
        ' · '+entry.status,row);
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
  const templates=[
    ['reminder','Training reminder'],['availability','Availability check'],
    ['match','Next match'],['results','Results'],['cancel','Training cancelled'],
    ['custom','Write your own']
  ];
  async function messages(ctx,loading){
    const history=await query(ctx,'messages.read');
    loading.remove();
    const c=card('New message');
    info('Prepare a WhatsApp message for your team group, or Share/Copy it. Team Manager cannot automatically send messages or confirm WhatsApp delivery.',c);
    const f=form(c,async d=>{
      const body=text(d.get('body')).trim();
      const saved=await query(ctx,'messages.prepare',{
        audience:text(d.get('audience')),channel:'whatsapp',body
      });
      if(!ensure(ctx))return;
      message('Message prepared and logged. Open WhatsApp, then confirm whether it was sent.');
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
    const audience=selectField(f,'Audience','audience',[
      ['all','Whole team'],['players','Players'],['volunteers','Volunteers']]);
    const label=h('label',{text:'Message',parent:f});
    const area=h('textarea',{attrs:{name:'body',maxlength:1500,required:true,rows:6},parent:label});
    const populate=()=>{
      const team=ctx.club+' '+ctx.season;
      const choices={
        reminder:'Training reminder · '+team+'\nPlease check your next training session and reply with your availability.',
        availability:'Availability check · '+team+'\nPlease reply YES, NO or MAYBE for the next scheduled activity.',
        match:'Next match · '+team+'\nPlease confirm availability for our next match.',
        results:'Match results · '+team+'\nPlease see the team noticeboard for updates.',
        cancel:'Training cancelled · '+team+'\nPlease check the team schedule for the latest update.',
        custom:''
      };
      if(!area.value.trim()||selected.value!=='custom')area.value=choices[selected.value]||'';
    };
    selected.addEventListener('change',populate);populate();
    h('button',{className:'cloud-btn primary',text:'Prepare and log message',
      attrs:{type:'submit'},parent:f});
    const log=card('Message log');
    if(!history.length)info('No messages prepared yet.',log);
    for(const item of history){
      const row=h('div',{className:'cloud-list-item',parent:log});
      h('strong',{text:item.audience+' · '+item.status,parent:row});
      info(item.body,row);
      info('WhatsApp and sharing are manual. Only your confirmation changes the status.',row);
      if(item.status==='prepared'){
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
  async function duties(ctx,loading){
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
      if(['assigned','confirmed'].includes(d.status))
        button('Withdraw',()=>void use(ctx,'duties.withdraw',{
          dutyId:d.dutyId,expectedVersion:d.version
        },()=>open('Volunteer tally'),'Volunteer duty withdrawn.'),actions(row));
    }
    const sessions=await query(ctx,'duties.board');
    info('To create a new assignment, first add a training session and verify an adult volunteer for the team.',c);
  }
  return Object.freeze({open,permitted});
}
