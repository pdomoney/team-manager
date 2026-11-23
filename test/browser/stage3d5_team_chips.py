# Stage 3D.5 automatic team context UX, synthetic accounts only.
# No real member data, email provider, Supabase SQL or Worker deployment.
import json,os,subprocess,sys
import harness
from harness import Check,serve
from playwright.sync_api import sync_playwright

sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=harness.REPO,text=True).strip()
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
checks=Check();errors=[]
engine=os.getenv('STAGE3D5_BROWSER_ENGINE','chromium')
owner_token='synthetic-owner-token-long-123456789'
manager_token='synthetic-manager-token-long-123456789'
grants={
 'owner':[
  ('stgeorge-mixed20','St George Oztag','2027','team_coach'),
  ('stgeorge-mixed20','St George Oztag','2027','team_volunteer'),
  ('rangers-manager','Rangers Club','2027','team_manager')],
 'manager':[('stgeorge-mixed20','St George Oztag','2027','team_manager')]
}
operations=[];invitations=[]
def respond(route,body,status=200):
 return route.fulfill(status=status,content_type='application/json',body=json.dumps(body))
def bind(ctx):
 def actor(req):
  header=req.headers.get('authorization','')
  if owner_token in header:return 'owner'
  if manager_token in header:return 'manager'
  return None
 def provider(route):
  who=actor(route.request)
  path=route.request.url.split('supabase.co',1)[-1].split('?',1)[0]
  if not who:return respond(route,{},401)
  if path=='/auth/v1/user':
   return respond(route,{'id':'11111111-1111-4111-8111-111111111111' if who=='owner' else
      '22222222-2222-4222-8222-222222222222',
    'email':who+'@example.test','email_confirmed_at':'2026-11-23T00:00:00Z'})
  if path=='/rest/v1/rpc/tm_my_operator_context':
   return respond(route,{'isOwner':who=='owner'})
  if path=='/rest/v1/rpc/tm_my_team_context':
   return respond(route,[{'team_id':team,'club_ref':club,'sport_ref':'oztag',
      'season_ref':season,'team_role':role}
     for team,club,season,role in grants[who]])
  if path=='/rest/v1/rpc/tm_my_profile':
   return respond(route,{'accountStatus':'active','displayName':'Test '+who,
    'version':0,'linkStatus':'verified'})
  return respond(route,{},404)
 def owner(route):
  who=actor(route.request)
  payload=json.loads(route.request.post_data or '{}')
  if who!='owner':return respond(route,{'ok':False,'code':'scope-denied'},403)
  if payload.get('action')=='status':
   return respond(route,{'ok':True,'code':'ready',
    'team':{'teamId':'stgeorge-mixed20','clubRef':'St George Oztag',
      'sportRef':'oztag','seasonRef':'2027'},
    'coachAssigned':True,'policyReady':True,'invitations':invitations})
  if payload.get('action')=='invite.issue' and payload.get('role')=='team_manager':
   invitations.append({'invitationId':'invite-'+'a'*32,'email':payload.get('email'),
     'role':'team_manager','status':'approved','delivery':'sent',
     'expiresAt':'2026-12-01T00:00:00Z'})
   return respond(route,{'ok':True,'code':'approved','delivery':'sent',
     'invitationId':invitations[0]['invitationId']})
  return respond(route,{'ok':False,'code':'scope-denied'},403)
 def operation(route):
  who=actor(route.request)
  payload=json.loads(route.request.post_data or '{}')
  team=payload.get('activeTeamId');role=payload.get('activeRole')
  action=payload.get('action')
  operations.append((who,team,role,action))
  if not who or not any(t==team and r==role for t,c,s,r in grants[who]):
   return respond(route,{'ok':False,'code':'role-denied'},403)
  if action in ['schedule.read','roster.read','notices.read','duty.read']:
   return respond(route,{'ok':True,'code':'permitted','data':[]})
  return respond(route,{'ok':False,'code':'role-denied'},403)
 ctx.route('https://stage3d3-example.supabase.co/**',provider)
 ctx.route('**/api/stage3d4/v1/owner',owner)
 ctx.route('**/api/stage1/v1/operation',operation)
 ctx.route('**/api/stage3b/v1/operation',operation)
 ctx.route('**/api/stage3/v1/onboarding',lambda r:respond(r,{'ok':True,'code':'permitted','data':[]}))
def session(browser,token,width):
 ctx=browser.new_context(viewport={'width':width,'height':844})
 bind(ctx)
 ctx.add_init_script("""(() => {
  sessionStorage.setItem('tm-cloud-identity-preview-v1',
  JSON.stringify({access_token:'TOKEN',refresh_token:'synthetic-refresh-token-long-123',
    expires_at:Math.floor(Date.now()/1000)+3600}));
 })();""".replace('TOKEN',token))
 page=ctx.new_page()
 page.on('pageerror',lambda error:errors.append(str(error)))
 page.on('dialog',lambda dialog:dialog.accept())
 page.goto(base+'cloud-team.html')
 return ctx,page
try:
 with sync_playwright() as p:
  browser=getattr(p,engine).launch()
  for width in (390,1280):
   c,page=session(browser,owner_token,width)
   page.locator('#club-chips button').first.wait_for()
   checks.ok(page.locator('#role-context').count()==0,
     f'[{width}] role switcher removed')
   checks.ok(page.locator('#club-chips').get_by_role(
     'button',name='Platform').get_attribute('aria-pressed')=='true',
     f'[{width}] Owner lands on Platform with same login')
   page.get_by_role('heading',name='Invite an adult').wait_for()
   checks.ok(not any(w=='owner' for w,t,r,a in operations),
     f'[{width}] Platform Owner did not read any Coach team data')
   page.get_by_label('Recipient email').fill('manager-new@example.test')
   page.get_by_label('Team role').select_option('team_manager')
   page.get_by_role('button',name='Approve and send invitation').click()
   page.get_by_text('Provider reported invitation sent',exact=False).wait_for()
   checks.ok(len(invitations)>=1,f'[{width}] Owner invitation endpoint used')
   page.locator('#club-chips').get_by_role('button',name='St George Oztag').click()
   page.locator('#team-chips button').first.click()
   page.get_by_role('heading',name='Home').wait_for()
   checks.ok('Coach' in page.locator('#active-context').inner_text(),
     f'[{width}] selected team is Coach without role switch')
   page.get_by_role('button',name='Team',exact=True).first.click()
   page.get_by_role('heading',name='Squad nominations').wait_for()
   checks.ok(('owner','stgeorge-mixed20','team_coach','roster.read') in operations,
     f'[{width}] exact-team Coach grants used for roster')
   checks.ok(('owner','stgeorge-mixed20','team_volunteer','duty.read') in operations,
     f'[{width}] same-team volunteer grant used separately')
   page.locator('#club-chips').get_by_role('button',name='Rangers Club').click()
   page.locator('#team-chips button').first.click()
   page.get_by_role('heading',name='Home').wait_for()
   page.get_by_role('button',name='Team',exact=True).first.click()
   page.get_by_role('heading',name='Squad nominations').wait_for()
   checks.ok(('owner','rangers-manager','team_manager','roster.read') in operations,
     f'[{width}] Manager team uses only its own grant')
   checks.ok(not any(w=='owner' and t=='rangers-manager' and r=='team_coach'
     for w,t,r,a in operations),f'[{width}] no cross-team Coach escalation')
   checks.ok(page.locator('body').evaluate('(el)=>el.scrollWidth<=innerWidth+2'),
     f'[{width}] page has no horizontal clipping')
   c.close()
   c,page=session(browser,manager_token,width)
   page.get_by_role('heading',name='Home').wait_for()
   checks.ok(page.locator('#club-chips').get_by_role(
     'button',name='Platform').count()==0,
     f'[{width}] non-owner never sees Platform chip')
   checks.ok('Manager' in page.locator('#active-context').inner_text(),
     f'[{width}] Team Manager goes straight to approved team')
   checks.ok(page.locator('#team-chips button').count()==1,
     f'[{width}] Manager sees one selected team')
   checks.ok(page.locator('body').evaluate('(el)=>el.scrollWidth<=innerWidth+2'),
     f'[{width}] Manager layout fits')
   c.close()
  browser.close()
finally:server.shutdown()
sys.exit(0 if checks.done(errors) else 1)
