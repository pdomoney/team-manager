# Stage 2 browser: fictional independently signed-in Owner/Coach and Player.
# Cloud providers and Worker API are mocked at network boundaries. No live
# Supabase keys, user data, migrations, physical iPhone or deployment.
import json
import os
import sys
from harness import build, serve, Check
from playwright.sync_api import sync_playwright

build()
server, url = serve()
checks = Check()
errors = []
TEAM = 'comets-qa-u16'
ACCOUNT = '11111111-1111-4111-8111-111111111111'
OWNER_TOKEN = 'owner-fictitious-session-token-long'
PLAYER_TOKEN = 'player-fictitious-session-token-long'
VOL_TOKEN = 'volunteer-fictitious-session-token-long'
sessions = [{
    'sessionId':'training-original','kind':'training','title':'Fictional drills',
    'startsAt':'2026-11-23T07:00:00Z','locationLabel':'Field A',
    'status':'planned','version':0,'myAvailability':None,'myAvailabilityVersion':None
}]
plays = [{
    'playId':'play-step-out','revisionId':'rev-001','version':0,
    'revisionStatus':'draft','publishedRevisionId':None,
    'play':{'id':'synthetic-step-out','name':'Step Out','sport':'Oztag','players':{'LM':[24.6,49.6],'RM':[25,46]},
        'moves':[{'t':'pass','pts':[[24.6,49.6],[25,46]]}],
        'phases':[{'title':'The second phase','players':{'LM':[28,42]},'moves':[]}],
        'steps':'Pass to the support runner',
        'eventTimeline':{'version':1,'actors':[],'events':[]}}
}]
published = []
availability = None
duties = [{
    'dutyId':'duty-1','sessionId':'training-original','status':'assigned',
    'response':None,'version':0
}]
operations = []
reject_next_play_save = False
assignment_mock = None
templates = []
def signed_role(headers):
    auth = headers.get('authorization', '')
    if OWNER_TOKEN in auth:return 'owner'
    if PLAYER_TOKEN in auth:return 'player'
    if VOL_TOKEN in auth:return 'volunteer'
    return None

def bind(ctx):
    def auth_endpoint(route):
        role=signed_role(route.request.headers)
        identities={
            'owner':(ACCOUNT,'coach@fictional.test'),
            'player':('33333333-3333-4333-8333-333333333333','player@fictional.test'),
            'volunteer':('44444444-4444-4444-8444-444444444444',
                         'volunteer@fictional.test')
        }
        data={'id':identities[role][0],'email':identities[role][1]} if role else {}
        route.fulfill(status=200 if role else 401,
            content_type='application/json',body=json.dumps(data))
    def contexts_endpoint(route):
        role=signed_role(route.request.headers)
        rows = {'owner':['team_coach'], 'player':['team_player'],
            'volunteer':['team_volunteer']}.get(role, [])
        data=[{'team_id':TEAM,'club_ref':'Fictional Comets','sport_ref':'oztag',
            'season_ref':'2026','team_role':r} for r in rows]
        route.fulfill(status=200,content_type='application/json',body=json.dumps(data))
    def operator_endpoint(route):
        role=signed_role(route.request.headers)
        route.fulfill(status=200,content_type='application/json',
            body=json.dumps({'isOwner':role=='owner'}))
    def operations_endpoint(route):
        global availability, reject_next_play_save
        payload=route.request.post_data_json
        role=signed_role(route.request.headers)
        action=payload.get('action')
        op_role=payload.get('activeRole')
        team=payload.get('activeTeamId')
        operations.append((role,op_role,team,action))
        if team!=TEAM or role is None or (role=='player' and op_role!='team_player') or \
            (role=='volunteer' and op_role!='team_volunteer') or \
            (role=='owner' and op_role!='team_coach'):
            reply={'ok':False,'code':'scope-denied'}
            code=403
        elif action=='schedule.read':
            data=[dict(s, myAvailability=availability,
                myAvailabilityVersion=0 if availability is not None else None)
                for s in sessions]
            reply={'ok':True,'code':'permitted','data':data};code=200
        elif action=='schedule.edit' and role=='owner':
            title=payload['payload']['command']['title']
            sessions.append({'sessionId':'training-created','kind':'training',
                'title':title,'startsAt':'2026-11-25T07:00:00Z',
                'locationLabel':'Field B','status':'planned','version':0,
                'myAvailability':None,'myAvailabilityVersion':None})
            reply={'ok':True,'code':'committed','resourceId':'training-created',
                'version':0};code=200
        elif action=='availability.reply' and role=='player':
            availability=payload['payload']['response']
            reply={'ok':True,'code':'committed','resourceId':'training-original',
                'version':0};code=200
        elif action=='roster.read' and role=='owner':
            reply={'ok':True,'code':'permitted','data':[]};code=200
        elif action=='duty.read' and role=='volunteer':
            reply={'ok':True,'code':'permitted','data':duties};code=200
        elif action=='duty.reply' and role=='volunteer':
            d=duties[0];d['response']=payload['payload']['response'];d['version']+=1
            d['status']='confirmed'
            reply={'ok':True,'code':'committed','resourceId':d['dutyId'],
                'version':d['version']};code=200
        elif action=='play.published.read':
            reply={'ok':True,'code':'permitted','data':published};code=200
        elif action=='play.draft.read' and role=='owner':
            reply={'ok':True,'code':'permitted','data':plays};code=200
        elif action=='play.draft.edit' and role=='owner':
            if reject_next_play_save:
                reject_next_play_save=False
                reply={'ok':False,'code':'stale-play'};code=409
            else:
                cmd=payload['payload']['command']
                data=plays[0]
                if cmd['op']=='create' and payload['resourceId']==TEAM and payload['payload']['expectedVersion']==0:
                    created={'playId':'imported-qa','revisionId':'rev-imported','version':0,'revisionStatus':'draft','publishedRevisionId':None,'play':cmd['play']}
                    plays.append(created)
                    reply={'ok':True,'code':'committed','resourceId':created['playId'],'version':0,'revisionId':created['revisionId']};code=200
                elif cmd['op']!='save' or payload['resourceId']!=data['playId'] or payload['payload']['expectedVersion']!=data['version']:
                    reply={'ok':False,'code':'stale-play'};code=409
                else:
                    data['play']=cmd['play'];data['version']+=1;data['revisionId']='rev-edited'
                    reply={'ok':True,'code':'committed','resourceId':data['playId'],'version':data['version'],'revisionId':data['revisionId']};code=200
        elif action=='play.publish' and role=='owner':
            data=plays[0]
            published[:]=[dict(data)]
            data['revisionStatus']='published'
            data['publishedRevisionId']=data['revisionId']
            data['version']+=1
            reply={'ok':True,'code':'committed','resourceId':data['playId'],
                'version':data['version'],'revisionId':data['revisionId']}
            code=200
        else:
            reply={'ok':False,'code':'role-denied'};code=403
        route.fulfill(status=code,content_type='application/json',
            body=json.dumps(reply))
    def assignments_endpoint(route):
        payload=route.request.post_data_json
        permitted=(signed_role(route.request.headers)=='player' and payload.get('role')=='team_player'
          and payload.get('teamId')==TEAM and payload.get('action')=='play.assignment.read'
          and payload.get('input')=={'sessionId':'training-original'})
        if permitted:
            reply={'ok':True,'code':'permitted','data':{'sessionVersion':0,'sessionStatus':'planned',
                'rows':[assignment_mock] if assignment_mock else []}}
        else:
            reply={'ok':False,'code':'scope-denied'}
        route.fulfill(status=200 if permitted else 403,content_type='application/json',body=json.dumps(reply))
    def owner_endpoint(route):
        payload=route.request.post_data_json
        action=payload.get('action')
        role=signed_role(route.request.headers)
        reply={'ok':False,'code':'scope-denied'};code=403
        if role=='owner':
            if action=='status':
                reply={'ok':True,'code':'ready','team':{'clubRef':'Fictional Comets','teamId':TEAM,'seasonRef':'2026','sportRef':'oztag'},'coachAssigned':True,'policyReady':True,'invitations':[]};code=200
            elif action=='template.list':
                reply={'ok':True,'code':'ready','templates':[dict(templateId=t['templateId'],version=t['version'],state=t['state'],origin='owner-authored',name=t['play']['name'],sport=t['play'].get('sport')) for t in templates]};code=200
            elif action=='template.create' and payload.get('ownerAuthored') is True and set(payload)=={'action','templateId','ownerAuthored','play'}:
                templates.append(dict(templateId=payload['templateId'],version=1,state='active',play=payload['play']))
                reply={'ok':True,'code':'ready'};code=200
            elif action=='template.archive':
                item=next((t for t in templates if t['templateId']==payload.get('templateId') and t['version']==payload.get('expectedVersion') and t['state']=='active'),None)
                if item:
                    item['state']='archived';item['version']+=1
                    reply={'ok':True,'code':'ready'};code=200
        route.fulfill(status=code,content_type='application/json',body=json.dumps(reply))
    ctx.route('**/api/stage3d4/v1/owner',owner_endpoint)
    ctx.route('**/api/stage3d5/v1/team',assignments_endpoint)
    ctx.route('**/auth/v1/user',auth_endpoint)
    ctx.route('**/rest/v1/rpc/tm_my_team_context',contexts_endpoint)
    ctx.route('**/rest/v1/rpc/tm_my_operator_context',operator_endpoint)
    ctx.route('**/api/stage1/v1/operation',operations_endpoint)
    ctx.route('**/api/stage2/v1/play',operations_endpoint)
    ctx.route('**/fonts.googleapis.com/**',lambda route:route.abort())
    ctx.route('**/fonts.gstatic.com/**',lambda route:route.abort())

def new_page(browser,token,width=390,stage4=False):
    ctx=browser.new_context(viewport={'width':width,'height':820})
    bind(ctx)
    if stage4:
        # Synthetic test only: enable the feature in this browser context;
        # the default build and all production flags remain unchanged.
        def stage4_config(route):
            response=route.fetch()
            body=response.text()
            assert body.count('CLOUD_STAGE4_TACTICS_ENABLED=false')==1
            route.fulfill(response=response,body=body.replace('CLOUD_STAGE4_TACTICS_ENABLED=false','CLOUD_STAGE4_TACTICS_ENABLED=true'))
        ctx.route('**/cloud-public-config.js*',stage4_config)
    ctx.add_init_script("""(() => {
      const token = TOKEN_LITERAL;
      sessionStorage.setItem('tm-cloud-identity-preview-v1',
        JSON.stringify({access_token:token,refresh_token:'synthetic-refresh-token-long',
          expires_at:Math.floor(Date.now()/1000)+3600}));
    })();""".replace('TOKEN_LITERAL',json.dumps(token)))
    page=ctx.new_page()
    page.on('pageerror',lambda e:errors.append('pageerror: '+str(e)))
    page.on('dialog',lambda dialog:dialog.accept())
    page.goto(url+'cloud-team.html')
    page.wait_for_selector('#context-controls:not([hidden])',timeout=15000)
    return ctx,page

engine=os.getenv('STAGE2_BROWSER_ENGINE','chromium')
with sync_playwright() as p:
    browser=getattr(p,engine).launch()
    coach_ctx,coach=new_page(browser,OWNER_TOKEN)
    checks.ok(coach.locator('#club-chips button').count()==2,
        'one signed-in account has Platform and one authorised club chip')
    checks.ok('Fictional drills' not in coach.locator('main').inner_text(),
        'Platform Owner starts with no private team records')
    coach.get_by_role('button',name='Fictional Comets',exact=True).click()
    coach.locator('#team-chips button').first.click()
    coach.get_by_role('button',name='Manage training').click()
    coach.get_by_role('heading',name='Sessions').wait_for()
    checks.ok('Fictional drills' in coach.locator('main').inner_text(),
        'Coach sees only team training')
    coach.locator('input[name=title]').fill('New coach practice')
    coach.locator('input[name=startsAt]').fill('2026-11-25T18:00')
    coach.locator('input[name=locationLabel]').fill('Field B')
    coach.get_by_role('button',name='Create training').click()
    coach.get_by_text('New coach practice').wait_for()
    checks.ok(any(s['title']=='New coach practice' for s in sessions),
        'Coach persisted training through trusted operation')
    coach.get_by_role('button',name='Tactics').click()
    coach.get_by_role('heading',name='Coach play drafts').wait_for()
    checks.ok('Step Out' in coach.locator('main').inner_text(),
        'Coach draft visible to authorised coaching role')
    # Exercise the original E5 editor, not the simplified text editor.
    coach.get_by_role('button',name='Edit play',exact=True).click()
    editor=coach.frame_locator('iframe[title="Play Editor"]')
    editor.get_by_role('button',name='Advanced diagram').wait_for(timeout=15000)
    checks.ok(editor.locator('#ped-field svg.editor').count()==1,
        'Native E5 diagram workspace mounted in the authenticated team shell')
    checks.ok(coach.locator('dialog.cloud-e5-dialog').evaluate('(d)=>d.matches(":modal")'),
        'Editor is a modal full-screen workspace, not a clipped nested card')
    editor.get_by_role('button',name='Duplicate previous phase',exact=True).click()
    phase_track=editor.locator('#ped-phases')
    checks.ok(phase_track.get_by_role('button',name='Phase 3',exact=True).get_attribute('aria-pressed')=='true',
        'Coach duplicates the last phase and opens the new independent phase')
    editor.get_by_role('button',name='Undo',exact=True).click()
    checks.ok(phase_track.get_by_role('button',name='Phase 3',exact=True).count()==0,
        'Undo removes only the duplicated phase')
    editor.get_by_role('button',name='Redo phase duplication',exact=True).click()
    checks.ok(phase_track.get_by_role('button',name='Phase 3',exact=True).get_attribute('aria-pressed')=='true',
        'Redo restores the duplicated phase')
    editor.get_by_role('button',name='Undo',exact=True).click()
    checks.ok(phase_track.get_by_role('button',name='Phase 3',exact=True).count()==0,
        'Undo restores the prior authored phase count before the original save journey')
    editor.get_by_role('button',name='Play details',exact=True).click()
    editor.locator('[name=steps]').fill('Pass to the support runner\nThen move into space')
    save=editor.get_by_role('button',name='Save play',exact=True)
    box=save.bounding_box()
    checks.ok(box is not None and box['y']>=0 and box['y']+box['height']<=coach.viewport_size['height']+1,
        'Save footer is fully inside the actual phone viewport')
    reject_next_play_save=True
    save.click()
    editor.locator('#toast').get_by_text('This record changed on another device.',exact=False).wait_for(timeout=15000)
    checks.ok(plays[0]['play']['steps']=='Pass to the support runner',
        'Rejected stale cloud save preserves the original record and open editor')
    checks.ok(editor.locator('[name=steps]').input_value().endswith('Then move into space'),
        'Failed cloud save preserves unsaved coaching edits')
    editor.get_by_role('button',name='Save play',exact=True).click()
    coach.get_by_role('heading',name='Coach play drafts').wait_for(timeout=15000)
    checks.ok(coach.locator('dialog.cloud-e5-dialog').count()==0 and coach.locator('body').evaluate('(b)=>b.style.overflow')=='',
        'Successful save dismisses workspace and restores parent scrolling')
    checks.ok(plays[0]['play']['steps'].endswith('Then move into space') and
        plays[0]['play']['moves'][0]['pts']==[[24.6,49.6],[25,46]] and
        plays[0]['play']['eventTimeline']=={'version':1,'actors':[],'events':[]},
        'Original E5 editor saved a versioned cloud draft with geometry and timing intact')
    coach.get_by_role('button',name='Publish reviewed revision').click()
    coach.get_by_text('Published revision').wait_for()
    checks.ok(len(published)==1,
        'Head Coach published a reviewed revision with source untouched')
    coach.locator('#club-chips').get_by_role('button',name='Platform').click()
    checks.ok('Fictional drills' not in coach.locator('main').inner_text(),
        'Selecting Platform clears Coach records and privileges')
    coach_ctx.close()

    player_ctx,player=new_page(browser,PLAYER_TOKEN)
    checks.ok(player.locator('#club-chips button').count()==1 and
        player.locator('#team-chips button').count()==1,
        'Player is automatically placed in their sole approved team')
    player.get_by_role('button',name='Reply to training').click()
    player.get_by_role('button',name='Maybe').first.click()
    player.get_by_text('My response: maybe').first.wait_for()
    checks.ok(availability=='maybe','Player own RSVP persists across clients')
    player.get_by_role('button',name='Tactics').click()
    player.get_by_role('heading',name='Published team plays').wait_for()
    checks.ok('Coach play drafts' not in player.locator('main').inner_text(),
        'Player cannot see coaching drafts')
    player.get_by_role('button',name='Watch and Learn',exact=True).click()
    viewer=player.frame_locator('iframe[title="Watch and Learn"]')
    viewer.get_by_role('button',name='Watch animation').wait_for(timeout=15000)
    checks.ok(viewer.locator('svg.pf.study').count()==1,
        'Player opens actual E5 Learn field, not an alternate preview')
    checks.ok(viewer.get_by_role('button',name='Edit',exact=True).count()==0 and
        viewer.get_by_role('button',name='Save play',exact=True).count()==0,
        'Published viewer cannot open coach editing controls')
    viewer.get_by_role('button',name='Watch animation').click()
    viewer.get_by_role('button',name='Attacking left').click()
    checks.ok(viewer.locator('#play-fig svg.pf').count()==1 and
        viewer.locator('#play-fig svg.pf').get_attribute('aria-label').endswith('attacking left'),
        'Native E5 Watch renders mirrored field')
    viewer.get_by_role('button',name='All plays',exact=False).click()
    player.get_by_role('heading',name='Published team plays').wait_for(timeout=15000)
    player.get_by_role('button',name='View diagram and Learn / authored timing').click()
    checks.ok(player.locator('.cloud-play-field svg circle').count()>=2,
        'Player sees authored E5 positions in read-only cloud preview')
    checks.ok('Pass to the support runner' in player.locator('main').inner_text(),
        'Published E5 teaching instructions retained')
    player_ctx.close()

    # Exercise the real Stage 4 schedule entry with a separate player context.
    assignment_mock={'playId':published[0]['playId'],'revisionId':published[0]['revisionId'],
        'version':1,'sessionVersion':0,'state':'approved','reason':'current','name':published[0]['play']['name']}
    assigned_ctx,assigned=new_page(browser,PLAYER_TOKEN,stage4=True)
    assigned.locator('#cloud-nav').get_by_role('button',name='Tactics',exact=True).click()
    assigned.get_by_role('heading',name='Published team plays').wait_for()
    thumb=assigned.frame_locator('iframe[title="Diagram: Step Out"]')
    thumb.locator('svg.pf.thumb').wait_for(timeout=15000)
    checks.ok(thumb.locator('svg.pf.thumb').count()==1 and thumb.get_by_role('button',name='Save play',exact=True).count()==0,
        'Stage 4 library uses native E5 thumbnails, no editor controls')
    assigned.locator('#cloud-nav').get_by_role('button',name='Schedule',exact=True).click()
    assigned.locator('.cloud-session-row').filter(has_text='Fictional drills').get_by_role('button',name='Assigned plays').click()
    assigned.get_by_role('heading',name='Session play assignments').wait_for()
    assigned.get_by_role('button',name='Watch and Learn',exact=True).click()
    assigned_viewer=assigned.frame_locator('iframe[title="Watch and Learn"]')
    assigned_viewer.get_by_role('button',name='Watch animation').wait_for(timeout=15000)
    checks.ok(assigned_viewer.locator('svg.pf.study').count()==1 and
        assigned_viewer.get_by_role('button',name='Save play',exact=True).count()==0,
        'Assigned play opens the original E5 read-only Learn workspace directly')
    assigned_viewer.get_by_role('button',name='All plays',exact=False).click()
    assigned.get_by_role('heading',name='Session play assignments').wait_for(timeout=15000)
    checks.ok(assigned.locator('dialog.cloud-e5-dialog').count()==0 and
        assigned.locator('#cloud-nav [data-tab=schedule]').get_attribute('aria-current')=='page',
        'Closing assigned play returns to the originating session on Schedule')
    # Simulate revocation after the assignment list has already been shown.
    assignment_mock=None
    assigned.get_by_role('button',name='Watch and Learn',exact=True).click()
    assigned.get_by_text('This assignment or published revision has changed or is unavailable.',exact=False).wait_for()
    checks.ok(assigned.locator('dialog.cloud-e5-dialog').count()==0,
        'A withdrawn assignment cannot open a stale published play')
    checks.ok(all(not(r=='player' and a in ('play.draft.read','play.draft.edit','play.publish'))
        for r,_,_,a in operations),'Player assignment viewing grants no draft or publication authority')
    assigned_ctx.close()

    library_ctx,library_owner=new_page(browser,OWNER_TOKEN,stage4=True)
    library_owner.get_by_role('button',name='Manage play templates').click()
    library_owner.get_by_role('heading',name='Owner-authored templates').wait_for()
    original={'id':'owner-example','name':'Owner original','sport':'Oztag','players':{'LM':[24,46]},'moves':[]}
    library_owner.locator('input[name=templateFile]').set_input_files({'name':'owner.json','mimeType':'application/json','buffer':json.dumps(original).encode()})
    library_owner.locator('input[name=ownerAuthored]').check()
    library_owner.get_by_role('button',name='Save owner template').click()
    library_owner.get_by_text('Owner original',exact=True).wait_for(timeout=15000)
    checks.ok(len(templates)==1 and templates[0]['play']==original,
        'Platform Owner stores only explicitly declared own-authored play')
    library_owner.get_by_role('button',name='Archive template').click()
    library_owner.get_by_text('Oztag · archived · owner-authored · version 2').wait_for(timeout=15000)
    checks.ok(library_owner.get_by_role('button',name='Download play JSON').count()==0,
        'Archived template is not offered for reuse')
    library_owner.get_by_role('button',name='Back to Platform').click()
    library_owner.get_by_role('button',name='Fictional Comets',exact=True).click()
    library_owner.locator('#team-chips button').first.click()
    library_owner.locator('#cloud-nav').get_by_role('button',name='Tactics',exact=True).click()
    library_owner.get_by_role('heading',name='Coach play drafts').wait_for()
    legacy={'format':'team-manager-library','version':1,'library':{'plays':[dict(original,id='legacy-example',name='Legacy support',set='support',who={'LM':'A1'}),dict(original,id='unsupported',set='missing')],'playerSets':[{'id':'support','name':'Support','labels':[{'code':'A1','name':'First support'}]}]}}
    library_owner.locator('input[name=playFile]').set_input_files({'name':'library.json','mimeType':'application/json','buffer':json.dumps(legacy).encode()})
    library_owner.get_by_role('button',name='Review import').click()
    library_owner.get_by_text('1 eligible plays · 1 held for review').wait_for(timeout=15000)
    # The review panel already contains the play name before the write.
    # Observe the exact committed create response, then the refreshed draft
    # row (with editor controls), not that pre-existing preview text.
    def imported_response(response):
        request=response.request
        if not response.url.endswith('/api/stage2/v1/play') or request.method!='POST':
            return False
        data=request.post_data_json or {}
        return (data.get('action')=='play.draft.edit' and data.get('activeTeamId')==TEAM
            and data.get('activeRole')=='team_coach' and data.get('resourceId')==TEAM
            and data.get('payload',{}).get('command',{}).get('op')=='create')
    with library_owner.expect_response(imported_response,timeout=15000) as committed:
        library_owner.get_by_role('button',name='Import selected play as draft').click()
    response=committed.value
    assert response.status==200 and response.json().get('code')=='committed', 'Exact-team draft creation was not committed'
    library_owner.get_by_role('button',name='Import selected play as draft').wait_for(state='detached',timeout=15000)
    imported_row=library_owner.locator('.cloud-list-item').filter(has=library_owner.get_by_text('Legacy support',exact=True)).filter(has=library_owner.get_by_role('button',name='Edit play',exact=True))
    imported_row.get_by_role('button',name='Edit play',exact=True).wait_for(timeout=15000)
    checks.ok(len(plays)==2 and plays[-1]['play']['setDef']['labels'][0]['code']=='A1' and
        plays[-1]['revisionStatus']=='draft' and plays[-1]['publishedRevisionId'] is None and
        all(p['play']['name']!='Legacy support' for p in published),
        'Historical library selection imports one exact custom-set coach draft without publication')
    library_ctx.close()

    vol_ctx,volunteer=new_page(browser,VOL_TOKEN)
    volunteer.get_by_role('button',name='View your duties').click()
    volunteer.get_by_role('button',name='Accept').click()
    volunteer.get_by_text('Your response: yes').wait_for()
    checks.ok(duties[0]['status']=='confirmed',
        'Volunteer sees and responds only to assigned duty')
    checks.ok(all(not(r=='volunteer' and a in ('roster.read','play.draft.read'))
        for r,_,_,a in operations),
        'Volunteer has no implicit private roster or draft-play access')
    vol_ctx.close()
    browser.close()
server.shutdown()
if not checks.done(errors):
    raise SystemExit('Stage 2 cloud browser checks failed')
