# Stage 3D.2 browser-auth smoke using synthetic provider responses only.
# No real Google/Apple account, Supabase project or invitation is contacted.
import os, json, sys
from urllib.parse import urlparse, parse_qs
import harness
from harness import build, serve, Check
from playwright.sync_api import sync_playwright

build()
# Opt in ONLY in this throwaway browser dist; production/public config stays
# fail-closed and the Supabase requests below are mocked.
cfg=os.path.join(harness.DIST,'cloud-public-config.js')
with open(cfg,encoding='utf8') as source: txt=source.read()
old='export const CLOUD_STAGE3D2_AUTH_ENABLED = false;'
assert txt.count(old)==1, 'Browser synthetic provider activation source drift'
with open(cfg,'w',encoding='utf8') as dest:
  dest.write(txt.replace(old,'export const CLOUD_STAGE3D2_AUTH_ENABLED = true;'))
server,url=serve()
checks=Check()
errors=[]
engine=os.getenv('STAGE3D2_BROWSER_ENGINE','chromium')
provider='https://uyjxvaobshaahzipzzds.supabase.co'
user_id='11111111-1111-4111-8111-111111111111'
with sync_playwright() as p:
  browser=getattr(p,engine).launch()
  for width in (390,1280):
    ctx=browser.new_context(viewport={'width':width,'height':844})
    actions=[]
    def auth(route):
      request=route.request
      parsed=urlparse(request.url)
      path=parsed.path
      body={}
      if request.post_data:
        try:body=json.loads(request.post_data)
        except ValueError:pass
      actions.append((path,body,parse_qs(parsed.query)))
      if path=='/auth/v1/otp':
        return route.fulfill(status=200,content_type='application/json',body='{}')
      if path in ('/auth/v1/verify','/auth/v1/token'):
        return route.fulfill(status=200,content_type='application/json',
          body=json.dumps({'access_token':'synthetic-approved-actor-token-12345',
            'refresh_token':'synthetic-refresh-token-1234567890','expires_in':3600}))
      if path=='/auth/v1/user':
        return route.fulfill(status=200,content_type='application/json',
          body=json.dumps({'id':user_id,'email':'approved@example.test'}))
      if path=='/rest/v1/rpc/tm_my_team_context':
        return route.fulfill(status=200,content_type='application/json',body='[]')
      if path=='/rest/v1/rpc/tm_my_operator_context':
        return route.fulfill(status=200,content_type='application/json',
          body='{"isOwner":false}')
      if path=='/auth/v1/authorize':
        return route.fulfill(status=200,content_type='text/html',body='OAuth handoff intercepted')
      return route.fulfill(status=404,content_type='application/json',body='{}')
    ctx.route(provider+'/**',auth)
    pg=ctx.new_page()
    pg.on('pageerror',lambda error:errors.append('pageerror: '+str(error)))
    pg.goto(url+'cloud-access.html')
    pg.get_by_role('heading',name='Sign in to your team').wait_for()
    checks.ok(pg.get_by_role('button',name='Continue with Google').is_visible()
      and pg.get_by_role('button',name='Continue with Apple').is_visible(),
      f'[{width}] Google and Apple sign-in controls visible')
    pg.get_by_role('button',name='Use a one-time email code').click()
    pg.locator('#cloud-otp-email').fill('approved@example.test')
    pg.get_by_role('button',name='Send one-time code').click()
    pg.get_by_role('heading',name='Enter your email code').wait_for()
    checks.ok(any(x[0]=='/auth/v1/otp' and x[1].get('create_user') is False
      for x in actions),f'[{width}] email OTP never creates a provider user')
    pg.locator('#cloud-otp-token').fill('123456')
    pg.get_by_role('button',name='Verify and sign in').click()
    pg.get_by_text('No verified active team access is assigned to this account.').wait_for()
    checks.ok(pg.get_by_role('link',name='Set up your profile').count()==1
      and pg.get_by_role('link',name='Open your team workspace').count()==0,
      f'[{width}] no team role granted from email OTP')
    checks.ok(pg.locator('body').evaluate('(el)=>el.scrollWidth<=innerWidth+2'),
      f'[{width}] no mobile horizontal overflow')
    pg.get_by_role('button',name='Sign out').click()
    pg.get_by_role('button',name='Continue with Google').wait_for()
    pg.get_by_role('button',name='Continue with Google').click()
    pg.wait_for_url('**/auth/v1/authorize?*')
    query=parse_qs(urlparse(pg.url).query)
    checks.ok(query.get('provider')==['google'] and
      query.get('flow_type')==['pkce'] and
      query.get('code_challenge_method')==['s256'] and
      len(query.get('code_challenge',[''])[0])==43,
      f'[{width}] Google navigation includes PKCE and no user registration')
    pg.goto(url+'cloud-access.html?code=one_use_browser_code')
    pg.get_by_text('No verified active team access is assigned to this account.').wait_for()
    checks.ok(pg.url.endswith('/cloud-access.html') and
      not any('access_token' in x[2] for x in actions),
      f'[{width}] OAuth callback strips code and does not expose tokens')
    ctx.close()
  browser.close()
server.shutdown()
sys.exit(0 if checks.done(errors) else 1)
