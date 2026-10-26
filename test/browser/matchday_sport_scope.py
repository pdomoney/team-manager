# P11 Match Day first sport-aware fail-closed boundary. Synthetic coach data only.
import sys
from harness import *
from playwright.sync_api import sync_playwright
build(); srv,url=serve()
checks=Check(); errors=[]
act="([a,ds])=>{const b=document.createElement('button');b.dataset.act=a;Object.assign(b.dataset,ds||{});document.body.appendChild(b);b.click();b.remove()}"
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width,height in [(390,844),(820,1180),(1280,900)]:
        ctx,pg,_=page(browser,url+'#home',width=width,height=height,errors=errors)
        pg.get_by_text('Load a sample squad').click()
        pg.wait_for_selector('#view')
        mid=pg.evaluate("window.__team.data.matches.find(m=>m.opponent==='Hills Hornets').id")
        for sport in ['Rugby League','League Tag','Touch','Netball']:
            pg.evaluate("(sport)=>{window.__team.data.team.sport=sport}",sport)
            before=pg.evaluate("JSON.stringify(window.__team.data.matches)")
            pg.evaluate(act,['match-open',{'id':mid}])
            pg.wait_for_selector('#sheet .panel-body')
            text=pg.inner_text('#sheet')
            checks.ok('sport-specific lineup is not configured' in text.lower() and sport in text,
                      f'[{width}] {sport}: sport-specific lineup visibly unavailable')
            checks.ok('Scoring controls' in text and 'approved competition format' in text,
                      f'[{width}] {sport}: safe unsupported scoring notice')
            checks.ok(pg.locator('#sheet form[data-form=match-result]').count()==0 and
                      pg.locator('#sheet form[data-form=match-lineup]').count()==0,
                      f'[{width}] {sport}: no eight-slot/try editor controls')
            checks.ok('Our tries' not in text and 'Make the match lineup' not in text,
                      f'[{width}] {sport}: no Oztag-specific action copy')
            checks.ok(pg.evaluate('JSON.stringify(window.__team.data.matches)')==before,
                      f'[{width}] {sport}: opening detail never changes historic matches')
            checks.ok(pg.evaluate('document.documentElement.scrollWidth <= innerWidth+1'),
                      f'[{width}] {sport}: no viewport overflow')
            pg.keyboard.press('Escape')
            pg.wait_for_selector('#sheet',state='hidden')
        pg.evaluate("window.__team.data.team.sport='Oztag'")
        pg.evaluate(act,['match-open',{'id':mid}])
        pg.wait_for_selector('#sheet form[data-form=match-result]')
        checks.ok(pg.locator('#sheet input[name=us]').count()==1 and
                  pg.locator('#sheet input[name=them]').count()==1,
                  f'[{width}] Oztag retains legacy result editor')
        checks.ok(pg.locator('#sheet form[data-form=match-lineup]').count()==1,
                  f'[{width}] Oztag retains match lineup creation')
        ctx.close()
    ok=checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
