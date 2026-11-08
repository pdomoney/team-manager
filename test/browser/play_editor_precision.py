# Option B / B4.1: precision controls must work with the mobile inspector
# collapsed, and must never write changes until Save play. Chromium synthetic.
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
        original=pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(x=>x.id==='quickie-out'))""")
        pg.locator('[data-act=play-edit]').click()
        pg.locator('#ped-field svg [data-pl="LM"]').first.click()
        precision=pg.locator('#ped-precision')
        checks.ok(precision.is_visible() and 'LM' in precision.inner_text(),
                  f'[{width}] selecting player reveals precision controls without opening inspector')
        if width==390:
            measures=pg.evaluate("""() => {
              const tools=document.querySelector('#ped-tools'),
                canvas=document.querySelector('.ped-main .ped-card'),
                buttons=document.querySelector('.ped-under');
              return {toolsHeight:tools.getBoundingClientRect().height,
                toolsContent:tools.scrollWidth,toolsVisible:tools.clientWidth,
                viewHeight:buttons.getBoundingClientRect().height,
                boardWidth:canvas.getBoundingClientRect().width};
            }""")
            checks.ok(measures['toolsHeight']<=60 and
                      measures['toolsContent']>measures['toolsVisible'] and
                      measures['viewHeight']<=65 and measures['boardWidth']>=280,
                      f'[{width}] mobile tool rails are compact and canvas remains usable: {measures!r}')
            checks.ok(pg.locator('#ped-properties').is_hidden(),
                      f'[{width}] precision nudge does not require expanding properties')

        old=pg.evaluate("""() => [...window.__team.state.ped.draft.players.LM]""")
        pg.locator('#ped-precision [data-act=ped-precision-nudge][data-dx="1"]').click()
        moved=pg.evaluate("""() => [...window.__team.state.ped.draft.players.LM]""")
        checks.ok(round(moved[0]-old[0],1)==0.5 and moved[1]==old[1],
                  f'[{width}] touch-friendly right arrow nudges LM by a controlled half-unit')
        checks.ok(pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(x=>x.id==='quickie-out'))""")==original,
                  f'[{width}] draft nudge does not mutate committed play until Save')
        pg.locator('[data-act=ped-undo]').click()
        reverted=pg.evaluate("""() => [...window.__team.state.ped.draft.players.LM]""")
        checks.ok(reverted==old,f'[{width}] single Undo restores the prior actor position')

        # Change the step and use a keyboard arrow with the canvas focused.
        pg.locator('#ped-precision [data-change=ped-precision-step]').select_option('1')
        pg.locator('#ped-field').focus()
        pg.keyboard.press('ArrowDown')
        keyed=pg.evaluate("""() => [...window.__team.state.ped.draft.players.LM]""")
        checks.ok(keyed[0]==old[0] and round(keyed[1]-old[1],1)==1,
                  f'[{width}] canvas keyboard arrow uses the chosen one-unit step')
        pg.locator('[data-act=ped-undo]').click()

        pg.locator('#sheet .ped-save [data-act=ped-cancel]').click()
        checks.ok(pg.locator('#sheet form.ped').count()==0 and
                  pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(x=>x.id==='quickie-out'))""")==original,
                  f'[{width}] cancelling an undone edit retains original Step Out')
        ctx.close()
    ok=checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
