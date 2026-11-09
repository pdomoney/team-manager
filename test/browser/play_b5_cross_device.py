# Option B B5: one complete coach -> saved play -> reload -> player journey.
# Run on Chromium and Linux Playwright WebKit (Safari-like engine, NOT iOS Safari).
# All test data is fictional, local-only, and isolated in a fresh browser context.
import os
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv, url = serve()
checks, errors = Check(), []
engine = os.environ.get('B5_BROWSER_ENGINE', 'chromium').lower()
if engine not in ('chromium', 'webkit'):
    raise SystemExit('Unsupported B5_BROWSER_ENGINE: ' + engine)
widths = (390, 853, 1280) if engine == 'chromium' else (390, 1280)
act = """([name, data]) => {
  const button = document.createElement('button');
  button.dataset.act = name;
  Object.assign(button.dataset, data || {});
  document.body.appendChild(button);
  button.click();
  button.remove();
}"""

with sync_playwright() as p:
    browser = getattr(p, engine).launch()
    for width in widths:
        ctx, pg, _ = page(browser, url + '#home', width=width, height=840, errors=errors)
        pg.get_by_text('Load a sample squad').click()
        pg.goto(url + '#plays')
        pg.wait_for_selector('.play-row[data-id=quickie-out]')
        snapshot = pg.evaluate("""() => {
          const d=window.__team.data;
          return {team:d.id,
            other:JSON.stringify(d.plays.find(p=>p.id==='quickie-in')),
            source:JSON.stringify(d.plays.find(p=>p.id==='quickie-out'))};
        }""")

        # Cards/List, Watch seek/mirror and Learn steps must share one play ID.
        checks.ok(pg.locator('.play-row[data-id=quickie-in]').count() == 1 and
                  'Step Out' in pg.locator('.play-row[data-id=quickie-out]').inner_text(),
                  f'[{engine}/{width}] original Step In/Step Out catalogue and IDs')
        pg.locator('.card-mode button').filter(has_text='List').click()
        checks.ok(pg.locator('.plays-grid.view-list .play-row[data-id=quickie-out]').count()==1,
                  f'[{engine}/{width}] List mode still reaches Step Out')
        pg.locator('.play-row[data-id=quickie-out]').click()
        pg.locator('[data-act=play-mode][data-mode=watch]').click()
        pg.locator('#anim-seek').evaluate("""e=>{
          e.value='45';e.dispatchEvent(new Event('input',{bubbles:true}));
        }""")
        checks.ok(pg.locator('#anim-pct').inner_text()=='45%' and
                  pg.locator('#play-fig svg.pf.watch-art').count()==1,
                  f'[{engine}/{width}] Watch seek and presentation respond')
        pg.locator('[data-act=play-side][data-side=left]').click()
        checks.ok(pg.locator('#play-fig svg.pf').get_attribute('aria-label').endswith('attacking left'),
                  f'[{engine}/{width}] mirrored Watch retains direction')
        pg.locator('[data-act=play-mode][data-mode=learn]').click()
        pg.locator('[data-act=study-next]').click()
        pg.locator('[data-change=study-role]').select_option('LM')
        checks.ok(pg.locator('#play-fig .study-cue').count()==1 and
                  pg.locator('#play-fig .plg.study-target').count()==1 and
                  pg.locator('#play-fig [aria-current=step]').count()==1,
                  f'[{engine}/{width}] Learn step, selected position and focus')

        # Create a real draft coordinate change and a linked instruction.
        pg.locator('[data-act=play-edit]').click()
        pg.wait_for_selector('#ped-field svg.pf.editor')
        pg.locator('#ped-field svg [data-pl="LM"] .ped-actor-hit').click()
        before_lm = pg.evaluate('window.__team.state.ped.draft.players.LM.slice()')
        pg.locator('#ped-precision [data-act=ped-precision-nudge][data-dx="1"]').click()
        after_lm = pg.evaluate('window.__team.state.ped.draft.players.LM.slice()')
        checks.ok(round(after_lm[0]-before_lm[0],1)==.5 and after_lm[1]==before_lm[1],
                  f'[{engine}/{width}] coach can nudge player on actual editing board')
        pg.locator('[data-act=ped-zoom-in]').click()
        zoom=pg.evaluate('window.__team.state.ped.zoom')
        pg.set_viewport_size({'width':width+100,'height':840})
        pg.wait_for_timeout(140)
        checks.ok(pg.evaluate('window.__team.state.ped.zoomMode')=='manual' and
                  pg.evaluate('window.__team.state.ped.zoom')==zoom and
                  pg.evaluate('window.__team.state.ped.draft.players.LM.slice()')==after_lm,
                  f'[{engine}/{width}] resized editor preserves manual zoom and draft position')
        checks.ok(pg.evaluate("""() => JSON.stringify(
          window.__team.data.plays.find(p=>p.id==='quickie-out'))""")==snapshot['source'],
                  f'[{engine}/{width}] nudge/resize do not prematurely commit play')

        pg.locator('[data-act=ped-tab][data-tab=teach]').click()
        pg.locator('[data-act=teach-seed]').click()
        pg.locator('.teach-action').first.locator('[data-input=teach-title]').fill('B5 coach cue')
        pg.locator('.teach-action').first.locator('[data-input=teach-text]').fill('LM draws the defender and RM follows.')
        pg.locator('.teach-action').first.locator('[data-change=teach-role]').select_option('LM')
        pg.locator('.teach-action').first.locator('[data-change=teach-move]').select_option('0')
        pg.locator('.teach-action').first.locator('[data-act=teach-preview]').click()
        checks.ok('LM draws the defender' in pg.locator('.teach-preview .study-cue').inner_text() and
                  pg.locator('.teach-preview .mv.study-emphasis').count()==1,
                  f'[{engine}/{width}] coach-linked instruction previews correct movement')
        pg.locator('#sheet form[data-form=play] button[type=submit]').click()
        checks.ok(pg.locator('#sheet form[data-form=play]').count()==0,
                  f'[{engine}/{width}] valid teaching edit saves and exits editor')
        saved=pg.evaluate("""() => {
          const d=window.__team.data, play=d.plays.find(p=>p.id==='quickie-out');
          return {play:JSON.stringify(play),team:d.id,
            other:JSON.stringify(d.plays.find(p=>p.id==='quickie-in')),
            lm:play.players.LM,study:play.study};
        }""")
        checks.ok(saved['lm']==after_lm and saved['study'][0]['roles']==['LM'] and
                  saved['study'][0]['moves']==[0] and saved['other']==snapshot['other'] and
                  saved['team']==snapshot['team'],
                  f'[{engine}/{width}] Save changes intended play only, keeps IDs and linkage')

        # A real browser reload, rather than in-memory rerender, exercises
        # persistence and any local legacy/versioned play normalization.
        pg.reload()
        pg.wait_for_selector('.play-row[data-id=quickie-out]')
        restored=pg.evaluate("""() => {
          const d=window.__team.data;
          return {play:JSON.stringify(d.plays.find(p=>p.id==='quickie-out')),
            team:d.id,other:JSON.stringify(d.plays.find(p=>p.id==='quickie-in'))};
        }""")
        checks.ok(restored=={k:saved[k] for k in ('play','team','other')},
                  f'[{engine}/{width}] edited geometry, versioned links and instructions survive reload')
        pg.locator('.play-row[data-id=quickie-out]').click()
        pg.locator('[data-act=play-mode][data-mode=learn]').click()
        checks.ok('LM draws the defender' in pg.locator('#play-fig .study-cue').inner_text() and
                  pg.locator('#play-fig .plg.study-target').count()==1,
                  f'[{engine}/{width}] reloaded Learn shows saved role and cue')
        pg.locator('[data-act=play-mode][data-mode=watch]').click()
        pg.locator('#anim-seek').evaluate("""e=>{
          e.value='60';e.dispatchEvent(new Event('input',{bubbles:true}));
        }""")
        checks.ok(pg.locator('#anim-pct').inner_text()=='60%' and
                  pg.locator('#play-fig svg.pf.watch-art').count()==1,
                  f'[{engine}/{width}] reloaded Watch still seeks and animates')
        pg.evaluate(act,['preview-on',{}])
        pg.locator('[data-act=play-back]').click()
        pg.locator('.play-row[data-id=quickie-out]').click()
        checks.ok('LM draws the defender' in pg.locator('#play-fig .study-cue').inner_text() and
                  pg.locator('[data-act=play-edit], [data-act=play-del]').count()==0,
                  f'[{engine}/{width}] player preview sees saved cue but not coach controls')
        pg.evaluate(act,['play-edit',{}])
        checks.ok(pg.locator('#sheet form.ped').count()==0 and
                  pg.evaluate('document.documentElement.scrollWidth-innerWidth')<=2,
                  f'[{engine}/{width}] forged player edit cannot open editor or overflow')
        ctx.close()

    ok=checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
