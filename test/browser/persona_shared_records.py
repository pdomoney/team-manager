# Native test records must not be replaced by profile switching or legacy QA records.
import sys
from harness import *
from playwright.sync_api import sync_playwright
build();srv,url=serve();c=Check();errors=[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
        ctx,pg,_=page(browser,url+'?sandbox=1#home',width=width,height=844,errors=errors)
        pg.wait_for_selector('#home-profile-button')
        original=pg.evaluate('JSON.stringify(window.__team.ws)')
        c.ok(pg.evaluate('window.__team.M.teamsOf(window.__team.ws).length')==18,
             f'[{width}] original native workspace contains fictional team roster data')
        pg.evaluate("""() => localStorage.setItem('tm-persona-actions-v2','{\"preserve\":true}')""")
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-09]')
        manager=pg.evaluate("({team:window.__team.data.id,ids:window.__team.data.players.map(p=>p.id)})")
        c.ok(manager['team']=='qa-comets-mixed' and len(manager['ids'])>=15,
             f'[{width}] Manager views native Comets team players')
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-05]')
        admin=pg.evaluate("({team:window.__team.data.id,ids:window.__team.data.players.map(p=>p.id)})")
        c.ok(manager==admin and
             pg.locator('#tabs [data-g=team]').count()==1,
             f'[{width}] Club Admin and Manager use one unchanged team roster')
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-14]')
        player=pg.evaluate("({team:window.__team.data.id,ids:window.__team.data.players.map(p=>p.id)})")
        c.ok(manager==player and pg.evaluate("window.__team.state.preview"),
             f'[{width}] Player reads same native team through original Player view')
        c.ok(pg.evaluate('JSON.stringify(window.__team.ws)')==original,
             f'[{width}] selecting roles never mutates native team records')
        c.ok(pg.evaluate("localStorage.getItem('tm-persona-actions-v2')")=='{"preserve":true}',
             f'[{width}] past fictional workflow data key is not overwritten')
        pg.reload();pg.wait_for_selector('#home-profile-button')
        c.ok(pg.evaluate("window.__team.M.teamsOf(window.__team.ws).length")==18 and
             not pg.evaluate("document.body.classList.contains('persona-mode')"),
             f'[{width}] persisted native workspace opens after refresh')
        ctx.close()
    result=c.done(errors);browser.close()
srv.shutdown();sys.exit(0 if result else 1)
