# Stage 1 isolated UI rehearsal. Every identity, record and response is fictional.
# Provider and Worker calls are intercepted; no Supabase data or live worker touched.
import json,sys
from urllib.parse import urlparse
from harness import *
from playwright.sync_api import sync_playwright

build()
server,url=serve()
checks,errors=Check(),[]
state={'sessions':[],'availability':None,'duties':[],'writes':0}
SUPABASE='https://uyjxvaobshaahzipzzds.supabase.co'
roles={'coach':'team_coach','manager':'team_manager',
       'player':'team_player','volunteer':'team_volunteer'}
def response(route,status,body):
    route.fulfill(status=status,content_type='application/json',body=json.dumps(body))
def install_routes(page):
    def provider(route):
        req=route.request
        p=urlparse(req.url).path
        if p=='/auth/v1/token':
            user=req.post_data_json.get('email','coach@example.test').split('@')[0]
            response(route,200,{'access_token':'fictional-'+user+'-access-token-123456',
               'refresh_token':'fictional-'+user+'-refresh-token-123456',
               'expires_in':3600})
        elif p=='/auth/v1/user':
            role=req.headers.get('authorization','').split('fictional-')[-1].split('-')[0]
            response(route,200,{'id':'11111111-1111-4111-8111-111111111111',
               'email':role+'@example.test'})
        elif p=='/rest/v1/rpc/tm_my_team_context':
            role=req.headers.get('authorization','').split('fictional-')[-1].split('-')[0]
            response(route,200,[{'team_id':'comets-qa-u16',
               'club_ref':'Fictional Comets','sport_ref':'oztag',
               'season_ref':'2026','team_role':roles.get(role,'team_player')}])
        elif p=='/auth/v1/logout':response(route,200,{})
        else:response(route,404,{'error':'synthetic service missing'})
    def api(route):
        op=route.request.post_data_json
        role=op.get('activeRole')
        action=op.get('action')
        if op.get('activeTeamId')!='comets-qa-u16':
            return response(route,403,{'ok':False,'code':'scope-denied'})
        if action=='schedule.read':
            return response(route,200,{'ok':True,'code':'permitted',
              'data':[{**s,'myAvailability':state['availability'],
                'myAvailabilityVersion':0 if state['availability'] else None}
                 for s in state['sessions']]})
        if action=='roster.read':
            return response(route,200,{'ok':True,'code':'permitted','data':[]})
        if action=='duty.read':
            return response(route,200,{'ok':True,'code':'permitted',
              'data':state['duties']})
        if action=='schedule.edit' and role in ('team_coach','team_assistant','team_manager'):
            cmd=op['payload']['command']
            if cmd['op']=='create':
                s={'sessionId':'training-test01','kind':'training',
                   'startsAt':cmd['startsAt'],'title':cmd['title'],
                   'locationLabel':cmd.get('locationLabel',''),
                   'status':'planned','version':0}
                state['sessions'].append(s)
                state['writes']+=1
                return response(route,200,{'ok':True,'code':'committed',
                  'resourceId':s['sessionId'],'version':0})
            if cmd['op']=='update':
                for s in state['sessions']:
                    if s['sessionId']==op['resourceId']:
                        if op['payload']['expectedVersion']!=s['version']:
                            return response(route,409,{'ok':False,'code':'stale-or-protected-session'})
                        s.update({k:cmd[k] for k in ('title','startsAt','locationLabel') if k in cmd})
                        s['version']+=1
                        state['writes']+=1
                        return response(route,200,{'ok':True,'code':'committed',
                          'resourceId':s['sessionId'],'version':s['version']})
        if action=='availability.reply' and role=='team_player':
            state['availability']=op['payload']['response']
            state['writes']+=1
            return response(route,200,{'ok':True,'code':'committed',
              'resourceId':op['resourceId'],'version':0})
        if action=='duty.assign' and role=='team_manager':
            d={'dutyId':'duty-test01','sessionId':op['payload']['command']['sessionId'],
               'status':'assigned','response':None,'version':0}
            state['duties'].append(d)
            state['writes']+=1
            return response(route,200,{'ok':True,'code':'committed',
              'resourceId':d['dutyId'],'version':0})
        if action=='duty.reply' and role=='team_volunteer':
            d=state['duties'][0]
            d['status']='confirmed' if op['payload']['response']=='yes' else 'revoked'
            d['response']=op['payload']['response'];d['version']+=1
            state['writes']+=1
            return response(route,200,{'ok':True,'code':'committed',
              'resourceId':d['dutyId'],'version':d['version']})
        return response(route,403,{'ok':False,'code':'role-denied'})
    page.route(SUPABASE+'/**',provider)
    page.route('**/api/stage1/v1/operation',api)

def sign_in(page,who):
    page.goto(url+'cloud-access.html')
    page.locator('#cloud-email').fill(who+'@example.test')
    page.locator('#cloud-password').fill('fictional-password')
    page.locator('#cloud-submit').click()
    page.get_by_text('Signed in as '+who+'@example.test').wait_for()
    page.goto(url+'cloud-operations.html')
    page.get_by_text('Team records verified for comets-qa-u16',exact=False).wait_for()

with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
        state.update(sessions=[],availability=None,duties=[],writes=0)
        contexts=[]
        try:
            for who in ('coach','manager','player','volunteer'):
                ctx=browser.new_context(viewport={'width':width,'height':844})
                page=ctx.new_page()
                page.on('pageerror',lambda e:errors.append('pageerror: '+str(e)))
                install_routes(page)
                sign_in(page,who)
                contexts.append((ctx,page))
            coach,manager,player,volunteer=(x[1] for x in contexts)
            checks.ok(coach.locator('#stage-training').is_visible(),
                      f'[{width}] coach may create training')
            checks.ok(coach.locator('#stage-roster-section').is_visible(),
                      f'[{width}] coach sees scoped roster')
            checks.ok(manager.locator('#stage-duty-assign-section').is_visible(),
                      f'[{width}] manager can assign duty')
            checks.ok(player.locator('#stage-roster-section').is_hidden(),
                      f'[{width}] player cannot browse squad')
            checks.ok(volunteer.locator('#stage-schedule-section').is_hidden(),
                      f'[{width}] volunteer cannot view general schedule')
            checks.ok(coach.locator('#stage-context option').count()==1,
                      f'[{width}] only authorised active team is selectable')
            coach.locator('#stage-title-field').fill('Fictional midweek training')
            coach.locator('#stage-when').fill('2026-11-25T18:00')
            coach.locator('#stage-training-save').click()
            coach.get_by_text('Training saved.',exact=False).wait_for()
            checks.ok(len(state['sessions'])==1 and state['writes']==1,
                      f'[{width}] coach training write committed to server')
            manager.locator('#stage-refresh').click()
            manager.get_by_text('Fictional midweek training',exact=False).wait_for()
            checks.ok(manager.locator('#stage-sessions li').count()==1,
                      f'[{width}] independent Manager browser sees same training')
            player.locator('#stage-refresh').click()
            player.get_by_text('Fictional midweek training',exact=False).wait_for()
            player.locator('#stage-rsvp').select_option('yes')
            player.locator('#stage-availability-form button[type=submit]').click()
            player.get_by_text('Your availability response was saved.').wait_for()
            checks.ok(state['availability']=='yes',
                      f'[{width}] own player RSVP committed')
            manager.locator('#stage-duty-person').fill('fictional-volunteer-1')
            manager.locator('#stage-duty-assign-form button[type=submit]').click()
            manager.get_by_text('Duty assigned as',exact=False).wait_for()
            volunteer.locator('#stage-refresh').click()
            volunteer.get_by_text('training-test01',exact=False).wait_for()
            volunteer.get_by_role('button',name='Accept').click()
            volunteer.get_by_text('Your duty response was saved.').wait_for()
            checks.ok(state['duties'][0]['status']=='confirmed',
                      f'[{width}] assigned volunteer can accept own duty')
            checks.ok(player.locator('#stage-duty-section').is_hidden(),
                      f'[{width}] player never sees volunteer duty controls')
            checks.ok(coach.evaluate('document.documentElement.scrollWidth - innerWidth')<=2,
                      f'[{width}] Stage 1 page fits without horizontal overflow')
            checks.ok(all('rangers' not in x[1].locator('#stage-context').inner_text()
                          for x in contexts),f'[{width}] foreign teams are omitted')
        finally:
            for ctx,_ in contexts:ctx.close()
    result=checks.done(errors)
    browser.close()
server.shutdown()
sys.exit(0 if result else 1)
