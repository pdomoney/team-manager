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
    'play':{'name':'Step Out','sport':'oztag','players':{'LM':[24.6,49.6],'RM':[25,46]},
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
def signed_role(headers):
    auth = headers.get('authorization', '')
    if OWNER_TOKEN in auth:return 'owner'
    if PLAYER_TOKEN in auth:return 'player'
    if VOL_TOKEN in auth:return 'volunteer'
    return None

def bind(ctx):
    def auth_endpoint(route):
        role=signed_role(route.request.headers)
        data={'id':ACCOUNT,'email':'coach@fictional.test'} if role else {}
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
        global availability
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
    ctx.route('**/auth/v1/user',auth_endpoint)
    ctx.route('**/rest/v1/rpc/tm_my_team_context',contexts_endpoint)
    ctx.route('**/rest/v1/rpc/tm_my_operator_context',operator_endpoint)
    ctx.route('**/api/stage1/v1/operation',operations_endpoint)
    ctx.route('**/api/stage2/v1/play',operations_endpoint)
    ctx.route('**/fonts.googleapis.com/**',lambda route:route.abort())
    ctx.route('**/fonts.gstatic.com/**',lambda route:route.abort())

def new_page(browser,token,width=390):
    ctx=browser.new_context(viewport={'width':width,'height':820})
    bind(ctx)
    ctx.add_init_script("""(() => {
      const token = TOKEN_LITERAL;
      sessionStorage.setItem('tm-cloud-identity-preview-v1',
        JSON.stringify({access_token:token,refresh_token:'synthetic-refresh-token-long',
          expires_at:Math.floor(Date.now()/1000)+3600}));
    })();""".replace('TOKEN_LITERAL',json.dumps(token)))
    page=ctx.new_page()
    page.on('pageerror',lambda e:errors.append('pageerror: '+str(e)))
    page.on('dialog',lambda d:d.accept())
    page.on('dialog',lambda dialog:dialog.accept())
    page.goto(url+'cloud-team.html')
    page.wait_for_selector('#context-controls:not([hidden])',timeout=15000)
    return ctx,page

engine=os.getenv('STAGE2_BROWSER_ENGINE','chromium')
with sync_playwright() as p:
    browser=getattr(p,engine).launch()
    coach_ctx,coach=new_page(browser,OWNER_TOKEN)
    checks.ok(coach.locator('#role-context option').count()==3,
        'one login exposes a neutral choice plus separate Owner and Coach grants')
    checks.ok('Choose your role and team' in coach.locator('main').inner_text(),
        'multi-role account must explicitly choose one context')
    checks.ok('Fictional drills' not in coach.locator('main').inner_text(),
        'no private records until a role is chosen')
    coach.locator('#role-context').select_option('0')
    checks.ok('Platform administration' in coach.locator('main').inner_text(),
        'Owner mode has no automatic team data view')
    coach.locator('#role-context').select_option('1')
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
    coach.get_by_role('button',name='Publish reviewed revision').click()
    coach.get_by_text('Published revision').wait_for()
    checks.ok(len(published)==1,
        'Head Coach published a reviewed revision with source untouched')
    coach.locator('#role-context').select_option(index=0)
    checks.ok('Fictional drills' not in coach.locator('main').inner_text(),
        'Switching to Owner drops Coach records')
    coach_ctx.close()

    player_ctx,player=new_page(browser,PLAYER_TOKEN)
    checks.ok(player.locator('#role-context option').count()==1,
        'Player has only their own team role')
    player.get_by_role('button',name='Reply to training').click()
    player.get_by_role('button',name='Maybe').first.click()
    player.get_by_text('My response: maybe').first.wait_for()
    checks.ok(availability=='maybe','Player own RSVP persists across clients')
    player.get_by_role('button',name='Tactics').click()
    player.get_by_role('heading',name='Published team plays').wait_for()
    checks.ok('Coach play drafts' not in player.locator('main').inner_text(),
        'Player cannot see coaching drafts')
    player.get_by_role('button',name='View diagram and Learn / authored timing').click()
    checks.ok(player.locator('.cloud-play-field svg circle').count()>=2,
        'Player sees authored E5 positions in read-only cloud preview')
    checks.ok('Pass to the support runner' in player.locator('main').inner_text(),
        'Published E5 teaching instructions retained')
    player_ctx.close()

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
