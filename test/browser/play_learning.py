# Player learning modes, readable step navigation, role highlighting, mirroring,
# animation scrubbing, and read-only player preview. Synthetic browser data only.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv, url = serve()
checks, allerrs = Check(), []
act = "([a, ds]) => { const b = document.createElement('button'); b.dataset.act = a; Object.assign(b.dataset, ds || {}); document.body.appendChild(b); b.click(); b.remove(); }"

page_helper = page
with sync_playwright() as p:
    browser = p.chromium.launch()
    for width in (390, 1280):
        ctx, page, errs = page_helper(browser, url + '#home', width=width, height=865, errors=allerrs)
        page.get_by_text('Load a sample squad').click()
        page.goto(url + '#plays')
        page.wait_for_selector('.play-row')
        page.locator('.play-row[data-id="quickie-out"]').click()
        checks.ok(page.locator('[data-act=play-mode][data-mode=watch][aria-pressed=true]').count() == 1,
                  f'[{width}] coach opens existing Watch mode without breaking the legacy workflow')
        checks.ok(page.locator('#anim-seek').count() == 1, f'[{width}] animation exposes a keyboard-operable seek control')
        page.locator('[data-act=anim-play]').click()
        page.wait_for_timeout(150)
        page.locator('#anim-seek').evaluate("(e) => { e.value = '65'; e.dispatchEvent(new Event('input', {bubbles:true})); }")
        checks.ok(page.locator('#anim-pct').inner_text() == '65%' and
                  page.evaluate('!window.__team.anim.playing'),
                  f'[{width}] scrubbing stops playback and seeks inside the phase')
        page.locator('[data-act=anim-restart]').click()
        checks.ok(page.locator('#anim-pct').inner_text() == '0%',
                  f'[{width}] restart returns animation to start')
        page.locator('[data-act=play-mode][data-mode=learn]').click()
        checks.ok(page.locator('#play-fig .study-cue').count() == 1 and
                  page.locator('#play-fig svg.pf.study').count() == 1 and
                  page.locator('#play-fig .study-cue').inner_text().find('RM') >= 0,
                  f'[{width}] learning screen pairs coaching cue with uncluttered SVG')
        checks.ok(page.locator('#play-fig .pf-note').count() == 0,
                  f'[{width}] study removes diagram note clutter without deleting original data')
        checks.ok(page.locator('#play-fig .plg.study-target').count() > 0,
                  f'[{width}] cues focus real named positions')
        first = page.locator('#play-fig .study-cue').inner_text()
        page.locator('[data-act=study-next]').click()
        checks.ok(page.locator('#play-fig .study-cue').inner_text() != first and
                  page.locator('[data-act=study-prev]').is_enabled(),
                  f'[{width}] next/previous instructions are navigable')
        page.locator('[data-change=study-role]').select_option('LM')
        checks.ok(page.locator('#play-fig .plg.study-target').count() == 1 and
                  page.locator('#play-fig .plg.study-soft').count() >= 1,
                  f'[{width}] player-selected role is highlighted independently of cue')
        page.locator('[data-act=play-side][data-side=left]').click()
        checks.ok(page.locator('#play-fig svg.pf.study').get_attribute('aria-label').endswith('attacking left'),
                  f'[{width}] mirrored player learning diagram is readable')
        checks.ok(page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'),
                  f'[{width}] learning layout does not overflow viewport')
        page.evaluate(act, ['preview-on', {}])
        page.locator('[data-act=play-back]').click()
        page.locator('.play-row[data-id="quickie-out"]').click()
        checks.ok(page.locator('[data-act=play-mode][data-mode=learn][aria-pressed=true]').count() == 1,
                  f'[{width}] actual player-facing preview starts in Learn mode')
        checks.ok(page.locator('[data-act=play-edit], [data-act=play-del]').count() == 0,
                  f'[{width}] player learning cannot edit or delete a play')
        page.locator('[data-act=play-mode][data-mode=watch]').click()
        checks.ok(page.locator('[data-act=anim-play]').count() == 1,
                  f'[{width}] players can switch to an animation whenever they choose')
        ctx.close()
    okay = checks.done(allerrs)
    browser.close()
srv.shutdown()
sys.exit(0 if okay else 1)
