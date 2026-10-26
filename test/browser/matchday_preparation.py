# P11L read-only preparation summary, links only to existing non-Oztag disclosures.
import sys
from harness import *
from playwright.sync_api import sync_playwright
build();srv,url=serve()
c=Check();errors=[]
act="([a,ds])=>{const b=document.createElement('button');b.dataset.act=a;Object.assign(b.dataset,ds||{});document.body.appendChild(b);b.click();b.remove()}"
with sync_playwright() as p:
  browser=p.chromium.launch()
  for width,height in [(390,844),(820,1180),(1280,900)]:
    ctx,pg,_=page(browser,url+'#home',width=width,height=height,errors=errors)
    pg.get_by_text('Load a sample squad').click()
    mid=pg.evaluate("window.__team.data.matches.find(m=>m.opponent==='Hills Hornets').id")
    for sport in ['Rugby league','League tag','Touch football','Netball']:
      pg.evaluate('(s)=>{window.__team.data.team.sport=s}',sport)
      original=pg.evaluate('JSON.stringify(window.__team.ws)')
      pg.evaluate(act,['match-open',{'id':mid}])
      pg.wait_for_selector('#sheet .match-preparation')
      c.ok('not' in pg.inner_text('#sheet .match-preparation').lower() and
        pg.locator('#sheet form[data-form=match-result]').count()==0,
        f'[{width}] {sport} preparation does not introduce scorer')
      pg.click('#sheet .match-preparation [data-act=match-prep-jump][data-target=roster]')
      c.ok(pg.locator('#sheet .match-roster-readiness[open]').count()==1,
        f'[{width}] {sport} preparation opens existing fixture roster without writes')
      c.ok(pg.evaluate('JSON.stringify(window.__team.ws)')==original,
        f'[{width}] {sport} read-only preparation unchanged')
      c.ok(pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),
        f'[{width}] {sport} preparation fits width')
      pg.keyboard.press('Escape');pg.wait_for_selector('#sheet',state='hidden')
    pg.evaluate("(id)=>{window.__team.data.matches.find(m=>m.id===id).seasonId='orphan'}",mid)
    pg.evaluate(act,['match-open',{'id':mid}])
    c.ok(pg.locator('#sheet .match-preparation [data-act=match-prep-jump]').count()==0,
      f'[{width}] orphan fixture cannot navigate other season squad')
    pg.keyboard.press('Escape');pg.wait_for_selector('#sheet',state='hidden')
    pg.evaluate("(id)=>{const d=window.__team.data;d.team.sport='Oztag';d.matches.find(m=>m.id===id).seasonId=window.__team.M.activeSeason(d).id}",mid)
    pg.evaluate(act,['match-open',{'id':mid}])
    c.ok(pg.locator('#sheet .match-preparation').count()==0 and
      pg.locator('#sheet form[data-form=match-result]').count()==1,
      f'[{width}] original Oztag Match Day remains')
    ctx.close()
  ok=c.done(errors);browser.close()
srv.shutdown();sys.exit(0 if ok else 1)
