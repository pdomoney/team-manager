# E1/E2 completion candidate: synthetic layout-space zoom and Teach state contract.
# Browser viewport contraction approximates layout space at 100/125/150/200%.
# It does NOT claim true browser zoom, an on-screen keyboard or physical Safari.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv,url=serve()
checks,errors=Check(),[]

with sync_playwright() as p:
    browser=p.chromium.launch()

    # Source-level E1 acceptance matrix. For mobile effective widths below
    # 320 CSS px, verify access but do not impose a WCAG 320px reflow promise.
    for physical in (390,768,1280):
        for zoom in (100,125,150,200):
            width=round(physical*100/zoom)
            ctx,pg,_=page(browser,url+'#home',width=width,height=780,errors=errors)
            pg.get_by_text('Load a sample squad').click()
            pg.goto(url+'#plays')
            pg.locator('.play-row[data-id=quickie-out]').click()
            before=pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(x=>x.id==='quickie-out'))""")
            pg.locator('[data-act=play-edit]').click()
            panel=pg.locator('#sheet .play-editor-workspace')
            checks.ok(panel.count()==1 and pg.locator('#ped-diagram').is_visible(),
                      f'[E1 {physical}px @ {zoom}%] dedicated editor opens in available layout width {width}')
            pg.locator('[data-act=ped-tab][data-tab=teach]').click()
            snap=pg.evaluate("""() => {
              const panel=document.querySelector('#sheet .play-editor-workspace'),
                preview=document.querySelector('#sheet .teach-preview'),
                save=document.querySelector('#sheet .ped-save'),
                b=x=>{const r=x.getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom,width:r.width};};
              return {panel:b(panel),preview:b(preview),save:b(save),
                overflow:document.documentElement.scrollWidth-innerWidth};
            }""")
            checks.ok(snap['panel']['left']>=-2 and snap['panel']['right']<=width+2 and
                      snap['preview']['width']>0 and snap['preview']['right']<=snap['panel']['right']+2 and
                      pg.locator('#sheet .teach-preview svg.pf.study').count()==1,
                      f'[E1 {physical}px @ {zoom}%] Teach preview stays in editor: {snap!r}')
            checks.ok(pg.locator('.ped-save button[type=submit]').is_visible() and
                      pg.locator('[data-act=ped-cancel]').is_visible(),
                      f'[E1 {physical}px @ {zoom}%] Save and Cancel remain accessible')
            if width>=320:
                checks.ok(snap['overflow']<=2,
                          f'[E1 {physical}px @ {zoom}%] no page-level horizontal overflow: {snap!r}')
            pg.locator('[data-act=ped-tab][data-tab=diagram]').click()
            checks.ok(pg.locator('#ped-field svg.pf.editor').count()==1 and
                      pg.locator('#ped-tools button').count()>=4 and
                      pg.locator('#ped-zoom-value').is_visible(),
                      f'[E1 {physical}px @ {zoom}%] original tools and diagram remain available')
            pg.locator('[data-act=ped-tab][data-tab=words]').click()
            checks.ok(pg.locator('#ped-words [name=headline]').is_visible(),
                      f'[E1 {physical}px @ {zoom}%] Play details remain available')
            pg.locator('[data-act=ped-cancel]').click()
            checks.ok(pg.locator('#sheet form.ped').count()==0 and
                      pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(x=>x.id==='quickie-out'))""")==before,
                      f'[E1 {physical}px @ {zoom}%] no silent data modification')
            ctx.close()

    # Landscape-shaped short viewports. A reachable Save/footer is essential;
    # scrolling the stage must not move the saved source.
    for width,height in ((844,390),(1024,500)):
        ctx,pg,_=page(browser,url+'#home',width=width,height=height,errors=errors)
        pg.get_by_text('Load a sample squad').click()
        pg.goto(url+'#plays')
        pg.locator('.play-row[data-id=quickie-out]').click()
        before=pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(x=>x.id==='quickie-out'))""")
        pg.locator('[data-act=play-edit]').click()
        pg.locator('[data-act=ped-tab][data-tab=teach]').click()
        checks.ok(pg.locator('.teach-preview svg.pf.study').count()==1 and
                  pg.locator('.ped-save button[type=submit]').is_visible(),
                  f'[E1 {width}x{height}] landscape Teach and Save remain accessible')
        pg.locator('[data-act=ped-tab][data-tab=diagram]').click()
        checks.ok(pg.locator('[data-act=ped-fit]').is_visible() and
                  pg.locator('#ped-field svg.pf.editor').count()==1,
                  f'[E1 {width}x{height}] landscape diagram and Fit remain available')
        pg.locator('[data-act=ped-cancel]').click()
        checks.ok(pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(x=>x.id==='quickie-out'))""")==before,
                  f'[E1 {width}x{height}] viewport rotation proxy cannot alter saved play')
        ctx.close()

    # E2: actual coach editing keyboard selection, empty and invalid states.
    for width in (390,1280):
        ctx,pg,_=page(browser,url+'#home',width=width,height=860,errors=errors)
        pg.get_by_text('Load a sample squad').click()
        pg.goto(url+'#plays')
        pg.locator('.play-row[data-id=quickie-out]').click()
        before=pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(x=>x.id==='quickie-out'))""")
        pg.locator('[data-act=play-edit]').click()
        pg.locator('[data-act=ped-tab][data-tab=teach]').click()
        empty=pg.locator('#sheet .teach-empty-state')
        checks.ok(empty.count()==1 and empty.is_visible() and
                  'No guided actions yet' in empty.inner_text() and
                  empty.evaluate('e=>getComputedStyle(e).backgroundColor')=='rgb(38, 49, 60)',
                  f'[E2 {width}] dark-board empty state explains that drawings are preserved')
        pg.locator('[data-act=teach-add]').click()
        pg.locator('.ped-save button[type=submit]').click()
        invalid=pg.locator('#sheet .teach-action.is-invalid')
        missing=pg.locator('#sheet [data-input=teach-text][data-i="0"]')
        checks.ok(invalid.count()==1 and
                  invalid.locator('.teach-inline-error[role=alert]').is_visible() and
                  missing.get_attribute('aria-invalid')=='true' and
                  missing.evaluate('e=>document.activeElement===e') and
                  pg.locator('#sheet form.ped').count()==1,
                  f'[E2 {width}] missing instruction blocks Save and focuses explicit inline error')
        missing.fill('LM passes to RM, then RM follows the support run.')
        checks.ok(invalid.count()==0 and
                  pg.locator('#sheet .teach-inline-error').count()==0 and
                  missing.get_attribute('aria-invalid') is None,
                  f'[E2 {width}] valid instruction clears error without moving keyboard focus')
        pg.locator('[data-act=teach-add]').click()
        second=pg.locator('[data-input=teach-text][data-i="1"]')
        second.fill('Defender stays behind the marker in this training example.')
        btn0=pg.locator('[data-act=teach-preview][data-i="0"]')
        btn0.focus()
        pg.keyboard.press('Enter')
        checks.ok(btn0.get_attribute('aria-pressed')=='true' and
                  btn0.evaluate('e=>document.activeElement===e') and
                  pg.locator('[data-act=teach-preview][data-i="1"]').get_attribute('aria-pressed')=='false' and
                  'LM passes to RM' in pg.locator('.teach-preview .study-cue').inner_text(),
                  f'[E2 {width}] keyboard preview restores focus and exposes one selected action')
        pg.evaluate("""() => {
          const b=document.createElement('button');b.dataset.act='teach-preview';b.dataset.i='999';
          document.body.append(b);b.click();b.remove();
        }""")
        checks.ok(pg.locator('[data-act=teach-preview][data-i="0"]').get_attribute('aria-pressed')=='true',
                  f'[E2 {width}] forged out-of-range selection cannot replace the preview')
        pg.locator('[data-act=ped-tab][data-tab=diagram]').click()
        checks.ok(pg.locator('#ped-field svg.pf.editor').count()==1 and
                  pg.locator('#ped-tools button').count()>=4,
                  f'[E2 {width}] same dark board retains Advanced Diagram tools')
        pg.evaluate('window.confirm=()=>true')
        pg.locator('[data-act=ped-cancel]').click()
        checks.ok(pg.locator('#sheet form.ped').count()==0 and
                  pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(x=>x.id==='quickie-out'))""")==before,
                  f'[E2 {width}] preview, error and keyboard changes never save without explicit Save')
        ctx.close()

    ok=checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
