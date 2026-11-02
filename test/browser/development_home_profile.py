# Public development experience: no login, Home profile selector, isolated test records.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv,url=serve()
c=Check();errors=[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
        ctx,pg,_=page(browser,url+'?sandbox=1#home',width=width,height=844,errors=errors)
        pg.wait_for_selector('#home-profile-button')
        c.ok(pg.locator('#view input[type=password]').count()==0,
             f'[{width}] development landing page has no password form')
        c.ok(pg.locator('#desktop-profile-control').is_hidden(),
             f'[{width}] profile selection is on Home, not the header')
        c.ok(pg.locator('#home-profile-button').is_visible(),
             f'[{width}] Home displays Switch profile')
        pg.evaluate("""() => {
          localStorage.setItem('tm-auth',JSON.stringify({role:'coach',key:'not-a-real-key'}));
          localStorage.setItem('tm-test-data','DO_NOT_OVERWRITE_OLD_TEST_DATA');
        }""")
        pg.reload()
        pg.wait_for_selector('#home-profile-button')
        original=pg.evaluate('JSON.stringify(window.__team.ws)')
        c.ok(pg.locator('input[type=password]').count()==0,
             f'[{width}] old saved credentials do not trigger password sign-in')
        c.ok(pg.evaluate("localStorage.getItem('tm-test-data')")=='DO_NOT_OVERWRITE_OLD_TEST_DATA',
             f'[{width}] legacy test records are not replaced')
        pg.click('#home-profile-button')
        panel=pg.locator('#home-profile-panel')
        c.ok(panel.is_visible() and panel.locator('[data-act=desktop-profile-pick]').count()==20,
             f'[{width}] Home button offers all 20 fictional people')
        pg.keyboard.press('Escape')
        c.ok(panel.is_hidden(),f'[{width}] Escape closes Home selector')
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-15]')
        pg.wait_for_selector('#view [data-role-workspace=player]')
        c.ok(pg.locator('#home-profile-button').is_visible() and
             pg.locator('#view input[type=password]').count()==0,
             f'[{width}] Player opens personal Home with Switch profile, no password')
        c.ok('Example Comets U14' in pg.locator('#view').inner_text() and
             pg.locator('#tabs [data-section="Match day staff"]').count()==0,
             f'[{width}] Junior Player sees assigned team, not Manager controls')
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-09]')
        pg.wait_for_selector('#view [data-role-workspace=team_manager]')
        c.ok(pg.locator('#view [data-section="Match-day staff"]').count()==1,
             f'[{width}] Manager changes navigation and team role')
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-07]')
        pg.wait_for_selector('#view [data-role-workspace=team_coach]')
        c.ok(pg.locator('#tabs [data-section=Training]').count()==1 and
             pg.locator('#view [data-section="Match-day staff"]').count()==0,
             f'[{width}] Coach changes to own training navigation')
        pg.click('#view [data-act=desktop-profile-exit]')
        c.ok(pg.locator('#home-profile-button').is_visible() and
             pg.locator('#view [data-qa-profile=qa-01]').count()==1 and
             pg.evaluate('JSON.stringify(window.__team.ws)')==original,
             f'[{width}] Back to Owner Home restores unchanged sandbox workspace')
        c.ok(pg.evaluate("localStorage.getItem('tm-auth')") is not None,
             f'[{width}] legacy encrypted authentication record is untouched')
        ctx.close()
    result=c.done(errors);browser.close()
srv.shutdown();sys.exit(0 if result else 1)
