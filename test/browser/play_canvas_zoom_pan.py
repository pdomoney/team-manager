# Regression for the coach's screenshot: the play is too small and hard to edit.
# Synthetic workspace only; Safari acceptance is an independent owner check.
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
        pg.locator('.play-row[data-id=quickie-in]').click()
        original=pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(p=>p.id==='quickie-in'))""")
        pg.locator('[data-act=play-edit]').click()
        pg.locator('[data-act=ped-tab][data-tab=diagram]').click()
        metrics=pg.evaluate("""() => {
          const card=document.querySelector('#ped-field').closest('.ped-card');
          const svg=card.querySelector('svg');
          return {scale:svg.getBoundingClientRect().width/
            document.querySelector('#ped-field').getBoundingClientRect().width,
            cardWidth:card.clientWidth,contentWidth:card.scrollWidth,
            cardHeight:card.clientHeight,contentHeight:card.scrollHeight,
            scrollTop:card.scrollTop,tool:!!document.querySelector('[data-t=pan]')};
        }""")
        checks.ok(metrics['scale']<=1.01 and metrics['tool'],
                  f'[{width}] editor starts at fit view with a pan tool: {metrics!r}')
        checks.ok(metrics['contentWidth']>=metrics['cardWidth'],
                  f'[{width}] fit view retains a real canvas scroll container: {metrics!r}')
        checks.ok(metrics['contentHeight']>=metrics['cardHeight'],
                  f'[{width}] short plays fit vertically while taller plays can scroll: {metrics!r}')
        zoom=pg.locator('#ped-zoom-value')
        initial=zoom.inner_text()
        start=int(initial.split('%')[0].split('·')[-1].strip())
        checks.ok('Fit' in initial and 10<=start<100,
                  f'[{width}] opens with a fitted view below 100%, not an arbitrary 150%: {initial}')
        pg.locator('[data-act=ped-zoom-in]').click()
        enlarged=int(zoom.inner_text().replace('%',''))
        checks.ok(enlarged>start,f'[{width}] manual zoom in from Fit')
        pg.locator('[data-act=ped-zoom-out]').click()
        checks.ok(int(zoom.inner_text().replace('%',''))==start,
                  f'[{width}] zoom out restores previous displayed scale')
        # Force a large working view to exercise two-axis panning and
        # verify scroll survives SVG redraw when Snap is toggled.
        for _ in range(9):
            pg.locator('[data-act=ped-zoom-in]').click()
        grown=pg.evaluate("""() => {
          const c=document.querySelector('#ped-field').closest('.ped-card');
          return {visible:c.clientWidth,content:c.scrollWidth};
        }""")
        checks.ok(grown['content']>grown['visible']+10,
                  f'[{width}] zoomed board really scrolls horizontally: {grown!r}')
        pg.locator('[data-act=ped-tool][data-t=pan]').click()
        checks.ok(pg.locator('[data-act=ped-tool][data-t=pan]').get_attribute('aria-pressed')=='true',
                  f'[{width}] pan mode has clear active state')
        pg.locator('[data-act=ped-tool][data-t=select]').click()
        checks.ok(pg.locator('[data-act=ped-tool][data-t=select]').get_attribute('aria-pressed')=='true',
                  f'[{width}] user returns to selection')
        # Repainting a selected actor must not discard canvas scroll position.
        pg.evaluate("""() => {
          const c=document.querySelector('#ped-field').closest('.ped-card');
          c.scrollLeft=Math.min(85,c.scrollWidth-c.clientWidth);
          c.scrollTop=Math.min(140,c.scrollHeight-c.clientHeight);
        }""")
        before=pg.evaluate("""() => {
          const c=document.querySelector('#ped-field').closest('.ped-card');
          return [c.scrollLeft,c.scrollTop];
        }""")
        pg.locator('[data-act=ped-snap]').click()
        after=pg.evaluate("""() => {
          const c=document.querySelector('#ped-field').closest('.ped-card');
          return [c.scrollLeft,c.scrollTop];
        }""")
        checks.ok(abs(after[0]-before[0])<=2 and abs(after[1]-before[1])<=2,
                  f'[{width}] toolbar redraw retains board scroll: {before!r} to {after!r}')
        pg.locator('#sheet .panel-head [data-act=close-sheet]').click()
        unchanged=pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(p=>p.id==='quickie-in'))""")
        checks.ok(unchanged==original,f'[{width}] zoom and pan do not modify Step In geometry or notes')
        ctx.close()
    ok=checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
