# Stage 3D.5 automatic team context UX, synthetic accounts only.
# No real member data, email provider, Supabase SQL or Worker deployment.
import json,os,subprocess,sys
import harness
from harness import Check,serve
from playwright.sync_api import sync_playwright

sha=subprocess.check_output(['git','-c','safe.directory='+harness.REPO,'rev-parse','HEAD'],cwd=harness.REPO,text=True).strip()
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
player_token='synthetic-player-token-long-123456789'
grants={
 'owner':[
  ('stgeorge-mixed20','St George Oztag','2027','team_coach'),
  ('stgeorge-mixed20','St George Oztag','2027','team_volunteer'),
  ('rangers-manager','Rangers Club','2027','team_manager')],
 'manager':[('stgeorge-mixed20','St George Oztag','2027','team_manager')],
 'player':[('stgeorge-mixed20','St George Oztag','2027','team_player')]
}
operations=[];invitations=[]
message_log=[];notice_log=[];schedule_rows=[]
def respond(route,body,status=200):
 return route.fulfill(status=status,content_type='application/json',body=json.dumps(body))
def bind(ctx):
 def actor(req):
  header=req.headers.get('authorization','')
  if owner_token in header:return 'owner'
  if manager_token in header:return 'manager'
  if player_token in header:return 'player'
  return None
 def provider(route):
  who=actor(route.request)
  path=route.request.url.split('supabase.co',1)[-1].split('?',1)[0]
  if path=='/auth/v1/token' and route.request.method=='POST':
   body=json.loads(route.request.post_data or '{}')
   if body.get('email')=='owner@example.test':
    return respond(route,{'access_token':owner_token,
      'refresh_token':'synthetic-refresh-token-long-123',
      'expires_in':3600})
   return respond(route,{},401)
  if not who:return respond(route,{},401)
  if path=='/auth/v1/user':
   return respond(route,{'id':{
      'owner':'11111111-1111-4111-8111-111111111111',
      'manager':'22222222-2222-4222-8222-222222222222',
      'player':'33333333-3333-4333-8333-333333333333'}[who],
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
  if action=='schedule.read':
   return respond(route,{'ok':True,'code':'permitted','data':schedule_rows if team=='stgeorge-mixed20' else []})
  if action=='notices.read':
   rows=[n for n in notice_log if n['teamId']==team and
     (role in ('team_manager','team_coach') or (n['status']=='published' and n['audience'] in ('all','players') and role=='team_player'))]
   return respond(route,{'ok':True,'code':'permitted','data':rows})
  if action in ('notice.create','notice.publish','notice.archive') and role in ('team_manager','team_coach'):
   command=payload['payload']['command']
   if action=='notice.create':
    n=dict(command,noticeId='notice-'+str(len(notice_log)+1),teamId=team,status='draft',version=0)
    notice_log.append(n)
   else:
    n=next((n for n in notice_log if n['noticeId']==payload['resourceId'] and n['teamId']==team),None)
    if not n or n['version']!=payload['payload']['expectedVersion']:
     return respond(route,{'ok':False,'code':'stale-notice'},409)
    n['status']='published' if action=='notice.publish' else 'archived';n['version']+=1
   return respond(route,{'ok':True,'code':'committed','resourceId':n['noticeId'],'version':n['version']})
  if action in ['roster.read','duty.read']:
   return respond(route,{'ok':True,'code':'permitted','data':[]})
  return respond(route,{'ok':False,'code':'role-denied'},403)
 def management(route):
  who=actor(route.request)
  data=json.loads(route.request.post_data or '{}')
  team=data.get('teamId');role=data.get('role');action=data.get('action')
  if not who or not any(t==team and r==role for t,c,ss,r in grants[who]):
   return respond(route,{'ok':False,'code':'scope-denied'},403)
  if action=='admin.status':
   return respond(route,{'ok':True,'code':'permitted','data':{
    'canAdmin':role=='team_manager','role':role}})
  if action=='player.team.read' and role=='team_player':
   return respond(route,{'ok':True,'code':'permitted','data':{
    'roster':[{'displayName':'Verified Example Player'}],
    'rosterEligible':1,'rosterShown':1,'rosterOmittedUnverified':0,
    'competitions':[{'competitionId':'competition-'+'a'*32,
      'name':'Fictional Carnival','format':'tournament','division':'Mixed 20',
      'status':'entered','official':False}],
    'fixtures':[{'competitionId':'competition-'+'a'*32,
      'title':'vs Fictional Opponent','startsAt':'2027-02-20T08:00:00+11:00',
      'status':'planned','official':False}]}})
  if action=='messages.read' and role in ('team_coach','team_manager'):
   rows=[dict(m,canConfirm=m['author']==who) for m in message_log if m['teamId']==team]
   return respond(route,{'ok':True,'code':'permitted','data':rows})
  if action=='messages.prepare' and role in ('team_coach','team_manager'):
   value=data['input']
   m=dict(value,messageId='message-'+format(len(message_log)+1,'032x'),teamId=team,author=who,status='prepared',version=0)
   message_log.append(m)
   return respond(route,{'ok':True,'code':'committed','data':{'messageId':m['messageId'],'status':'prepared'}})
  if action=='messages.confirm' and role in ('team_coach','team_manager'):
   value=data['input'];m=next((m for m in message_log if m['messageId']==value['messageId'] and m['teamId']==team and m['author']==who),None)
   if not m or m['version']!=value['expectedVersion']:
    return respond(route,{'ok':False,'code':'stale-version'},409)
   m['status']=value['status'];m['version']+=1
   return respond(route,{'ok':True,'code':'committed','data':{'messageId':m['messageId'],'status':m['status'],'version':m['version']}})
  if action in ('team.members','volunteers.list','jerseys.read',
    'competitions.read','competitions.fixtures','duties.board','invite.list'):
   return respond(route,{'ok':True,'code':'permitted','data':[]})
  if action=='settings.read':
   return respond(route,{'ok':True,'code':'permitted','data':{
    'teamLabel':'Mixed 20','trainingVenue':'','trainingStart':'',
    'trainingEnd':'','contactName':'','contactEmail':'','jerseyLoan':False,
    'version':0}})
  if action in ('settings.save','competitions.create'):
   if role!='team_manager':
    return respond(route,{'ok':False,'code':'role-denied'},403)
   response={'version':1}
   if action=='competitions.create':response={'competitionId':'competition-'+'a'*32,'version':0}
   return respond(route,{'ok':True,'code':'committed','data':response})
  return respond(route,{'ok':False,'code':'invalid-request'},403)
 ctx.route('https://stage3d3-example.supabase.co/**',provider)
 ctx.route('**/api/stage3d4/v1/owner',owner)
 ctx.route('**/api/stage3d5/v1/team',management)
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
  # A real first-team password sign-in lands directly on Platform, not on a
  # permission chooser or the old account overview.
  login_ctx=browser.new_context(viewport={'width':390,'height':844})
  bind(login_ctx)
  login_page=login_ctx.new_page()
  login_page.on('pageerror',lambda error:errors.append(str(error)))
  login_page.goto(base+'cloud-access.html')
  login_page.locator('#cloud-email').fill('owner@example.test')
  login_page.locator('#cloud-password').fill('synthetic-password-only')
  login_page.get_by_role('button',name='Sign in').click()
  login_page.wait_for_url(base+'cloud-team.html')
  login_page.get_by_role('heading',name='Invite an adult').wait_for()
  checks.ok(login_page.locator('#club-chips').get_by_role(
    'button',name='Platform').get_attribute('aria-pressed')=='true',
    'fresh founder login opens Platform automatically')
  login_ctx.close()
  for width in (390,1280):
   message_log.clear();notice_log.clear();schedule_rows.clear()
   start_ops=len(operations)
   c,page=session(browser,owner_token,width)
   page.locator('#club-chips button').first.wait_for()
   checks.ok(page.locator('#role-context').count()==0,
     f'[{width}] role switcher removed')
   checks.ok(page.locator('#club-chips').get_by_role(
     'button',name='Platform').get_attribute('aria-pressed')=='true',
     f'[{width}] Owner lands on Platform with same login')
   page.get_by_role('heading',name='Invite an adult').wait_for()
   checks.ok(not any(w=='owner' for w,t,r,a in operations[start_ops:]),
     f'[{width}] Platform Owner did not read any Coach team data before team selection')
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
   page.get_by_role('button',name='More',exact=True).first.click()
   page.get_by_role('button',name='Settings').click()
   page.get_by_role('heading',name='Team settings').wait_for()
   checks.ok(page.get_by_role('button',name='Save team settings').count()==0,
     f'[{width}] Coach sees read-only settings while approved Manager owns team admin')
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
   page.get_by_role('button',name='More',exact=True).first.click()
   page.get_by_role('heading',name='Team management').wait_for()
   checks.ok(page.get_by_role('button',name='Settings').count()==1 and
     page.get_by_role('button',name='Competitions').count()==1 and
     page.get_by_role('button',name='Messages').count()==1 and
     page.get_by_role('button',name='Jerseys').count()==1,
     f'[{width}] connected management More contains established functions')
   checks.ok(page.locator('.cloud-more-item .more-ic svg').count()>=8 and
     page.locator('.cloud-more-item .cloud-more-arrow svg').count()>=8,
     f'[{width}] original illustrated More rows and chevrons are restored')
   checks.ok(page.get_by_role('button',name='Messages').get_attribute('aria-label')=='Messages',
     f'[{width}] original-style navigation keeps accessible button names')
   page.get_by_role('button',name='Settings').click()
   page.get_by_role('heading',name='Team settings').wait_for()
   page.get_by_role('button',name='All management tools').click()
   page.get_by_role('button',name='Competitions').click()
   page.get_by_role('heading',name='Create a league, tournament or carnival').wait_for()
   page.get_by_role('button',name='All management tools').click()
   page.get_by_role('button',name='Messages').click()
   page.get_by_role('heading',name='New message').wait_for()
   area=page.locator('textarea[name=body]')
   page.locator('select[name=template]').select_option('cancelled')
   checks.ok('actually cancelled' in area.input_value(),
     f'[{width}] no fabricated training cancellation')
   page.get_by_role('button',name='Prepare and log message').click()
   page.get_by_text('Complete the factual details',exact=False).wait_for()
   checks.ok(not message_log and not notice_log,
     f'[{width}] unavailable template cannot become message or notice')
   page.locator('select[name=template]').select_option('blank')
   page.locator('select[name=audience]').select_option('players')
   body='Training update\nPlease check your availability.'
   area.fill(body)
   page.get_by_role('button',name='Prepare and log message').click()
   page.get_by_role('heading',name='Prepared message').wait_for()
   checks.ok(len(message_log)==1 and message_log[0]['body']==body and message_log[0]['status']=='prepared',
     f'[{width}] multiline message is recorded, never automatically marked sent')
   checks.ok(len(notice_log)==1 and notice_log[0]['status']=='published' and
     notice_log[0]['audience']=='players' and notice_log[0]['body']==body.replace('\n',' '),
     f'[{width}] same selected-team notice published for chosen audience')
   page.get_by_role('button',name='Yes, sent').click()
   page.get_by_text('players · sent',exact=True).wait_for()
   checks.ok(message_log[0]['status']=='sent',f'[{width}] confirmation is explicit')
   page.get_by_role('button',name='Use again').click()
   checks.ok(area.input_value()==body,f'[{width}] previous message opens in editable form')
   page.get_by_role('button',name='All management tools').click()
   page.get_by_role('button',name='Noticeboard').click()
   page.get_by_role('heading',name='Noticeboard').wait_for()
   page.locator('input[name=title]').fill('Standalone notice')
   page.locator('textarea[name=body]').fill('Bring your water bottle.')
   page.locator('select[name=audience]').select_option('players')
   page.get_by_role('button',name='Save notice draft').click()
   draft=page.locator('.cloud-list-item').filter(has_text='Standalone notice')
   draft.get_by_role('button',name='Publish notice').click()
   draft.get_by_text('players · published',exact=True).wait_for()
   checks.ok(notice_log[-1]['status']=='published',f'[{width}] standalone noticeboard can publish its draft')
   page.get_by_role('button',name='Back to More').click()
   page.get_by_role('button',name='Jerseys').click()
   page.get_by_role('heading',name='Jersey numbers and issue history').wait_for()
   checks.ok(page.get_by_text('No active players yet').count()==1,
     f'[{width}] jersey workflow uses real-team empty state, not fictional players')
   page.get_by_role('button',name='All management tools').click()
   checks.ok(page.locator('body').evaluate('(el)=>el.scrollWidth<=innerWidth+2'),
     f'[{width}] Manager layout fits')
   c.close()
   # Player sees only independently approved roster and team tournament facts.
   c,page=session(browser,player_token,width)
   page.get_by_role('heading',name='Home').wait_for()
   checks.ok('Player' in page.locator('#active-context').inner_text(),
     f'[{width}] Player opens the exact approved team')
   page.get_by_role('button',name='Team',exact=True).first.click()
   page.get_by_role('heading',name='Our team').wait_for()
   page.get_by_text('Verified Example Player').wait_for()
   page.get_by_text('Fictional Carnival').wait_for()
   checks.ok(page.get_by_text('Team recorded, not an official draw').count()==1,
     f'[{width}] Player sees local fixture without official draw claim')
   page.get_by_role('button',name='More',exact=True).first.click()
   checks.ok(page.get_by_role('button',name='Settings').count()==0
     and page.get_by_role('button',name='Messages').count()==0,
     f'[{width}] Player has no Manager settings or message history')
   page.get_by_role('button',name='Noticeboard').first.click()
   page.get_by_role('heading',name='Noticeboard').wait_for()
   page.get_by_text('Standalone notice',exact=True).wait_for()
   checks.ok(page.get_by_role('button',name='Save notice draft').count()==0
     and page.get_by_role('button',name='Publish notice').count()==0
     and page.get_by_role('button',name='Archive notice').count()==0,
     f'[{width}] Player reads published notices but cannot mutate them')
   c.close()
  browser.close()
finally:server.shutdown()
sys.exit(0 if checks.done(errors) else 1)
