# Stage 3C management-only Worker assets: actual isolated browser content,
# synthetic Auth/Worker responses, never a live provider or actual participant.
import os, json, sys, subprocess
from harness import Check
import harness
from playwright.sync_api import sync_playwright

sha=subprocess.check_output(['git','-c','safe.directory='+harness.REPO,'rev-parse','HEAD'],cwd=harness.REPO,text=True).strip()
env=dict(os.environ,STAGE3C_SOURCE_SHA=sha,
  STAGE3C_SUPABASE_URL='https://sandbox3c-example.supabase.co',
  STAGE3C_SUPABASE_PUBLISHABLE_KEY='sb_publishable_fictionalStage3cPublic123',
  STAGE3C_ORIGIN='https://team-manager-stage3c.example.test')
subprocess.run(['node','scripts/stage3c-build.mjs'],env=env,check=True,
  capture_output=True)
harness.DIST=os.path.join(harness.REPO,'dist-stage3c')
srv,url=harness.serve()
checks=Check()
errors=[]
token='stage3c-fake-coach-bearer-token-abc123'
with sync_playwright() as p:
  browser=getattr(p,os.getenv('STAGE3C_BROWSER_ENGINE','chromium')).launch()
  for width in (390,1280):
    ctx=browser.new_context(viewport={'width':width,'height':844})
    calls=[]
    def provider(route):
      req=route.request
      path=req.url.split('?')[0]
      if path.endswith('/auth/v1/user'):
        return route.fulfill(status=200,content_type='application/json',
          body=json.dumps({'id':'11111111-1111-4111-8111-111111111111',
            'email':'fictional-coach@example.test'}))
      if path.endswith('/rest/v1/rpc/tm_my_team_context'):
        return route.fulfill(status=200,content_type='application/json',body=json.dumps([{
          'team_id':'comets-3c','team_role':'team_coach',
          'club_ref':'Fictional Comets','sport_ref':'oztag','season_ref':'2026'}]))
      if path.endswith('/rest/v1/rpc/tm_my_operator_context'):
        return route.fulfill(status=200,content_type='application/json',
          body='{"isOwner":false}')
      if path.endswith('/rest/v1/rpc/tm_my_profile'):
        return route.fulfill(status=200,content_type='application/json',body=json.dumps({
          'accountStatus':'active','displayName':'Fictional Coach',
          'version':1,'linkStatus':'verified'}))
      return route.fulfill(status=404,content_type='application/json',body='{}')
    def operation(route):
      req=route.request
      body=req.post_data_json
      calls.append(body.get('action'))
      if body['activeTeamId']!='comets-3c':
        return route.fulfill(status=403,content_type='application/json',
          body='{"ok":false,"code":"scope-denied"}')
      return route.fulfill(status=200,content_type='application/json',
        body='{"ok":true,"code":"permitted","data":[]}')
    def onboarding(route):
      return route.fulfill(status=200,content_type='application/json',
        body='{"ok":true,"code":"permitted","data":[]}')
    ctx.route('https://sandbox3c-example.supabase.co/**',provider)
    ctx.route('**/api/stage1/v1/operation',operation)
    ctx.route('**/api/stage3b/v1/operation',operation)
    ctx.route('**/api/stage3/v1/onboarding',onboarding)
    ctx.add_init_script("""(() => {
      sessionStorage.setItem('tm-cloud-identity-preview-v1',JSON.stringify({
        access_token:'STAGING_TOKEN',
        refresh_token:'staging-refresh-token-long-enough-1234',
        expires_at:Math.floor(Date.now()/1000)+3600
      }));
    })();""".replace('STAGING_TOKEN',token))
    pg=ctx.new_page()
    pg.on('pageerror',lambda error:errors.append('pageerror: '+str(error)))
    pg.goto(url+'cloud-team.html')
    pg.get_by_role('heading',name='Home').wait_for()
    checks.ok(pg.locator('#active-context').inner_text().startswith('Coach'),
      f'[{width}] exact Coach team loads in isolated staging')
    checks.ok(pg.locator('button[data-tab="tactics"]').is_hidden(),
      f'[{width}] Stage 4 Tactics not advertised in management trial')
    checks.ok('play.published.read' not in calls,
      f'[{width}] no Stage 4 reads triggered from Home')
    pg.get_by_role('button',name='Team',exact=True).click()
    pg.get_by_role('heading',name='Team',exact=True).wait_for()
    pg.get_by_role('heading',name='Team account invitations').wait_for()
    checks.ok(pg.get_by_role('heading',name='Team account invitations').count()==1,
      f'[{width}] real account invitation UI preserved')
    pg.get_by_role('button',name='More',exact=True).click()
    pg.get_by_role('heading',name='My profile').wait_for()
    checks.ok(pg.get_by_label('Display name').input_value()=='Fictional Coach',
      f'[{width}] personal profile remains accessible')
    checks.ok(pg.locator('body').evaluate('(x)=>x.scrollWidth<=innerWidth+2'),
      f'[{width}] management UI has no horizontal overflow')
    ctx.close()
  browser.close()
srv.shutdown()
sys.exit(0 if checks.done(errors) else 1)
