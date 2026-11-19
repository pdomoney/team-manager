# Stage 3A: multi-account invitation, reviewer and recovery journey.
# Uses fictional adults and mocked Supabase/Worker boundaries, never live data.
import json
import os
import sys
from harness import build, serve, Check
from playwright.sync_api import sync_playwright

build()
server,url=serve()
checks=Check()
errors=[]
TEAM='comets-onboarding'
INVITE='invite-12345678123412341234123456781234'
TOKENS={
    'coach':'synthetic-coach-stage3a-token-123456',
    'manager':'synthetic-manager-stage3a-token-123456',
    'player':'synthetic-player-stage3a-token-123456'}
EMAILS={
    'coach':'coach@fictional.test',
    'manager':'manager@fictional.test',
    'player':'player@fictional.test'}
ACTORS={
    'coach':'11111111-1111-4111-8111-111111111111',
    'manager':'22222222-2222-4222-8222-222222222222',
    'player':'44444444-4444-4444-8444-444444444444'}
engine=os.getenv('STAGE3A_BROWSER_ENGINE','chromium')
with sync_playwright() as p:
    browser=getattr(p,engine).launch()
    for width in (390,1280):
        state={'status':None,'delivery':'not-sent','player_active':False,
            'claimed':False,'email_sent':False,'recovery_requested':False,
            'password_changed':False,'actions':[]}
        def actor(req):
            token=req.headers.get('authorization','')
            return next((x for x,t in TOKENS.items() if t in token),None)
        def supply(ctx):
            def provider(route):
                req=route.request
                who=actor(req)
                path=req.url.split('?')[0]
                status=200
                if path.endswith('/auth/v1/user'):
                    if req.method=='PUT':
                        state['password_changed']=True
                    reply={'id':ACTORS[who], 'email':EMAILS[who],
                        'email_confirmed_at':'2026-11-19T00:00:00Z'} if who else {}
                    status=200 if who else 401
                elif path.endswith('/auth/v1/recover'):
                    state['recovery_requested']=True
                    reply={}
                elif path.endswith('/rest/v1/rpc/tm_my_team_context'):
                    roles={'coach':['team_coach'],'manager':['team_manager'],
                        'player':['team_player'] if state['player_active'] else []}
                    reply=[{'team_id':TEAM,'club_ref':'Fictional Comets',
                        'sport_ref':'oztag','season_ref':'2026','team_role':role}
                        for role in roles.get(who,[])]
                elif path.endswith('/rest/v1/rpc/tm_my_operator_context'):
                    reply={'isOwner':False}
                elif path.endswith('/rest/v1/rpc/tm_my_profile'):
                    reply=({'accountStatus':'active','displayName':'Fictional '+str(who),
                        'version':1,'linkStatus':'verified' if state['player_active']
                        else 'pending'} if who!='player' or state['claimed'] else None)
                else:
                    reply={};status=404
                route.fulfill(status=status,content_type='application/json',
                    body=json.dumps(reply))
            def operation(route):
                payload=route.request.post_data_json
                who=actor(route.request)
                if payload.get('action') in ('schedule.read','roster.read','duty.read'):
                    result={'ok':True,'code':'permitted','data':[]}
                    status=200
                else:
                    result={'ok':False,'code':'role-denied'}
                    status=403
                route.fulfill(status=status,content_type='application/json',
                    body=json.dumps(result))
            def onboarding(route):
                payload=route.request.post_data_json
                who=actor(route.request)
                action=payload.get('action')
                state['actions'].append((who,action))
                common={'invitationId':INVITE,'email':EMAILS['player'],
                    'teamRole':'team_player','status':state['status'],
                    'delivery':state['delivery'],
                    'expiresAt':'2026-11-27T00:00:00Z',
                    'proposedByMe':who=='coach','canReview':who=='manager'}
                result=None
                if action=='list.team' and who in ('coach','manager'):
                    result={'ok':True,'code':'permitted',
                        'data':[common] if state['status'] else []}
                elif action=='list.mine' and who=='player':
                    mine={k:common[k] for k in
                        ('invitationId','teamRole','status','expiresAt')}
                    mine['teamId']=TEAM
                    result={'ok':True,'code':'permitted',
                        'data':[mine] if state['status'] in
                        ('approved','claimed','activated') else []}
                elif action=='propose' and who=='coach' and not state['status']:
                    state['status']='proposed'
                    result={'ok':True,'code':'proposed','invitationId':INVITE}
                elif action=='approve' and who=='manager' and state['status']=='proposed':
                    state['status']='approved';state['delivery']='sent';state['email_sent']=True
                    result={'ok':True,'code':'approved',
                        'invitationId':INVITE,'delivery':'sent'}
                elif action=='claim' and who=='player' and state['status']=='approved':
                    state['status']='claimed';state['claimed']=True
                    result={'ok':True,'code':'claimed','invitationId':INVITE}
                elif action=='activate' and who=='manager' and state['status']=='claimed':
                    state['status']='activated';state['player_active']=True
                    result={'ok':True,'code':'activated','invitationId':INVITE}
                elif action=='revoke' and who=='manager' and state['status']=='activated':
                    state['status']='revoked';state['player_active']=False
                    result={'ok':True,'code':'revoked','invitationId':INVITE}
                else:
                    result={'ok':False,'code':'scope-denied'}
                route.fulfill(status=200 if result['ok'] else 403,
                    content_type='application/json',body=json.dumps(result))
            ctx.route('https://uyjxvaobshaahzipzzds.supabase.co/**',provider)
            ctx.route('**/api/stage1/v1/operation',operation)
            ctx.route('**/api/stage2/v1/play',operation)
            ctx.route('**/api/stage3/v1/onboarding',onboarding)
            ctx.route('**/fonts.googleapis.com/**',lambda route:route.abort())
            ctx.route('**/fonts.gstatic.com/**',lambda route:route.abort())
        def open_user(who):
            ctx=browser.new_context(viewport={'width':width,'height':850})
            supply(ctx)
            ctx.add_init_script("""(() => {
              sessionStorage.setItem('tm-cloud-identity-preview-v1',
                JSON.stringify({access_token:'TOKEN',
                  refresh_token:'synthetic-stage3a-refresh-token-abc',
                  expires_at:Math.floor(Date.now()/1000)+3600}));
            })();""".replace('TOKEN',TOKENS[who]))
            page=ctx.new_page()
            page.on('pageerror',lambda error:errors.append('pageerror: '+str(error)))
            page.on('dialog',lambda dialog:dialog.accept())
            page.goto(url+'cloud-team.html')
            return ctx,page

        coach_ctx,coach=open_user('coach')
        coach.get_by_role('button',name='Team',exact=True).click()
        coach.get_by_role('heading',name='Team account invitations').wait_for()
        coach.get_by_label('Invitee email').fill(EMAILS['player'])
        coach.get_by_label('Proposed team access').select_option('team_player')
        coach.get_by_role('button',name='Propose invitation').click()
        coach.get_by_text('Invitation proposed.',exact=False).wait_for()
        checks.ok(state['status']=='proposed',
            f'[{width}] Coach creates scoped pending invitation')
        checks.ok(coach.get_by_role('button',name='Approve invitation').count()==0,
            f'[{width}] proposing Coach cannot self-approve')
        coach_ctx.close()

        manager_ctx,manager=open_user('manager')
        manager.get_by_role('button',name='Team',exact=True).click()
        manager.get_by_role('button',name='Approve invitation').wait_for()
        manager.get_by_role('button',name='Approve invitation').click()
        manager.get_by_text('Invitation approved and email sent.',exact=False).wait_for()
        checks.ok(state['status']=='approved' and state['email_sent'],
            f'[{width}] second Manager approval triggers invitation')
        manager_ctx.close()

        player_ctx,player=open_user('player')
        player.get_by_role('heading',name='My team invitations').wait_for()
        player.get_by_role('button',name='Claim invitation').click()
        player.get_by_text('Invitation claimed.',exact=False).wait_for()
        checks.ok(state['status']=='claimed' and not state['player_active'],
            f'[{width}] Player can claim but not approve their own account-to-person link')
        checks.ok(player.get_by_role('button',name='Team',exact=True).count()==0,
            f'[{width}] Player has no team navigation before verified role')
        player_ctx.close()

        manager_ctx,manager=open_user('manager')
        manager.get_by_role('button',name='Team',exact=True).click()
        manager.get_by_role('button',name='Verify person and activate access').wait_for()
        manager.get_by_role('button',name='Verify person and activate access').click()
        manager.get_by_text('Access approved for the selected team',exact=False).wait_for()
        checks.ok(state['player_active'],
            f'[{width}] independent person review activates exact-team grant')
        manager_ctx.close()

        player_ctx,player=open_user('player')
        player.get_by_role('button',name='Team',exact=True).wait_for()
        checks.ok(TEAM in player.locator('#active-context').inner_text(),
            f'[{width}] verified Player sees only their approved team')
        player_ctx.close()

        manager_ctx,manager=open_user('manager')
        manager.get_by_role('button',name='Team',exact=True).click()
        manager.get_by_role('button',name='Revoke team access').wait_for()
        manager.get_by_role('button',name='Revoke team access').click()
        manager.get_by_text('Team access withdrawn.',exact=False).wait_for()
        checks.ok(not state['player_active'],
            f'[{width}] team role revoked by independent Manager')
        manager_ctx.close()

        player_ctx,player=open_user('player')
        player.get_by_role('heading',name='My profile').wait_for()
        checks.ok(player.locator('#cloud-nav').is_hidden(),
            f'[{width}] revoked Player has no team navigation')
        checks.ok(all(who!='player' or action not in ('activate','approve')
            for who,action in state['actions']),
            f'[{width}] recipient never exercised privileged approval')
        player_ctx.close()

        recovery_ctx=browser.new_context(viewport={'width':width,'height':850})
        supply(recovery_ctx)
        recovery=recovery_ctx.new_page()
        recovery.on('pageerror',lambda error:errors.append('pageerror: '+str(error)))
        recovery.goto(url+'cloud-access.html')
        recovery.get_by_role('button',name='Forgot password?').click()
        recovery.get_by_label('Account email').fill(EMAILS['player'])
        recovery.get_by_role('button',name='Send recovery instructions').click()
        recovery.get_by_text('If that account exists',exact=False).wait_for()
        checks.ok(state['recovery_requested'],
            f'[{width}] recovery request does not disclose registered account')
        recovery_ctx.close()

        link_ctx=browser.new_context(viewport={'width':width,'height':850})
        supply(link_ctx)
        link=link_ctx.new_page()
        link.on('pageerror',lambda error:errors.append('pageerror: '+str(error)))
        link.goto(url+'cloud-access.html#type=invite&access_token='+
            TOKENS['player']+'&refresh_token=synthetic-stage3a-refresh-token-abc'+
            '&expires_in=3600')
        link.get_by_role('heading',name='Set your password').wait_for()
        checks.ok('access_token=' not in link.url,
            f'[{width}] invite bearer stripped from address immediately')
        link.get_by_label('New password',exact=True).fill('Strong-test-password-2026')
        link.get_by_label('Confirm new password').fill('Strong-test-password-2026')
        link.get_by_role('button',name='Save password').click()
        link.get_by_text('Signed in as '+EMAILS['player']).wait_for()
        checks.ok(state['password_changed'],
            f'[{width}] invited user completes credential setup')
        link_ctx.close()
    browser.close()
server.shutdown()
sys.exit(0 if checks.done(errors) else 1)
