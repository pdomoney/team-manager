# End-to-end fictional role experiences: actual navigation and scoped actions.
import sys
from harness import *
from playwright.sync_api import sync_playwright
build();srv,url=serve()
check=Check();errors=[]
act="([name,values])=>{let b=document.createElement('button');b.dataset.act=name;Object.assign(b.dataset,values||{});document.body.appendChild(b);b.click();b.remove()}"
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
        ctx,pg,_=page(browser,url+'?sandbox=1#home',width=width,height=844,errors=errors)
        pg.wait_for_selector('#view [data-role-workspace=personal_owner]')
        original=pg.evaluate('JSON.stringify(window.__team.ws)')
        check.ok(pg.locator('#view .persona-team-card').count()==18,
                 f'[{width}] Owner Home starts with eighteen usable fictional teams')
        check.ok(pg.locator('#tabs .nav-main').count()==5 and pg.locator('#view .qa-tiles').count()==0,
                 f'[{width}] actual app navigation replaces QA capability report')
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-07]')
        pg.wait_for_selector('#view [data-role-workspace=team_coach]')
        check.ok(pg.locator('#tabs [data-section=Training]').count()==1 and
                 pg.locator('#tabs [data-section="Match staff"]').count()==0,
                 f'[{width}] Coach has training navigation, no Manager-only staff page')
        pg.click('#tabs [data-section=Squad]')
        pg.wait_for_selector('#view [data-persona-screen=Squad]')
        item=pg.locator('#view [data-capability=roster]').first
        check.ok(item.count()==1 and pg.locator('#view .persona-list-row').count()>=20,
                 f'[{width}] Coach has actual populated roster and selection actions')
        before=item.inner_text()
        item.click()
        check.ok(pg.locator('#view [data-capability=roster]').first.inner_text()!=before,
                 f'[{width}] Coach roster change updates the fictional workflow')
        pg.click('#tabs [data-section=Training]')
        pg.locator('#view [data-capability=training]').first.click()
        check.ok('Ball skills' in pg.locator('#view .persona-content ul').inner_text(),
                 f'[{width}] Coach training plan action changes displayed data')
        # The screenshot case: one Club Admin serving two clubs sees all twelve
        # assigned teams and can change exact club scope.
        pg.click('#tabs [data-section=Home]')
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-05]')
        check.ok(pg.locator('#view .persona-team-card').count()==12,
                 f'[{width}] Large Club Admin Home shows both clubs and twelve teams')
        pg.locator('#view [data-act=persona-team][data-team=qa-comets-mixed]').click()
        check.ok(pg.locator('#view select[data-change=p12-context]').input_value()=='grant:club_admin:club:qa-comets',
                 f'[{width}] Club Admin team choice switches exact club group')
        pg.click('#tabs [data-section=People]')
        check.ok(pg.locator('#view [data-capability=roster]').count()==0 and
                 pg.locator('#view .persona-list-row').count()>=14,
                 f'[{width}] Club Admin sees scoped people but not Coach-only lineup action')

        # Manager assigned across different clubs through active role/group changes.
        pg.click('#tabs [data-section=Home]')
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-18]')
        pg.locator('#view select[data-change=p12-context]').select_option('grant:team_manager:team:qa-stars-women')
        pg.click('#tabs [data-section="Match staff"]')
        check.ok(pg.locator('#view [data-capability=staff]').count()>0,
                 f'[{width}] Manager has fictional volunteer proposals')
        pg.locator('#view [data-capability=staff]').first.click()
        check.ok('proposed trainer' in pg.locator('#view').inner_text(),
                 f'[{width}] Manager duty proposal updates selected team without accreditation grant')
        # Re-enter same identity as a player; Manager actions must disappear.
        pg.locator('#view select[data-change=p12-context]').select_option('membership:player:team:qa-comets-mixed')
        check.ok(pg.locator('#tabs [data-section="Match staff"]').count()==0 and
                 pg.locator('#view [data-capability=staff]').count()==0,
                 f'[{width}] switching to Player removes Manager tools')
        pg.evaluate(act,['persona-action',{'capability':'staff','person':'qa-stars-women-volunteer-1','value':'trainer'}])
        check.ok(pg.locator('#view [data-capability=staff]').count()==0,
                 f'[{width}] forged Manager click cannot grant Player action')
        # Multi-sport playing identity with independently scoped availability.
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-14]')
        check.ok(pg.locator('#view .persona-team-card').count()==2 and
                 'Oztag' in pg.locator('#view').inner_text() and
                 'Touch' in pg.locator('#view').inner_text(),
                 f'[{width}] multi-sport Player sees both team memberships')
        pg.click('#tabs [data-section=Availability]')
        pg.locator('#view [data-capability=own-availability][data-value=yes]').click()
        check.ok('Response: yes' in pg.locator('#view').inner_text(),
                 f'[{width}] Player can update own synthetic availability')
        pg.locator('#view select[data-change=p12-context]').select_option('membership:player:team:qa-stars-women')
        pg.click('#tabs [data-section=Availability]')
        check.ok('Response: pending' in pg.locator('#view').inner_text(),
                 f'[{width}] availability does not leak across multi-sport team contexts')
        pg.click('#tabs [data-section=Seasons]')
        check.ok(pg.locator('#view .persona-list-row').count()==6,
                 f'[{width}] Player sees sample history across two sports and three seasons')
        pg.click('#tabs [data-section=Home]')
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-19]')
        check.ok(pg.locator('#tabs .nav-main').count()==1 and
                 pg.locator('#view .persona-team-card').count()==0,
                 f'[{width}] revoked Coach never sees roster or team access')
        check.ok(pg.evaluate('JSON.stringify(window.__team.ws)')==original,
                 f'[{width}] all actions leave the prior workspace unchanged')
        ctx.close()
    result=check.done(errors);browser.close()
srv.shutdown();sys.exit(0 if result else 1)
