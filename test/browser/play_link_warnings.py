# E4.5: coach-only broken connection warnings in the existing play editor.
# Synthetic Chromium only; Safari/device qualification remains independent.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv, url = serve()
checks, errors = Check(), []
act = "([a, ds]) => {const b=document.createElement('button');b.dataset.act=a;Object.assign(b.dataset,ds||{});document.body.appendChild(b);b.click();b.remove();}"
with sync_playwright() as p:
    browser = p.chromium.launch()
    for width in (390, 1280):
        ctx, pg, _ = page(browser, url + '#home', width=width, height=850, errors=errors)
        pg.get_by_text('Load a sample squad').click()
        pg.goto(url + '#plays')
        pg.locator('.play-row[data-id=quickie-out]').click()
        old_play=pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(p=>p.id==='quickie-out'))""")
        checks.ok(pg.locator('#ped-link-warning').count() == 0,
                  f'[{width}] coach-only link warning does not leak onto Watch or Learn')
        pg.locator('[data-act=play-edit]').click()
        warnings=pg.locator('#ped-link-warning')
        checks.ok(warnings.count()==1 and not warnings.is_visible(),
                  f'[{width}] legacy Step Out has no false warning on first editor render')
        pg.evaluate("""() => {
          const E=window.__team.state.ped, ph=E.draft;
          ph.moves.push({
            moveId:'m-warning-test',linkVersion:1,t:'pass',
            pts:[[...ph.players.LM],[...ph.players.RM]],
            actorLinks:{start:'player:LM',end:'player:unknown'}
          });
        }""")
        pg.locator('[data-act=ped-snap]').click()
        warning=warnings.inner_text()
        checks.ok(warnings.is_visible() and 'Movement' in warning and
                  'no longer exists' in warning and 'No drawing is changed automatically' in warning,
                  f'[{width}] an explicit broken receiver appears as a concise coach warning')
        measures=pg.evaluate("""() => {
          const n=document.querySelector('#ped-link-warning').getBoundingClientRect();
          const b=document.querySelector('.ped-main').getBoundingClientRect();
          return {width:n.width, x:n.x, right:n.right, stageX:b.x, stageRight:b.right,
            bodyOverflow:document.documentElement.scrollWidth>window.innerWidth+2,
            role:document.querySelector('#ped-link-warning').getAttribute('role')};
        }""")
        checks.ok(measures['role']=='status' and
                  measures['width']>0 and measures['x']>=measures['stageX']-2 and
                  measures['right']<=measures['stageRight']+2 and
                  not measures['bodyOverflow'],
                  f'[{width}] warning stays in editor width and is accessible: {measures!r}')
        checks.ok(pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(p=>p.id==='quickie-out'))""")==old_play,
                  f'[{width}] preview audit does not modify the stored original')
        pg.evaluate("""() => {
          const E=window.__team.state.ped;
          E.draft.moves.at(-1).actorLinks.end='player:RM';
        }""")
        pg.locator('[data-act=ped-snap]').click()
        checks.ok(not warnings.is_visible() and warnings.inner_text()=='',
                  f'[{width}] connecting the original receiver clears warning after redraw')
        pg.locator('#sheet .ped-save [data-act=ped-cancel]').click()
        checks.ok(pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(p=>p.id==='quickie-out'))""")==old_play,
                  f'[{width}] cancelling a draft does not persist diagnostic data')
        pg.evaluate(act,['preview-on',{}])
        pg.locator('[data-act=play-back]').click()
        pg.locator('.play-row[data-id=quickie-out]').click()
        checks.ok(pg.locator('[data-act=play-edit], #ped-link-warning').count()==0,
                  f'[{width}] Player preview stays read-only and contains no editor warnings')
        ctx.close()
    passed=checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if passed else 1)
