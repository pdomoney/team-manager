# Header context: one source of team selection on Home, static team identity everywhere.
# Runs only against synthetic test library and browser-local state.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv,url=serve()
c,errs=Check(),[]
act="([a, ds]) => {const b=document.createElement('button');b.dataset.act=a;Object.assign(b.dataset,ds||{});document.body.appendChild(b);b.click();b.remove();}"
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (360,390,1280):
        ctx,pg,_=page(browser,url+'#home',width=width,height=860,errors=errs)
        pg.wait_for_selector('#view [data-act=test-library]')
        pg.click('#view [data-act=test-library]')
        pg.wait_for_timeout(180)
        W=lambda js: pg.evaluate(f'(() => {{const W=window.__team.ws,D=window.__team.data,M=window.__team.M; return {js};}})()')
        current=W('D.id')
        club=W('M.clubOf(W,D).name')
        sport=W('M.teamSport(D.team,M.clubOf(W,D))')
        c.ok(pg.locator('#team-title .t-name').count()==1 and
             pg.locator('#team-title [data-act=team-switch]').count()==0 and
             pg.locator('#team-title svg:not(.sport-ic)').count()==0,
             f'[{width}] team name is clear text with no redundant dropdown or chevron')
        c.ok(club in pg.get_attribute('#team-title .t-context','title') and
             sport in pg.get_attribute('#team-title .t-context','title') and
             pg.locator('#team-title .season-tag').count()==1,
             f'[{width}] header identifies club, sport and retains season access')
        c.ok(pg.locator('.scope-club').count()>2 and pg.locator('.scope-team').count()>1,
             f'[{width}] Home still offers club and team chips')
        pg.click('.scope-club[data-id=tarenpointtitans]')
        pg.wait_for_timeout(90)
        c.ok(W('D.id')==current and pg.locator('.scope-club[data-id=tarenpointtitans][aria-pressed=true]').count()==1,
             f'[{width}] choosing a club filters Home without silently switching editing team')
        target=pg.locator('.scope-team').first
        other=target.get_attribute('data-id')
        target.click()
        pg.wait_for_timeout(100)
        c.ok(W('D.id')==other and pg.locator('#team-title .t-name').inner_text()==W('D.team.name') and
             W('M.clubOf(W,D).name') in pg.get_attribute('#team-title .t-context','title'),
             f'[{width}] selecting a team chip updates editing context and static header')
        pg.evaluate(act,['tab',{'tab':'matches'}])
        pg.wait_for_timeout(100)
        c.ok(pg.locator('#team-title [data-act=team-switch]').count()==0 and
             pg.locator('#tabs [data-act=nav][data-g=home]').count()==1,
             f'[{width}] other pages keep Home navigation without competing header switch')
        # Season picker is deliberately retained for coaches, unlike team picker.
        pg.locator('#team-title .season-tag').click()
        c.ok(pg.locator('#sheet').is_visible(),f'[{width}] coach season selector still opens')
        pg.keyboard.press('Escape')
        pg.evaluate(act,['preview-on',{}])
        pg.wait_for_timeout(100)
        c.ok(pg.locator('#team-title [data-act=team-switch]').count()==0 and
             pg.locator('#team-title .t-context').count()==1 and
             pg.locator('#team-title .season-tag').count()==1,
             f'[{width}] player preview has team/club identity but no team switching')
        pg.evaluate(act,['preview-off',{}])
        pg.wait_for_timeout(90)
        c.ok(pg.evaluate('document.documentElement.scrollWidth <= innerWidth+1'),
             f'[{width}] header has no horizontal overflow')
        ctx.close()
    ok=c.done(errs)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
