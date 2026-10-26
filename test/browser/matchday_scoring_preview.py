# P11C transient source-backed scoring calculation; synthetic coach data only.
import sys
from harness import *
from playwright.sync_api import sync_playwright
build(); srv,url=serve()
checks=Check(); errors=[]
act="([a,ds])=>{const b=document.createElement('button');b.dataset.act=a;Object.assign(b.dataset,ds||{});document.body.appendChild(b);b.click();b.remove()}"
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width,height in [(390,844),(1280,900)]:
        ctx,pg,_=page(browser,url+'#home',width=width,height=height,errors=errors)
        pg.get_by_text('Load a sample squad').click()
        mid=pg.evaluate("window.__team.data.matches.find(m=>m.opponent==='Hills Hornets').id")
        pg.evaluate(act,['match-open',{'id':mid}])
        pg.wait_for_selector('#sheet')
        checks.ok(pg.locator('#sheet .match-score-preview').count()==0 and
                  pg.locator('#sheet form[data-form=match-result]').count()==1,
                  f'[{width}] Oztag original score editor remains, no unsupported preview')
        pg.keyboard.press('Escape')
        pg.wait_for_selector('#sheet',state='hidden')
        pg.evaluate("() => Object.assign(window.__team.data.team,{sport:'Rugby league',rules:'league/men',ageGroup:'open',category:'men'})")
        baseline=pg.evaluate('JSON.stringify(window.__team.ws)')
        pg.evaluate(act,['match-open',{'id':mid}])
        pg.wait_for_selector('#sheet details.match-score-preview')
        pg.click('#sheet .match-score-preview summary')
        checks.ok('Not saved' in pg.inner_text('#sheet .match-score-preview') and
                  pg.locator('#sheet form[data-form=match-result]').count()==0,
                  f'[{width}] league example clearly not a match result')
        fields={
          'us-tries':'2','us-conversions':'1','us-fieldGoals':'1',
          'us-twoPointFieldGoals':'1','them-tries':'1','them-penaltyGoals':'1'
        }
        for name,val in fields.items():
            pg.fill('#sheet [data-form=score-preview] input[name="'+name+'"]',val)
        pg.click('#sheet [data-act=score-preview-calc]')
        checks.ok('Us 13 – Them 6' in pg.inner_text('#sheet .score-preview-output'),
                  f'[{width}] source-based five-event league points calculated')
        checks.ok(pg.evaluate('JSON.stringify(window.__team.ws)')==baseline,
                  f'[{width}] preview calculates with no workspace changes')
        checks.ok(pg.locator('#sheet .match-score-preview button[type=submit]').count()==0,
                  f'[{width}] score simulator has no save/submit button')
        pg.fill('#sheet [data-form=score-preview] input[name=us-tries]','100')
        pg.click('#sheet [data-act=score-preview-calc]')
        checks.ok('nothing has been saved' in pg.inner_text('#sheet .score-preview-output'),
                  f'[{width}] out of bounds count rejected')
        checks.ok(pg.evaluate('JSON.stringify(window.__team.ws)')==baseline,
                  f'[{width}] invalid simulation also makes no data changes')
        pg.keyboard.press('Escape')
        pg.wait_for_selector('#sheet',state='hidden')
        pg.evaluate(act,['match-open',{'id':mid}])
        pg.click('#sheet .match-score-preview summary')
        checks.ok(pg.input_value('#sheet input[name=us-tries]')=='0',
                  f'[{width}] closing and reopening clears simulation')
        pg.keyboard.press('Escape')
        pg.wait_for_selector('#sheet',state='hidden')
        pg.evaluate("() => Object.assign(window.__team.data.team,{sport:'League tag',rules:'league-tag/15',category:'women'})")
        pg.evaluate(act,['match-open',{'id':mid}])
        pg.click('#sheet .match-score-preview summary')
        checks.ok(pg.locator('#sheet input[name=us-dropGoals]').count()==1 and
                  pg.locator('#sheet input[name=us-twoPointFieldGoals]').count()==0,
                  f'[{width}] League tag drops do not borrow international two-point field goals')
        pg.fill('#sheet input[name=us-tries]','1')
        pg.fill('#sheet input[name=us-dropGoals]','2')
        pg.click('#sheet [data-act=score-preview-calc]')
        checks.ok('Us 6 – Them 0' in pg.inner_text('#sheet .score-preview-output'),
                  f'[{width}] source-specific League tag points calculated')
        pg.keyboard.press('Escape')
        pg.wait_for_selector('#sheet',state='hidden')
        for sport,rules in [('Rugby league','league/u8'),('League tag','league-tag/10-12'),
                            ('Touch football','league/men'),('Netball','')]:
            pg.evaluate("(x)=>Object.assign(window.__team.data.team,x)",{'sport':sport,'rules':rules})
            pg.evaluate(act,['match-open',{'id':mid}])
            checks.ok(pg.locator('#sheet .match-score-preview').count()==0 and
                      pg.locator('#sheet form[data-form=match-result]').count()==0,
                      f'[{width}] {sport} with {rules} does not infer an unapproved scoring type')
            pg.keyboard.press('Escape')
            pg.wait_for_selector('#sheet',state='hidden')
        # Deliberately selecting the adult law pack for a youth team does not bypass the age guard.
        pg.evaluate("() => Object.assign(window.__team.data.team,{sport:'Rugby league',rules:'league/men',ageGroup:'u16',category:'boys'})")
        pg.evaluate(act,['match-open',{'id':mid}])
        checks.ok(pg.locator('#sheet .match-score-preview').count()==0,
                  f'[{width}] junior team cannot use an adult rule pack by accident')
        pg.keyboard.press('Escape')
        pg.wait_for_selector('#sheet',state='hidden')
        checks.ok(pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),
                  f'[{width}] no horizontal overflow')
        ctx.close()
    ok=checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
