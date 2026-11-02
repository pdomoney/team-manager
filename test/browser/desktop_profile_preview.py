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
        c.ok(control.is_visible() and pg.locator('#desktop-profile-button').is_visible(),
             f'[{width}] Coach workspace shows profile control on phone and desktop')
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
        c.ok(pg.locator('#view [data-role-workspace=personal_owner]').count()==1 and
             'Owner workspace' in pg.locator('#view').inner_text() and
             pg.locator('#view .qa-tiles').count()==0,
             f'[{width}] owner opens role workspace instead of P12 QA report')
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
        c.ok(pg.locator('#view [data-role-workspace=team_manager]').count()==1 and
             'Example Stars Women' in pg.locator('#view').inner_text() and
             pg.locator('#view .qa-tiles').count()==0,
             f'[{width}] Manager sees only selected Stars team, not QA role matrix')
        pg.click('#view [data-act=qa-role-section][data-section="Match-day staff"]')
        c.ok('Match-day team' in pg.locator('#view').inner_text(),
             f'[{width}] Manager role navigation changes content')
        context=pg.locator('#view select[data-change=p12-context]')
        context.select_option('membership:player:team:qa-comets-mixed')
        c.ok(pg.locator('#view [data-role-workspace=player]').count()==1 and
             'Example Comets Mixed' in pg.locator('#view').inner_text() and
             'Example Stars Women' not in pg.locator('#view .qa-role-workspace').inner_text() and
             pg.locator('#view [data-section="Match-day staff"]').count()==0,
             f'[{width}] Player role changes UI and cannot inherit Manager teams')
        pg.click('#desktop-profile-button')
        pg.click('#desktop-profile-panel [data-profile=qa-14]')
        c.ok(pg.locator('#view [data-role-workspace=player]').count()==1 and
             'Oztag, Touch' in pg.locator('#view').inner_text(),
             f'[{width}] multi-sport Player can see their participation summary')
        pg.click('#desktop-profile-button')
        pg.click('#desktop-profile-panel [data-profile=qa-19]')
        c.ok(pg.locator('#view [data-role-workspace=none]').count()==1 and
             pg.locator('#view [data-section="Squad"]').count()==0,
             f'[{width}] revoked Coach is denied coaching navigation')

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
        # The button is also available to the Coach in non-trial mode. This
        # only opens fictional fixtures; it cannot read or change live records.
        pg.evaluate('window.__team.S.trial=false')
        pg.evaluate(act,['qa-exit',{}])
        c.ok(pg.locator('#desktop-profile-control').is_visible() and
             pg.locator('#qa-persona-control').is_hidden(),
             f'[{width}] non-trial Coach has desktop synthetic preview, not unrestricted QA controls')
        pg.click('#desktop-profile-button')
        pg.click('#desktop-profile-panel [data-profile=qa-04]')
        c.ok(pg.locator('#view [data-qa-profile=qa-04]').count()==1 and
             pg.evaluate('JSON.stringify(window.__team.ws)')==original,
             f'[{width}] non-trial Coach can inspect fictional Club Admin without data transfer')
        pg.click('#desktop-profile-exit')
        pg.evaluate('window.__team.S.trial=true')
        pg.evaluate(act,['qa-exit',{}])
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
        c.ok(pg.locator('#desktop-profile-control').is_visible() and
             pg.locator('#view [data-qa-profile=qa-07]').count()==1 and
             pg.evaluate('JSON.stringify(window.__team.ws)')==original,
             f'[{width}] resizing to mobile retains selected fictional profile and unchanged workspace')
        pg.click('#desktop-profile-exit')
        pg.evaluate(act,['tab',{'tab':'field'}])
        c.ok(pg.evaluate("document.body.classList.contains('game')") and
             pg.locator('#desktop-profile-control').is_hidden() and
             pg.evaluate("document.querySelector('.top').offsetHeight")<=56,
             f'[{width}] slim game screen hides mobile profile control without growing header')
        pg.evaluate(act,['tab',{'tab':'home'}])
        c.ok(control.is_visible(),
             f'[{width}] returning to Home restores the fictional profile control')
        pg.evaluate('window.__team.S.role=null')
        pg.evaluate(act,['lock-mode',{'mode':'player'}])
        c.ok(control.is_hidden() and
             pg.locator('#view input[name=password]').is_visible(),
             f'[{width}] signed-out player login hides Coach-only fictional profile switcher')
        pg.evaluate(act,['desktop-profile-menu',{}])
        c.ok(control.is_hidden() and
             pg.locator('#desktop-profile-panel').is_hidden(),
             f'[{width}] synthetic profile picker cannot open while signed out')
        ctx.close()
    result=c.done(errors)
    browser.close()
srv.shutdown();sys.exit(0 if result else 1)
