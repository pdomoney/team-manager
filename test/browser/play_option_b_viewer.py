# Option B B2: diagram-first viewer, preserving two-direction, study, animation
# and role-aware editing. Chromium/synthetic only; Safari owner approval pending.
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
        before=pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(p=>p.id==='quickie-out'))""")
        pg.locator('[data-act=play-mode][data-mode=watch]').click()
        stage=pg.locator('.play-workspace-view .play-workspace-stage')
        info=pg.locator('.play-workspace-view .play-workspace-info')
        checks.ok(stage.count()==1 and info.count()==1 and
                  pg.locator('#play-fig .play-board-field svg.pf').count()==1,
                  f'[{width}] exactly one diagram and one information rail')
        rect=pg.evaluate("""() => {
          const a=document.querySelector('.play-workspace-stage').getBoundingClientRect(),
            b=document.querySelector('.play-workspace-info').getBoundingClientRect(),
            fig=document.querySelector('#play-fig .play-board-field').getBoundingClientRect(),
            ctrl=document.querySelector('.play-workspace-toolbar').getBoundingClientRect();
          return {stageW:a.width,infoW:b.width,stageTop:a.top,infoTop:b.top,
            boardW:fig.width,toolbarH:ctrl.height,
            scrollOverflow:document.documentElement.scrollWidth-innerWidth};
        }""")
        checks.ok(rect['scrollOverflow']<=2 and rect['boardW']>0,
                  f'[{width}] layout fits horizontal viewport: {rect!r}')
        if width>=1100:
            checks.ok(rect['stageW']>=rect['infoW']*1.7 and
                      abs(rect['stageTop']-rect['infoTop'])<=3,
                      f'[{width}] diagram is primary desktop column: {rect!r}')
        else:
            checks.ok(rect['infoTop']>=rect['stageTop'] and
                      rect['boardW']<=width+2,
                      f'[{width}] diagram appears before instructions: {rect!r}')
        checks.ok(pg.locator('.play-workspace-toolbar [data-act=play-mode]').count()==2
                  and pg.locator('.play-workspace-toolbar [data-act=play-side]').count()==2,
                  f'[{width}] mode and direction controls remain keyboard-accessible')
        checks.ok('Step Out' in pg.locator('#play-fig .play-board-title').inner_text()
                  and pg.locator('#play-fig #anim-seek').count()==1
                  and 'When to use it' in info.inner_text()
                  and 'Steps' in info.inner_text(),
                  f'[{width}] animation and full coaching context remain')
        pg.locator('[data-act=play-side][data-side=left]').click()
        checks.ok(pg.locator('#play-fig svg.pf').get_attribute('aria-label').endswith('attacking left'),
                  f'[{width}] left orientation remains available')
        pg.locator('[data-act=play-side][data-side=right]').click()
        pg.locator('[data-act=play-mode][data-mode=learn]').click()
        checks.ok(pg.locator('#play-fig svg.pf.study').count()==1 and
                  pg.locator('#play-fig [data-act=study-next]').count()==1 and
                  pg.locator('.study-side [data-change=study-role]').count()==1,
                  f'[{width}] read-only learning steps and position control remain')
        pg.locator('[data-act=study-next]').click()
        checks.ok(pg.locator('#play-fig [aria-current=step]').count()==1,
                  f'[{width}] learning step selection retained')
        checks.ok(pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(p=>p.id==='quickie-out'))""")==before,
                  f'[{width}] all viewer interactions leave stored play intact')

        # Synthetic extra phase exercises the animation render path without
        # altering persisted fixtures or inventing a new formation profile.
        if width==1280:
            pg.evaluate("""() => {
              const play=window.__team.data.plays.find(p=>p.id==='quickie-out');
              play.phases=[{title:'Follow-on phase',players:structuredClone(play.players),
                defence:structuredClone(play.defence),moves:structuredClone(play.moves),
                focus:structuredClone(play.focus),tags:structuredClone(play.tags),
                ghost:structuredClone(play.ghost),notes:structuredClone(play.notes),
                labels:structuredClone(play.labels)}];
            }""")
            pg.locator('[data-act=play-mode][data-mode=watch]').click()
            pg.locator('#play-fig [data-act=play-phase][data-i="1"]').click()
            checks.ok(pg.locator('#play-fig .play-board-title').count()==1
                      and 'Step Out' in pg.locator('#play-fig .play-board-title').inner_text()
                      and pg.locator('#play-fig .play-board-field svg.pf').count()==1,
                      'phase switch preserves play title and one tactical diagram')
        ctx.close()
    ok=checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
