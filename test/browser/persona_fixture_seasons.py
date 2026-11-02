# Shared fictional fixture workflow across Manager, Coach and Player; historical seasons immutable.
import sys
from harness import *
from playwright.sync_api import sync_playwright
build();srv,url=serve()
c=Check();errors=[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
        ctx,pg,_=page(browser,url+'?sandbox=1#home',width=width,height=860,errors=errors)
        pg.wait_for_selector('#home-profile-button')
        original=pg.evaluate('JSON.stringify(window.__team.ws)')
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-09]')
        pg.wait_for_selector('#view [data-role-workspace=team_manager]')
        pg.click('#tabs [data-section=Fixtures]')
        editor=pg.locator('#view .persona-fixture-editor')
        c.ok(editor.count()==1 and editor.is_visible(),
             f'[{width}] Manager has real fixture edit form in exact assigned team')
        editor.locator('[data-fixture-field=date]').fill('2026-11-21')
        editor.locator('[data-fixture-field=opponent]').fill('Example Coast Team')
        editor.locator('[data-fixture-field=venue]').fill('Example Central Park')
        editor.locator('[data-act=persona-fixture-save]').click()
        c.ok('Example Coast Team' in pg.locator('#view').inner_text() and
             'Example Central Park' in pg.locator('#view').inner_text(),
             f'[{width}] Manager fixture edit changes shared schedule')
        pg.locator('#view [data-change=persona-season]').select_option('2025')
        c.ok('2025-09-20' in pg.locator('#view').inner_text() and
             editor.count()==0,
             f'[{width}] historical season fixtures are independent and read-only')
        pg.locator('#view [data-change=persona-season]').select_option('2026')
        c.ok('Example Coast Team' in pg.locator('#view').inner_text(),
             f'[{width}] current season fixture remains after switching seasons')
        pg.click('#tabs [data-section=Home]')
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-14]')
        pg.wait_for_selector('#view [data-role-workspace=player]')
        pg.click('#tabs [data-section=Fixtures]')
        c.ok('Example Coast Team' in pg.locator('#view').inner_text() and
             pg.locator('#view .persona-fixture-editor').count()==0,
             f'[{width}] same-team Player sees updated fixture without Manager editor')
        pg.locator('#view select[data-change=p12-context]').select_option(
            'membership:player:team:qa-stars-women')
        pg.click('#tabs [data-section=Fixtures]')
        c.ok('Example Coast Team' not in pg.locator('#view .persona-content').inner_text(),
             f'[{width}] fixture changes do not leak to second sport/team')
        pg.click('#tabs [data-section=Home]')
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-09]')
        pg.locator('#view select[data-change=p12-context]').select_option(
            'grant:team_manager:team:qa-rangers-16')
        pg.click('#tabs [data-section=Fixtures]')
        editor=pg.locator('#view .persona-fixture-editor')
        editor.locator('[data-fixture-field=date]').fill('2026-12-05')
        editor.locator('[data-fixture-field=opponent]').fill('Example Valley Team')
        editor.locator('[data-fixture-field=venue]').fill('Example Rangers Oval')
        editor.locator('[data-act=persona-fixture-save]').click()
        pg.click('#tabs [data-section=Home]')
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-07]')
        pg.click('#tabs [data-section=Matches]')
        c.ok('Example Valley Team' in pg.locator('#view').inner_text() and
             pg.locator('#view .persona-fixture-editor').count()==0,
             f'[{width}] assigned Coach sees Manager fixture updates read-only')
        c.ok(pg.evaluate('JSON.stringify(window.__team.ws)')==original,
             f'[{width}] original Coach workspace and encrypted records remain unchanged')
        pg.reload()
        pg.wait_for_selector('#home-profile-button')
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-09]')
        pg.click('#tabs [data-section=Fixtures]')
        c.ok('Example Coast Team' in pg.locator('#view').inner_text(),
             f'[{width}] shared fixture update persists locally after reload')
        ctx.close()
    result=c.done(errors);browser.close()
srv.shutdown();sys.exit(0 if result else 1)
