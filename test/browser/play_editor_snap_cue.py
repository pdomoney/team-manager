# B4.5 synthetic Chromium: visual snap cue must identify the actual landing
# actor, disappear for ambiguity/freehand/cancel and never become stored play data.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv,url=serve()
checks,errors=Check(),[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390, 1280):
        ctx,pg,_=page(browser,url+'#home',width=width,height=820,errors=errors)
        pg.get_by_text('Load a sample squad').click()
        pg.goto(url+'#plays')
        pg.locator('.play-row[data-id=quickie-out]').click()
        stored=pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(x=>x.id==='quickie-out'))""")
        pg.locator('[data-act=play-edit]').click()
        pg.evaluate("""() => {
          const box=document.querySelector('#ped-field');
          const xy = point => {
            const svg=box.querySelector('svg'), d=svg.dataset;
            const x=14+(point[0]-Number(d.x0))*Number(d.k);
            const y=Number(d.top)+(point[1]-Number(d.y0))*Number(d.k);
            const out=new DOMPoint(x,y).matrixTransform(svg.getScreenCTM());
            return [out.x,out.y];
          };
          const fire=(element,type,id,point) => element.dispatchEvent(new PointerEvent(type,{
            bubbles:true, pointerType:'touch', pointerId:id, isPrimary:true, button:0,
            buttons:type==='pointerdown'||type==='pointermove'?1:0,
            clientX:point[0], clientY:point[1]
          }));
          window.__snapCueStart=(id=101) => {
            const d=window.__team.state.ped.draft;
            const lm=d.players.LM;
            fire(box.querySelector('svg [data-pl="LM"]'),'pointerdown',id,xy(lm));
          };
          window.__snapCueMove=(kind,id=101) => {
            const d=window.__team.state.ped.draft;
            const p=kind==='far'?[49,70]:[d.players.RM[0]+0.2,d.players.RM[1]+0.1];
            fire(box,'pointermove',id,xy(p));
          };
          window.__snapCueFinish=(type='pointerup',id=101) => {
            const d=window.__team.state.ped.draft;
            fire(box,type,id,xy([d.players.RM[0]+0.2,d.players.RM[1]+0.1]));
          };
        }""")
        checks.ok(pg.locator('#ped-field svg .ped-snap-cue').count()==0,
                  f'[{width}] no snap cue before a gesture')
        pg.locator('#ped-tools [data-t=pass]').click()
        checks.ok(pg.locator('[data-act=ped-snap]').get_attribute('aria-pressed')=='true',
                  f'[{width}] Snap starts On in a new editing session')
        box_size=pg.evaluate("""() => {
          const c=document.querySelector('.ped-main .ped-card').getBoundingClientRect();
          return [c.width,c.height];
        }""")
        pg.evaluate("() => window.__snapCueStart(101)")
        pg.evaluate("() => window.__snapCueMove('near',101)")
        pg.wait_for_function("""() => document.querySelector('#ped-field svg .ped-snap-cue') !== null""")
        cue=pg.evaluate("""() => {
          const svg=document.querySelector('#ped-field svg');
          const cue=svg.querySelector('.ped-snap-cue');
          const c=cue.querySelector('circle');
          const rm=window.__team.state.ped.draft.players.RM;
          return {
            target:cue.dataset.snapTarget, 
            cx:Number(c.getAttribute('cx')),
            cy:Number(c.getAttribute('cy')),
            expectedX:14+(rm[0]-Number(svg.dataset.x0))*Number(svg.dataset.k),
            expectedY:Number(svg.dataset.top)+(rm[1]-Number(svg.dataset.y0))*Number(svg.dataset.k),
            nonblocking:getComputedStyle(cue).pointerEvents==='none',
            status:document.querySelector('#ped-snap-status').textContent
          };
        }""")
        checks.ok(cue['target']=='RM' and cue['status']=='Snap ready: RM' and
                  abs(cue['cx']-cue['expectedX'])<0.2 and
                  abs(cue['cy']-cue['expectedY'])<0.2 and cue['nonblocking'],
                  f'[{width}] snap cue matches the unique actor exactly and ignores pointer input: {cue!r}')
        pg.evaluate("() => window.__snapCueFinish('pointerup',101)")
        pg.wait_for_function("""() => document.querySelector('#ped-field svg .ped-snap-cue')===null""")
        committed=pg.evaluate("""() => {
          const e=window.__team.state.ped,m=e.draft.moves.at(-1);
          return {end:m.pts.at(-1),target:e.draft.players.RM,link:m.actorLinks?.end};
        }""")
        checks.ok(committed['end']==committed['target'] and committed['link']=='player:RM',
                  f'[{width}] committed endpoint and actor link match visual cue')
        checks.ok(pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(x=>x.id==='quickie-out'))""")==stored,
                  f'[{width}] cue and drawn draft do not write saved Step Out until Save')
        pg.locator('[data-act=ped-undo]').click()

        # Switching Snap Off suppresses cues, even when near RM.
        pg.locator('[data-act=ped-snap]').click()
        pg.evaluate("() => window.__snapCueStart(102)")
        pg.evaluate("() => window.__snapCueMove('near',102)")
        pg.wait_for_timeout(80)
        checks.ok(pg.locator('#ped-field svg .ped-snap-cue').count()==0,
                  f'[{width}] freehand mode never claims an actor visually')
        pg.evaluate("() => window.__snapCueFinish('pointercancel',102)")
        checks.ok(pg.evaluate("window.__team.state.ped.snapPreview") is None,
                  f'[{width}] pointercancel clears any visual cue')
        pg.locator('[data-act=ped-snap]').click()

        # Overlapping diagram actors are deliberately ambiguous: no false ring.
        pg.evaluate("""() => {
          const d=window.__team.state.ped.draft;
          d.players.RR=[...d.players.RM];
        }""")
        pg.locator('#ped-tools [data-t=pass]').click()
        pg.evaluate("() => window.__snapCueStart(103)")
        pg.evaluate("() => window.__snapCueMove('near',103)")
        pg.wait_for_function("""() => document.querySelector('#ped-snap-status')?.textContent?.includes('Multiple nearby actors')""")
        checks.ok(pg.locator('#ped-field svg .ped-snap-cue').count()==0,
                  f'[{width}] overlapping player targets have no snap cue')
        pg.evaluate("() => window.__snapCueFinish('pointercancel',103)")
        pg.evaluate("() => window.__snapCueStart(104)")
        pg.evaluate("() => window.__snapCueMove('far',104)")
        pg.wait_for_function("""() => document.querySelector('#ped-snap-status')?.textContent?.includes('No nearby actor')""")
        checks.ok(pg.locator('#ped-field svg .ped-snap-cue').count()==0,
                  f'[{width}] distant freehand target has no snap cue')
        pg.evaluate("() => window.__snapCueFinish('pointercancel',104)")
        pg.locator('[data-act=ped-undo]').click() if pg.locator('[data-act=ped-undo]').is_enabled() else None

        box_after=pg.evaluate("""() => {
          const c=document.querySelector('.ped-main .ped-card').getBoundingClientRect();
          return [c.width,c.height];
        }""")
        checks.ok(all(abs(a-b)<=4 for a,b in zip(box_size,box_after)),
                  f'[{width}] visual feedback keeps fitted stage dimensions stable')
        checks.ok(pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(x=>x.id==='quickie-out'))""")==stored,
                  f'[{width}] ambiguous/canceled gestures leave saved Step Out unchanged')
        ctx.close()
    ok=checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
