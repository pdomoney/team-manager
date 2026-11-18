# Stage 3A: independently authenticated self-profile onboarding; fictional identities.
# No live Supabase, contact fields, minors or data migrations touched.
import json
import sys
from harness import build, serve, Check
from playwright.sync_api import sync_playwright

build()
server, url = serve()
checks=Check()
errors=[]
token='synthetic-stage3a-browser-session-token-long'
user='11111111-1111-4111-8111-111111111111'

with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
        state={'version':0,'displayName':'','saved':[],'team_grants':[],
            'profileStatus':'pending'}
        ctx=browser.new_context(viewport={'width':width,'height':844})
        def provider(route):
            request=route.request
            path=request.url.split('?')[0]
            if path.endswith('/auth/v1/user'):
                response={'id':user,'email':'tester@example.test'}
            elif path.endswith('/rest/v1/rpc/tm_my_team_context'):
                response=state['team_grants']
            elif path.endswith('/rest/v1/rpc/tm_my_operator_context'):
                response={'isOwner':False}
            elif path.endswith('/rest/v1/rpc/tm_my_profile'):
                response={'accountStatus':'active','displayName':state['displayName'],
                    'version':state['version'],'linkStatus':state['profileStatus'],
                    'privateEvidence':'do-not-render'}
            elif path.endswith('/rest/v1/rpc/tm_save_my_profile'):
                args=request.post_data_json
                state['saved'].append(args)
                if args['p_expected_version']!=state['version']:
                    response={'ok':False,'code':'stale-profile'}
                else:
                    state['displayName']=args['p_display_name']
                    state['version']+=1
                    response={'ok':True,'displayName':state['displayName'],
                        'version':state['version']}
            else:
                route.fulfill(status=404,content_type='application/json',body='{}')
                return
            route.fulfill(status=200,content_type='application/json',body=json.dumps(response))
        ctx.route('https://uyjxvaobshaahzipzzds.supabase.co/**',provider)
        ctx.add_init_script("""(() => {
          sessionStorage.setItem('tm-cloud-identity-preview-v1',JSON.stringify({
            access_token:'TOKEN_PLACEHOLDER',refresh_token:'synthetic-stage3a-refresh-long',
            expires_at:Math.floor(Date.now()/1000)+3600
          }));
        })();""".replace('TOKEN_PLACEHOLDER',token))
        page=ctx.new_page()
        page.on('pageerror',lambda e:errors.append('pageerror: '+str(e)))
        page.goto(url+'cloud-access.html')
        page.get_by_role('link',name='Set up your profile').wait_for()
        checks.ok(page.locator('#cloud-teams li').count()==0,
            f'[{width}] no approved teams remain no team grants')
        page.get_by_role('link',name='Set up your profile').click()
        page.get_by_role('heading',name='My profile').wait_for()
        page.get_by_label('Display name').wait_for()
        checks.ok('No authorised team' not in page.locator('main').inner_text() or
            page.locator('#cloud-nav').is_hidden(),
            f'[{width}] profile access does not invent team permissions')
        checks.ok('Person link: pending' in page.locator('main').inner_text(),
            f'[{width}] independently pending person verification visible')
        page.get_by_label('Display name').fill('  Fictional Adult  ')
        page.get_by_role('button',name='Save my profile').click()
        page.get_by_text('Your display name was saved.').wait_for()
        checks.ok(state['displayName']=='Fictional Adult' and state['version']==1,
            f'[{width}] one person's profile persisted via authenticated RPC')
        checks.ok(state['saved'][0]=={'p_display_name':'Fictional Adult',
            'p_expected_version':0},
            f'[{width}] no role, team, person or account identifiers supplied to write')
        page.reload()
        page.get_by_label('Display name').wait_for()
        checks.ok(page.get_by_label('Display name').input_value()=='Fictional Adult',
            f'[{width}] saved profile survives reload')
        state['version']=2
        page.get_by_label('Display name').fill('Stale overwrite')
        page.get_by_role('button',name='Save my profile').click()
        page.get_by_text('This record changed on another device.',exact=False).wait_for()
        checks.ok(state['displayName']=='Fictional Adult',
            f'[{width}] stale write denied with prior profile retained')
        state['displayName']='<script id="injected">unsafe</script>'
        page.reload()
        page.get_by_label('Display name').wait_for()
        checks.ok(page.locator('#injected').count()==0 and
            '<script id="injected">' in page.get_by_label('Display name').input_value(),
            f'[{width}] user-supplied display name remains inert text')
        checks.ok('do-not-render' not in page.locator('body').inner_text(),
            f'[{width}] extra provider fields never displayed')
        checks.ok(page.evaluate('document.documentElement.scrollWidth - innerWidth')<=2,
            f'[{width}] profile workspace fits viewport')
        ctx.close()
    browser.close()
server.shutdown()
sys.exit(0 if checks.done(errors) else 1)
