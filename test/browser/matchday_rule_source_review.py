# P11B: exact match competition scope and rule references, no automatic policy approval.
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
        mid=pg.evaluate("window.__team.data.matches.find(m=>m.opponent==='Hills Hornets').id")
        before=pg.evaluate("JSON.stringify(window.__team.data.matches)")
        # Oztag: old sport UI still works, but a rule reference never grants local authorisation.
        pg.evaluate(act,['match-open',{'id':mid}])
        pg.wait_for_selector('#sheet details.match-format-review')
        pg.click('#sheet details.match-format-review summary')
        checks.ok('Oztag' in pg.inner_text('#sheet .match-format-review') and
                  'owner-approved scoring configuration are outstanding' in pg.inner_text('#sheet .match-format-review'),
                  f'[{width}] Oztag source reference visibly distinguished from competition approval')
        checks.ok(pg.locator('#sheet .match-format-review a[target=_blank][rel="noopener noreferrer"]').count()>=1,
                  f'[{width}] existing official reference is safe external link')
        checks.ok(pg.locator('#sheet form[data-form=match-result]').count()==1,
                  f'[{width}] historical Oztag result flow unchanged')
        pg.keyboard.press('Escape')
        pg.wait_for_selector('#sheet',state='hidden')
        pg.evaluate("(x)=>{Object.assign(window.__team.data.team,x)}",
          {'sport':'Rugby league','rules':'league/u8','ageGroup':'u8','category':'boys'})
        pg.evaluate(act,['match-open',{'id':mid}])
        pg.wait_for_selector('#sheet details.match-format-review')
        pg.click('#sheet details.match-format-review summary')
        detail=pg.inner_text('#sheet .match-format-review')
        checks.ok('Rugby league' in detail and 'u8' in detail and 'boys' in detail,
                  f'[{width}] Rugby league review shows exact sport and grade/category')
        checks.ok('2026-national-6-12-junior-league-laws.pdf' in
                  pg.get_attribute('#sheet .match-format-review a','href'),
                  f'[{width}] grade-specific reference points to recorded official junior laws')
        checks.ok('competition' in detail.lower() and 'review' in detail.lower() and
                  pg.locator('#sheet form[data-form=match-result]').count()==0,
                  f'[{width}] non-Oztag match still has no generic tries editor')
        pg.keyboard.press('Escape')
        pg.wait_for_selector('#sheet',state='hidden')
        pg.evaluate("(x)=>{Object.assign(window.__team.data.team,x)}",
          {'sport':'Netball','rules':'','ageGroup':'','category':''})
        pg.evaluate(act,['match-open',{'id':mid}])
        pg.click('#sheet details.match-format-review summary')
        detail=pg.inner_text('#sheet .match-format-review')
        checks.ok('No applicable, trusted rules source' in detail and 'Not specified' in detail,
                  f'[{width}] Netball shows unconfigured source and missing scope')
        checks.ok(pg.locator('#sheet .match-format-review a').count()==0 and
                  pg.locator('#sheet form[data-form=match-result]').count()==0,
                  f'[{width}] Netball no borrowed rules, no score editing')
        checks.ok(pg.evaluate('JSON.stringify(window.__team.data.matches)')==before,
                  f'[{width}] source-panel use does not alter historical matches')
        checks.ok(pg.evaluate('document.documentElement.scrollWidth <= innerWidth+1'),
                  f'[{width}] source panel does not create horizontal overflow')
        ctx.close()
    ok=checks.done(errors)
    browser.close()
srv.shutdown();sys.exit(0 if ok else 1)
