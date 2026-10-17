# Existing features end to end, plus navigation and accessibility checks, at phone and desktop width.
import sys; from harness import *
from playwright.sync_api import sync_playwright
build(); srv, url = serve()
c = Check(); allerrs = []
act = "([a, ds]) => { const b = document.createElement('button'); b.dataset.act = a; Object.assign(b.dataset, ds || {}); document.body.appendChild(b); b.click(); b.remove(); }"
A11Y = """() => {
  const vis = el => el.offsetParent !== null || el.getClientRects().length;
  const name = el => (el.getAttribute('aria-label') || el.textContent || el.title || '').trim() || (el.getAttribute('aria-labelledby') ? 'x' : '');
  const scope = document.querySelector('#sheet:not([hidden])') || document;
  const btn = [...scope.querySelectorAll('button')].filter(vis).filter(b => !name(b)).map(b => b.outerHTML.slice(0, 80));
  const inp = [...scope.querySelectorAll('input:not([type=hidden]),select,textarea')].filter(vis).filter(i => !(i.labels && i.labels.length) && !i.getAttribute('aria-label') && !i.getAttribute('aria-labelledby')).map(i => i.outerHTML.slice(0, 80));
  const small = [...scope.querySelectorAll('button,.chip,[role=button]')].filter(vis).filter(b => !b.matches('.link-btn.inline')).filter(b => { const r = b.getBoundingClientRect(); return r.height && r.height < 24; }).map(b => b.outerHTML.slice(0, 60));
  return { btn, inp, small };
}"""
def a11y(pg, where):
    r = pg.evaluate(A11Y)
    c.ok(not r['btn'], f'{where}: buttons without a name {r["btn"][:3]}')
    c.ok(not r['inp'], f'{where}: fields without a label {r["inp"][:3]}')
    c.ok(not r['small'], f'{where}: targets under 24px {r["small"][:3]}')
with sync_playwright() as p:
    b = p.chromium.launch()
    for width in (390, 1280):
        W = f'[{width}]'
        ctx, pg, errs = page(b, url + '#home', width=width, height=860, errors=allerrs)
        d = lambda js: pg.evaluate(f'(() => {{ const D = window.__team.data, S = window.__team.state; return {js}; }})()')
        pg.wait_for_selector('text=Load a sample squad'); a11y(pg, W + ' empty home')
        pg.click('text=Load a sample squad'); pg.wait_for_timeout(300)
        c.ok('Needs attention' in pg.inner_text('#view'), W + ' home shows what needs attention')
        # every section and view
        groups = pg.eval_on_selector_all('.nav-main', 'els => els.map(e => e.dataset.g)')
        c.ok(groups == ['home', 'schedule', 'team', 'tactics', 'more'], W + f' five sections {groups}')
        for g in groups:
            pg.click(f'.nav-main[data-g={g}]'); pg.wait_for_timeout(120)
            c.ok(pg.get_attribute(f'.nav-main[data-g={g}]', 'aria-current') == 'page', f'{W} {g} marked current')
            views = pg.eval_on_selector_all('.subnav button' if width < 1000 else f'.nav-group.on .nav-sub button', 'els => els.map(e => e.dataset.tab)')
            for v in views or [d('S.tab')]:
                pg.click(f'{".subnav" if width < 1000 else ".nav-group.on .nav-sub"} [data-tab={v}]') if views else None
                pg.wait_for_timeout(120)
                c.ok(len(pg.inner_text('#view').strip()) > 20 and d('S.tab') == v, f'{W} view {v} renders')
                a11y(pg, f'{W} {v}')
        c.ok(pg.title().startswith('Teams'), W + f' title names the view: {pg.title()}') if d('S.tab') == 'teams' else None
        # squad: add, search, filter, edit
        pg.goto(url + '#squad'); pg.wait_for_timeout(100)
        pg.evaluate(act, ['add-player', {}]); a11y(pg, W + ' player form')
        pg.click('#sheet button[value=save]'); c.ok(pg.locator('#sheet .err').count() == 1 or not pg.evaluate("document.querySelector('#sheet input[name=name]').checkValidity()"), W + ' missing name stops the form at the field')
        pg.fill('#sheet input[name=name]', 'Zara Quinn'); pg.check('#sheet input[value=F]'); pg.click('#sheet button[value=save]'); pg.wait_for_timeout(100)
        c.ok(d("D.players.some(p => p.name === 'Zara Quinn')"), W + ' player added')
        pg.fill('[data-input=squad-search]', 'zara'); pg.wait_for_timeout(100)
        c.ok(pg.locator('#squad-list .row').count() == 1, W + ' search')
        pg.fill('[data-input=squad-search]', '')
        # training: weekly sessions, roll call
        pg.goto(url + '#training'); pg.wait_for_timeout(100)
        n0 = d('D.sessions.length')
        pg.evaluate(act, ['add-session', {}]); pg.fill('#sheet input[name=date]', '2026-11-03'); pg.check('#sheet input[name=repeat]')
        pg.fill('#sheet input[name=until]', '2026-11-24'); pg.click('#sheet button[type=submit]'); pg.wait_for_timeout(100)
        c.ok(d('D.sessions.length') - n0 == 4, W + ' weekly sessions added')
        sid = d("D.sessions.find(s => s.date < new Date().toISOString().slice(0,10) && !Object.keys(s.attendance).length)?.id || D.sessions[0].id")
        pg.evaluate(act, ['roll', {'id': sid}]); pg.click('#sheet [data-act=mark-all]'); pg.click('#sheet [data-act=roll-done]'); pg.wait_for_timeout(100)
        c.ok(d(f"Object.keys(D.sessions.find(s => s.id === '{sid}').attendance).length") == d('D.players.length'), W + ' roll call saved')
        # lineup: assign, move by keyboard, shapes, systems
        pg.goto(url + '#field'); pg.wait_for_timeout(150)
        pg.click('#field [data-slot=LW]'); pg.wait_for_selector('#sheet .pick'); a11y(pg, W + ' assign sheet')
        pg.click('#sheet .pick:has-text("Zara Quinn")'); pg.wait_for_timeout(100)
        c.ok(d("D.lineups[0].slots.find(s => s.id === 'LW').playerId === D.players.find(p => p.name === 'Zara Quinn').id"), W + ' player put in a position')
        pg.click('[data-act=move-mode][data-on="1"]'); pg.focus('#field [data-slot=RW]'); x0 = d("D.lineups[0].slots.find(s => s.id === 'RW').x")
        pg.keyboard.press('ArrowLeft'); pg.wait_for_timeout(50)
        c.ok(abs(d("D.lineups[0].slots.find(s => s.id === 'RW').x") - (x0 - 1)) < 0.01, W + ' position moved with the keyboard')
        pg.click('[data-act=move-mode][data-on="0"]'); pg.click('[data-act=shape][data-shape=defence]')
        pg.click('.sys-chip >> nth=1'); pg.wait_for_timeout(100)
        c.ok(pg.locator('.sys-card').count() == 1 and pg.locator('#field .sy-t, #field .sy-mv').count() > 0, W + ' game system drawn with its card')
        pg.click('.sys-chip >> nth=1'); pg.wait_for_timeout(50)
        c.ok('males' in pg.inner_text('#view'), W + ' mixed-team check shown')
        # plays: open, flip, animate, edit and save, duplicate, player lists
        pg.goto(url + '#plays'); pg.wait_for_timeout(150)
        n_plays = pg.locator('.play-row').count(); c.ok(n_plays >= 8, W + f' starter plays listed ({n_plays})')
        pg.click('.play-row >> nth=3'); pg.wait_for_timeout(150)
        pg.click('[data-act=play-side][data-side=left]'); pg.wait_for_timeout(100)
        c.ok(pg.locator('#play-fig svg.pf').count() >= 1, W + ' play drawn attacking left')
        pg.click('[data-act=anim-play]'); pg.wait_for_timeout(400)
        c.ok(pg.evaluate('window.__team.anim.playing || window.__team.anim.done'), W + ' animation runs')
        pg.click('[data-act=play-edit]'); pg.wait_for_selector('#sheet form[data-form=play]')
        pg.fill('#sheet input[name=name]', 'Edited play'); pg.click('#sheet [data-act=ped-tool][data-t=run]')
        pg.click('#sheet form[data-form=play] button[type=submit]'); pg.wait_for_timeout(150)
        c.ok(d("D.plays.some(p => p.name === 'Edited play')"), W + ' play edited and saved')
        pg.click('[data-act=play-dup]'); pg.wait_for_timeout(100)
        c.ok(d("D.plays.filter(p => p.name.startsWith('Edited play')).length") == 2, W + ' play duplicated')
        pg.evaluate(act, ['psets', {}]); pg.wait_for_selector('#sheet [data-act=pset-new]'); pg.keyboard.press('Escape')
        # tasks, helpers, tally, checklist
        pg.goto(url + '#tasks'); pg.wait_for_timeout(100)
        pg.evaluate(act, ['task-new', {}]); a11y(pg, W + ' task form')
        pg.fill('#sheet input[name=title]', 'Bring oranges'); pg.fill('#sheet input[name=date]', '2026-11-07'); pg.click('#sheet button[type=submit]'); pg.wait_for_timeout(150)
        c.ok(d("D.tasks.some(t => t.title === 'Bring oranges')"), W + ' task added')
        pg.keyboard.press('Escape'); pg.evaluate(act, ['task-checklist', {}]); pg.fill('#sheet input[name=date]', '2026-11-14'); pg.click('#sheet form[data-form=task-checklist] button[type=submit]'); pg.wait_for_timeout(100)
        c.ok(d("D.tasks.filter(t => t.date === '2026-11-14').length") == 6, W + ' game-day checklist added')
        # messages and notices
        pg.goto(url + '#messages'); pg.wait_for_timeout(100)
        for t in ('reminder', 'availability', 'match', 'results', 'lineup', 'help', 'countdown'):
            pg.click(f'[data-act=tpl][data-t={t}]'); pg.wait_for_timeout(40)
            c.ok(len(pg.input_value('#msg')) > 20, f'{W} template {t}')
        pg.evaluate(act, ['add-notice', {}]); pg.fill('#sheet textarea[name=text]', 'Photos on Saturday'); pg.click('#sheet button[type=submit]'); pg.wait_for_timeout(100)
        c.ok(d("D.notices[0].text") == 'Photos on Saturday', W + ' notice posted')
        # dialog behaviour: inert background, focus trapped, Escape returns focus
        pg.goto(url + '#more'); pg.wait_for_timeout(100)
        pg.focus('.more-item[data-act=settings]'); pg.keyboard.press('Enter'); pg.wait_for_selector('#sheet .panel')
        c.ok(pg.evaluate("document.querySelector('#view').inert && document.querySelector('#tabs').inert"), W + ' page behind the sheet is inert')
        c.ok(pg.evaluate("document.querySelector('#sheet .panel').getAttribute('aria-labelledby') === 'sheet-title'"), W + ' sheet labelled by its title')
        for _ in range(60): pg.keyboard.press('Tab')
        c.ok(pg.evaluate("document.querySelector('#sheet').contains(document.activeElement)"), W + ' focus stays in the sheet')
        a11y(pg, W + ' settings')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
        c.ok(pg.evaluate("document.activeElement && document.activeElement.dataset.act === 'settings'"), W + ' focus back where it was')
        # settings: layout and players' view
        pg.evaluate(act, ['preview-on', {}]); pg.wait_for_timeout(100)
        c.ok(pg.locator('.nav-sub [data-tab=attendance], .subnav [data-tab=attendance]').count() == 0, W + ' players have no attendance view')
        pg.goto(url + '#home'); pg.wait_for_timeout(100); a11y(pg, W + ' player home')
        c.ok('Needs attention' not in pg.inner_text('#view'), W + ' players don’t see the coach’s action list')
        pg.evaluate(act, ['preview-off', {}])
        ctx.close()
    ok = c.done(allerrs); b.close()
srv.shutdown(); sys.exit(0 if ok else 1)
