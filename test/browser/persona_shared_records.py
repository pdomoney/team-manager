# Shared fictional records must follow the team, not the selected profile.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build();server,url=serve();checks=Check();errors=[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
        ctx,pg,_=page(browser,url+'?sandbox=1#home',width=width,height=844,errors=errors)
        pg.wait_for_selector('#home-profile-button')
        original=pg.evaluate('JSON.stringify(window.__team.ws)')
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-09]')
        pg.wait_for_selector('#view [data-role-workspace=team_manager]')
        checks.ok('Example Comets Mixed' in pg.locator('#view').inner_text(),
                  f'[{width}] Manager assigned to Comets Mixed team')
        pg.click('#tabs [data-section=Squad]')
        player=pg.locator('#view .persona-list-row').nth(1)
        player.locator('[data-capability=attendance][data-value=yes]').click()
        checks.ok('yes' in pg.locator('#view .persona-list-row').nth(1).inner_text(),
                  f'[{width}] Manager records availability for one fictional player')
        pg.click('#tabs [data-section="Match staff"]')
        pg.locator('#view [data-capability=staff][data-value=trainer]').first.click()
        checks.ok('proposed trainer' in pg.locator('#view').inner_text(),
                  f'[{width}] Manager proposes a trainer in shared team record')
        pg.click('#tabs [data-section=Home]')
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-05]')
        pg.locator('#view select[data-change=p12-context]').select_option(
            'grant:club_admin:club:qa-comets')
        pg.click('#tabs [data-section=People]')
        checks.ok('yes' in pg.locator('#view .persona-list-row').nth(1).inner_text()
                   and pg.locator('#view [data-capability=attendance]').count()==0,
                  f'[{width}] Club Admin sees same team responses without Manager edit buttons')
        pg.click('#tabs [data-section=Volunteers]')
        checks.ok('proposed trainer' in pg.locator('#view').inner_text()
                   and pg.locator('#view [data-capability=staff]').count()==0,
                  f'[{width}] Club Admin sees same proposed staff without Manager controls')
        pg.click('#tabs [data-section=Home]')
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-14]')
        pg.click('#tabs [data-section=Availability]')
        pg.locator('#view [data-capability=own-availability][data-value=yes]').click()
        checks.ok('Response: yes' in pg.locator('#view').inner_text(),
                  f'[{width}] first fictional Player records own availability')
        pg.click('#tabs [data-section=Home]')
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-18]')
        pg.locator('#view select[data-change=p12-context]').select_option(
            'membership:player:team:qa-comets-mixed')
        pg.click('#tabs [data-section=Availability]')
        checks.ok('Response: pending' in pg.locator('#view').inner_text(),
                  f'[{width}] another Player on the same team has independent availability')
        checks.ok(pg.evaluate('JSON.stringify(window.__team.ws)')==original,
                  f'[{width}] fictional edits never alter original workspace')
        checks.ok(pg.evaluate("localStorage.getItem('tm-persona-actions-v2')") is not None,
                  f'[{width}] shared team changes are stored in separate fictional v2 key')
        pg.reload()
        pg.wait_for_selector('#home-profile-button')
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-09]')
        pg.click('#tabs [data-section="Match staff"]')
        checks.ok('proposed trainer' in pg.locator('#view').inner_text(),
                  f'[{width}] shared team state remains after reload')
        ctx.close()
    result=checks.done(errors);browser.close()
server.shutdown();sys.exit(0 if result else 1)
