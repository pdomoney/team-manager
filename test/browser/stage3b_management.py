# Stage 3B.1–3B.6, synthetic Coach/Manager/Player/Volunteer collaboration.
# Browser tests only the existing signed-in workspace, not a real backend.
import json
import os
import sys
from harness import build, serve, Check
from playwright.sync_api import sync_playwright

build()
server,url=serve()
checks=Check()
errors=[]
team='comets-3b'
actors={
 'coach':('11111111-1111-4111-8111-111111111111','team_coach'),
 'manager':('22222222-2222-4222-8222-222222222222','team_manager'),
 'player':('33333333-3333-4333-8333-333333333333','team_player'),
 'volunteer':('44444444-4444-4444-8444-444444444444','team_volunteer')
}
tokens={who:'synthetic-stage3b-'+who+'-bearer-token-123456' for who in actors}
engine=os.getenv('STAGE3B_BROWSER_ENGINE','chromium')

with sync_playwright() as p:
    browser=getattr(p,engine).launch()
    for width in (390,1280):
        state={'roster':[{'personId':'player-pending','status':'pending','version':0},
            {'personId':'player-1','status':'active','version':0}],
            'sessions':[{'sessionId':'training-3b','kind':'training',
                'title':'Team training','locationLabel':'Community oval',
                'startsAt':'2026-11-26T07:00:00Z','status':'planned','version':0,
                'myAvailability':None,'myAvailabilityVersion':0}],
            'duties':[{'dutyId':'duty-3b','sessionId':'training-3b',
                'personId':'volunteer-1','status':'assigned','version':0,
                'response':None,'type':'general_help'}],
            'attendance':None,'response':None,'responseSource':'none',
            'notices':[],'calls':[],'eventCount':0}
        def role(req):
            auth=req.headers.get('authorization','')
            return next((key for key,token in tokens.items() if token in auth),None)
        def reply(route,obj,status=200):
            route.fulfill(status=status,content_type='application/json',
                body=json.dumps(obj))
        def configure(context):
            def provider(route):
                req=route.request
                who=role(req)
                path=req.url.split('?')[0]
                if path.endswith('/auth/v1/user'):
                    return reply(route,{'id':actors[who][0],
                        'email':who+'@fictional.test'} if who else {},200 if who else 401)
                if path.endswith('/rest/v1/rpc/tm_my_team_context'):
                    return reply(route,[{'team_id':team,'team_role':actors[who][1],
                        'club_ref':'Fictional Comets','sport_ref':'oztag',
                        'season_ref':'2026'}] if who else [])
                if path.endswith('/rest/v1/rpc/tm_my_operator_context'):
                    return reply(route,{'isOwner':False})
                if path.endswith('/rest/v1/rpc/tm_my_profile'):
                    return reply(route,{'accountStatus':'active',
                        'displayName':'Fictional '+str(who),'version':1,
                        'linkStatus':'verified'})
                return reply(route,{},404)
            def invitation(route):
                action=route.request.post_data_json['action']
                return reply(route,{'ok':True,'code':'permitted','data':[]}
                    if action in ('list.mine','list.team') else
                    {'ok':False,'code':'scope-denied'})
            def stage1(route):
                request=route.request.post_data_json
                who=role(route.request)
                a=request['action']
                state['calls'].append((who,a,request['activeTeamId']))
                assert request['activeTeamId']==team
                if a=='schedule.read':
                    data=[dict(s,**({'myAvailability':state['response'],
                        'myAvailabilityVersion':1 if state['response'] else 0}
                        if who=='player' else {})) for s in state['sessions']]
                    return reply(route,{'ok':True,'code':'permitted','data':data})
                if a=='roster.read':
                    return reply(route,{'ok':True,'code':'permitted',
                        'data':state['roster']})
                if a=='duty.read':
                    return reply(route,{'ok':True,'code':'permitted',
                        'data':state['duties'] if who=='volunteer' else []})
                if a=='availability.reply' and who=='player':
                    state['response']=request['payload']['response']
                    state['responseSource']='self'
                elif a=='duty.reply' and who=='volunteer':
                    state['duties'][0]['response']=request['payload']['response']
                    state['duties'][0]['status']='confirmed'
                    state['duties'][0]['version']+=1
                elif a=='duty.assign' and who=='manager':
                    pass
                elif a=='schedule.edit' and who in ('coach','manager'):
                    pass
                else:
                    return reply(route,{'ok':False,'code':'role-denied'},403)
                return reply(route,{'ok':True,'code':'committed',
                    'resourceId':request['resourceId'],'version':1})
            def management(route):
                req=route.request.post_data_json
                who=role(route.request)
                action=req['action']
                state['calls'].append((who,action,req['activeTeamId']))
                if req['activeTeamId']!=team:
                    return reply(route,{'ok':False,'code':'scope-denied'},403)
                command=req['payload'].get('command',{})
                res=req['resourceId']
                if action=='notices.read':
                    notes=[n for n in state['notices'] if
                        who in ('coach','manager') or
                        (n['status']=='published' and (
                          n['audience']=='all' or
                          (n['audience']=='players' and who=='player') or
                          (n['audience']=='volunteers' and who=='volunteer')))]
                    return reply(route,{'ok':True,'code':'permitted','data':notes})
                if action=='roster.approve' and who in ('coach','manager'):
                    for x in state['roster']:
                        if x['personId']==res and x['status']=='pending':
                            x.update({'status':'active','version':x['version']+1})
                            return reply(route,{'ok':True,'code':'committed',
                                'resourceId':res,'version':x['version']})
                if action=='event.create' and who in ('coach','manager'):
                    state['eventCount']+=1
                    event='event-'+str(state['eventCount'])
                    state['sessions'].append({'sessionId':event,
                        'kind':'match' if command['kind']=='friendly' else 'other',
                        'title':command['title'],'startsAt':command['startsAt'],
                        'locationLabel':command['locationLabel'],
                        'status':'planned','version':0})
                    return reply(route,{'ok':True,'code':'committed',
                        'resourceId':event,'version':0})
                if action=='event.change' and who in ('coach','manager'):
                    current=next((x for x in state['sessions'] if x['sessionId']==res),None)
                    if not current or not res.startswith('event-'):
                        return reply(route,{'ok':False,'code':'stale-or-external-event'},409)
                    current.update({'status':'cancelled',
                        'version':current['version']+1})
                    return reply(route,{'ok':True,'code':'committed',
                        'resourceId':res,'version':current['version']})
                if action in ('attendance.read','availability.board') and who in ('coach','manager'):
                    if action=='attendance.read':
                        item={'personId':'player-1',
                            'status':state['attendance'],'version':1 if state['attendance'] else 0}
                    else:
                        item={'personId':'player-1','response':state['response'],
                            'source':state['responseSource'],
                            'version':1 if state['response'] else 0}
                    return reply(route,{'ok':True,'code':'permitted','data':[item]})
                if action=='attendance.record' and who in ('coach','manager'):
                    state['attendance']=command['status']
                    return reply(route,{'ok':True,'code':'committed',
                        'resourceId':res,'version':1})
                if action=='availability.transcribe' and who=='manager':
                    state['response']=command['response']
                    state['responseSource']=command['source']
                    return reply(route,{'ok':True,'code':'committed',
                        'resourceId':res,'version':1})
                if action=='duty.board' and who=='manager':
                    return reply(route,{'ok':True,'code':'permitted','data':state['duties']})
                if action=='duty.label' and who=='manager':
                    state['duties'][0]['type']=command['type']
                    state['duties'][0]['version']+=1
                    return reply(route,{'ok':True,'code':'committed',
                        'resourceId':res,'version':state['duties'][0]['version']})
                if action=='duty.withdraw' and who=='manager':
                    state['duties'][0]['status']='revoked'
                    state['duties'][0]['version']+=1
                    return reply(route,{'ok':True,'code':'committed',
                        'resourceId':res,'version':state['duties'][0]['version']})
                if action=='notice.create' and who in ('coach','manager'):
                    item={'noticeId':'notice-'+str(len(state['notices'])+1),
                        'title':command['title'],'body':command['body'],
                        'audience':command['audience'],'status':'draft',
                        'version':0,'createdAt':'2026-11-19T00:00:00Z'}
                    state['notices'].append(item)
                    return reply(route,{'ok':True,'code':'committed',
                        'resourceId':item['noticeId'],'version':0})
                if action in ('notice.publish','notice.archive') and who in ('coach','manager'):
                    item=next(n for n in state['notices'] if n['noticeId']==res)
                    item['status']='published' if action=='notice.publish' else 'archived'
                    item['version']+=1
                    return reply(route,{'ok':True,'code':'committed',
                        'resourceId':res,'version':item['version']})
                if action=='report.summary' and who in ('coach','manager'):
                    return reply(route,{'ok':True,'code':'permitted','data':[{
                        'sessionId':'training-3b','kind':'training',
                        'title':'Team training','startsAt':'2026-11-26T07:00:00Z',
                        'activeRoster':None,'availabilityYes':None,
                        'attendancePresent':None,'volunteerAccepted':0}]})
                return reply(route,{'ok':False,'code':'role-denied'},403)
            context.route('https://uyjxvaobshaahzipzzds.supabase.co/**',provider)
            context.route('**/api/stage1/v1/operation',stage1)
            context.route('**/api/stage3b/v1/operation',management)
            context.route('**/api/stage3/v1/onboarding',invitation)
            context.route('**/fonts.googleapis.com/**',lambda route:route.abort())
            context.route('**/fonts.gstatic.com/**',lambda route:route.abort())

        def open_person(who):
            ctx=browser.new_context(viewport={'width':width,'height':850})
            configure(ctx)
            ctx.add_init_script("""(() => {
              sessionStorage.setItem('tm-cloud-identity-preview-v1',
                JSON.stringify({access_token:'MYTOKEN',
                  refresh_token:'synthetic-stage3b-refresh',
                  expires_at:Math.floor(Date.now()/1000)+3600}));
            })();""".replace('MYTOKEN',tokens[who]))
            page=ctx.new_page()
            page.on('pageerror',lambda exc:errors.append('pageerror: '+str(exc)))
            page.on('dialog',lambda dialog:dialog.accept())
            page.goto(url+'cloud-team.html')
            page.get_by_role('button',name='Home',exact=True).wait_for()
            return ctx,page

        coach_ctx,coach=open_person('coach')
        coach.get_by_role('button',name='Team',exact=True).click()
        coach.get_by_role('button',name='Approve team placement').wait_for()
        coach.get_by_role('button',name='Approve team placement').click()
        coach.get_by_text('Team placement approved.',exact=False).wait_for()
        checks.ok(state['roster'][0]['status']=='active',
            f'[{width}] Coach approves team placement, not competition eligibility')
        coach.get_by_role('button',name='Schedule',exact=True).click()
        coach.get_by_role('heading',name='Add team event or friendly').wait_for()
        coach.get_by_label('Event type').select_option('friendly')
        coach.get_by_label('Event title').fill('Fictional friendly')
        coach.get_by_label('Start',exact=True).fill('2026-11-27T18:30')
        coach.get_by_label('Location').last.fill('Community field')
        coach.get_by_role('button',name='Add team event').click()
        coach.get_by_text('Team-managed event created.',exact=False).wait_for()
        checks.ok(any(s['kind']=='match' and s['title']=='Fictional friendly'
           for s in state['sessions']),
           f'[{width}] Coach creates unofficial team friendly without changing fixtures')
        coach.get_by_role('button',name='Attendance and responses').click()
        coach.get_by_role('heading',name='Training roll call').wait_for()
        coach.get_by_label('Attendance').select_option('present')
        coach.get_by_role('button',name='Save attendance').click()
        coach.get_by_text('Attendance recorded.',exact=False).wait_for()
        checks.ok(state['attendance']=='present',
            f'[{width}] Coach records roll-call for an existing active Player')
        coach_ctx.close()

        manager_ctx,manager=open_person('manager')
        manager.get_by_role('button',name='Schedule',exact=True).click()
        manager.get_by_role('button',name='Attendance and responses').click()
        manager.get_by_label('Reported reply').select_option('no')
        manager.get_by_label('Received by').select_option('phone')
        manager.get_by_role('button',name='Record reported reply').click()
        manager.get_by_text('External availability response recorded',exact=False).wait_for()
        checks.ok(state['response']=='no' and state['responseSource']=='phone',
            f'[{width}] Manager records external response with exact provenance')
        manager.get_by_role('button',name='Team',exact=True).click()
        manager.get_by_role('heading',name='Team volunteer duty board').wait_for()
        manager.get_by_label('Non-accredited duty type').select_option('setup')
        manager.get_by_role('button',name='Update duty type').click()
        manager.get_by_text('Duty category updated.',exact=False).wait_for()
        checks.ok(state['duties'][0]['type']=='setup',
            f'[{width}] Manager manages volunteer assignment without accreditation')
        manager.get_by_role('button',name='More',exact=True).click()
        manager.get_by_role('heading',name='Team notices').wait_for()
        manager.get_by_label('Notice title').fill('Check Friday training')
        manager.get_by_label('Notice message').fill('<script>harmless-as-text</script>')
        manager.get_by_label('Audience').select_option('players')
        manager.get_by_role('button',name='Save notice draft').click()
        manager.get_by_text('Notice saved as a draft.',exact=False).wait_for()
        checks.ok(state['notices'][0]['status']=='draft',
            f'[{width}] Manager saves an unpublished scoped team notice')
        manager.get_by_role('button',name='Publish notice').wait_for()
        manager.get_by_role('button',name='Publish notice').click()
        manager.get_by_text('Notice published to its approved audience.',exact=False).wait_for()
        manager.get_by_role('button',name='Open team reports').click()
        manager.get_by_role('heading',name='Session summaries').wait_for()
        checks.ok('Under 5' in manager.locator('main').inner_text(),
            f'[{width}] private aggregate report suppresses small cohort counts')
        checks.ok(manager.get_by_role('button',name='Attendance detail').count()==1,
            f'[{width}] attendance accessible from Reports as requested')
        manager_ctx.close()

        player_ctx,player=open_person('player')
        player.get_by_role('heading',name='Latest team notices').wait_for()
        player.get_by_text('Check Friday training').wait_for()
        checks.ok(player.locator('main script').count()==0,
            f'[{width}] submitted notice HTML is inert text')
        player.get_by_role('button',name='Schedule',exact=True).click()
        player.get_by_role('button',name='Yes',exact=True).first.click()
        player.get_by_text('Your response was saved.',exact=False).wait_for()
        checks.ok(state['response']=='yes' and state['responseSource']=='self',
            f'[{width}] authenticated Player self-response supersedes Manager source')
        player.get_by_role('button',name='More',exact=True).click()
        checks.ok(player.get_by_role('button',name='Open team reports').count()==0,
            f'[{width}] Player cannot view private management reports')
        checks.ok(player.get_by_role('button',name='Publish notice').count()==0,
            f'[{width}] Player cannot publish notices')
        player_ctx.close()

        volunteer_ctx,volunteer=open_person('volunteer')
        volunteer.get_by_role('heading',name='Latest team notices').wait_for()
        checks.ok(volunteer.get_by_text('Check Friday training').count()==0,
            f'[{width}] Volunteer excluded from Player-only notice audience')
        volunteer.get_by_role('button',name='Team',exact=True).click()
        volunteer.get_by_role('button',name='Accept',exact=True).click()
        volunteer.get_by_text('Your response was saved.',exact=False).wait_for()
        checks.ok(state['duties'][0]['status']=='confirmed',
            f'[{width}] Volunteer can accept only their own duty')
        volunteer_ctx.close()

        checks.ok(all(x[2]==team for x in state['calls']),
            f'[{width}] no management operation escapes exact selected team')
    browser.close()
server.shutdown()
sys.exit(0 if checks.done(errors) else 1)
