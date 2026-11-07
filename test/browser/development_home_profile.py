# Public development must use the ORIGINAL app shell with a compact profile switcher.
import sys
from harness import *
from playwright.sync_api import sync_playwright
build();srv,url=serve();c=Check();errors=[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
        ctx,pg,_=page(browser,url+'?sandbox=1#home',width=width,height=844,errors=errors)
        pg.wait_for_selector('#home-profile-button')
        c.ok(pg.locator('#view input[type=password]').count()==0,
             f'[{width}] sandbox uses no passwords')
        c.ok(pg.locator('#tabs .nav-group').count()==5 and
             not pg.evaluate("document.body.classList.contains('persona-mode')"),
             f'[{width}] restores original five-section Team Manager navigation')
        c.ok(pg.locator('#view .home-cols').count()==1 and
             pg.locator('#view [data-role-workspace]').count()==0,
             f'[{width}] native Home, not detached fictional persona app')
        c.ok(pg.evaluate('window.__team.M.teamsOf(window.__team.ws).length')==26,
             f'[{width}] combined 26-team catalogue appears in native workspace')
        pg.evaluate("""() => {
          localStorage.setItem('tm-auth',JSON.stringify({role:'coach',key:'old-secret'}));
          localStorage.setItem('tm-test-data','DO_NOT_CHANGE');
        }""")
        original=pg.evaluate('JSON.stringify(window.__team.ws)')
        pg.click('#home-profile-button')
        c.ok(pg.locator('#home-profile-panel [data-profile]').count()==20,
             f'[{width}] compact Home profile picker has 20 people')
        pg.click('#home-profile-panel [data-profile=qa-15]')
        pg.wait_for_selector('#home-profile-button')
        c.ok(pg.evaluate("window.__team.state.preview") and
             pg.evaluate("window.__team.data.id")=='qacometsjuniors' and
             pg.locator('#view [data-role-workspace]').count()==0,
             f'[{width}] Player uses original Player screen for exact team')
        # Multi-sport Players reuse the original menu without private coach stats.
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-14]')
        c.ok(pg.locator('#view nav.scope .scope-club').count()==2 and
             pg.locator('#view nav.scope .scope-team').count()==1 and
             pg.locator('#view [data-change=native-persona-team]').count()==0,
             f'[{width}] multi-sport Player has original scoped club/team navigation')
        pg.locator('#view .scope-club[data-id=qa-stars]').click()
        c.ok(pg.evaluate("window.__team.data.id")=='qastarswomen' and
             pg.evaluate("window.__team.state.preview") and
             pg.locator('#view .home-cols').count()==1,
             f'[{width}] Player club menu changes to correct original Player team screen')
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-09]')
        c.ok(not pg.evaluate("window.__team.state.preview") and
             pg.locator('#tabs [data-g=tactics]').count()==0 and
             pg.evaluate("window.__team.data.id")=='qacometsmixed',
             f'[{width}] Manager uses native shell with restricted navigation')
        c.ok(pg.locator('#view nav.scope .scope-club').count()==4 and
             pg.locator('#view .scope-team').count()==2 and
             pg.locator('#view .scope-club[data-id=qa-stars]').count()==0 and
             pg.locator('#view select[data-change=native-persona-team]').count()==0,
             f'[{width}] Manager sees original menu for only two assigned clubs')
        # Native Home links remain usable as read-only navigation for a Manager.
        pg.locator('#view [data-act=home-days][data-v="30"]').click()
        c.ok(pg.locator('#view [data-act=home-days][data-v="30"]').get_attribute('aria-pressed')=='true',
             f'[{width}] Manager can change Home day range without editing records')
        manager_record=pg.locator('#view [data-act=home-go][data-go=match-open]').first
        c.ok(manager_record.count()==1 and manager_record.is_enabled(),
             f'[{width}] Manager native Home match navigation stays available')
        manager_record.click()
        c.ok(pg.evaluate('window.__team.state.tab')=='matches' and pg.locator('#sheet:not([hidden])').count()==0,
             f'[{width}] Manager Home match opens native Matches, not the edit sheet')
        pg.locator('#tabs [data-g=more]').click()
        c.ok(pg.evaluate('window.__team.state.tab')=='more',
             f'[{width}] Manager More hub remains the original More screen')
        pg.locator('#tabs [data-g=home]').click()
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-07]')
        c.ok(pg.locator('#tabs [data-g=tactics]').count()==1 and
             pg.locator('#view nav.scope .scope-club').count()==4 and
             pg.locator('#view .scope-club[data-id=qa-comets]').count()==0 and
             pg.locator('#view select[data-change=native-persona-team]').count()==0,
             f'[{width}] Coach has native Tactics and original assigned-club menu')
        pg.locator('#view .scope-club[data-id=qa-stars]').click()
        c.ok(pg.evaluate("window.__team.data.id")=='qastarsopen' and
             pg.evaluate("window.__team.state.qaContext")=='grant:team_coach:team:qa-stars-open',
             f'[{width}] native club menu switches Coach to assigned Stars team and grant')
        c.ok(pg.locator('#view .scope-team[data-id=qastarsopen]').count()==1 and
             pg.locator('#view .scope-team[data-id=qarangers16]').count()==0,
             f'[{width}] native team list narrows to selected club')
        pg.locator('#view .scope-team[data-id=qastarsopen]').click()
        c.ok(pg.evaluate("window.__team.state.nativeHomeScope.kind")=='team' and
             pg.evaluate("window.__team.data.id")=='qastarsopen',
             f'[{width}] Coach team menu selects team-scoped original Home')
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-05]')
        c.ok(pg.locator('#view .scope-club[data-id=qa-rangers]').count()==1 and
             pg.locator('#view .scope-club[data-id=qa-comets]').count()==1 and
             pg.locator('#view .scope-club[data-id=qa-stars]').count()==0,
             f'[{width}] large Club Admin can navigate only assigned clubs')
        pg.locator('#view .scope-club[data-id=qa-comets]').click()
        c.ok(pg.evaluate("window.__team.data.team.clubId")=='qa-comets' and
             pg.evaluate("window.__team.state.qaContext")=='grant:club_admin:club:qa-comets',
             f'[{width}] cross-club admin navigation updates exact group and club banner')
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-18]')
        pg.locator('#view select[data-change=native-persona-context]').select_option(
            'grant:team_coach:team:qa-rangers-u12')
        c.ok(pg.evaluate("window.__team.data.id")=='qarangersu12' and
             pg.evaluate("window.__team.state.qaContext")=='grant:team_coach:team:qa-rangers-u12',
             f'[{width}] multi-role user keeps explicitly selected Coach group')
        pg.locator('#view select[data-change=native-persona-context]').select_option(
            'grant:team_manager:team:qa-comets-u16')
        c.ok(pg.evaluate("window.__team.data.id")=='qacometsu16' and
             pg.evaluate("window.__team.state.qaContext")=='grant:team_manager:team:qa-comets-u16' and
             pg.locator('#view .scope-club[data-id=qa-rangers]').count()==0,
             f'[{width}] multi-role Manager role shows only role-scoped teams')
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-01]')
        c.ok(pg.locator('#tabs .nav-group').count()==5 and
             pg.locator('#view .home-cols').count()==1 and
             pg.evaluate('JSON.stringify(window.__team.ws)')==original,
             f'[{width}] Owner returns to original app without altering saved records')
        c.ok(pg.evaluate("localStorage.getItem('tm-test-data')")=='DO_NOT_CHANGE',
             f'[{width}] existing local user data remains untouched')
        pg.reload();pg.wait_for_selector('#home-profile-button')
        c.ok(pg.locator('input[type=password]').count()==0 and
             pg.locator('#tabs .nav-group').count()==5,
             f'[{width}] refresh retains original password-free UX')
        ctx.close()
    result=c.done(errors);browser.close()
srv.shutdown();sys.exit(0 if result else 1)
