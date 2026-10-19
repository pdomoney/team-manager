# Guided coach authoring and player-visible teaching cues.
# All activity uses synthetic data and a local Chromium browser.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv, url = serve()
checks, errors = Check(), []
act = "([a, ds]) => { const b = document.createElement('button'); b.dataset.act = a; Object.assign(b.dataset, ds || {}); document.body.appendChild(b); b.click(); b.remove(); }"
with sync_playwright() as p:
    browser = p.chromium.launch()
    for width in (390, 1280):
        ctx, pg, errs = page(browser, url + '#home', width=width, height=880, errors=errors)
        pg.get_by_text('Load a sample squad').click()
        pg.goto(url + '#plays')
        pg.locator('.play-row[data-id="quickie-out"]').click()
        pg.locator('[data-act=play-edit]').click()
        pg.wait_for_selector('#sheet form[data-form=play]')
        checks.ok(pg.locator('#ped-teach').is_visible() and pg.locator('#ped-diagram').is_hidden(),
                  f'[{width}] coach starts in Teach, advanced tools are preserved but not distracting')
        checks.ok(pg.locator('[data-act=teach-seed]').is_visible(),
                  f'[{width}] old plays can deliberately seed teaching actions')
        pg.locator('[data-act=teach-seed]').click()
        count = pg.locator('.teach-action').count()
        checks.ok(count >= 3, f'[{width}] existing coaching instructions become editable teaching actions ({count})')
        pg.locator('.teach-action').first.locator('[data-input=teach-title]').fill('First cue')
        pg.locator('.teach-action').first.locator('[data-input=teach-text]').fill('LM draws the marker, then RM attacks.')
        pg.locator('.teach-action').first.locator('[data-change=teach-role]').select_option('LM')
        pg.locator('.teach-action').first.locator('[data-change=teach-move]').select_option('0')
        pg.locator('.teach-action').first.locator('[data-act=teach-preview]').click()
        checks.ok('LM draws the marker' in pg.locator('.teach-preview .study-cue').inner_text() and
                  pg.locator('.teach-preview .mv.study-emphasis').count() == 1,
                  f'[{width}] author preview highlights exact selected line and instruction')
        pg.locator('[data-act=teach-add]').click()
        checks.ok(pg.locator('.teach-action').count() == count + 1, f'[{width}] new action can be added without changing drawing')
        pg.locator('#sheet form[data-form=play] button[type=submit]').click()
        checks.ok(pg.locator('#sheet form[data-form=play]').is_visible(),
                  f'[{width}] incomplete teaching action cannot be saved to players')
        pg.locator('.teach-action').last.locator('[data-input=teach-title]').fill('Final reminder')
        pg.locator('.teach-action').last.locator('[data-input=teach-text]').fill('Chase through together.')
        pg.locator('#sheet form[data-form=play] button[type=submit]').click()
        pg.wait_for_timeout(120)
        saved = pg.evaluate("""() => {
          const p = window.__team.data.plays.find(x => x.id === 'quickie-out');
          return { study: p.study, moves: p.moves.length, steps: p.steps, edited: p.edited };
        }""")
        checks.ok(len(saved['study']) == count + 1 and saved['study'][0]['moves'] == [0] and
                  saved['study'][0]['roles'] == ['LM'] and saved['moves'] > 0 and saved['edited'],
                  f'[{width}] edited built-in play preserves drawing and saves explicit instruction linkage')
        pg.locator('[data-act=play-mode][data-mode=learn]').click()
        checks.ok('LM draws the marker' in pg.locator('#play-fig .study-cue').inner_text(),
                  f'[{width}] saved action appears in coach learning preview')
        pg.evaluate(act, ['preview-on', {}])
        pg.locator('[data-act=play-back]').click()
        pg.locator('.play-row[data-id="quickie-out"]').click()
        checks.ok('LM draws the marker' in pg.locator('#play-fig .study-cue').inner_text() and
                  pg.locator('#play-fig .mv.study-emphasis').count() == 1,
                  f'[{width}] player-facing encrypted-copy projection includes precise cues')
        checks.ok(pg.locator('[data-act=play-edit]').count() == 0,
                  f'[{width}] player cannot open the coach editor')
        checks.ok(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth'),
                  f'[{width}] learning page has no sideways overflow')
        ctx.close()
    ok = checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
