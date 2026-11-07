# Native role switching must stay useful after loading the real-club / fictional
# Titans test library. No production credentials, genuine staff or authorisation.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv,url=serve()
c,errs=Check(),[]
act="([a,ds])=>{const b=document.createElement('button');b.dataset.act=a;Object.assign(b.dataset,ds||{});document.body.appendChild(b);b.click();b.remove();}"

with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
        ctx,pg,_=page(browser,url+'?sandbox=1#home',width=width,height=860,errors=errs)
        pg.wait_for_selector('#home-profile-button')
        c.ok(pg.evaluate('window.__team.M.teamsOf(window.__team.ws).length')==18,
             f'[{width}] original P12 role fixture begins with 18 fictional teams')
        # The original role context still works before the Titans library is loaded.
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-09]')
        c.ok(pg.evaluate('window.__team.data.id')=='qacometsmixed'
             and 'No assigned team' not in pg.locator('#view').inner_text(),
             f'[{width}] original fictional Manager team works unchanged')
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-01]')
        pg.evaluate(act,['test-library',{}])
        pg.wait_for_function("window.__team.ws?.clubs?.some(c=>c.id==='tarenpointtitans')")
        c.ok(pg.evaluate("window.__team.M.teamsOf(window.__team.ws).filter(t=>t.team.clubId==='tarenpointtitans').length")==4,
             f'[{width}] replaceable library has four Titans teams with histories')
        stable="async () => (await import('./test-library.js')).stable(window.__team.ws)"
        unchanged=pg.evaluate(stable)

        pg.click('#home-profile-button')
        c.ok('Alex Sample' in pg.locator('#home-profile-panel').inner_text()
             and 'Morgan Example' in pg.locator('#home-profile-panel').inner_text()
             and 'Jules Example' in pg.locator('#home-profile-panel').inner_text(),
             f'[{width}] profile picker identifies the linked fictional Titans staff')
        pg.click('#home-profile-panel [data-profile=qa-07]')
        c.ok(pg.evaluate('window.__team.data.id')=='testtitans'
             and 'Alex Sample' in pg.locator('#view .home-profile-identity').inner_text()
             and 'No assigned team' not in pg.locator('#view').inner_text()
             and 'Titans' in pg.locator('#team-title').inner_text(),
             f'[{width}] Head Coach opens the Titans squad on existing native Home')
        pg.evaluate(act,['tab',{'tab':'squad'}])
        c.ok('Sienna Mercer' in pg.locator('#view').inner_text()
             and 'Ava Kelleher' not in pg.locator('#view').inner_text(),
             f'[{width}] Coach sees the linked Titans player records, not P12 or DragonTag')
        pg.evaluate(act,['tab',{'tab':'home'}])
        pg.locator('#view select[data-change=native-persona-context]').select_option(
          'titans-demo:qa-07:team_coach:team:testtitansgirls12')
        c.ok(pg.evaluate('window.__team.data.id')=='testtitansgirls12'
             and pg.evaluate('window.__team.state.qaContext')=='titans-demo:qa-07:team_coach:team:testtitansgirls12'
             and 'Dana Sample' in pg.locator('#view .home-profile-identity').inner_text(),
             f'[{width}] explicit second Coach team and group switch follows its recorded staff')
        pg.evaluate(act,['tab',{'tab':'squad'}])
        c.ok('Ava Kendall' in pg.locator('#view').inner_text()
             and 'Sienna Mercer' not in pg.locator('#view').inner_text(),
             f'[{width}] changing Coach team also changes the squad')

        pg.evaluate(act,['tab',{'tab':'home'}])
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-08]')
        c.ok(pg.evaluate('window.__team.data.id')=='testtitans'
             and 'Billie Sample' in pg.locator('#view .home-profile-identity').inner_text(),
             f'[{width}] assistant coach is assigned to actual demo team')
        pg.evaluate(act,['tab',{'tab':'plays'}])
        c.ok(pg.evaluate("window.__team.state.tab")=='plays'
             and pg.locator('#view [data-act=play-new]').count()==1
             and not pg.locator('#view [data-act=play-new]').is_enabled(),
             f'[{width}] Assistant Coach retains Tactics viewing but not Coach play-edit actions')

        pg.evaluate(act,['tab',{'tab':'home'}])
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-09]')
        c.ok(pg.evaluate('window.__team.data.id')=='testtitans'
             and 'Morgan Example' in pg.locator('#view .home-profile-identity').inner_text()
             and pg.locator('#tabs [data-g=tactics]').count()==0
             and 'No assigned team' not in pg.locator('#view').inner_text(),
             f'[{width}] Manager opens its assigned Titans role without coaching Tactics')
        pg.locator('#view select[data-change=native-persona-context]').select_option(
          'titans-demo:qa-09:team_manager:team:testleague')
        c.ok(pg.evaluate('window.__team.data.id')=='testleague'
             and 'Riley Example' in pg.locator('#view .home-profile-identity').inner_text(),
             f'[{width}] Manager changes to explicit Titans U16 assignment')
        pg.evaluate(act,['tab',{'tab':'crew'}])
        c.ok('Riley Example' in pg.locator('#view .crew-directory-results').inner_text()
             and 'Morgan Example' not in pg.locator('#view .crew-directory-results').inner_text()
             and pg.locator('#view .crew-readiness-summary[data-scope=team]').count()==1,
             f'[{width}] Match staff shows only assigned Titans Manager team')
        pg.evaluate(act,['tab',{'tab':'home'}])
        # A forged context must not switch Manager outside the mapped two teams.
        original=pg.evaluate('window.__team.data.id')
        pg.evaluate(act,['team-pick',{'id':'testtitansgirls12'}])
        c.ok(pg.evaluate('window.__team.data.id')==original,
             f'[{width}] forged Manager team selection cannot see other Titans squads')

        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-12]')
        c.ok(pg.evaluate('window.__team.data.id')=='testtitans'
             and pg.evaluate("window.__team.state.preview") is True
             and 'Jules Example' in pg.locator('#view .home-profile-identity').inner_text()
             and 'Trainer' in pg.locator('#view .home-profile-identity').inner_text()
             and 'No assigned team' not in pg.locator('#view').inner_text(),
             f'[{width}] Trainer has a selected team but remains a read-only participant')
        pg.evaluate(act,['add-player',{}])
        c.ok(pg.evaluate("document.querySelector('#sheet').hidden")
             and pg.locator('#tabs [data-g=tactics]').count()==0
             and pg.locator('#view [data-change=native-persona-context]').count()==1,
             f'[{width}] trainer membership cannot perform coaching edits')
        pg.locator('#view select[data-change=native-persona-context]').select_option(
          'titans-demo:qa-12:staff:team:testtitansmixed10')
        c.ok(pg.evaluate('window.__team.data.id')=='testtitansmixed10'
             and 'Lee Example' in pg.locator('#view .home-profile-identity').inner_text(),
             f'[{width}] trainer role/group selector follows a second recorded Titans team')

        # Revoked and pending identities remain denied, even with a demo library.
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-19]')
        c.ok(pg.locator('#tabs .nav-group').count()==1
             and pg.evaluate('window.__team.state.tab')=='home',
             f'[{width}] revoked Coach still cannot see another team')
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-20]')
        c.ok(pg.evaluate('window.__team.state.tab')=='home'
             and pg.locator('#tabs [data-g=team]').count()==0,
             f'[{width}] pending Manager invitation remains without team authority')
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-01]')
        c.ok(pg.evaluate(stable)==unchanged
             and pg.locator('#tabs .nav-group').count()==5,
             f'[{width}] profile changes never modify the original Titans test records')
        c.ok(pg.evaluate('document.documentElement.scrollWidth <= innerWidth+1'),
             f'[{width}] mobile/desktop profiles do not overflow horizontally')
        ctx.close()
    ok=c.done(errs)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
