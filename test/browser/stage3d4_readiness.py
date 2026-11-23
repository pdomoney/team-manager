# Stage 3D.4 founder readiness and responsive policy UI, synthetic only.
# Never connects to the actual Supabase project or deployed Worker.
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
  STAGE3D3_SEASON_REF='2027',
  STAGE3D3_PROVIDER_METHODS='off')
subprocess.run(['node','scripts/stage3d3-build.mjs'],cwd=harness.REPO,
  env=env,check=True,capture_output=True)
harness.DIST=os.path.join(harness.REPO,'dist-stage3d3')
server,base=serve()
checks=Check()
errors=[]
engine=os.getenv('STAGE3D4_BROWSER_ENGINE','chromium')
user='11111111-1111-4111-8111-111111111111'
team={'teamId':'stgeorge-mixed20','clubRef':'St George Oztag',
  'sportRef':'oztag','seasonRef':'2027'}
try:
  with sync_playwright() as playwright:
    browser=getattr(playwright,engine).launch()
    for width in (390,1280):
      policy_active=[False]; accepted=[False]
      ctx=browser.new_context(viewport={'width':width,'height':844})
      ctx.add_init_script("""(() => {
        sessionStorage.setItem('tm-cloud-identity-preview-v1',
          JSON.stringify({access_token:'synthetic-readiness-token-1234567890',
            refresh_token:'synthetic-readiness-refresh-1234567890',
            expires_at:Math.floor(Date.now()/1000)+3600}));
      })();""")
      def provider(route):
        path=route.request.url.split('supabase.co',1)[-1].split('?',1)[0]
        if path=='/auth/v1/user':
          data={'id':user,'email':'founder@example.test',
            'email_confirmed_at':'2026-11-23T00:00:00Z'}
        elif path=='/rest/v1/rpc/tm_my_team_context':
          data=([{'team_id':'stgeorge-mixed20','club_ref':'St George Oztag',
            'sport_ref':'oztag','season_ref':'2027','team_role':'team_coach'}]
            if accepted[0] else [])
        elif path=='/rest/v1/rpc/tm_my_operator_context':
          data={'isOwner':accepted[0]}
        else:
          return route.fulfill(status=404,content_type='application/json',body='{}')
        return route.fulfill(status=200,content_type='application/json',
          body=json.dumps(data))
      def founder(route):
        response={'ok':True,'code':'ready','team':team,'coachAssigned':True,
          'policyReady':accepted[0],'invitations':[]}
        return route.fulfill(status=200,content_type='application/json',
          body=json.dumps(response))
      def registration(route):
        if not policy_active[0]:
          return route.fulfill(status=503,content_type='application/json',
            body='{"ok":false,"code":"policy-unavailable","canProceed":false}')
        if route.request.method=='POST':
          data=json.loads(route.request.post_data or '{}')
          accepted[0]=(data.get('termsAccepted') is True and
            data.get('privacyAcknowledged') is True and
            data.get('marketingOptIn') is False)
          return route.fulfill(status=200 if accepted[0] else 400,
            content_type='application/json',body=json.dumps({
            'ok':accepted[0],'code':'accepted' if accepted[0] else 'acceptance-invalid',
            'canProceed':accepted[0]}))
        return route.fulfill(status=200,content_type='application/json',
          body=json.dumps({'ok':True,'code':'accepted' if accepted[0] else 'acceptance-required',
          'canProceed':accepted[0],
          'policy':{'policyId':'adult-first-team-v1','termsVersion':'terms-v1',
            'termsSha256':'a'*64,'termsUrl':'https://policies.example.test/terms-v1',
            'privacyVersion':'privacy-v1','privacySha256':'b'*64,
            'privacyUrl':'https://policies.example.test/privacy-v1'}}))
      ctx.route('https://stage3d3-example.supabase.co/**',provider)
      ctx.route('**/api/stage3d4/v1/owner',founder)
      ctx.route('**/api/stage3d3/v1/registration',registration)
      page=ctx.new_page()
      page.on('pageerror',lambda error: errors.append(str(error)))
      page.goto(base+'cloud-access.html')
      page.get_by_text('Coach role recorded',exact=False).first.wait_for()
      checks.ok(page.locator('#cloud-owner-link').is_visible(),
        f'[{width}] Owner setup remains available before policy acceptance')
      checks.ok(not page.locator('#cloud-workspace-link').is_visible(),
        f'[{width}] no team workspace permission before acceptance')
      page.goto(base+'cloud-team.html')
      try:
        page.get_by_role('heading',name='Team access awaiting registration').wait_for(timeout=7000)
      except Exception:
        print('DIAGNOSTIC pending-workspace body:',page.locator('body').inner_text()[:1800])
        print('DIAGNOSTIC pending-workspace pageerrors:',errors)
        raise
      checks.ok(page.get_by_text('Coach grant recorded',exact=False).count()==1,
        f'[{width}] pending Coach grant is disclosed without a working team role')
      checks.ok(not page.locator('#context-controls').is_visible(),
        f'[{width}] no role context is selectable before acceptance')
      checks.ok(not page.get_by_text('Claim your approved invitation first.').is_visible(),
        f'[{width}] founder not misdirected into invitations')
      page.goto(base+'cloud-owner.html')
      page.get_by_text('Your Platform Owner and Coach roles are recorded.',exact=False).wait_for()
      paragraph=page.locator('#owner-policy-pending p').bounding_box()
      action=page.locator('#owner-policy-pending .owner-summary-action a').bounding_box()
      checks.ok(paragraph is not None and action is not None and
        action['y']>=paragraph['y']+paragraph['height']+8,
        f'[{width}] Owner policy link does not overlap its explanation')
      checks.ok(page.locator('body').evaluate('(el)=>el.scrollWidth<=innerWidth+2'),
        f'[{width}] Owner page has no horizontal clipping')
      page.get_by_role('link',name='Review registration and privacy').click()
      page.get_by_text('No approved application terms and privacy notice are active yet.',exact=False).wait_for()
      checks.ok(not page.locator('#registration-form').is_visible(),
        f'[{width}] missing policy cannot show acknowledgement controls')
      policy_active[0]=True
      page.reload()
      page.get_by_role('button',name='Record acknowledgement').wait_for()
      checks.ok(not page.locator('#registration-terms').is_checked()
        and not page.locator('#registration-privacy').is_checked()
        and not page.locator('#registration-marketing').is_checked(),
        f'[{width}] explicit acknowledgements required with marketing off')
      page.locator('#registration-terms').check()
      page.locator('#registration-privacy').check()
      page.get_by_role('button',name='Record acknowledgement').click()
      page.get_by_role('link',name='Continue to team access').wait_for()
      page.goto(base+'cloud-team.html')
      page.get_by_role('heading',name='Choose your role and team').wait_for()
      checks.ok(page.get_by_role('button',name='Platform Owner',exact=False).count()==1
        and page.get_by_role('button',name='Coach',exact=False).count()==1,
        f'[{width}] two independent Owner and Coach contexts after policy acceptance')
      checks.ok(page.locator('body').evaluate('(el)=>el.scrollWidth<=innerWidth+2'),
        f'[{width}] accepted team page has no horizontal clipping')
      ctx.close()
    browser.close()
finally:
  server.shutdown()
sys.exit(0 if checks.done(errors) else 1)
