# Regression: the public development site's fictional Owner must select active
# teams from the loaded workspace, not only the unrelated P12 test-fixture IDs.
# Other role/group choices remain exact and do not union permissions.
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
        c.ok(pg.evaluate("window.__team.state.qaProfile")=='qa-01',
             f'[{width}] sandbox begins with fictional Owner, not a production login')
        # Reload the richer library like the owner does in Settings. The initial
        # P12 18-team demo has different IDs, which caused the original defect.
        pg.evaluate(act,['test-library',{}])
        pg.wait_for_function("window.__team.ws?.clubs?.some(c=>c.id==='tarenpointtitans')")
        W=lambda exp:pg.evaluate(f'(() => {{const W=window.__team.ws,D=window.__team.data,M=window.__team.M; return {exp};}})()')
        stable="async () => (await import('./test-library.js')).stable(window.__team.ws)"
        before=pg.evaluate(stable)
        c.ok(W("D.id")=='team1' and W("M.teamsOf(W).filter(t=>t.team.clubId==='tarenpointtitans').length")==4,
             f'[{width}] Owner test library contains DragonTag and four Titans squads')
        pg.locator('#view .scope-club[data-id=tarenpointtitans]').click()
        c.ok(W("D.team.clubId")=='tarenpointtitans'
             and 'Titans' in pg.locator('#team-title .t-name').inner_text()
             and pg.locator('#view .scope-club[data-id=tarenpointtitans][aria-pressed=true]').count()==1
             and pg.locator('#view .scope-team.editing').count()==1,
             f'[{width}] selecting Titans club aligns working team, banner and Home selection')
        # Reproduce the owner's previously saved mismatch: Titans is selected
        # on Home but an old browser copy still remembers DragonTag as active.
        pg.evaluate("""() => localStorage.setItem('tm-persona-sandbox-team','team1')""")
        pg.reload()
        pg.wait_for_function("window.__team?.data?.team?.clubId === 'tarenpointtitans'")
        c.ok(W("D.team.clubId")=='tarenpointtitans'
             and 'Titans' in pg.locator('#team-title .t-name').inner_text()
             and pg.locator('#view .scope-club[data-id=tarenpointtitans][aria-pressed=true]').count()==1,
             f'[{width}] previously stale persisted Home club heals the banner at reload')
        pg.evaluate(act,['tab',{'tab':'crew'}])
        c.ok(pg.locator('#view .crew-readiness-summary[data-scope=club]').count()==1
             and pg.locator('#view .crew-directory-results').count()==1
             and 'Taren Point Titans' in pg.locator('#view .crew-directory-results').inner_text()
             and pg.locator('#view [name=crewTeamId]').input_value()==W("D.id"),
             f'[{width}] selecting Titans club displays Titans club staff, not DragonTag')

        pg.evaluate(act,['tab',{'tab':'home'}])
        pg.locator('#view .scope-team[data-id=testleague]').click()
        c.ok(W("D.id")=='testleague'
             and W("M.teamSport(D.team,M.clubOf(W,D))")=='Rugby league'
             and 'Titans Under 16' in pg.locator('#team-title .t-name').inner_text()
             and W("JSON.parse(localStorage.getItem('tm-home-scope')).id")=='testleague',
             f'[{width}] selecting a Titans team changes real active team, sport and banner')
        for section in ('squad','training','matches','reports'):
            pg.evaluate(act,['tab',{'tab':section}])
            c.ok(W("D.id")=='testleague'
                 and 'Titans Under 16' in pg.locator('#team-title .t-name').inner_text(),
                 f'[{width}] {section} reads selected team rather than an independent banner filter')
        pg.evaluate(act,['tab',{'tab':'squad'}])
        c.ok('Noah Parker' in pg.locator('#view').inner_text()
             and 'Ava Kelleher' not in pg.locator('#view').inner_text(),
             f'[{width}] Squad contains selected Titans players, not DragonTag')
        pg.evaluate(act,['tab',{'tab':'crew'}])
        c.ok(pg.locator('#view .crew-readiness-summary[data-scope=team]').count()==1
             and 'Chris Example' in pg.locator('#view .crew-directory-results').inner_text()
             and 'Alex Sample' not in pg.locator('#view .crew-directory-results').inner_text(),
             f'[{width}] match staff and readiness follow the selected Titans team')
        pg.locator('#view [name=crewTeamId]').select_option('testtitansgirls12')
        c.ok(W("D.id")=='testtitansgirls12'
             and W("JSON.parse(localStorage.getItem('tm-home-scope')).id")=='testtitansgirls12'
             and 'Under 12 Girls' in pg.locator('#team-title .t-name').inner_text()
             and pg.locator('#view .crew-readiness-summary[data-scope=team]').count()==1,
             f'[{width}] in-page staff team picker updates Home filter and working team together')
        pg.evaluate(act,['tab',{'tab':'home'}])
        c.ok(pg.locator('#view .scope-team[data-id=testtitansgirls12][aria-pressed=true]').count()==1,
             f'[{width}] Home remembers exact team chosen in staff page')

        # The Owner's native Clubs/teams selector must work with library IDs,
        # and stale or forged IDs may not create a contradictory Home filter.
        pg.evaluate(act,['team-pick',{'id':'testtitansmixed10'}])
        c.ok(W("D.id")=='testtitansmixed10'
             and W("JSON.parse(localStorage.getItem('tm-home-scope')).id")=='testtitansmixed10',
             f'[{width}] native team picker changes real team and Home context')
        scope=W("JSON.stringify(JSON.parse(localStorage.getItem('tm-home-scope')))")
        pg.evaluate(act,['home-scope',{'kind':'team','id':'not-a-team'}])
        pg.evaluate(act,['home-scope',{'kind':'club','id':'not-a-club'}])
        pg.evaluate(act,['team-pick',{'id':'not-a-team'}])
        c.ok(W("D.id")=='testtitansmixed10'
             and W("JSON.stringify(JSON.parse(localStorage.getItem('tm-home-scope')))")==scope,
             f'[{width}] forged or stale team/club choices cannot desynchronise filter and banner')
        pg.evaluate(act,['home-scope',{'kind':'all','id':''}])
        c.ok(W("JSON.parse(localStorage.getItem('tm-home-scope')).kind")=='all'
             and W("D.id")=='testtitansmixed10'
             and pg.locator('#view .scope-club[data-kind=all][aria-pressed=true]').count()==1,
             f'[{width}] All clubs is a Home overview, not a silent switch of team records')
        c.ok(pg.evaluate(stable)==before,
             f'[{width}] all context switches leave test workspace records unchanged')
        ctx.close()

        # Keep the existing negative access regression for scoped QA roles.
        other,restricted,_=page(browser,url+'?sandbox=1#home',width=width,height=860,errors=errs)
        restricted.wait_for_selector('#home-profile-button')
        restricted.click('#home-profile-button')
        restricted.click('#home-profile-panel [data-profile=qa-07]')
        original=restricted.evaluate('window.__team.data.id')
        restricted.evaluate(act,['team-pick',{'id':'qacometsmixed'}])
        restricted.evaluate(act,['home-scope',{'kind':'club','id':'qa-comets'}])
        c.ok(original=='qarangers16' and restricted.evaluate('window.__team.data.id')==original
             and restricted.locator('#view .scope-club[data-id=qa-comets]').count()==0,
             f'[{width}] Coach cannot change into unassigned club/team by a forged action')
        restricted.locator('#view .scope-club[data-id=qa-stars]').click()
        c.ok(restricted.evaluate('window.__team.data.id')=='qastarsopen'
             and restricted.evaluate('window.__team.state.qaContext')=='grant:team_coach:team:qa-stars-open',
             f'[{width}] Coach still switches to explicitly assigned other-club team')
        restricted.click('#home-profile-button')
        restricted.click('#home-profile-panel [data-profile=qa-09]')
        current=restricted.evaluate('window.__team.data.id')
        restricted.evaluate(act,['team-pick',{'id':'qastarswomen'}])
        c.ok(current=='qacometsmixed'
             and restricted.evaluate('window.__team.data.id')==current
             and restricted.locator('#view .scope-club[data-id=qa-stars]').count()==0,
             f'[{width}] Manager cannot access an unassigned other-club team')
        other.close()
    ok=c.done(errs)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
