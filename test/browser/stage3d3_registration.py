# Stage 3D.3 first-team registration. Disposable synthetic browser only.
# This NEVER opens Supabase, Google, Apple, SMTP, or a live Worker.
import json, os, subprocess, sys
import harness
from harness import Check, serve
from playwright.sync_api import sync_playwright

sha=subprocess.check_output(['git','-c','safe.directory='+harness.REPO,
  'rev-parse','HEAD'],cwd=harness.REPO,text=True).strip()
env=dict(os.environ,
  STAGE3D3_SOURCE_SHA=sha,
  STAGE3D3_SUPABASE_URL='https://stage3d3-example.supabase.co',
  STAGE3D3_SUPABASE_PUBLISHABLE_KEY='sb_publishable_firstTeamSyntheticOnly123456',
  STAGE3D3_ORIGIN='https://first-team-stage3d3.example.test',
  STAGE3D3_SCOPE='individually-authorised-adults-only',
  STAGE3D3_SEASON_REF='2026',
  STAGE3D3_PROVIDER_METHODS='off')
subprocess.run(['node','scripts/stage3d3-build.mjs'],cwd=harness.REPO,env=env,
  check=True,capture_output=True)
harness.DIST=os.path.join(harness.REPO,'dist-stage3d3')
server,base=serve()
checks=Check()
errors=[]
engine=os.getenv('STAGE3D3_BROWSER_ENGINE','chromium')
user='11111111-1111-4111-8111-111111111111'
with sync_playwright() as p:
  browser=getattr(p,engine).launch()
  for width in (390,1280):
    accepted=[False]
    force_missing=[False]
    sent=[]
    ctx=browser.new_context(viewport={'width':width,'height':844})
    ctx.add_init_script("""(() => {
      sessionStorage.setItem('tm-cloud-identity-preview-v1',
        JSON.stringify({access_token:'synthetic-stage3d3-token-1234567890',
          refresh_token:'synthetic-stage3d3-refresh-1234567890',
          expires_at:Math.floor(Date.now()/1000)+3600}));
    })();""")
    def auth(route):
      req=route.request
      path=req.url.split('supabase.co',1)[-1].split('?',1)[0]
      if path=='/auth/v1/user':
        return route.fulfill(status=200,content_type='application/json',
          body=json.dumps({'id':user,'email':'approved@example.test'}))
      if path=='/rest/v1/rpc/tm_my_team_context':
        return route.fulfill(status=200,content_type='application/json',
          body=json.dumps([{'team_id':'stgeorge-mixed20',
            'club_ref':'St George Oztag','sport_ref':'oztag',
            'season_ref':'2026','team_role':'team_coach'}]))
      if path=='/rest/v1/rpc/tm_my_operator_context':
        return route.fulfill(status=200,content_type='application/json',
          body=json.dumps({'isOwner':False}))
      return route.fulfill(status=404,content_type='application/json',body='{}')
    def registration(route):
      req=route.request
      if force_missing[0]:
        return route.fulfill(status=503,content_type='application/json',
          body='{"ok":false,"code":"policy-unavailable","canProceed":false}')
      if req.method=='POST':
        body=json.loads(req.post_data or '{}')
        sent.append(body)
        if (body.get('policyId')=='mixed20-policy-v1'
          and body.get('termsAccepted') is True
          and body.get('privacyAcknowledged') is True
          and body.get('marketingOptIn') is False):
          accepted[0]=True
          return route.fulfill(status=200,content_type='application/json',
            body='{"ok":true,"code":"accepted","canProceed":true}')
        return route.fulfill(status=400,content_type='application/json',
          body='{"ok":false,"code":"acceptance-invalid","canProceed":false}')
      response={
        'ok':True,'code':'accepted' if accepted[0] else 'acceptance-required',
        'canProceed':accepted[0],
        'policy':{'policyId':'mixed20-policy-v1',
          'termsVersion':'terms-v1','termsSha256':'a'*64,
          'termsUrl':'https://policies.example.test/terms-v1',
          'privacyVersion':'privacy-v1','privacySha256':'b'*64,
          'privacyUrl':'https://policies.example.test/privacy-v1'}}
      return route.fulfill(status=200,content_type='application/json',
        body=json.dumps(response))
    ctx.route('https://stage3d3-example.supabase.co/**',auth)
    ctx.route('**/api/stage3d3/v1/registration',registration)
    page=ctx.new_page()
    page.on('pageerror',lambda e: errors.append('pageerror: '+str(e)))
    page.goto(base+'cloud-access.html')
    page.get_by_role('link',name='Review registration terms and privacy').wait_for()
    checks.ok(not page.get_by_role('link',name='Open your team workspace').is_visible(),
      f'[{width}] no team access before independent policy acceptance')
    page.get_by_role('link',name='Review registration terms and privacy').click()
    page.get_by_role('button',name='Record acknowledgement').wait_for()
    checks.ok(page.get_by_role('link',name='Read application terms').get_attribute('href')
      =='https://policies.example.test/terms-v1',
      f'[{width}] document link/version comes from approved server metadata')
    checks.ok(not page.locator('#registration-terms').is_checked()
      and not page.locator('#registration-privacy').is_checked()
      and not page.locator('#registration-marketing').is_checked(),
      f'[{width}] legal acknowledgements and marketing all unchecked')
    page.locator('#registration-terms').check()
    checks.ok(not page.locator('#registration-privacy').is_checked(),
      f'[{width}] terms cannot silently acknowledge privacy')
    page.locator('#registration-privacy').check()
    page.get_by_role('button',name='Record acknowledgement').click()
    page.get_by_role('link',name='Continue to team access').wait_for()
    checks.ok(len(sent)==1 and sent[0]['marketingOptIn'] is False,
      f'[{width}] server receives opt-in false and both explicit acknowledgements')
    page.get_by_role('link',name='Continue to team access').click()
    page.get_by_role('link',name='Open your team workspace').wait_for()
    checks.ok(page.get_by_text('Mixed 20 · team coach').count()==1,
      f'[{width}] exact team visible only after acceptance')
    force_missing[0]=True
    page.reload()
    page.get_by_text('Team access is unavailable until your individual registration requirements are approved.').wait_for()
    checks.ok(not page.locator('#cloud-workspace-link').is_visible(),
      f'[{width}] missing or revoked policy immediately removes workspace entry')
    checks.ok(page.locator('body').evaluate('(el)=>el.scrollWidth<=innerWidth+2'),
      f'[{width}] no horizontal clipping')
    ctx.close()
  browser.close()
server.shutdown()
sys.exit(0 if checks.done(errors) else 1)
