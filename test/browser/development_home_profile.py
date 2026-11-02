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
        c.ok(pg.evaluate('window.__team.M.teamsOf(window.__team.ws).length')==18,
             f'[{width}] fictional 18-team dataset appears in native workspace')
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
             pg.evaluate("window.__team.data.id")=='qa-comets-juniors' and
             pg.locator('#view [data-role-workspace]').count()==0,
             f'[{width}] Player uses original Player screen for exact team')
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-09]')
        c.ok(not pg.evaluate("window.__team.state.preview") and
             pg.locator('#tabs [data-g=tactics]').count()==0 and
             pg.evaluate("window.__team.data.id")=='qa-comets-mixed',
             f'[{width}] Manager uses native shell with restricted navigation')
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-07]')
        c.ok(pg.locator('#tabs [data-g=tactics]').count()==1 and
             pg.locator('#view select[data-change=native-persona-team]').count()==1,
             f'[{width}] Coach has native Tactics and assigned-team selection')
        pg.locator('#view select[data-change=native-persona-team]').select_option('qa-stars-open')
        c.ok(pg.evaluate("window.__team.data.id")=='qa-stars-open',
             f'[{width}] cross-club Coach team selection changes native team data')
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
