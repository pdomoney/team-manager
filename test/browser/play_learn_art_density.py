# B4.10: desktop Learn art should be lean while the approved phone
# teaching board, step buttons and role highlights remain unchanged.
# Synthetic Chromium only, not macOS/iPhone Safari acceptance.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv,url=serve()
checks,errors=Check(),[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,853,1280):
        ctx,pg,_=page(browser,url+'#home',width=width,height=820,errors=errors)
        pg.get_by_text('Load a sample squad').click()
        pg.goto(url+'#plays')
        pg.locator('.play-row[data-id=quickie-out]').click()
        before=pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(q=>q.id==='quickie-out'))""")
        pg.locator('[data-act=play-mode][data-mode=learn]').click()

        def artwork():
            return pg.evaluate("""() => {
                const svg=document.querySelector('#play-fig svg.pf.study');
                const icon=svg?.querySelector('[data-pl="LM"] circle.pl');
                return {
                  width:svg?.getBoundingClientRect().width||0,
                  icon:icon?.getBoundingClientRect().width||0,
                  scale:Number(svg?.dataset.learnArtScale||1),
                  flagged:svg?.classList.contains('learn-art')||false,
                  overflow:document.documentElement.scrollWidth-innerWidth,
                  cue:document.querySelector('#play-fig .study-cue')?.textContent||''
                };
            }""")
        initial=artwork()
        expected=(24*initial['width']/380 if initial['width']<=570 else 36)
        checks.ok(abs(initial['icon']-expected)<=2 and initial['overflow']<=2,
                  f'[{width}] desktop Learn player size capped, phone natural: {initial!r}, expected={expected}')
        if initial['width']<=570:
            checks.ok(not initial['flagged'],
                      f'[{width}] phone Learn retains original untouched SVG art')
        else:
            checks.ok(initial['flagged'] and initial['scale']<1,
                      f'[{width}] wider Learn uses independent compact art')
        pg.locator('[data-act=study-next]').click()
        second=artwork()
        checks.ok(second['cue']!=initial['cue'] and
                  abs(second['icon']-initial['icon'])<=2 and
                  pg.locator('#play-fig [aria-current=step]').count()==1,
                  f'[{width}] next step retains scale and study selection')
        pg.locator('[data-change=study-role]').select_option('LM')
        checks.ok(pg.locator('#play-fig .plg.study-target').count()==1,
                  f'[{width}] role highlighting preserved')
        pg.locator('[data-act=play-side][data-side=left]').click()
        checks.ok(pg.locator('#play-fig svg.pf.study').get_attribute('aria-label').endswith('attacking left'),
                  f'[{width}] Learn mirroring preserved')
        pg.set_viewport_size({'width':width+210,'height':820})
        pg.wait_for_timeout(100)
        resized=artwork()
        expected=(24*resized['width']/380 if resized['width']<=570 else 36)
        checks.ok(abs(resized['icon']-expected)<=2 and
                  resized['cue']==second['cue'] and
                  resized['overflow']<=2,
                  f'[{width}] resizing updates artwork without resetting step: {resized!r}')
        pg.locator('[data-act=play-mode][data-mode=watch]').click()
        checks.ok(pg.locator('#play-fig svg.pf.watch-art').count()==1 and
                  pg.locator('#play-fig svg.pf.learn-art').count()==0,
                  f'[{width}] Watch keeps separate renderer')
        checks.ok(pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(q=>q.id==='quickie-out'))""")==before,
                  f'[{width}] presentation and steps do not mutate stored Step Out')
        ctx.close()
    ok=checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
