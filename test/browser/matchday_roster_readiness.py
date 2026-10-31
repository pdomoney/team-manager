# P11G: coach-only read-only match roster for sports without approved lineups.
import sys
from harness import *
from playwright.sync_api import sync_playwright
build();srv,url=serve()
checks=Check();errors=[]
act="([a,ds])=>{const b=document.createElement('button');b.dataset.act=a;Object.assign(b.dataset,ds||{});document.body.appendChild(b);b.click();b.remove()}"
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width,height in [(390,844),(820,1180),(1280,900)]:
        ctx,pg,_=page(browser,url+'#home',width=width,height=height,errors=errors)
        pg.get_by_text('Load a sample squad').click()
        pg.wait_for_selector('#view')
        mid=pg.evaluate("window.__team.data.matches.find(m=>m.opponent==='Hills Hornets').id")
        for sport in ['Rugby league','League tag','Touch football','Netball']:
            pg.evaluate("(sport)=>{window.__team.data.team.sport=sport}",sport)
            baseline=pg.evaluate("JSON.stringify(window.__team.ws)")
            pg.evaluate(act,['match-open',{'id':mid}])
            pg.wait_for_selector('#sheet details.match-roster-readiness')
            pg.click('#sheet details.match-roster-readiness summary')
            block=pg.locator('#sheet details.match-roster-readiness')
            content=block.inner_text()
            count=pg.locator('#sheet .roster-readiness-group').count()
            checks.ok(count==4 and 'recorded players' in content and 'not a match lineup' in content,
                f'[{width}] {sport}: grouped view explicitly not a lineup')
            checks.ok(pg.locator('#sheet .roster-readiness-group h4').count()==4 and
                pg.locator('#sheet form[data-form=match-lineup]').count()==0 and
                pg.locator('#sheet form[data-form=match-result]').count()==0,
                f'[{width}] {sport}: 4 RSVP cohorts with no borrowed scoring/lineup editor')
            # Venue arrivals are deliberately editable ON the fixture date. On
            # earlier CI runs this sample fixture was not yet today (runner UTC),
            # so the outdated 'no buttons' check passed accidentally. Review and
            # check-in actions are valid, but never imply lineup/score eligibility.
            actions=block.locator('button[data-act]').evaluate_all(
                '(nodes)=>nodes.map(n=>n.dataset.act)')
            allowed={'rsvp-open','roster-player-rsvp','roster-arrival-toggle'}
            checks.ok('position preferences' in content.lower() and
                'not verified assignments' in content.lower() and
                all(a in allowed for a in actions) and
                block.locator('form[data-form=match-lineup],form[data-form=match-result]').count()==0,
                f'[{width}] {sport}: only review/check-in actions, never lineup/score: {actions}')
            checks.ok(pg.evaluate('JSON.stringify(window.__team.ws)')==baseline,
                f'[{width}] {sport}: roster rendering never writes shared workspace')
            checks.ok(pg.evaluate('document.documentElement.scrollWidth <= innerWidth+1'),
                f'[{width}] {sport}: no horizontal viewport overflow')
            pg.keyboard.press('Escape')
            pg.wait_for_selector('#sheet',state='hidden')
        pg.evaluate("(id)=>{window.__team.data.matches.find(m=>m.id===id).seasonId='orphaned-season'}",mid)
        baseline=pg.evaluate('JSON.stringify(window.__team.ws)')
        pg.evaluate(act,['match-open',{'id':mid}])
        pg.wait_for_selector('#sheet')
        text=pg.inner_text('#sheet')
        checks.ok('match has no resolved season' in text.lower() and
            pg.locator('#sheet .roster-readiness-group').count()==0,
            f'[{width}] orphan season never silently borrows active-season squad')
        checks.ok(pg.evaluate('JSON.stringify(window.__team.ws)')==baseline,
            f'[{width}] unknown season keeps records unchanged')
        pg.keyboard.press('Escape')
        pg.wait_for_selector('#sheet',state='hidden')
        pg.evaluate("(id)=>{const m=window.__team.data.matches.find(m=>m.id===id);m.seasonId=window.__team.M.activeSeason(window.__team.data).id;window.__team.data.team.sport='Oztag'}",mid)
        pg.evaluate(act,['match-open',{'id':mid}])
        pg.wait_for_selector('#sheet form[data-form=match-result]')
        checks.ok(pg.locator('#sheet details.match-roster-readiness').count()==0 and
            pg.locator('#sheet form[data-form=match-result]').count()==1,
            f'[{width}] Oztag retains established score editor without duplicate readiness view')
        ctx.close()
    ok=checks.done(errors)
    browser.close()
srv.shutdown();sys.exit(0 if ok else 1)
