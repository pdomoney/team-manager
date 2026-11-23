# First-team invitation acceptance before registration, synthetic browser only.
# The fixture never opens the actual Supabase project or sends live email.
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
server,base=serve();checks=Check();errors=[]
engine=os.getenv('STAGE3D4B_BROWSER_ENGINE','chromium')
invitation_id='invite-'+'a'*32
try:
  with sync_playwright() as p:
    browser=getattr(p,engine).launch()
    for width in (390,1280):
      claimed=[False];requests=[]
      ctx=browser.new_context(viewport={'width':width,'height':844})
      ctx.add_init_script("""(() => {
        sessionStorage.setItem('tm-cloud-identity-preview-v1',
          JSON.stringify({access_token:'synthetic-invitee-token-1234567890',
            refresh_token:'synthetic-invitee-refresh-1234567890',
            expires_at:Math.floor(Date.now()/1000)+3600}));
      })();""")
      def supabase(route):
        path=route.request.url.split('supabase.co',1)[-1].split('?',1)[0]
        if path=='/auth/v1/user':
          data={'id':'22222222-2222-4222-8222-222222222222',
            'email':'invited@example.test','email_confirmed_at':'2026-11-23T00:00:00Z'}
        elif path=='/rest/v1/rpc/tm_my_team_context':
          data=[]
        elif path=='/rest/v1/rpc/tm_my_operator_context':
          data={'isOwner':False}
        elif path=='/rest/v1/rpc/tm_my_profile':
          data=None
        else:return route.fulfill(status=404,content_type='application/json',body='{}')
        return route.fulfill(status=200,content_type='application/json',
          body=json.dumps(data))
      def policy(route):
        return route.fulfill(status=403,content_type='application/json',
          body='{"ok":false,"code":"account-unavailable","canProceed":false}')
      def owner(route):
        return route.fulfill(status=403,content_type='application/json',
          body='{"ok":false,"code":"scope-denied"}')
      def onboarding(route):
        payload=json.loads(route.request.post_data or '{}')
        requests.append(payload.get('action'))
        if payload.get('action')=='list.mine':
          data={'ok':True,'code':'permitted','data':[{
            'invitationId':invitation_id,'teamId':'stgeorge-mixed20',
            'teamRole':'team_manager',
            'status':'claimed' if claimed[0] else 'approved',
            'expiresAt':'2026-11-30T00:00:00Z'}]}
        elif payload.get('action')=='claim' and not claimed[0] and payload.get('invitationId')==invitation_id:
          claimed[0]=True
          data={'ok':True,'code':'claimed','invitationId':invitation_id}
        else:
          return route.fulfill(status=403,content_type='application/json',
            body='{"ok":false,"code":"scope-denied"}')
        return route.fulfill(status=200,content_type='application/json',
          body=json.dumps(data))
      ctx.route('https://stage3d3-example.supabase.co/**',supabase)
      ctx.route('**/api/stage3d3/v1/registration',policy)
      ctx.route('**/api/stage3d4/v1/owner',owner)
      ctx.route('**/api/stage3/v1/onboarding',onboarding)
      page=ctx.new_page()
      page.on('pageerror',lambda err: errors.append(str(err)))
      page.goto(base+'cloud-access.html')
      page.get_by_role('link',name='Review my team invitation').wait_for()
      checks.ok(not page.locator('#cloud-workspace-link').is_visible(),
        f'[{width}] no team working-context access before policy')
      checks.ok(not page.locator('#cloud-owner-link').is_visible(),
        f'[{width}] invited account has no Owner permission')
      page.get_by_role('link',name='Review my team invitation').click()
      page.get_by_role('heading',name='My team invitations').wait_for()
      page.get_by_role('button',name='Claim invitation').wait_for()
      checks.ok(page.locator('#context-controls').is_hidden(),
        f'[{width}] role picker denied before policy')
      page.get_by_role('button',name='Claim invitation').click()
      page.get_by_text('claimed',exact=False).first.wait_for()
      checks.ok(requests.count('claim')==1,
        f'[{width}] single claim made with trusted account')
      checks.ok(not page.locator('#context-controls').is_visible(),
        f'[{width}] claim alone does not create an active working context')
      checks.ok(page.locator('body').evaluate('(el)=>el.scrollWidth<=innerWidth+2'),
        f'[{width}] invitation screen fits mobile/desktop viewport')
      ctx.close()
    browser.close()
finally:
  server.shutdown()
sys.exit(0 if checks.done(errors) else 1)
