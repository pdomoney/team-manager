# P11D — exact fixture-scope score-preview guard, synthetic coach data.
import sys
from harness import *
from playwright.sync_api import sync_playwright
build(); srv,url=serve()
checks=Check();errors=[]
act="([a,ds])=>{const b=document.createElement('button');b.dataset.act=a;Object.assign(b.dataset,ds||{});document.body.appendChild(b);b.click();b.remove()}"
with sync_playwright() as p:
  browser=p.chromium.launch()
  for width,height in [(390,844),(1280,900)]:
    ctx,pg,_=page(browser,url+'#home',width=width,height=height,errors=errors)
    pg.get_by_text('Load a sample squad').click()
    mid=pg.evaluate("window.__team.data.matches.find(m=>m.opponent==='Hills Hornets').id")
    pg.evaluate("() => Object.assign(window.__team.data.team,{sport:'Rugby league',rules:'league/men',ageGroup:'open',category:'men'})")
    # A dangling competition entry blocks preview even for an otherwise valid team rulebook.
    pg.evaluate("(mid)=>{window.__team.data.matches.find(m=>m.id===mid).entryId='orphan-entry'}",mid)
    base=pg.evaluate("JSON.stringify(window.__team.ws)")
    pg.evaluate(act,['match-open',{'id':mid}])
    pg.wait_for_selector('#sheet')
    checks.ok(pg.locator('#sheet .match-score-preview').count()==0 and
              'competition link cannot be resolved' in pg.inner_text('#sheet'),
              f'[{width}] orphan competition entry blocks source score example')
    checks.ok(pg.evaluate("JSON.stringify(window.__team.ws)")==base,
              f'[{width}] orphan fixture view is read-only')
    pg.keyboard.press('Escape')
    pg.wait_for_selector('#sheet',state='hidden')
    # A standalone training fixture may show example points, never an approved match result.
    pg.evaluate("(mid)=>{window.__team.data.matches.find(m=>m.id===mid).entryId=''}",mid)
    pg.evaluate(act,['match-open',{'id':mid}])
    pg.wait_for_selector('#sheet details.match-score-preview')
    pg.click('#sheet .match-score-preview summary')
    checks.ok(pg.locator('#sheet .match-score-preview').count()==1 and
              pg.locator('#sheet form[data-form=match-result]').count()==0,
              f'[{width}] unlinked fixture offers only read-only source simulation')
    # A previously opened panel must fail closed if fixture binding changes.
    pg.fill('#sheet [data-form=score-preview] input[name=us-tries]','2')
    pg.evaluate("(mid)=>{window.__team.data.matches.find(m=>m.id===mid).entryId='orphan-entry'}",mid)
    prior=pg.evaluate("JSON.stringify(window.__team.ws)")
    pg.click('#sheet [data-act=score-preview-calc]')
    checks.ok('Preview unavailable' in pg.inner_text('#sheet .score-preview-output'),
              f'[{width}] stale open form recalculates fixture gate and refuses preview')
    checks.ok(pg.evaluate("JSON.stringify(window.__team.ws)")==prior,
              f'[{width}] stale preview cannot modify workspace')
    checks.ok(pg.evaluate("document.documentElement.scrollWidth<=innerWidth+1"),
              f'[{width}] no horizontal overflow')
    ctx.close()
  ok=checks.done(errors)
  browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
