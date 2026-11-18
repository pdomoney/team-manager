# Synthetic Supabase sign-in on the actual Cloudflare-ready page. All API
# calls are intercepted; NO real auth user, project database or account created.
# Physical Safari, provider migration and launch remain separate requirements.
import json
import sys
from urllib.parse import urlparse, parse_qs
from harness import *
from playwright.sync_api import sync_playwright

build()
srv, url = serve()
checks, errors = Check(), []
with sync_playwright() as p:
    browser = p.chromium.launch()
    for width in (390, 1280):
        ctx = browser.new_context(viewport={'width': width, 'height': 844})
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        page.on('console', lambda m: errors.append('console.error: ' + m.text)
                if m.type == 'error' else None)
        state = {'token_status': 200, 'rpc_status': 200, 'calls': []}
        def route_provider(route):
            req = route.request
            path = urlparse(req.url)
            state['calls'].append((path.path, req.method))
            status = 200
            body = {}
            if path.path == '/auth/v1/token':
                if state['token_status'] != 200:
                    status = state['token_status']
                    body = {'error':'do not reveal provider error'}
                else:
                    body = {
                        'access_token': 'synthetic-browser-access-token-123456',
                        'refresh_token': 'synthetic-browser-refresh-token-123456',
                        'expires_in': 3600
                    }
            elif path.path == '/auth/v1/user':
                body = {
                    'id':'11111111-1111-4111-8111-111111111111',
                    'email':'coach@example.test',
                    'user_metadata':{'secret':'not for browser display'}
                }
            elif path.path == '/rest/v1/rpc/tm_my_team_context':
                status = state['rpc_status']
                body = [{'team_id':'fictional-u16',
                    'club_ref':'<script id="forbidden">XSS</script>',
                    'sport_ref':'oztag','season_ref':'2026',
                    'team_role':'team_coach','internal_secret':'hidden'}] if status == 200 else {
                        'message':'private database error not for clients'
                    }
            elif path.path == '/auth/v1/logout':
                status = 204
            else:
                status = 404
            route.fulfill(status=status, content_type='application/json',
                          body='' if status == 204 else json.dumps(body))
        page.route('https://uyjxvaobshaahzipzzds.supabase.co/**', route_provider)
        page.goto(url + 'cloud-access.html')
        checks.ok(page.get_by_role('heading', name='Sign in to your team').count() == 1,
                  f'[{width}] cloud identity page loads on real browser')
        checks.ok(page.get_by_text('For invited test accounts only.', exact=False).count() == 1,
                  f'[{width}] preview cannot be mistaken for production signup')
        checks.ok(page.get_by_role('link', name='Back to demo').count() == 1,
                  f'[{width}] existing demo remains available')
        checks.ok(page.locator('#cloud-login').is_visible(),
                  f'[{width}] unauthenticated sign-in form visible')
        page.locator('#cloud-email').fill('coach@example.test')
        page.locator('#cloud-password').fill('fictional-password')
        page.locator('#cloud-submit').click()
        page.get_by_text('Signed in as coach@example.test').wait_for()
        checks.ok(page.locator('#cloud-login').is_hidden(),
                  f'[{width}] form hides on verified identity')
        checks.ok(page.locator('#cloud-teams li').count() == 1,
                  f'[{width}] one team scope returned by reviewed RPC')
        checks.ok('fictional-u16' in page.locator('#cloud-teams').inner_text() and
                  'team coach' in page.locator('#cloud-teams').inner_text(),
                  f'[{width}] approved active team and role displayed')
        checks.ok(page.locator('#forbidden').count() == 0 and
                  page.get_by_text('<script id="forbidden">XSS</script>').count() == 1,
                  f'[{width}] server team label displayed as inert text')
        checks.ok('hidden' not in page.locator('#cloud-teams').inner_text(),
                  f'[{width}] provider extra fields not shown')
        checks.ok(state['calls'].count(('/auth/v1/user','GET')) >= 1 and
                  ('/rest/v1/rpc/tm_my_team_context','POST') in state['calls'],
                  f'[{width}] user identity and scoped team RPC actually called')
        state['rpc_status'] = 404
        page.reload()
        page.get_by_text('The read-only database endpoint has not been installed.', exact=False).wait_for()
        checks.ok(page.locator('#cloud-teams li').count() == 0,
                  f'[{width}] missing RPC cannot imply an authorised team')
        state['rpc_status'] = 200
        page.reload()
        page.get_by_text('Signed in as coach@example.test').wait_for()
        page.locator('#cloud-signout').click()
        page.get_by_text('Signed out.', exact=True).wait_for()
        checks.ok(page.locator('#cloud-account').is_hidden() and
                  page.locator('#cloud-login').is_visible(),
                  f'[{width}] logout restores guest-only state')
        state['token_status'] = 400
        page.locator('#cloud-email').fill('coach@example.test')
        page.locator('#cloud-password').fill('invalid')
        page.locator('#cloud-submit').click()
        page.get_by_text('Sign-in could not be completed.', exact=False).wait_for()
        checks.ok('do not reveal provider error' not in page.locator('body').inner_text(),
                  f'[{width}] rejected login shows no provider exception or details')
        checks.ok(page.locator('#cloud-account').is_hidden(),
                  f'[{width}] rejected login stays signed out')
        checks.ok(page.evaluate('document.documentElement.scrollWidth - innerWidth') <= 2,
                  f'[{width}] new identity page fits screen without horizontal overflow')
        ctx.close()
    result = checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if result else 1)
