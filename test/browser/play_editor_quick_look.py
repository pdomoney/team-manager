# B6: actual coach editor Quick Look and defender route on mobile/desktop.
# Synthetic local-only Playwright; no installed Pages or physical Safari claim.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv, url=serve()
checks, errors=Check(), []

with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390, 1280):
        ctx, pg, _=page(browser,url+'#home',width=width,height=860,errors=errors)
        pg.get_by_text('Load a sample squad').click()
        pg.goto(url+'#plays')
        pg.locator('.play-row[data-id=quickie-out]').click()
        original=pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(p=>p.id==='quickie-out'))""")
        pg.locator('[data-act=play-edit]').click()
        snap=pg.locator('[data-act=ped-snap]')
        checks.ok(snap.get_attribute('aria-pressed')=='true' and
                  'On' in snap.inner_text() and
                  pg.evaluate('window.__team.state.ped.snapEnabled') is True,
                  f'[{width}] Snap is on by default in editor, not persisted into play')

        pg.locator('#ped-tools [data-t=shift]').click()
        checks.ok('Defender run' in pg.locator('#ped-tools [data-t=shift]').inner_text() and
                  pg.locator('#ped-defender-help').is_visible() and
                  'marker' in pg.locator('#ped-defender-help').inner_text(),
                  f'[{width}] defender drawing purpose and starting gesture explained')
        pg.locator('#ped-tools [data-t=select]').click()
        pg.locator('#ped-field svg [data-df="0"]').first.click()
        create=pg.locator('#ped-precision [data-act=ped-defender-run]')
        checks.ok(create.count()==1 and create.is_visible(),
                  f'[{width}] selected defender has one-click run action with inspector collapsed')
        before=pg.evaluate('window.__team.state.ped.draft.moves.length')
        create.click()
        draft=pg.evaluate("""() => {
          const d=window.__team.state.ped.draft,m=d.moves.at(-1);
          return {n:d.moves.length,t:m.t,links:m.actorLinks,pts:m.pts,defender:d.defence.line[0],
            dirty:window.__team.state.ped.dirty,sel:window.__team.state.ped.sel};
        }""")
        checks.ok(draft['n']==before+1 and draft['t']=='shift' and
                  draft['links']['start']=='defender:0' and
                  draft['pts'][0]==draft['defender'] and draft['dirty'] and
                  draft['sel']['k']=='mv',
                  f'[{width}] defender run links to actual selected defender without saving: {draft!r}')
        checks.ok(pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(p=>p.id==='quickie-out'))""")==original,
                  f'[{width}] adding defender path changes only the editor draft')

        # Form field edits are not committed until Save but Quick Look must see them.
        setup=pg.locator('details.ped-setup')
        if not setup.get_attribute('open'): setup.locator('summary').click()
        pg.locator('#sheet form.ped [name=name]').fill('Unsaved Step Out coaching preview')
        pg.locator('[data-act=ped-quicklook]').click()
        preview=pg.locator('#ped-quicklook')
        checks.ok(preview.is_visible() and
                  pg.locator('#ped-quick-title').inner_text()=='Unsaved Step Out coaching preview' and
                  pg.locator('#ped-diagram').is_hidden() and
                  pg.locator('#ped-quick-stage svg.pf').count()==1,
                  f'[{width}] Quick Look shows current unsaved diagram and typed name without leaving editor')
        checks.ok(pg.evaluate("window.__team.state.ped.quick.draft.moves.at(-1).t")=='shift' and
                  pg.evaluate("window.__team.state.ped.quick.draft.moves.at(-1).actorLinks.start")=='defender:0',
                  f'[{width}] Quick Look includes the unsaved linked defender run')

        play=pg.locator('[data-act=ped-quick-play]')
        slow=pg.locator('[data-act=ped-quick-slow]')
        checks.ok(slow.get_attribute('aria-pressed')=='false' and
                  'Play' in play.inner_text(),
                  f'[{width}] Quick Look has Play and Slow controls initially ready')
        play.click()
        pg.wait_for_function("""() => {
          const s=document.querySelector('#ped-quick-seek');
          return s && Number(s.value)>0;
        }""", timeout=5000)
        checks.ok('Pause' in play.inner_text() and
                  pg.evaluate('window.__team.state.ped.quick.playing') is True,
                  f'[{width}] Play starts animation from unsaved draft and progress advances')
        slow.click()
        checks.ok(slow.get_attribute('aria-pressed')=='true' and
                  'On' in slow.inner_text() and
                  pg.evaluate('window.__team.state.ped.quick.slow') is True,
                  f'[{width}] Slow changes live preview animation speed')
        play.click()
        checks.ok('Play' in play.inner_text() and
                  pg.evaluate('window.__team.state.ped.quick.playing') is False,
                  f'[{width}] Play toggles to Pause and back safely')
        seek=pg.locator('#ped-quick-seek')
        seek.evaluate("""e=>{e.value='60';e.dispatchEvent(new Event('input',{bubbles:true}));}""")
        checks.ok(pg.locator('#ped-quick-pct').inner_text()=='60%' and
                  pg.evaluate('window.__team.state.ped.quick.playing') is False,
                  f'[{width}] Quick Look seek positions approximate animation without saving')
        pg.locator('[data-act=ped-quick-restart]').click()
        checks.ok(pg.locator('#ped-quick-pct').inner_text()=='0%' and
                  slow.get_attribute('aria-pressed')=='true',
                  f'[{width}] Restart resets progress and retains selected Slow setting')

        pg.locator('[data-act=ped-quick-close]').click()
        checks.ok(pg.locator('#ped-diagram').is_visible() and preview.is_hidden() and
                  pg.evaluate('window.__team.state.ped.quick') is None and
                  pg.evaluate('window.__team.state.ped.draft.moves.length')==before+1 and
                  pg.locator('#ped-quicklook').count()==1,
                  f'[{width}] Back to editing restores unchanged unsaved draft without exiting')
        checks.ok(pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(p=>p.id==='quickie-out'))""")==original,
                  f'[{width}] Quick Look did not commit the source play')
        pg.locator('#sheet .ped-save [data-act=ped-cancel]').click()
        checks.ok(pg.locator('#sheet form.ped').count()==0 and
                  pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(p=>p.id==='quickie-out'))""")==original,
                  f'[{width}] Cancel discards defender run and typed name, preserving Step Out')

        pg.evaluate("""() => {
          const el=document.createElement('button');el.dataset.act='preview-on';
          document.body.append(el);el.click();el.remove();
        }""")
        pg.locator('[data-act=play-back]').click()
        pg.locator('.play-row[data-id=quickie-out]').click()
        checks.ok(pg.locator('[data-act=ped-quicklook], [data-act=play-edit]').count()==0,
                  f'[{width}] Player preview cannot reach unsaved editor Quick Look')
        ctx.close()
    ok=checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
