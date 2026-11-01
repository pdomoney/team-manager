# Desktop profile button: fictional Owner test profiles inside existing Coach workspace.
# No auth impersonation, no real data migration/publishing, no Supabase calls.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build();srv,url=serve()
c=Check();errors=[]
act="([name, values])=>{let b=document.createElement('button');b.dataset.act=name;Object.assign(b.dataset,values||{});document.body.appendChild(b);b.click();b.remove()}"
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,820,899,900,1280):
        ctx,pg,_=page(browser,url+'#home',width=width,height=860,errors=errors)
        pg.wait_for_selector('#view [data-act=test-library]')
        original=pg.evaluate('JSON.stringify(window.__team.ws)')
        control=pg.locator('#desktop-profile-control')
        if width<900:
            c.ok(control.is_hidden(),f'[{width}] no desktop switch button on phone/tablet')
            c.ok(pg.locator('#qa-persona-control').is_hidden(),
                 f'[{width}] no unrestricted trial profile preview before test library')
            ctx.close();continue

        c.ok(control.is_visible() and pg.locator('#desktop-profile-button').is_visible(),
             f'[{width}] coach workspace displays desktop View as profile control')
        c.ok(pg.locator('#qa-persona-control').is_hidden(),
             f'[{width}] existing trial picker remains hidden until test library')
        pg.click('#desktop-profile-button')
        panel=pg.locator('#desktop-profile-panel')
        c.ok(panel.is_visible() and
             panel.locator('button[data-act=desktop-profile-pick]').count()==20,
             f'[{width}] desktop menu lists 20 grouped fictional personas')
        c.ok(pg.get_attribute('#desktop-profile-button','aria-expanded')=='true',
             f'[{width}] button announces popup expanded')
        pg.keyboard.press('Escape')
        c.ok(panel.is_hidden() and
             pg.get_attribute('#desktop-profile-button','aria-expanded')=='false',
             f'[{width}] Escape safely closes profile picker')
        pg.click('#desktop-profile-button')
        pg.click('#desktop-profile-panel [data-profile=qa-01]')
        pg.wait_for_selector('#view [data-qa-profile=qa-01]')
        c.ok('Platform Owner' in pg.locator('#view').inner_text() and
             'FICTIONAL READ-ONLY VIEW' in pg.locator('#view').inner_text(),
             f'[{width}] owner profile opens explicit fictional preview')
        c.ok(pg.locator('#desktop-profile-exit').is_visible() and
             pg.locator('#qa-persona-control').is_hidden(),
             f'[{width}] desktop mode shows exit without duplicate header picker')
        c.ok(pg.locator('#tabs').is_hidden() and pg.locator('#menu-btn').is_hidden(),
             f'[{width}] preview blocks real app navigation and settings')
        c.ok(pg.evaluate('JSON.stringify(window.__team.ws)')==original,
             f'[{width}] selecting fictional owner cannot modify workspace')

        pg.click('#desktop-profile-button')
        pg.click('#desktop-profile-panel [data-profile=qa-18]')
        pg.wait_for_selector('#view [data-qa-profile=qa-18]')
        context=pg.locator('#view select[data-change=p12-context]')
        context.select_option('grant:team_manager:team:qa-stars-women')
        board=pg.locator('#view .qa-p12-workflow')
        c.ok(board.get_attribute('data-qa-workflow')=='qa-stars-women',
             f'[{width}] multi-club Manager gets only exact Stars fixture test')
        board.locator('[data-kind=propose-role-change][data-staff=qa-stars-women-staff-3][data-duty=trainer]').click()
        c.ok('Unverified duty proposals: 1' in board.inner_text(),
             f'[{width}] fictional role behaves like Manager without production assignment')
        context=pg.locator('#view select[data-change=p12-context]')
        context.select_option('membership:player:team:qa-comets-mixed')
        c.ok(pg.locator('#view .qa-p12-workflow').count()==0 and
             'No app capabilities' in pg.locator('#view .qa-tiles section').nth(1).inner_text(),
             f'[{width}] Player membership never inherits Manager actions')
        pg.click('#desktop-profile-button')
        pg.click('#desktop-profile-panel [data-profile=qa-19]')
        c.ok('No app capabilities' in pg.locator('#view .qa-tiles section').nth(1).inner_text(),
             f'[{width}] revoked Coach preview cannot gain edit rights')

        pg.evaluate(act,['task-new',{}])
        c.ok(pg.locator('#sheet').is_hidden(),
             f'[{width}] forged ordinary coach edit remains blocked')
        c.ok(pg.evaluate('JSON.stringify(window.__team.ws)')==original,
             f'[{width}] profile switching and sample changes are ephemeral')
        pg.click('#desktop-profile-exit')
        c.ok(pg.locator('#desktop-profile-button').is_visible() and
             pg.locator('#desktop-profile-exit').is_hidden() and
             pg.locator('#view [data-qa-profile]').count()==0,
             f'[{width}] exit restores original coach workspace view')
        c.ok(pg.evaluate('JSON.stringify(window.__team.ws)')==original,
             f'[{width}] exit did not alter original workspace')
        pg.evaluate(act,['preview-on',{}])
        c.ok(pg.locator('#desktop-profile-control').is_hidden(),
             f'[{width}] player preview never exposes desktop Owner simulation')
        pg.evaluate(act,['preview-off',{}])
        c.ok(pg.locator('#desktop-profile-control').is_visible(),
             f'[{width}] returning to Coach workspace restores button')

        pg.click('#desktop-profile-button')
        pg.click('#desktop-profile-panel [data-profile=qa-07]')
        c.ok(pg.locator('#view [data-qa-profile=qa-07]').count()==1,
             f'[{width}] desktop QA can preview Coach without loading test-library data')
        pg.set_viewport_size({'width':390,'height':860})
        c.ok(pg.locator('#desktop-profile-control').is_hidden() and
             pg.locator('#view [data-qa-profile]').count()==0 and
             pg.evaluate('JSON.stringify(window.__team.ws)')==original,
             f'[{width}] shrinking viewport exits desktop-only trial and preserves workspace')
        ctx.close()
    result=c.done(errors)
    browser.close()
srv.shutdown();sys.exit(0 if result else 1)
