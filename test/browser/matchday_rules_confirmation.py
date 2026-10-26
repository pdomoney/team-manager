# P11E: exact scoped organiser confirmation checklist, copy only on coach action.
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
    mid=pg.evaluate("window.__team.data.matches.find(m=>m.opponent==='Hills Hornets').id")
    pg.evaluate("""() => Object.defineProperty(navigator,'clipboard',{
       configurable:true,value:{writeText:async(text)=>{window.__copiedRules=text}}
    })""")
    pg.evaluate("(id)=>{window.__team.data.matches.find(m=>m.id===id).notes='PRIVATE PLAYER HEALTH NOTE - DO NOT COPY'}",mid)
    before=pg.evaluate("JSON.stringify(window.__team.ws)")
    pg.evaluate(act,['match-open',{'id':mid}])
    pg.wait_for_selector('#sheet details.match-format-review')
    pg.click('#sheet details.match-format-review summary')
    section=pg.locator('#sheet .match-rules-request')
    checks.ok(section.is_visible() and 'Request competition rule confirmation' in section.inner_text(),
              f'[{width}] rules review lives inside existing Match details disclosure')
    checks.ok(section.locator('ol li').count()==5 and
              'No message is sent' in section.inner_text(),
              f'[{width}] five competition review questions without implied sending')
    pg.click('#sheet [data-act=match-rules-copy]')
    pg.wait_for_function("() => typeof window.__copiedRules==='string' && window.__copiedRules.includes('STATUS: Not independently verified')")
    copied=pg.evaluate("window.__copiedRules")
    checks.ok('Oztag' in copied and 'PLEASE CONFIRM WITH THE ORGANISER' in copied,
              f'[{width}] coach explicitly copies a bounded rules confirmation request')
    checks.ok('PRIVATE PLAYER HEALTH NOTE' not in copied and
              'Mia Tuala' not in copied and 'Josh Halloran' not in copied and
              'private-match' not in copied,
              f'[{width}] copied request excludes private player details and match notes')
    checks.ok(pg.evaluate('JSON.stringify(window.__team.ws)')==before,
              f'[{width}] copying does not mutate matches, team data or rules')
    # A previously opened review sheet must recompute current team sport at copy time.
    pg.evaluate("() => Object.assign(window.__team.data.team,{sport:'Rugby league',rules:'league/u8',ageGroup:'u8',category:'boys'})")
    pg.evaluate("window.__copiedRules=null")
    pg.click('#sheet [data-act=match-rules-copy]')
    pg.wait_for_function("() => !!window.__copiedRules")
    copied=pg.evaluate("window.__copiedRules")
    checks.ok('Sport: Rugby league' in copied and 'Age group: u8' in copied and
              'App reference pack: league/u8' in copied,
              f'[{width}] stale review recomputes latest current sport and age before copying')
    pg.keyboard.press('Escape')
    pg.wait_for_selector('#sheet',state='hidden')
    pg.evaluate("(id)=>{window.__team.data.matches.find(m=>m.id===id).entryId='orphan-entry'}",mid)
    before2=pg.evaluate("JSON.stringify(window.__team.ws)")
    pg.evaluate(act,['match-open',{'id':mid}])
    pg.click('#sheet details.match-format-review summary')
    checks.ok('Resolve the fixture competition entry.' in pg.inner_text('#sheet .match-rules-request'),
              f'[{width}] orphaned fixture entry is a visible actionable blocker')
    pg.evaluate("window.__copiedRules=null")
    pg.click('#sheet [data-act=match-rules-copy]')
    pg.wait_for_function("() => !!window.__copiedRules")
    checks.ok('Resolve the fixture competition entry.' in pg.evaluate('window.__copiedRules') and
              pg.evaluate('JSON.stringify(window.__team.ws)')==before2,
              f'[{width}] copied orphan warning, no fixture updates')
    checks.ok(pg.evaluate("document.documentElement.scrollWidth<=innerWidth+1"),
              f'[{width}] rules checklist has no page-level horizontal overflow')
    ctx.close()
  ok=checks.done(errors)
  browser.close()
srv.shutdown();sys.exit(0 if ok else 1)
