# E4.4: coach can see controls and reach a tall board at desktop and phone sizes.
# Browser CI uses Chromium; actual Mac/iPhone Safari remains an owner acceptance gate.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv,url=serve()
checks,errors=Check(),[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,853,1280):
        ctx,pg,_=page(browser,url+'#home',width=width,height=760,errors=errors)
        pg.get_by_text('Load a sample squad').click()
        pg.goto(url+'#plays')
        pg.locator('.play-row[data-id=quickie-out]').click()
        before=pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(x=>x.id==='quickie-out'))""")
        pg.locator('[data-act=play-edit]').click()
        pg.locator('[data-act=ped-tab][data-tab=diagram]').click()
        snap=pg.locator('[data-act=ped-snap]')
        checks.ok(snap.count()==1 and snap.get_attribute('aria-pressed')=='false'
                  and 'Off' in snap.inner_text(),
                  f'[{width}] manual freehand editing is default')
        snap.click()
        checks.ok(snap.get_attribute('aria-pressed')=='true' and 'On' in snap.inner_text(),
                  f'[{width}] coach can explicitly enable snapping')
        snap.click()
        checks.ok(snap.get_attribute('aria-pressed')=='false',
                  f'[{width}] coach can disable snapping again')

        pg.locator('[data-act=ped-whole]').click()
        metrics=pg.evaluate("""() => {
          const card=document.querySelector('.ped-main .ped-card'),
            panel=document.querySelector('#sheet .panel'),
            save=document.querySelector('.ped-save button[type=submit]');
          const c=card.getBoundingClientRect(),p=panel.getBoundingClientRect();
          const svg=card.querySelector('svg').getBoundingClientRect();
          return {height:c.height,client:card.clientHeight,scroll:card.scrollHeight,
                  svgHeight:svg.height,overflow:getComputedStyle(card).overflowY,
                  panelRight:p.right,cardRight:c.right,save:!!save,
                  horizontalOverflow:document.documentElement.scrollWidth-innerWidth};
        }""")
        checks.ok(metrics['svgHeight']<=metrics['client']+4 and
                  metrics['height']>=180 and metrics['overflow'] in ('auto','scroll'),
                  f'[{width}] Fit view shows the whole field inside a usable canvas: {metrics!r}')
        checks.ok(metrics['cardRight']<=metrics['panelRight']+2 and
                  metrics['horizontalOverflow']<=2 and metrics['save'],
                  f'[{width}] editor controls and save remain inside dialog: {metrics!r}')

        pg.locator('#sheet .panel-head [data-act=close-sheet]').click()
        after=pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(x=>x.id==='quickie-out'))""")
        checks.ok(before==after,
                  f'[{width}] changing display and snap preferences does not rewrite the play')
        ctx.close()
    ok=checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
