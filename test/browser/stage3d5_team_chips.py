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
message_log=[];notice_log=[];schedule_rows=[];attendance_rows=[];member_rows=[];reported={};competition_rows=[];match_selections={}
def respond(route,body,status=200):
 return route.fulfill(status=status,content_type='application/json',body=json.dumps(body))
def admin_right(team,role):
 return role=='team_manager' or (role=='team_coach' and not any(
   t==team and r=='team_manager' for items in grants.values() for t,c,ss,r in items))
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
  if action=='schedule.edit' and role in ('team_coach','team_manager') and team=='stgeorge-mixed20':
   value=payload['payload'];command=value['command']
   if command['op']=='create':
    row=dict(command,sessionId='training-example',status='planned',version=0)
    schedule_rows.append(row)
   else:
    row=next((s for s in schedule_rows if s['sessionId']==payload['resourceId']),None)
    if not row or row['version']!=value['expectedVersion'] or row['status']!='planned':
     return respond(route,{'ok':False,'code':'stale-or-protected-session'},409)
    if command['op']=='cancel':row['status']='cancelled'
    else:row.update({k:v for k,v in command.items() if k!='op'})
    row['version']+=1
   return respond(route,{'ok':True,'code':'committed','resourceId':row['sessionId'],'version':row['version']})
  if action in ('attendance.read','availability.board') and role in ('team_coach','team_manager') and team=='stgeorge-mixed20':
   session=next((s for s in schedule_rows if s['sessionId']==payload['resourceId']),None)
   if not session or (action=='attendance.read' and session['kind']!='training'):
    return respond(route,{'ok':False,'code':'resource-out-of-scope'},403)
   rows=attendance_rows if action=='attendance.read' else [
    dict(personId=p['personId'],**reported.get((session['sessionId'],p['personId']),{'response':None,'source':'none','version':0}))
    for p in attendance_rows]
   return respond(route,{'ok':True,'code':'permitted','data':rows})
  if action=='availability.transcribe' and team=='stgeorge-mixed20':
   if not admin_right(team,role):return respond(route,{'ok':False,'code':'role-denied'},403)
   value=payload['payload'];command=value['command']
   session=next((s for s in schedule_rows if s['sessionId']==payload['resourceId']),None)
   key=(payload['resourceId'],command['personId'])
   if not session or session['status']!='planned' or not any(p['personId']==command['personId'] for p in attendance_rows):
    return respond(route,{'ok':False,'code':'invalid-availability'},403)
   previous=reported.get(key)
   if value['expectedVersion']!=(previous['version'] if previous else 0):
    return respond(route,{'ok':False,'code':'stale-availability'},409)
   reported[key]={'response':command['response'],'source':command['source'],'version':previous['version']+1 if previous else 0}
   return respond(route,{'ok':True,'code':'committed','resourceId':session['sessionId'],'version':reported[key]['version']})
  if action=='attendance.record' and role in ('team_coach','team_manager') and team=='stgeorge-mixed20' and payload['resourceId']=='training-example':
   value=payload['payload'];command=value['command']
   row=next((p for p in attendance_rows if p['personId']==command['personId']),None)
   if not row or row['version']!=value['expectedVersion']:
    return respond(route,{'ok':False,'code':'stale-attendance'},409)
   row['status']=command['status'];row['version']+=1
   return respond(route,{'ok':True,'code':'committed','resourceId':payload['resourceId'],'version':row['version']})
  if action=='availability.reply' and role=='team_player' and team=='stgeorge-mixed20':
   row=next((s for s in schedule_rows if s['sessionId']==payload['resourceId']),None)
   value=payload['payload']
   if not row or row['status']!='planned' or value['expectedVersion']!=row.get('myAvailabilityVersion',0):
    return respond(route,{'ok':False,'code':'stale-availability'},409)
   row['myAvailability']=value['response'];row['myAvailabilityVersion']=value['expectedVersion']+1
   return respond(route,{'ok':True,'code':'committed','resourceId':row['sessionId'],'version':row['myAvailabilityVersion']})
  if action=='notices.read':
   rows=[n for n in notice_log if n['teamId']==team and n['status']!='archived' and
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
    'canAdmin':admin_right(team,role),'role':role}})
  if action in ('match.selection.read','player.match.selection.read','match.selection.save','match.selection.publish','match.selection.withdraw'):
   value=data['input'];sid=value['sessionId']
   fixture=next((s for s in schedule_rows if s['sessionId']==sid and s['kind']=='match'),None)
   if team!='stgeorge-mixed20' or not fixture:return respond(route,{'ok':False,'code':'scope-denied'},403)
   old=match_selections.get(sid,{'state':'none','version':0,'selectedIds':[],'fixtureVersion':0})
   candidates=[{'personId':'person-example','displayName':'Verified Example Player','response':'yes'}]
   selected=[{'displayName':p['displayName']} for p in candidates if p['personId'] in old['selectedIds']]
   current=old['state']=='published' and old['fixtureVersion']==fixture.get('version',0) and fixture['status']!='cancelled'
   if action=='player.match.selection.read':
    if role!='team_player':return respond(route,{'ok':False,'code':'role-denied'},403)
    return respond(route,{'ok':True,'code':'permitted','data':{'state':'published' if current else 'unavailable','players':selected if current else []}})
   if action=='match.selection.read':
    if role not in ('team_coach','team_manager'):return respond(route,{'ok':False,'code':'role-denied'},403)
    return respond(route,{'ok':True,'code':'permitted','data':dict(old,current=current,eligible=2,shown=1,
     candidates=candidates,publishedPlayers=selected if current else [],fixtureVersion=fixture.get('version',0))})
   if role!='team_coach':return respond(route,{'ok':False,'code':'role-denied'},403)
   if value['expectedVersion']!=old['version'] or value['fixtureVersion']!=fixture.get('version',0):
    return respond(route,{'ok':False,'code':'stale-version'},409)
   updated=dict(old,version=old['version']+1,fixtureVersion=fixture.get('version',0))
   if action=='match.selection.save':updated.update(state='draft',selectedIds=value['personIds'])
   elif action=='match.selection.publish':updated.update(state='published')
   else:updated.update(state='withdrawn')
   match_selections[sid]=updated
   return respond(route,{'ok':True,'code':'committed','data':{'version':updated['version'],'state':updated['state']}})
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
  if action=='team.members' and role in ('team_coach','team_manager'):
   return respond(route,{'ok':True,'code':'permitted','data':member_rows if team=='stgeorge-mixed20' else []})
  if action=='competitions.read':
   return respond(route,{'ok':True,'code':'permitted','data':[c for c in competition_rows if c['teamId']==team]})
  if action in ('competitions.create','competitions.update'):
   if not admin_right(team,role):return respond(route,{'ok':False,'code':'role-denied'},403)
   value=data['input']
   if action=='competitions.create':
    c=dict(value,teamId=team,season='2027',competitionId='competition-'+'a'*32,version=0)
    competition_rows.append(c)
   else:
    c=next((c for c in competition_rows if c['teamId']==team and c['competitionId']==value['competitionId']),None)
    if not c or c['version']!=value['expectedVersion']:
     return respond(route,{'ok':False,'code':'stale-version'},409)
    c.update({k:v for k,v in value.items() if k!='expectedVersion'});c['version']+=1
   return respond(route,{'ok':True,'code':'committed','data':{'competitionId':c['competitionId'],'version':c['version']}})
  if action in ('volunteers.list','jerseys.read',
    'competitions.fixtures','duties.board','invite.list'):
   return respond(route,{'ok':True,'code':'permitted','data':[]})
  if action=='settings.read':
   return respond(route,{'ok':True,'code':'permitted','data':{
    'teamLabel':'Mixed 20','trainingVenue':'','trainingStart':'',
    'trainingEnd':'','contactName':'','contactEmail':'','jerseyLoan':False,
    'version':0}})
  if action=='settings.save':
   if role!='team_manager':
    return respond(route,{'ok':False,'code':'role-denied'},403)
   response={'version':1}
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
   message_log.clear();notice_log.clear();schedule_rows.clear();attendance_rows.clear();member_rows.clear();reported.clear();competition_rows.clear();match_selections.clear()
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
   create=page.locator('form').filter(has=page.get_by_role('button',name='Create competition',exact=True))
   create.get_by_label('Competition name').fill('Example carnival')
   # Implicit select labels include option text on WebKit. Scope by form and
   # stable field name, as for the existing message template controls.
   create.locator('select[name=format]').select_option('carnival')
   checks.ok(create.locator('select[name=format]').input_value()=='carnival',
     f'[{width}] tournament format selection is applied')
   create.get_by_role('button',name='Create competition',exact=True).click()
   entry=page.locator('.cloud-list-item').filter(has=page.get_by_text('Example carnival',exact=True))
   entry.get_by_text('Edit competition and participation').click()
   edit=entry.locator('form').filter(has=page.get_by_role('button',name='Save competition and entry',exact=True))
   checks.ok(edit.get_by_label('Competition name').input_value()=='Example carnival' and
     edit.locator('select[name=format]').input_value()=='carnival' and
     edit.locator('select[name=status]').input_value()=='planned',
     f'[{width}] existing tournament details are prefilled')
   edit.get_by_label('Venue',exact=True).fill('Updated venue')
   edit.locator('select[name=status]').select_option('entered')
   edit.get_by_role('button',name='Save competition and entry',exact=True).click()
   entry.get_by_text('carnival · 2027 · No grade · entered',exact=True).wait_for()
   checks.ok(competition_rows[0]['venue']=='Updated venue' and competition_rows[0]['version']==1,
     f'[{width}] existing tournament and entry update persisted')
   entry.get_by_text('Edit competition and participation').click()
   edit.locator('select[name=status]').select_option('withdrawn')
   edit.get_by_role('button',name='Save competition and entry',exact=True).click()
   entry.get_by_text('carnival · 2027 · No grade · withdrawn',exact=True).wait_for()
   checks.ok(entry.get_by_role('button',name='Add team-recorded fixture').count()==0,
     f'[{width}] withdrawn tournament no longer offers new fixture creation')
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
   page.locator('input[name=title]').fill('Archived notice example')
   page.locator('textarea[name=body]').fill('This notice will be archived.')
   page.get_by_role('button',name='Save notice draft').click()
   archived=page.locator('.cloud-list-item').filter(has_text='Archived notice example')
   archived.get_by_role('button',name='Archive notice').click()
   archived.wait_for(state='detached')
   checks.ok(notice_log[-1]['status']=='archived',f'[{width}] archive removes draft from current noticeboard')
   page.get_by_role('button',name='Back to More').click()
   page.get_by_role('button',name='Jerseys').click()
   page.get_by_role('heading',name='Jersey numbers and issue history').wait_for()
   checks.ok(page.get_by_text('No active players yet').count()==1,
     f'[{width}] jersey workflow uses real-team empty state, not fictional players')
   page.get_by_role('button',name='All management tools').click()
   checks.ok(page.locator('body').evaluate('(el)=>el.scrollWidth<=innerWidth+2'),
     f'[{width}] Manager layout fits')
   c.close()
   # A fresh Manager session creates and reschedules a training session, then
   # a separately signed-in Coach reads the persisted training and records roll call.
   member_rows.extend([{'personId':'person-example','name':'Verified Example Player','status':'active'},
     {'personId':'person-unnamed','name':'','status':'active'}])
   attendance_rows.extend([{'personId':'person-example','status':None,'version':0},
     {'personId':'person-unnamed','status':None,'version':0}])
   c,page=session(browser,manager_token,width)
   page.get_by_role('button',name='Schedule',exact=True).first.click()
   training_form=page.locator('form').filter(has=page.get_by_role('button',name='Create training',exact=True))
   training_form.get_by_label('Session title').fill('Example training')
   training_form.get_by_label('Start date and time').fill('2027-02-20T18:00')
   training_form.get_by_label('Location',exact=True).fill('Example field')
   training_form.get_by_role('button',name='Create training',exact=True).click()
   training=page.locator('.cloud-list-item').filter(has_text='Example training')
   training.get_by_role('button',name='Edit',exact=True).click()
   start_field=page.get_by_label('Start date and time')
   checks.ok(start_field.input_value()=='2027-02-20T18:00',
     f'[{width}] existing training time is prefilled on edit')
   start_field.fill('2027-02-21T19:00')
   expected_start=page.evaluate("() => new Date('2027-02-21T19:00').toISOString()")
   page.get_by_role('button',name='Save changes').click()
   training.get_by_role('button',name='Attendance and responses').wait_for()
   checks.ok(len(schedule_rows)==1 and schedule_rows[0]['version']==1 and
     schedule_rows[0]['startsAt']==expected_start and schedule_rows[0]['locationLabel']=='Example field',
     f'[{width}] Manager created and rescheduled training through existing API')
   c.close()
   c,page=session(browser,owner_token,width)
   page.locator('#club-chips').get_by_role('button',name='St George Oztag').click()
   page.locator('#team-chips button').first.click()
   page.get_by_role('button',name='Schedule',exact=True).first.click()
   page.locator('.cloud-list-item').filter(has_text='Example training').get_by_role('button',name='Attendance and responses').click()
   page.get_by_role('heading',name='Training roll call').wait_for()
   roll=page.locator('.cloud-list-item').filter(has_text='Verified Example Player').filter(has=page.get_by_role('button',name='Save attendance'))
   checks.ok(roll.get_by_label('Attendance').input_value()=='' and
     page.get_by_text('Player reference person-unnamed',exact=True).count()==2,
     f'[{width}] Coach sees named roll call, unnamed records retained and no default attendance')
   roll.get_by_label('Attendance').select_option('present')
   roll.get_by_role('button',name='Save attendance').click()
   roll.get_by_text('Attendance: present',exact=True).wait_for()
   checks.ok(attendance_rows[0]['status']=='present' and
     ('owner','stgeorge-mixed20','team_coach','attendance.record') in operations,
     f'[{width}] exact Coach attendance mutation persists and reads back')
   checks.ok(page.get_by_role('button',name='Record reported reply').count()==0,
     f'[{width}] appointed Manager prevents Coach transcription')
   schedule_rows.append({'sessionId':'event-external-match','kind':'match','title':'Example external fixture',
     'managementOrigin':'external','startsAt':'2027-02-25T18:00:00+11:00','status':'planned','version':0})
   saved_grants=grants['manager'];grants['manager']=[]
   page.get_by_role('button',name='Back to schedule').click()
   fixture=page.locator('.cloud-list-item').filter(has_text='Example external fixture')
   fixture.get_by_role('button',name='Match availability').click()
   page.get_by_role('heading',name='Availability responses').wait_for()
   reply=page.locator('.cloud-list-item').filter(has_text='Verified Example Player')
   checks.ok(page.get_by_role('heading',name='Training roll call').count()==0,
     f'[{width}] match shows availability without training attendance')
   reply.get_by_label('Reported reply').select_option('yes')
   reply.get_by_label('Received by').select_option('phone')
   reply.get_by_role('button',name='Record reported reply').click()
   reply.get_by_text('Reply: yes · source: phone',exact=True).wait_for()
   checks.ok(reported[('event-external-match','person-example')]['response']=='yes' and
     ('owner','stgeorge-mixed20','team_coach','availability.transcribe') in operations,
     f'[{width}] unstaffed team Coach records external match reply through exact grant')
   grants['manager']=saved_grants
   page.get_by_role('button',name='Back to schedule').click()
   fixture.get_by_role('button',name='Match availability').wait_for()
   checks.ok(fixture.get_by_role('button',name='Cancel team event').count()==0,
     f'[{width}] external fixture is protected despite event ID prefix')
   training=page.locator('.cloud-list-item').filter(has_text='Example training')
   training.get_by_role('button',name='Cancel',exact=True).click()
   training.get_by_text('cancelled',exact=False).wait_for()
   checks.ok(schedule_rows[0]['status']=='cancelled',
     f'[{width}] training cancellation persists in schedule')
   page.get_by_role('button',name='More',exact=True).first.click()
   page.get_by_role('button',name='Messages').click()
   page.get_by_role('heading',name='New message').wait_for()
   page.locator('select[name=template]').select_option('cancelled')
   body=page.locator('textarea[name=body]').input_value()
   checks.ok('Training cancelled' in body and 'is off.' in body and '[Choose' not in body,
     f'[{width}] actual cancelled training feeds original cancellation template')
   c.close()
   schedule_rows.clear()
   # Player reads and updates only their own planned availability; cancelled
   # events remain visible but cannot generate a new reply.
   schedule_rows.extend([
    {'sessionId':'event-example-match','kind':'match','title':'Example friendly','managementOrigin':'team-friendly',
     'startsAt':'2027-02-20T08:00:00+11:00','status':'planned',
     'locationLabel':'Example field','version':0,'myAvailability':'maybe','myAvailabilityVersion':0},
    {'sessionId':'cancelled-example','kind':'training','title':'Cancelled training example',
     'startsAt':'2027-02-21T08:00:00+11:00','status':'cancelled',
     'myAvailabilityVersion':0}
   ])
   # Coach publishes a named administrative squad; no positions or scoring inferred.
   c,page=session(browser,owner_token,width)
   page.locator('#club-chips').get_by_role('button',name='St George Oztag').click()
   page.locator('#team-chips button').first.click()
   page.get_by_role('button',name='Schedule',exact=True).first.click()
   page.locator('.cloud-list-item').filter(has_text='Example friendly').get_by_role('button',name='Selected match squad').click()
   page.get_by_role('button',name='Save squad draft').wait_for()
   page.locator('input[name=personIds][value=person-example]').check()
   page.get_by_role('button',name='Save squad draft').click()
   page.get_by_role('button',name='Publish match squad').wait_for()
   checks.ok(match_selections['event-example-match']['state']=='draft',
     f'[{width}] Coach persists selection as draft first')
   # session() already accepts confirmation dialogs; do not register twice.
   page.get_by_role('button',name='Publish match squad').click()
   page.get_by_role('heading',name='Published match squad').wait_for()
   checks.ok(match_selections['event-example-match']['state']=='published',
     f'[{width}] Coach publishes exact named match squad')
   c.close()
   c,page=session(browser,manager_token,width)
   page.get_by_role('button',name='Schedule',exact=True).first.click()
   page.locator('.cloud-list-item').filter(has_text='Example friendly').get_by_role('button',name='Selected match squad').click()
   page.get_by_role('heading',name='Published match squad').wait_for()
   checks.ok(page.get_by_role('button',name='Save squad draft').count()==0,
     f'[{width}] Manager cannot edit Coach selection')
   page.get_by_role('button',name='Prepare squad message').click()
   page.locator('textarea[name=body]').wait_for()
   body=page.locator('textarea[name=body]').input_value()
   checks.ok('Selected match squad' in body and 'Verified Example Player' in body and
     page.locator('select[name=audience]').input_value()=='players' and
     not page.locator('input[name=postNotice]').is_checked(),
     f'[{width}] saved squad enters existing player message composer without auto posting')
   page.get_by_role('button',name='Prepare and log message').click()
   page.get_by_role('heading',name='Prepared message').wait_for()
   checks.ok(message_log[-1]['body']==body and message_log[-1]['status']=='prepared',
     f'[{width}] squad message persists without automatic send')
   c.close()
   # Player sees only independently approved roster and team tournament facts.
   c,page=session(browser,player_token,width)
   page.get_by_role('heading',name='Home').wait_for()
   checks.ok('Player' in page.locator('#active-context').inner_text(),
     f'[{width}] Player opens the exact approved team')
   page.get_by_role('button',name='Schedule',exact=True).first.click()
   match=page.locator('.cloud-list-item').filter(has_text='Example friendly')
   match.get_by_role('button',name='Yes',exact=True).click()
   match.get_by_text('My response: yes',exact=True).wait_for()
   checks.ok(schedule_rows[0]['myAvailabilityVersion']==1 and
     ('player','stgeorge-mixed20','team_player','availability.reply') in operations,
     f'[{width}] exact Player reply persisted and read back')
   match.get_by_role('button',name='Selected match squad').click()
   page.get_by_role('heading',name='Published match squad').wait_for()
   page.get_by_text('Verified Example Player',exact=True).wait_for()
   checks.ok(page.get_by_role('button',name='Save squad draft').count()==0,
     f'[{width}] Player reads published names without coaching controls')
   page.get_by_role('button',name='Back to schedule').click()
   cancelled=page.locator('.cloud-list-item').filter(has_text='Cancelled training example')
   # Returning from a squad view reloads the authorised schedule asynchronously.
   # Wait for the actual session row, not for the assertion to become true.
   cancelled.get_by_text('Cancelled training example',exact=True).wait_for(state='visible')
   checks.ok(cancelled.get_by_text('Availability replies are closed',exact=False).count()==1 and
     all(cancelled.get_by_role('button',name=reply,exact=True).count()==0 for reply in ('Yes','No','Maybe')),
     f'[{width}] cancelled sessions cannot be answered')
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
   page.get_by_role('button',name='Match dates',exact=True).click()
   page.get_by_role('heading',name='Team match dates').wait_for()
   page.get_by_text('Example friendly',exact=True).wait_for()
   checks.ok(page.get_by_text('Team-recorded date, not an official draw',exact=True).count()==1
     and page.get_by_text('Cancelled training example',exact=True).count()==0,
     f'[{width}] match date view excludes training and does not assert an official draw')
   page.get_by_role('button',name='All team tools').click()
   page.get_by_role('button',name='Noticeboard').first.click()
   page.get_by_role('heading',name='Noticeboard').wait_for()
   page.get_by_text('Standalone notice',exact=True).wait_for()
   checks.ok(page.get_by_text('Archived notice example',exact=True).count()==0 and
     page.get_by_role('button',name='Save notice draft').count()==0
     and page.get_by_role('button',name='Publish notice').count()==0
     and page.get_by_role('button',name='Archive notice').count()==0,
     f'[{width}] Player reads published notices but cannot mutate them')
   c.close()
  browser.close()
finally:server.shutdown()
sys.exit(0 if checks.done(errors) else 1)
