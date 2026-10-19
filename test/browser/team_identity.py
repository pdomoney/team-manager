# Team identity: colour styles chosen in Settings (preview, save, per team, players), sport icons, and
# accreditation badges for match-day volunteers. Phone and desktop. Synthetic data only.
import sys, json
from harness import *
from playwright.sync_api import sync_playwright

build()
srv, url = serve()
c, errs = Check(), []
act = "([a, ds]) => { const b = document.createElement('button'); b.dataset.act = a; Object.assign(b.dataset, ds || {}); document.body.appendChild(b); b.click(); b.remove(); }"
# WCAG contrast of an element's text against the first opaque background behind it
CONTRAST = """sel => { const e = document.querySelector(sel); if (!e) return 0;
  const rgb = c => (c.match(/[\\d.]+/g) || []).map(Number), lum = ([r, g, b]) => [r, g, b].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
  const bg = el => { while (el) { const v = rgb(getComputedStyle(el).backgroundColor); if (v.length && (v.length < 4 || v[3] > .5)) return v; el = el.parentElement; } return [255, 255, 255]; };
  const a = lum(rgb(getComputedStyle(e).color)), b = lum(bg(e)); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); }"""
BG = "sel => getComputedStyle(document.querySelector(sel)).backgroundColor"
hexrgb = lambda h: 'rgb({}, {}, {})'.format(int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16))
with sync_playwright() as p:
    browser = p.chromium.launch()
    for width in (390, 1280):
        ctx, pg, _ = page(browser, url + '#home', width=width, height=860, errors=errs)
        W = lambda js: pg.evaluate(f'(() => {{ const W = window.__team.ws, D = window.__team.data, M = window.__team.M; return {js}; }})()')
        pg.get_by_text('Load a sample squad').click(); pg.wait_for_timeout(250)
        classic_top = pg.evaluate(BG, '.top')
        c.ok(classic_top == 'rgb(18, 61, 43)' and pg.evaluate(BG, '.btn.primary') == 'rgb(211, 38, 58)' and pg.evaluate("document.documentElement.dataset.teamStyle") is None,
             f'[{width}] no style chosen: the classic look, unchanged')
        # Settings › Team colours: preview, close without saving, then save
        pg.evaluate(act, ['settings', {}]); pg.wait_for_selector('#team-colours')
        c.ok(pg.locator('#sheet [name=teamStyle]').count() >= 18 and pg.is_checked('#sheet [name=teamStyle][value=""]'), f'[{width}] more than a dozen styles to choose from, classic selected')
        pg.click('#sheet .style-sw:has(input[value=maroon])')
        c.ok(pg.evaluate(BG, '.top') == hexrgb('#4E0B27'), f'[{width}] picking a style shows it straight away')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
        c.ok(pg.evaluate(BG, '.top') == classic_top and W('D.team.style') is None, f'[{width}] closing Settings without saving puts the colours back')
        pg.evaluate(act, ['settings', {}]); pg.wait_for_selector('#team-colours')
        pg.click('#sheet .style-sw:has(input[value=maroon])'); pg.click('#sheet form[data-form=settings] button[type=submit]'); pg.wait_for_timeout(150); pg.keyboard.press('Escape')
        c.ok(W('D.team.style') == {'palette': 'maroon'} and pg.evaluate(BG, '.top') == hexrgb('#4E0B27'), f'[{width}] saved with the team')
        pg.reload(); pg.wait_for_function('window.__team && window.__team.ws'); pg.wait_for_timeout(250)
        c.ok(pg.evaluate(BG, '.top') == hexrgb('#4E0B27') and pg.evaluate("document.documentElement.dataset.teamStyle") == 'maroon', f'[{width}] still there after a reload')
        c.ok(pg.evaluate("getComputedStyle(document.querySelector('.focus')).position") == 'relative' and pg.evaluate(CONTRAST, '.focus .btn.primary') >= 4.5
             and pg.evaluate(BG, '.focus .btn.primary') != pg.evaluate(BG, '.focus'), f'[{width}] the main card’s button stands out and reads clearly')
        # every palette, on the real page: header text, buttons and the selected tab
        bad = []
        styles = pg.evaluate("async () => (await import('./team-style.js')).TEAM_STYLES.map(s => s.id)")
        for sid in styles:
            W(f"(D.team.style = {{ palette: '{sid}' }}, 1)"); pg.goto(url + '#squad'); pg.wait_for_timeout(60)
            hdr, btn = pg.evaluate(CONTRAST, '#team-title .t-name'), pg.evaluate(CONTRAST, '#view .btn.primary')
            if hdr < 7 or btn < 4.5: bad.append((sid, round(hdr, 1), round(btn, 1)))
        c.ok(not bad and len(styles) >= 13, f'[{width}] every style passes on the page: header text 7:1, button text 4.5:1 {bad}')
        # your own colours: too pale is adjusted, and says so
        pg.goto(url + '#home'); pg.evaluate(act, ['settings', {}]); pg.wait_for_selector('#team-colours')
        pg.click('#sheet .style-sw:has(input[value=custom])')
        c.ok(pg.is_visible('#sheet .style-custom'), f'[{width}] your own colours: three pickers appear')
        for n, v in [('styleDark', '#a0d0ff'), ('styleAction', '#ffee55'), ('styleAccent', '#334455')]:
            pg.fill(f'#sheet [name={n}]', v); pg.dispatch_event(f'#sheet [name={n}]', 'change')
        c.ok('Adjusted so it stays readable' in pg.inner_text('#sheet .style-note') and pg.evaluate(CONTRAST, '#team-title .t-name') >= 7, f'[{width}] pale colours are adjusted to stay readable, and it says so')
        pg.click('#sheet form[data-form=settings] button[type=submit]'); pg.wait_for_timeout(120); pg.keyboard.press('Escape')
        c.ok(W('D.team.style.custom.dark') == '#A0D0FF', f'[{width}] your own colours are saved as chosen (the page adjusts them)')
        # the club's colours suggest a palette
        W("(W.clubs.find(c => c.id === D.team.clubId).colours = 'Red and white', 1)")
        pg.evaluate(act, ['settings', {}]); pg.wait_for_selector('#team-colours')
        pg.click('#sheet [data-act=style-club]')
        c.ok(pg.is_checked('#sheet [name=teamStyle][value=redwhite]') and pg.evaluate(BG, '.top') == hexrgb('#7D0F1D'), f'[{width}] “closest to the club’s colours” picks Red & White')
        pg.click('#sheet form[data-form=settings] button[type=submit]'); pg.wait_for_timeout(120); pg.keyboard.press('Escape')
        # sport icons: header, crest badge, main card
        pg.goto(url + '#home'); pg.wait_for_timeout(150)
        oz = pg.inner_html('.season-tag .sport-ic')
        c.ok(pg.locator('.season-tag .sport-ic').count() == 1 and pg.locator('.scope.single .sport-pip').count() == 1 and 'Oztag' in pg.inner_text('.scope.single .sport-pip'),
             f'[{width}] the sport beside the season and on the club crest')
        c.ok('url("data:image/svg+xml' in pg.evaluate("getComputedStyle(document.querySelector('section.focus'), '::after').maskImage || getComputedStyle(document.querySelector('section.focus'), '::after').webkitMaskImage"),
             f'[{width}] a faint sport mark on Home’s main card')
        pg.evaluate(act, ['settings', {}]); pg.wait_for_selector('#sheet select[name=teamSport]')
        pg.select_option('#sheet select[name=teamSport]', 'Netball'); pg.click('#sheet form[data-form=settings] button[type=submit]'); pg.wait_for_timeout(120); pg.keyboard.press('Escape')
        c.ok(pg.inner_html('.season-tag .sport-ic') != oz and 'Netball' in pg.inner_text('.scope.single .sport-pip'), f'[{width}] changing the sport changes the icon')
        # the training focus is plain text again, not a dark card
        pg.goto(url + '#training'); pg.wait_for_timeout(150)
        c.ok(pg.locator('.sess-focus').count() > 0 and pg.evaluate(BG, '.sess-focus') == 'rgba(0, 0, 0, 0)', f'[{width}] a session’s focus is plain text')
        # players see the colours and the sport
        pg.evaluate(act, ['preview-on', {}]); pg.goto(url + '#home'); pg.wait_for_timeout(200)
        c.ok(pg.evaluate(BG, '.top') == hexrgb('#7D0F1D') and pg.locator('.season-tag .sport-ic').count() == 1 and pg.locator('.sport-pip').count() == 1, f'[{width}] players see their team’s colours and sport')
        pg.evaluate(act, ['preview-off', {}]); pg.wait_for_timeout(100)
        # a second team: its own colours and sport, and each team chip shows its sport
        pg.evaluate(act, ['teams', {}]); pg.click('text=New team'); pg.fill('#sheet input[name=name]', 'Second Team AFL')
        if pg.locator('#sheet input[name=copySettings]').count() and pg.is_checked('#sheet input[name=copySettings]'): pg.uncheck('#sheet input[name=copySettings]')
        if pg.locator('#sheet input[name=withLibrary]').count() and pg.is_checked('#sheet input[name=withLibrary]'): pg.uncheck('#sheet input[name=withLibrary]')
        pg.click('#sheet form[data-form=team-new] button[type=submit]'); pg.wait_for_timeout(200)
        t2 = W('D.id'); W("(D.team.sport = 'AFL', D.team.style = { palette: 'navyred' }, 1)"); pg.goto(url + '#squad'); pg.goto(url + '#home'); pg.wait_for_timeout(200)
        c.ok(pg.evaluate(BG, '.top') == hexrgb('#0C1E3E'), f'[{width}] each team has its own colours')
        pg.evaluate(act, ['home-scope', {'kind': 'all', 'id': ''}]); pg.wait_for_timeout(150)
        chips = pg.eval_on_selector_all('.scope-team', "bs => bs.map(b => [b.title, b.querySelector('.chip-ic') ? b.querySelector('.chip-ic').innerHTML.length : 0])")
        c.ok(len(chips) == 2 and all(n > 0 for _, n in chips) and any('AFL' in t for t, _ in chips) and any('Netball' in t for t, _ in chips), f'[{width}] team chips show each team’s sport {chips}')
        pg.evaluate(act, ['team-pick', {'id': 'team1'}]); pg.wait_for_timeout(150)
        c.ok(pg.evaluate(BG, '.top') == hexrgb('#7D0F1D'), f'[{width}] switching team switches colours')
        pg.evaluate(act, ['team-switch', {}]); pg.wait_for_selector('#sheet .switch-ic')
        c.ok(pg.locator('#sheet .switch-ic').count() == 2 and 'AFL' in pg.inner_text('#sheet'), f'[{width}] the team switcher shows each team’s sport'); pg.keyboard.press('Escape')
        # accreditation badges for match-day volunteers
        W("""(() => { const today = M.isoDay(new Date()), d = n => M.addDays(today, n), team = D.id, club = D.team.clubId; D.team.sport = 'Rugby league';
          W.matchOfficials = [
            { id: 'v1', name: 'Synthetic Coach', clubIds: [club], teamIds: [team], rolesBySport: { 'Rugby league': ['coach', 'blue'] }, accreditationBySport: { 'Rugby league': { coach: d(400), blue: d(20) } }, wwccStatus: 'checked', wwccExpiry: d(700), active: true },
            { id: 'v2', name: 'Synthetic Trainer', clubIds: [club], teamIds: [team], rolesBySport: { 'Rugby league': ['yellow', 'manager'] }, accreditationBySport: { 'Rugby league': { yellow: d(-5) } }, wwccStatus: 'unverified', active: true } ];
          return 1; })()""")
        pg.goto(url + '#crew'); pg.wait_for_selector('.crew-person')
        rows = pg.eval_on_selector_all('.crew-person', "rs => rs.map(r => [r.querySelector('.name').textContent, [...r.querySelectorAll('.cbadge')].map(b => b.className.replace('cbadge s-', '')), r.innerText])")
        coach = next(r for r in rows if r[0] == 'Synthetic Coach'); trainer = next(r for r in rows if r[0] == 'Synthetic Trainer')
        c.ok(coach[1] == ['current', 'current', 'expiring'] and trainer[1] == ['unverified', 'expired', 'role'], f'[{width}] each volunteer’s badges show what they hold and how it stands {coach[1]} {trainer[1]}')
        c.ok('2 current · 1 expires soon' in coach[2] and '1 current · 1 expired · 1 not checked' in trainer[2], f'[{width}] with the same in words')
        c.ok(pg.locator('.crew-person .cbadge[title*="Blue · Level 1 trainer: expires soon"]').count() == 1, f'[{width}] each badge names the accreditation and its date')
        pg.click('.cbadge-legend summary')
        c.ok(pg.locator('.cbadge-legend .cbadge-key li').count() >= 12 and 'Expires within 60 days' in pg.inner_text('.cbadge-legend'), f'[{width}] a key explains every badge and state')
        pg.locator('#view [data-act=crew-basic]').filter(has_text='Synthetic Trainer').click(); pg.wait_for_selector('#sheet .cbadge-list')
        prof = pg.inner_text('#sheet .cbadge-card')
        c.ok('Rugby league' in prof and 'Yellow · LeagueSafe' in prof and 'Expired' in prof and 'Not checked by the club' in prof, f'[{width}] the profile lists each accreditation with its state')
        pg.keyboard.press('Escape')
        m = W("D.matches.filter(x => x.status === 'scheduled').sort((a, b) => a.date.localeCompare(b.date))[0]")
        if not m:
            W("(D.matches.push({ id: 'mx', date: M.addDays(M.isoDay(new Date()), 7), start: '10:00', opponent: 'Synthetic Opponents', status: 'scheduled', rsvp: {}, result: {} }), 1)"); m = {'id': 'mx'}
        pg.evaluate(act, ['match-open', {'id': m['id']}]); pg.wait_for_selector('#sheet [data-act=crew-match-open]')
        pg.locator('#sheet [data-act=crew-match-open]').click(); pg.wait_for_selector('#sheet .crew-assign-row')
        row = pg.locator('#sheet .crew-assign-row').first
        row.locator('select[name=crew-person]').select_option('v1'); row.locator('select[name=crew-role]').select_option('blue')
        c.ok(row.locator('.cbadge').count() == 3 and row.locator('.cbadge.on').get_attribute('title').startswith('Blue'), f'[{width}] picking a person shows their badges, with the role they’re filling ringed')
        row.locator('select[name=crew-role]').select_option('coach')
        c.ok(row.locator('.cbadge.on').get_attribute('title').startswith('Head coach'), f'[{width}] changing the role moves the ring')
        row.locator('input[type=checkbox]').check(); pg.locator('#sheet form[data-form=crew-match] button[type=submit]').click(); pg.wait_for_timeout(120)
        c.ok(pg.locator('#sheet .crew-slots li .cbadge').count() == 2 and 'Synthetic Coach' in pg.inner_text('#sheet .crew-slots'), f'[{width}] the match shows who’s on with their WWCC and role badges')
        pg.keyboard.press('Escape')
        for route in ['home', 'crew', 'training', 'squad', 'reports']:
            pg.goto(url + '#' + route); pg.wait_for_timeout(100)
            if pg.evaluate('document.documentElement.scrollWidth > innerWidth'): c.ok(False, f'[{width}] {route}: sideways scroll')
        c.ok(True, f'[{width}] no sideways scroll on Home, Match staff, Training, Squad or Reports')
        ctx.close()
    ok = c.done(errs)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
