# Option B B3: full-page play editor, preserved data and discard/save semantics.
# Synthetic Chromium only; Safari/physical touch remains a separate owner gate.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv,url=serve()
checks,errors=Check(),[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390, 853, 1280):
        ctx,pg,_=page(browser,url+'#home',width=width,height=820,errors=errors)
        pg.get_by_text('Load a sample squad').click()
        pg.goto(url+'#plays')
        pg.locator('.play-row[data-id=quickie-out]').click()
        source=pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(p=>p.id==='quickie-out'))""")
        pg.locator('[data-act=play-edit]').click()
        form=pg.locator('#sheet form.ped')
        stage=pg.locator('#sheet #ped-diagram')
        checks.ok(pg.locator('#ped-diagram > .ped-main').count()==1 and
                  pg.locator('#ped-diagram > .ped-tools').count()==1 and
                  pg.locator('#ped-diagram > .ped-properties #ped-panel').count()==1,
                  f'[{width}] board, tools and properties are independent layout regions')
        checks.ok(form.count()==1 and stage.is_visible() and
                  pg.locator('[data-act=ped-tab][data-tab=diagram]').get_attribute('aria-pressed')=='true',
                  f'[{width}] editor opens directly on usable Advanced diagram')
        dimensions=pg.evaluate("""() => {
          const panel=document.querySelector('#sheet .panel'),
            head=panel.querySelector('.panel-head'),
            board=panel.querySelector('.ped-card'),
            props=panel.querySelector('.ped-properties'),
            save=panel.querySelector('.ped-save'),
            b=x=>{const r=x.getBoundingClientRect();return {
              x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
          return {panel:b(panel),head:b(head),board:b(board),props:b(props),
             save:b(save),bodyW:document.documentElement.scrollWidth,
             modal:panel.getAttribute('role'),klass:panel.className};
        }""")
        checks.ok(dimensions['panel']['width']>=width-2 and
                  dimensions['panel']['height']>=818 and
                  'play-editor-workspace' in dimensions['klass'],
                  f'[{width}] play editor is full viewport, not small shared sheet: {dimensions!r}')
        checks.ok(dimensions['board']['width']>0 and
                  dimensions['board']['height']>=300 and
                  dimensions['bodyW']<=width+2,
                  f'[{width}] substantial canvas without page horizontal overflow: {dimensions!r}')
        if width >= 1000:
            checks.ok(dimensions['props']['x']>=dimensions['board']['x']+
                      dimensions['board']['width']-5,
                      f'[{width}] object properties are beside the canvas')
        else:
            checks.ok(dimensions['props']['y']>=dimensions['board']['y'],
                      f'[{width}] narrow device properties come after canvas')
        checks.ok(dimensions['save']['bottom']<=820+2 and
                  pg.locator('.ped-save [data-act=ped-cancel]').is_visible(),
                  f'[{width}] Cancel and Save are available')

        # Editing an ordinary form field was not covered by prior dirty
        # tracking. Decline dismissal and retain the unsaved draft.
        pg.locator('form.ped [name=name]').fill('Unsaved B3 title')
        pg.evaluate("""() => {
          window.__discardQuestion='';
          window.confirm=msg=>{window.__discardQuestion=msg;return false;};
        }""")
        pg.locator('[data-act=ped-cancel]').click()
        checks.ok(form.count()==1 and form.is_visible() and
                  'without saving' in pg.evaluate('window.__discardQuestion'),
                  f'[{width}] Cancel cannot silently discard a typed field edit')
        pg.evaluate("window.confirm=()=>true")
        pg.locator('[data-act=ped-cancel]').click()
        checks.ok(pg.locator('#sheet form.ped').count()==0 and
                  pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(p=>p.id==='quickie-out'))""")==source,
                  f'[{width}] accepted Cancel retains original geometry/text and no write')
        checks.ok(pg.locator('.play-workspace-view .play-board-field svg.pf').count()==1,
                  f'[{width}] cancelling returns to existing play viewer')
        ctx.close()

    # Save through the existing form and verify it changes just the intended
    # synthetic play while preserving its previously recorded movement paths.
    ctx,pg,_=page(browser,url+'#home',width=1280,height=820,errors=errors)
    pg.get_by_text('Load a sample squad').click()
    pg.goto(url+'#plays')
    pg.locator('.play-row[data-id=quickie-in]').click()
    before=pg.evaluate("""() => structuredClone(window.__team.data.plays.find(p=>p.id==='quickie-in'))""")
    pg.locator('[data-act=play-edit]').click()
    pg.locator('form.ped [name=name]').fill('Step In practice')
    pg.locator('.ped-save button[type=submit]').click()
    after=pg.evaluate("""() => structuredClone(window.__team.data.plays.find(p=>p.id==='quickie-in'))""")
    checks.ok(after['name']=='Step In practice' and
              after['moves']==before['moves'] and
              after['players']==before['players'] and
              after.get('phases', [])==before.get('phases', []),
              'Save uses original play data contract with no movement or phase migration')
    checks.ok(pg.locator('#sheet form.ped').count()==0 and
              'Step In practice' in pg.locator('#play-fig .play-board-title').inner_text(),
              'Save returns to updated player-viewing page')
    ctx.close()
    ok=checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
