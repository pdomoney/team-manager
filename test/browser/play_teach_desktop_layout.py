# B4.11: Teach must use desktop real estate in both empty and populated states,
# preserving the accepted stacked phone journey, editing controls and saved plays.
# Synthetic Chromium, not physical Safari visual acceptance.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv,url=serve()
checks,errors=Check(),[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,853,1280,1712):
        ctx,pg,_=page(browser,url+'#home',width=width,height=820,errors=errors)
        pg.get_by_text('Load a sample squad').click()
        pg.goto(url+'#plays')
        pg.locator('.play-row[data-id=quickie-out]').click()
        before=pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(q=>q.id==='quickie-out'))""")
        pg.locator('[data-act=play-edit]').click()
        pg.locator('[data-act=ped-tab][data-tab=teach]').click()

        def layout():
            return pg.evaluate("""() => {
              const q=s=>document.querySelector(s), r=s=>{
                const e=q(s), b=e?.getBoundingClientRect();
                return b?{x:b.x,y:b.y,right:b.right,bottom:b.bottom,
                  width:b.width,height:b.height}:null;
              };
              return {
                panel:r('#sheet .panel'),
                teach:r('#sheet #ped-teach'),
                list:r('#sheet .teach-list'),
                preview:r('#sheet .teach-preview'),
                diagram:r('#sheet .teach-preview .play-card'),
                svg:r('#sheet .teach-preview svg.pf.study'),
                save:r('#sheet .ped-save'),
                layout:q('#sheet .teach-layout')?.className||'',
                previewDisplay:getComputedStyle(q('#sheet .teach-preview')).display,
                overflow:document.documentElement.scrollWidth-innerWidth
              };
            }""")
        empty=layout()
        checks.ok('is-empty' in empty['layout'] and
                  pg.locator('#sheet .teach-action').count()==0 and
                  pg.locator('[data-act=teach-add]').count()==1 and
                  pg.locator('[data-act=teach-seed]').count()==1,
                  f'[{width}] no-action state retains both ways to start teaching')
        checks.ok(empty['overflow']<=2 and empty['preview']['width']>0 and
                  empty['preview']['right']<=empty['panel']['right']+2 and
                  empty['svg']['width']>0 and
                  pg.locator('#sheet .ped-save button[type=submit]').is_visible(),
                  f'[{width}] preview and Save remain reachable without horizontal overflow: {empty!r}')
        if width>=980:
            checks.ok(empty['list']['bottom']<=empty['preview']['y']+3 and
                      empty['list']['width']>=empty['teach']['width']*.90 and
                      empty['preview']['width']>=empty['teach']['width']*.90 and
                      empty['diagram']['x']>empty['preview']['x'] and
                      empty['previewDisplay']=='grid' and
                      empty['svg']['width']<=642,
                      f'[{width}] desktop empty guidance is a compact full-width setup above useful preview: {empty!r}')
        else:
            checks.ok(empty['preview']['y']>=empty['list']['bottom']-3 and
                      empty['previewDisplay']!='grid',
                      f'[{width}] narrow Teach keeps the accepted stacked layout: {empty!r}')

        pg.locator('[data-act=teach-add]').click()
        populated=layout()
        checks.ok('has-actions' in populated['layout'] and
                  pg.locator('.teach-action').count()==1 and
                  pg.locator('[data-input=teach-title]').count()==1 and
                  populated['overflow']<=2 and
                  populated['preview']['right']<=populated['panel']['right']+2,
                  f'[{width}] Add action opens editable teaching state with contained preview: {populated!r}')
        if width>=980:
            checks.ok(populated['preview']['x']>=populated['list']['right']-3 and
                      populated['list']['width']>=340 and
                      populated['preview']['width']>=350,
                      f'[{width}] instructions and preview share desktop space side by side: {populated!r}')
        else:
            checks.ok(populated['preview']['y']>=populated['list']['bottom']-3,
                      f'[{width}] populated narrow Teach stays stacked')
        pg.locator('[data-input=teach-title]').fill('First action')
        pg.locator('[data-input=teach-text]').fill('LM passes to RM, who runs forward.')
        pg.locator('[data-act=teach-preview]').click()
        checks.ok('LM passes to RM' in pg.locator('.teach-preview .study-cue').inner_text() and
                  pg.locator('#sheet .teach-preview svg.pf.study').count()==1,
                  f'[{width}] populated action still previews the actual teaching cue')
        pg.evaluate("window.confirm=()=>true")
        pg.locator('[data-act=ped-cancel]').click()
        checks.ok(pg.locator('#sheet form.ped').count()==0 and
                  pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(q=>q.id==='quickie-out'))""")==before,
                  f'[{width}] cancelling unsaved Teach changes leaves recorded Step Out untouched')
        ctx.close()

    # Existing written instructions can populate the teaching list without a
    # placeholder action or any migration. Keep desktop view valid after seeding.
    ctx,pg,_=page(browser,url+'#home',width=1280,height=820,errors=errors)
    pg.get_by_text('Load a sample squad').click()
    pg.goto(url+'#plays')
    pg.locator('.play-row[data-id=quickie-out]').click()
    pg.locator('[data-act=play-edit]').click()
    pg.locator('[data-act=ped-tab][data-tab=teach]').click()
    pg.locator('[data-act=teach-seed]').click()
    seeded=pg.locator('#sheet .teach-layout')
    checks.ok('has-actions' in (seeded.get_attribute('class') or '') and
              pg.locator('#sheet .teach-action').count()>=3 and
              pg.locator('#sheet .teach-preview svg.pf.study').count()==1,
              'desktop seeded legacy steps retain the populated side-by-side authoring view')
    pg.locator('.teach-action').first.locator('[data-act=teach-preview]').click()
    checks.ok(pg.locator('#sheet .teach-preview .study-cue').is_visible() and
              pg.locator('#sheet .ped-save button[type=submit]').is_visible(),
              'seeded action remains previewable and Save remains accessible')
    ctx.close()
    ok=checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
