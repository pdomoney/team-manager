# Rule sets: the Rules page, by-laws, the update bell and review, the rule book watch, the players' view.
import sys, json; from harness import *
from playwright.sync_api import sync_playwright
build(); srv, url = serve()
# A Rules watch result that saw the Oztag rule book change after the rules were checked against it.
with open(os.path.join(DIST, 'data', 'rules-watch.json'), 'w') as f:
    json.dump({ 'format': 'rules-watch', 'version': 1, 'checkedAt': '2026-11-02T08:00:00.000Z', 'pack': 1, 'sources': {
        'oztag': { 'url': 'https://api.oztag.com.au/wp-content/uploads/2026/09/AO-RULEBOOK-2022.pdf', 'status': 200, 'sha256': 'a' * 64, 'bytes': 1, 'lastModified': None, 'firstSeen': '2026-10-19T08:00:00.000Z', 'changedAt': '2026-11-02T08:00:00.000Z' },
        'league-tag': { 'url': 'https://www.playrugbyleague.com/media/16327/league-tag-laws-of-the-game-2018-1.pdf', 'status': 503, 'sha256': None, 'bytes': None, 'lastModified': None, 'firstSeen': None, 'changedAt': None, 'error': 'HTTP 503' } } }, f)
c = Check()
act = "([a, ds]) => { const b = document.createElement('button'); b.dataset.act = a; Object.assign(b.dataset, ds || {}); document.body.appendChild(b); b.click(); b.remove(); }"
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx, pg, errs = page(b, url + '#home', width=390, height=844)
    pg.wait_for_selector('text=Load a sample squad')
    W = lambda js: pg.evaluate(f'(() => {{ const W = window.__team.ws, D = window.__team.data, M = window.__team.M; return {js}; }})()')
    pg.wait_for_timeout(300)
    c.ok(pg.is_visible('#bell-btn') and pg.inner_text('#bell-btn .badge') == '2', 'bell: the rule update and the changed rule book')
    pg.click('#bell-btn'); pg.wait_for_selector('#sheet .notice')
    txt = pg.inner_text('#sheet')
    c.ok('Rules updated' in txt and 'Australian Oztag / ITF Official Rulebook has changed' in txt, 'updates sheet lists both')
    pg.keyboard.press('Escape')
    pg.click('[data-act=sample]'); pg.wait_for_timeout(200)
    # the Rules page
    pg.goto(url + '#rules'); pg.wait_for_timeout(150)
    txt = pg.inner_text('#view')
    c.ok('Mixed' in txt and '7 m' in txt and 'Female 2, male 1' in txt and 'Most males on field' in txt, 'rules at a glance for mixed Oztag')
    c.ok('Rule 7.22–7.24, 7.28' in txt and 'tap 10 m out' in txt and 'allowed in general play, on any tag' in txt, 'rules with their rule-book numbers')
    c.ok('changed (found' in txt and 'Couldn’t check: League Tag Laws' in txt, 'rule book watch on the Rules page')
    pg.screenshot(path=shot('rules-phone.png'), full_page=True)
    # by-laws: one that adds, one that replaces a rule that has just changed
    pg.click('[data-act=bylaw-add]'); pg.wait_for_selector('#sheet form[data-form=bylaw]')
    pg.click('#sheet form[data-form=bylaw] button[type=submit]'); pg.wait_for_timeout(100)
    c.ok(pg.is_visible('#sheet [name=text][aria-invalid=true]'), 'an empty by-law is flagged beside the field')
    pg.fill('#sheet textarea[name=text]', 'Games are 2 × 15 minutes with a 2-minute break.'); pg.select_option('#sheet select[name=topic]', 'Field')
    pg.click('#sheet form[data-form=bylaw] button[type=submit]'); pg.wait_for_timeout(150)
    pg.click('[data-act=bylaw-add]'); pg.wait_for_selector('#sheet form[data-form=bylaw]')
    pg.fill('#sheet textarea[name=text]', 'No kicking inside the last 2 minutes.'); pg.select_option('#sheet select[name=topic]', 'Kicking')
    pg.select_option('#sheet select[name=replaces]', 'oztag.kick.allowed')
    pg.click('#sheet form[data-form=bylaw] button[type=submit]'); pg.wait_for_timeout(150)
    c.ok(W('D.team.bylaws.length') == 2 and W('D.team.bylaws[1].replaces') == 'oztag.kick.allowed', 'by-laws saved with the rule they replace')
    c.ok(pg.locator('.rule-list li.replaced').count() == 1 and 'Our by-law applies instead' in pg.inner_text('#view'), 'the replaced rule is marked')
    # review the update
    pg.goto(url + '#home'); pg.wait_for_timeout(100)
    c.ok(W('M.homeView(W, null, new Date()).actions.some(a => a.kind === "rules" && a.act === "rules-review")') or 'Rules updated' in pg.inner_text('#view'), 'Home lists the rule update to review')
    pg.evaluate(act, ['rules-review', {}]); pg.wait_for_selector('#sheet form[data-form=rules-review]')
    txt = pg.inner_text('#sheet')
    c.ok(all(n in txt for n in ['When to kick', 'Their red zone', 'Defence up', 'Defence slide', 'Exit set']), 'review lists the game systems that rely on the changed rules')
    c.ok('No kicking inside the last 2 minutes' in txt and 'still applies' in txt, 'review flags the by-law that replaces a changed rule')
    pg.set_viewport_size({'width': 390, 'height': 1900}); pg.wait_for_timeout(600); pg.screenshot(path=shot('rules-review.png')); pg.set_viewport_size({'width': 390, 'height': 844})
    pg.click('#sheet [data-act=review-system][data-id=kick]'); pg.wait_for_timeout(150)
    c.ok(W('window.__team.state.tab') == 'field' and W('window.__team.state.system') == 'kick' and 'legal on any tag' in pg.inner_text('#view'), 'Open shows the game system with the new words')
    pg.evaluate(act, ['rules-review', {}]); pg.wait_for_selector('#sheet form[data-form=rules-review]')
    pg.click('#sheet form[data-form=rules-review] button[type=submit]'); pg.wait_for_timeout(150)
    c.ok(W('D.team.rulesSeen') == W('M.RULES.pack') and 'Tactics › Rules' in W('D.notices[0].text'), 'marked as reviewed, with a notice to players')
    c.ok(pg.inner_text('#bell-btn .badge') == '1', 'bell now only shows the rule book change')
    # settings: the rule set and the males number
    pg.evaluate(act, ['settings', {'sec': 'team'}]); pg.wait_for_selector('#sheet select[name=rules]')
    c.ok('Automatic: Oztag, Mixed' in pg.inner_text('#sheet select[name=rules]'), 'rule set: automatic from the club and category')
    pg.fill('#sheet input[name=maxMales]', ''); pg.click('#sheet form[data-form=settings] button[type=submit]'); pg.wait_for_timeout(150)
    c.ok(W("D.team.maxMales") == '' and W('M.maxMalesOf(D.team)') == 4, 'blank males number follows the rule set')
    pg.fill('#sheet input[name=maxMales]', '3'); pg.select_option('#sheet select[name=rules]', 'league/u12')
    pg.click('#sheet form[data-form=settings] button[type=submit]'); pg.wait_for_timeout(150); pg.keyboard.press('Escape')
    pg.goto(url + '#rules'); pg.wait_for_timeout(150)
    txt = pg.inner_text('#view')
    c.ok('Sport and rule set need review' in txt and 'Oztag' in txt and 'Rugby league' in txt
         and '100 × 68 m' not in txt and W("D.team.rules") == 'league/u12',
         'another sport rule set stays saved but its scoring and gameplay are hidden pending review')
    pg.evaluate(act, ['settings', {'sec': 'team'}]); pg.wait_for_selector('#sheet select[name=rules]')
    pg.select_option('#sheet select[name=rules]', ''); pg.click('#sheet form[data-form=settings] button[type=submit]'); pg.wait_for_timeout(150); pg.keyboard.press('Escape')
    pg.goto(url + '#rules'); pg.wait_for_timeout(150)
    c.ok('our by-law' in pg.inner_text('.rule-values'), 'a team number for males shows as our by-law')
    # a play's rules
    pg.goto(url + '#plays'); pg.wait_for_timeout(100)
    pg.evaluate(act, ['play-edit', {'id': 'quickie-out'}]); pg.wait_for_selector('#sheet form[data-form=play]')
    pg.evaluate(act, ['ped-tab', {'tab': 'words'}]); pg.wait_for_timeout(100)
    c.ok('Rules this play relies on (3)' in pg.inner_text('#sheet .rule-pick summary'), 'a starter play lists the rules it relies on')
    pg.click('#sheet .rule-pick summary'); pg.check('#sheet input[name=rules][value="oztag.kick.allowed"]')
    pg.click('#sheet form[data-form=play] button[type=submit]'); pg.wait_for_timeout(150)
    c.ok('oztag.kick.allowed' in W("D.plays.find(p => p.id === 'quickie-out').rules"), 'play rules saved')
    # the players' view
    pg.evaluate(act, ['preview-on', {}]); pg.goto(url + '#rules'); pg.wait_for_timeout(150)
    txt = pg.inner_text('#view')
    c.ok('Games are 2 × 15 minutes' in txt and 'Rule 7.22–7.24, 7.28' in txt, 'players see the rules and by-laws')
    c.ok(pg.locator('#view [data-act=bylaw-edit], #view [data-act=bylaw-add], #view [data-act=rules-check]').count() == 0 and 'Rule book watch' not in txt, 'players can’t edit and don’t see the watch')
    c.ok('rules' in pg.evaluate("[...document.querySelectorAll('#tabs [data-tab]')].map(b => b.dataset.tab).join(' ')"), 'Rules is in the players’ Tactics section')
    pg.evaluate(act, ['preview-off', {}]); pg.wait_for_timeout(100)
    # wide screen
    ctx2, pg2, errs2 = page(b, url + '#rules', width=1280, height=900, errors=errs)
    pg2.wait_for_selector('.rule-values'); pg2.screenshot(path=shot('rules-wide.png'), full_page=True)
    c.ok(pg2.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'no sideways scroll on a wide screen')
    c.ok(pg.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'no sideways scroll on a phone')
    ok = c.done(errs); b.close()
srv.shutdown(); sys.exit(0 if ok else 1)
