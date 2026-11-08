# B3 corrective: animation-editor ergonomics at normal browser zoom.
# Chromium synthetic checks; owner Safari/touch usability remains separate.
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
        original=pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(p=>p.id==='quickie-out'))""")
        pg.locator('[data-act=play-edit]').click()
        metrics=pg.evaluate("""() => {
          const panel=document.querySelector('#sheet .play-editor-workspace'),
            canvas=panel.querySelector('.ped-card'),
            svg=canvas.querySelector('svg.pf'),
            phases=panel.querySelector('.ped-phases'),
            tools=panel.querySelector('#ped-tools'),
            footer=panel.querySelector('.ped-save'),
            setup=panel.querySelector('details.ped-setup'),
            rect=x=>{const r=x.getBoundingClientRect(); return {x:r.x,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
          return {panel:rect(panel),canvas:rect(canvas),svg:rect(svg),
            phases:rect(phases),tools:rect(tools),footer:rect(footer),
            setupOpen:setup.open,
            inspectorVisible:!!panel.querySelector('#ped-properties').offsetParent,
            horizontalOverflow:document.documentElement.scrollWidth-innerWidth};
        }""")
        zoom=pg.locator('#ped-zoom-value').inner_text()
        percent=int(zoom.split('%')[0].split('·')[-1].strip())
        checks.ok('Fit' in zoom and 10<=percent<100,
                  f'[{width}] Fit view is initial and below 100%: {zoom}')
        checks.ok(metrics['svg']['height']<=metrics['canvas']['height']+3 and
                  metrics['svg']['width']<=metrics['canvas']['width']+3,
                  f'[{width}] complete drawing is visible in fitted stage: {metrics!r}')
        checks.ok(metrics['canvas']['height']>=245 and
                  metrics['phases']['top']>=metrics['canvas']['bottom']-4 and
                  metrics['footer']['top']>=metrics['phases']['bottom']-4 and
                  metrics['horizontalOverflow']<=2,
                  f'[{width}] canvas, phase track and action bar do not overlap: {metrics!r}')
        checks.ok(not metrics['setupOpen'] and
                  pg.locator('.ped-phase-label').text_content().strip().lower()=='phase track',
                  f'[{width}] metadata is folded and the phase track is visible')

        if width>=1000:
            checks.ok(metrics['tools']['width']<=120 and
                      metrics['tools']['top']<=metrics['canvas']['top']+2 and
                      metrics['tools']['x']+metrics['tools']['width']<=metrics['canvas']['x']+2,
                      f'[{width}] desktop drawing tools occupy a dedicated left palette')
            before=metrics['canvas']['width']
            pg.locator('[data-act=ped-inspector]').click()
            after=pg.locator('.ped-card').bounding_box()['width']
            checks.ok(after>before+100 and
                      pg.locator('#ped-properties').is_hidden(),
                      f'[{width}] hiding properties dedicates more room to the field')
            pg.locator('[data-act=ped-inspector]').click()
        else:
            checks.ok(pg.locator('#ped-properties').is_hidden(),
                      f'[{width}] mobile editor starts with the canvas in focus')
            pg.locator('[data-act=ped-inspector]').click()
            checks.ok(pg.locator('#ped-properties').is_visible(),
                      f'[{width}] mobile object properties remain accessible')
            pg.locator('[data-act=ped-inspector]').click()

        pg.locator('[data-act=ped-zoom-out]').click()
        after=int(pg.locator('#ped-zoom-value').inner_text().replace('%',''))
        checks.ok(after<percent and after<100,
                  f'[{width}] zoom out genuinely operates below 100%')
        pg.locator('[data-act=ped-fit]').click()
        checks.ok('Fit' in pg.locator('#ped-zoom-value').inner_text() and
                  pg.locator('[data-act=ped-fit]').get_attribute('aria-pressed')=='true',
                  f'[{width}] Fit button restores whole-play workspace')

        if width==1280:
            pg.set_viewport_size({'width':1160,'height':760})
            pg.wait_for_timeout(100)
            resized=pg.evaluate("""() => {
              const card=document.querySelector('.ped-card'),
                svg=card.querySelector('svg').getBoundingClientRect();
              return {svgHeight:svg.height,svgWidth:svg.width,
                cardHeight:card.clientHeight,cardWidth:card.clientWidth};
            }""")
            checks.ok(resized['svgHeight']<=resized['cardHeight']+4 and
                      resized['svgWidth']<=resized['cardWidth']+4 and
                      'Fit' in pg.locator('#ped-zoom-value').inner_text(),
                      f'[{width}] Fit recalculates on live viewport resize: {resized!r}')

        pg.locator('details.ped-setup summary').click()
        checks.ok(pg.locator('[name=name]').is_visible() and
                  pg.locator('[name=playSport]').is_visible(),
                  f'[{width}] play name, category and sport remain editable')
        pg.locator('details.ped-setup summary').click()
        pg.locator('[data-act=ped-cancel]').click()
        checks.ok(pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(p=>p.id==='quickie-out'))""")==original,
                  f'[{width}] display-only zoom/inspector/phase actions never rewrite saved play')
        ctx.close()
    ok=checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
