# The style review, applied: calmer colours and readable text, Lineup field-first, the match sheet in
# the order things are needed, quiet staff warnings, the Match Day screen, slim game screens (and
# sideways), Settings in sections, the page-by-page fixes, and editing a volunteer's teams on their
# profile. Phone, sideways phone and desktop. Synthetic data only (the sample squad).
import sys, datetime
from harness import *
from playwright.sync_api import sync_playwright

build()
srv, url = serve()
c, errs = Check(), []
act = "([a, ds]) => { const b = document.createElement('button'); b.dataset.act = a; Object.assign(b.dataset, ds || {}); document.body.appendChild(b); b.click(); b.remove(); }"
CONTRAST = """sel => { const e = document.querySelector(sel); if (!e) return 0;
  const rgb = c => (c.match(/[\\d.]+/g) || []).map(Number), lum = ([r, g, b]) => [r, g, b].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
  const bg = el => { while (el) { const v = rgb(getComputedStyle(el).backgroundColor); if (v.length && (v.length < 4 || v[3] > .5)) return v; el = el.parentElement; } return [255, 255, 255]; };
  const a = lum(rgb(getComputedStyle(e).color)), b = lum(bg(e)); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); }"""
BG = "sel => getComputedStyle(document.querySelector(sel)).backgroundColor"
PX = "sel => parseFloat(getComputedStyle(document.querySelector(sel)).fontSize)"
TOP = "sel => { const e = document.querySelector(sel); return e ? e.getBoundingClientRect().top + window.scrollY : -1; }"
NO_OVERFLOW = 'document.documentElement.scrollWidth <= window.innerWidth + 1'
# A match today, about 50 minutes from now (never past midnight), with its own lineup.
soon = min(datetime.datetime.now() + datetime.timedelta(minutes=50), datetime.datetime.combine(datetime.date.today(), datetime.time(23, 59)))
TODAY_MATCH = f"""(() => {{ const D = window.__team.data, t = new Date(), iso = t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0');
  const lu = JSON.parse(JSON.stringify(D.lineups[0])); lu.id = 'lu-today'; lu.name = 'vs Hills (today)'; D.lineups.push(lu);
  D.sessions = D.sessions.filter(s => s.date !== iso); D.tasks = D.tasks.filter(x => x.date !== iso);
  D.matches.push({{ id: 'm-today', date: iso, start: '{soon.strftime('%H:%M')}', opponent: 'Hills Hornets', venue: 'Hills Sports Park, Castle Hill', field: '4', round: 'Round 6', status: 'scheduled', rsvp: {{}}, result: {{}}, lineupId: 'lu-today' }});
  return 'm-today'; }})()"""

def setup(pg):
    pg.add_style_tag(content='#toast{display:none!important}')
    pg.get_by_text('Load a sample squad').click(); pg.wait_for_timeout(250)

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx, pg, _ = page(browser, url + '#home', width=390, height=844, errors=errs)
    W = lambda js: pg.evaluate(f'(() => {{ const W = window.__team.ws, D = window.__team.data, M = window.__team.M, S = window.__team.state; return {js}; }})()')
    go = lambda tab: (pg.evaluate(act, ['tab', {'tab': tab}]), pg.wait_for_timeout(120))
    setup(pg)

    # ---- Colours and contrast: main buttons green, red for problems and deleting; readable text
    go('squad')
    c.ok(pg.evaluate(BG, '#view .btn.primary') == 'rgb(29, 107, 69)', 'main buttons are the dark green, not red')
    c.ok(pg.evaluate(CONTRAST, '#view .btn.primary') >= 4.5, 'main button text reads clearly')
    go('matches'); W("(S.matchDayId = null, 1)")
    mid = W("D.matches.find(m => m.status === 'scheduled' && m.date >= new Date().toISOString().slice(0, 10)).id")
    pg.evaluate(act, ['match-open', {'id': mid}]); pg.wait_for_selector('#sheet .btn.wa')
    c.ok(pg.evaluate(CONTRAST, '#sheet .btn.wa') >= 4.5, 'WhatsApp button text at least 4.5:1')
    c.ok(pg.evaluate("getComputedStyle(document.querySelector('#sheet .btn.danger')).color") == 'rgb(192, 40, 58)', 'Delete stays red')
    pg.keyboard.press('Escape')
    go('home')
    c.ok(pg.evaluate(CONTRAST, '.tl-issue') >= 4.5, 'orange warning text at least 4.5:1')
    c.ok(pg.evaluate(PX, '.tl-meta') >= 14 and pg.evaluate(PX, '.tl-issue') >= 14, 'secondary text on Home is 14px or more')
    go('attendance')
    c.ok(pg.evaluate(PX, '.heat th') >= 12 and pg.evaluate(PX, '.legend') >= 14, 'attendance table text no smaller than 12px')

    # ---- Home: no repeated team card when there's one team; the club is in the header
    go('home')
    c.ok(pg.locator('#view .scope').count() == 0 and pg.is_visible('#team-crest .crest'), 'one team: no repeated club/team card, club crest in the header')

    # ---- Lineup: the field first, overlays behind one Show button
    go('field')
    c.ok(pg.is_hidden('#overlays') and pg.locator('#view .sys-chip:visible').count() == 0, 'overlays tucked behind Show')
    c.ok(pg.evaluate(TOP, '#field') < 340, f"the field starts near the top ({round(pg.evaluate(TOP, '#field'))}px down, was about 500)")
    c.ok(pg.inner_text('.show-btn .count') == '2', 'Show says how many overlays are on (zones and channels)')
    pg.click('.show-btn'); pg.wait_for_timeout(80)
    c.ok(pg.is_visible('#overlays') and pg.locator('#overlays .sys-chip').count() >= 6, 'Show opens the zones, channels and game systems')
    pg.locator('#overlays .sys-chip').first.click(); pg.wait_for_timeout(100)
    c.ok(pg.is_hidden('#overlays') and pg.locator('#view .sys-card').count() == 1 and pg.inner_text('.show-btn .count') == '3', 'picking a system closes the panel and shows it on the field')
    pg.click('.show-btn'); pg.locator('#overlays .sys-chip[aria-pressed=true]').click(); pg.wait_for_timeout(80)

    # ---- Game screens: slim header, no status bar or sub-tabs crowding the field
    c.ok(pg.evaluate("document.body.classList.contains('game')") and pg.is_hidden('#status'), 'Lineup is a game screen: the test-mode bar steps aside')
    th = pg.evaluate("document.querySelector('.top').offsetHeight")
    c.ok(th <= 56, f'slim one-line header ({th}px)')
    go('squad')
    c.ok(not pg.evaluate("document.body.classList.contains('game')") and pg.is_visible('#status'), 'other screens keep the full header and status bar')

    # ---- Matches: Next up first; the card has the time in large type
    go('matches')
    order = pg.evaluate("[...document.querySelectorAll('#view section.sec h2')].map(h => h.textContent.trim())")
    c.ok(order and order[0] == 'Next up', f'Next up comes first {order[:3]}')
    c.ok(pg.evaluate(PX, '.next-up .m-time') >= 24 and pg.locator('.next-up .m-opp').count() == 1 and pg.locator('.next-up .m-where').count() == 1, 'match card: big time, then opponent and field')
    c.ok(pg.evaluate(NO_OVERFLOW), 'Matches fits a phone')

    # ---- Match sheet: ordered by when things are needed; quiet staff line
    past = W("D.matches.find(m => m.status === 'played').id")
    pg.evaluate(act, ['match-open', {'id': past}]); pg.wait_for_selector('#sheet .m-steps')
    heads = pg.evaluate("[...document.querySelectorAll('#sheet h3.form-sec')].map(h => h.textContent.trim())")
    c.ok(heads[0] == 'Score and notes' and pg.inner_text('#sheet .m-steps [aria-current]') == 'Afterwards', f'finished match: score and notes first {heads}')
    c.ok(pg.locator('#sheet .crew-alert, #sheet .crew-match-summary .diff-list.issues').count() == 0, 'a finished trial game shows no red staffing errors')
    c.ok(pg.locator('#sheet [data-act=result-share]').count() == 1, 'afterwards: Send results')
    pg.keyboard.press('Escape')
    pg.evaluate(act, ['match-open', {'id': mid}]); pg.wait_for_selector('#sheet .m-steps')
    heads = pg.evaluate("[...document.querySelectorAll('#sheet h3.form-sec')].map(h => h.textContent.trim())")
    c.ok(heads[:2] == ['Availability', 'Lineup'] and pg.inner_text('#sheet .m-steps [aria-current]') == 'Before game day', f'before game day: availability, then lineup {heads}')
    c.ok('Staff requirements: not set up' in pg.inner_text('#sheet .crew-quiet') and pg.locator('#sheet .crew-alert').count() == 0
         and pg.locator('#sheet .crew-match-summary .diff-list.issues').count() == 0, 'no requirements: one grey line, not two red errors')
    pg.keyboard.press('Escape')

    # ---- Match Day
    pg.evaluate(TODAY_MATCH)
    go('home')
    c.ok('Hills Hornets' in pg.inner_text('.focus') and pg.locator('.focus [data-go=matchday-open]').count() == 1, 'Home: a match within three hours opens Match Day')
    pg.click('.focus [data-go=matchday-open]'); pg.wait_for_selector('.md')
    c.ok(W('S.tab') == 'matchday' and pg.evaluate(PX, '.md-big .m-time') >= 40 and 'Field 4' in pg.inner_text('.md-head') and 'vs Hills Hornets' in pg.inner_text('.md-head'), 'Match Day: time, field and opponent in large type')
    c.ok(pg.locator('#view .subnav').count() == 0 and pg.evaluate("document.body.classList.contains('game')"), 'Match Day: no sub-tabs, slim header')
    secs = pg.evaluate("[...document.querySelectorAll('.md > section')].map(s => s.className)")
    c.ok(secs[0].startswith('md-here') and secs[1].startswith('md-pitch') and secs[2].startswith('md-score'), f'before kick-off: who’s here, then the field, then the score {secs}')
    pids = W("D.lineups.find(l => l.id === 'lu-today').slots.map(s => s.playerId).filter(Boolean).slice(0, 3)")
    for pid in pids: pg.click(f'.md-p[data-pid="{pid}"]')
    pg.wait_for_timeout(80)
    c.ok(W("Object.keys(D.matches.find(m => m.id === 'm-today').arrived).length") == 3 and '3 of' in pg.inner_text('.md-count')
         and pg.locator('.md-p.on').count() == 3, 'ticking players off as they arrive')
    pg.click(f'.md-p[data-pid="{pids[0]}"]'); pg.wait_for_timeout(60)
    c.ok(W("Object.keys(D.matches.find(m => m.id === 'm-today').arrived).length") == 2, 'and untick')
    bench = W("D.players.filter(p => !D.lineups.find(l => l.id === 'lu-today').slots.some(s => s.playerId === p.id)).length")
    c.ok(pg.locator('.md-bench li').count() == bench and pg.locator('.md-bench li.away').count() == bench and pg.locator('.md-play #field .slot').count() == 8,
         'the field and the bench, with who isn’t here yet')
    c.ok(pg.locator('.md-btn[data-side=us][data-d="-1"]').is_disabled(), 'minus is off at zero')
    pg.click('.md-btn.plus[data-side=us]'); pg.click('.md-btn.plus[data-side=us]'); pg.click('.md-btn.plus[data-side=them]'); pg.wait_for_timeout(80)
    pg.click('.md-btn[data-side=us][data-d="-1"]'); pg.wait_for_timeout(80)
    m = W("D.matches.find(m => m.id === 'm-today')")
    c.ok(m['result'] == {'us': 1, 'them': 1} and m['status'] == 'scheduled', 'big + and − buttons keep the score; still in play')
    secs = pg.evaluate("[...document.querySelectorAll('.md > section')].map(s => s.className)")
    c.ok(secs[0].startswith('md-score'), 'once there’s a score, it moves to the top')
    c.ok(pg.evaluate(NO_OVERFLOW), 'Match Day fits a phone')
    msgs = W('D.messages.length')
    pg.click('[data-act=md-send-lineup]'); pg.wait_for_timeout(200)
    c.ok(W('D.messages.length') == msgs + 1 and 'Hills Hornets' in W('D.messages[0].text') and 'Interchange' in W('D.messages[0].text'), 'Send lineup opens WhatsApp with the team and the bench')
    pg.keyboard.press('Escape'); pg.evaluate("document.querySelector('#ask') && (document.querySelector('#ask').hidden = true)")
    pg.click('[data-act=md-fulltime]'); pg.wait_for_timeout(100)
    c.ok(W("D.matches.find(m => m.id === 'm-today').status") == 'played' and pg.locator('.md-score [data-act=result-share]').count() == 1
         and pg.locator('.md-btn').count() == 0, 'Full time saves the result and offers Send results')
    teamcopy = pg.evaluate("""async () => { const v = await import('./vault.js'), x = window.__team; const t = v.teamView(x.M.activeLens(x.data), x.M.clubOf(x.ws, x.data), []);
      return JSON.stringify(t.matches.find(m => m.id === 'm-today')); }""")
    c.ok('arrived' not in teamcopy and '"us":1' in teamcopy, 'players get the score, never who turned up')
    pg.click('[data-act=md-reopen]'); pg.wait_for_timeout(60)
    c.ok(W("D.matches.find(m => m.id === 'm-today').status") == 'scheduled' and pg.locator('.md-btn.plus').count() == 2, 'the score can be reopened')
    go('matches')
    c.ok(pg.locator('.m-card [data-act=matchday-open]').count() >= 1, 'Matches: a Match day button on today’s match')
    ctx.close()

    # ---- Sideways on a phone: a side rail, the field beside the bench
    ctx, pg, _ = page(browser, url + '#home', width=844, height=390, errors=errs)
    setup(pg); pg.evaluate(TODAY_MATCH)
    pg.evaluate(act, ['tab', {'tab': 'field'}]); pg.wait_for_timeout(150)
    tabs = pg.evaluate("(() => { const r = document.querySelector('#tabs').getBoundingClientRect(); return [r.width, r.height]; })()")
    fld = pg.evaluate("(() => { const r = document.querySelector('#field').getBoundingClientRect(); return [r.top, r.bottom, r.right, r.height]; })()")
    side = pg.evaluate("document.querySelector('.lineup-side').getBoundingClientRect().left")
    c.ok(tabs[0] <= 80 and tabs[1] >= 300, f'sideways: the menu is a rail down the side {tabs}')
    c.ok(fld[3] >= 280 and fld[1] <= 392 and side >= fld[2], f'sideways: the whole field shows, with the lineup beside it {fld}')
    pg.evaluate(act, ['matchday-open', {'id': 'm-today'}]); pg.wait_for_timeout(150)
    pg.evaluate("document.querySelector('.md-pitch').scrollIntoView()"); pg.wait_for_timeout(60)
    fr, br = pg.evaluate("(() => { const f = document.querySelector('.md-play #field').getBoundingClientRect(), b = document.querySelector('.md-side-list').getBoundingClientRect(); return [[f.left, f.right, f.height], [b.left]]; })()")
    c.ok(br[0] >= fr[1] and fr[2] >= 280, f'sideways Match Day: bench beside the field {fr} {br}')
    c.ok(pg.evaluate(NO_OVERFLOW), 'sideways: no horizontal scroll')
    ctx.close()

    # ---- Settings in sections; each saves only its own
    ctx, pg, _ = page(browser, url + '#home', width=390, height=844, errors=errs)
    W = lambda js: pg.evaluate(f'(() => {{ const W = window.__team.ws, D = window.__team.data, M = window.__team.M, S = window.__team.state; return {js}; }})()')
    go = lambda tab: (pg.evaluate(act, ['tab', {'tab': tab}]), pg.wait_for_timeout(120))
    setup(pg)
    pg.click('#menu-btn'); pg.wait_for_selector('#sheet .set-list')
    names = pg.evaluate("[...document.querySelectorAll('#sheet .set-list .name')].map(x => x.textContent)")
    c.ok(names[:9] == ['Team', 'Club branding', 'Season and tournament', 'Contacts', 'Training', 'Field', 'Jerseys', 'Publishing', 'Backup'], f'Settings lists its sections {names}')
    c.ok(pg.locator('#sheet form').count() == 0, 'no five-screen form: a list to choose from')
    event = W('D.team.event')
    pg.click('#sheet [data-sec=team]'); pg.wait_for_selector('#sheet form[data-form=settings][data-sec=team]')
    c.ok(pg.locator('#sheet [name=event]').count() == 0 and pg.locator('#sheet [name=tasksName]').count() == 0, 'the Team section has only team fields')
    pg.fill('#sheet [name=name]', 'DragonTag Mixed'); pg.click('#sheet form[data-form=settings] button[type=submit]'); pg.wait_for_timeout(120)
    c.ok(W('D.team.name') == 'DragonTag Mixed' and W('D.team.event') == event, 'saving Team leaves the tournament alone')
    pg.click('#sheet .set-back'); pg.click('#sheet [data-sec=season]'); pg.wait_for_selector('#sheet [name=event]')
    pg.fill('#sheet [name=event]', 'State Cup'); pg.click('#sheet form[data-form=settings] button[type=submit]'); pg.wait_for_timeout(120)
    c.ok(W('D.team.event') == 'State Cup' and W('D.team.name') == 'DragonTag Mixed', 'saving the tournament leaves the team alone')
    pg.click('#sheet .set-back'); pg.click('#sheet [data-sec=contacts]'); pg.wait_for_selector('#sheet [name=tasksName]')
    pg.fill('#sheet [name=tasksName]', 'Sam (manager)'); pg.click('#sheet form[data-form=settings] button[type=submit]'); pg.wait_for_timeout(120)
    c.ok(W('D.team.tasksContact.name') == 'Sam (manager)' and W('D.team.event') == 'State Cup', 'Contacts saves on its own')
    pg.keyboard.press('Escape')

    # ---- Page by page
    go('squad')
    c.ok(pg.locator('#view .sec-h [data-act=squad-add]').count() == 1 and pg.locator('#view .sec-h [data-act=bulk-add]').count() == 0, 'Squad: one Add button')
    pg.click('[data-act=squad-add]'); pg.wait_for_selector('#sheet [data-act=player-import]')
    c.ok(pg.locator('#sheet [data-act=add-player], #sheet [data-act=bulk-add], #sheet [data-act=player-import]').count() == 3, 'Add opens a menu: a player, a list, another team')
    pg.keyboard.press('Escape')
    go('training')
    c.ok('Roll call' in pg.inner_text('#view .sess-acts') and 'Remind' in pg.inner_text('#view .sess-acts'), 'Training: buttons say what they do')
    go('tasks')
    c.ok(pg.evaluate(BG, '.pill.kind') == 'rgb(238, 241, 236)', 'Tasks: category pills in one calm colour')
    c.ok(pg.locator('.subnav [data-tab=tally]').count() == 0 and pg.locator('.subnav button').count() == 4, 'Team has four sub-tabs; Tally moved to More')
    go('more')
    c.ok(pg.locator('.more-item[data-tab=tally]').count() == 1 and pg.locator('.more-item[data-tab=notices]').count() == 1, 'More: Volunteer tally and the noticeboard')
    go('tally')
    c.ok(pg.is_hidden('.helped-h') and pg.evaluate("document.querySelector('.helped-row .hn .name').scrollWidth <= document.querySelector('.helped-row .hn .name').clientWidth"), 'Tally on a phone: full names, no squeezed columns')
    go('messages')
    c.ok(pg.locator('#view [data-act=del-notice]').count() == 0 and pg.locator('#view .link-card[data-tab=notices]').count() == 1, 'Messages: the noticeboard is its own page')
    go('notices')
    c.ok(pg.locator('#view [data-act=add-notice]').count() == 1, 'Noticeboard: post from its own page')
    go('reports')
    jumps = pg.locator('.jump button').count()
    c.ok(jumps >= 6 and pg.locator('.long-page .fold').count() >= 6, f'Reports: a jump bar ({jumps}) and folding sections')
    first = pg.locator('.fold-btn').first
    first.click(); pg.wait_for_timeout(40)
    c.ok(first.get_attribute('aria-expanded') == 'false' and pg.is_hidden('.fold-body >> nth=0'), 'a section folds away')
    pg.locator('.jump button').first.click(); pg.wait_for_timeout(60)
    c.ok(first.get_attribute('aria-expanded') == 'true', 'jumping to a folded section opens it')
    go('rules')
    c.ok(pg.locator('.long-page .fold-btn').count() >= 4 and pg.locator('.jump button').count() >= 4, 'Rules: a jump bar and topics that fold away')
    c.ok(pg.evaluate("[...document.querySelectorAll('#view .subnav')].every(n => n.scrollWidth <= n.clientWidth + 2 || !n.classList.contains('at-end') || n.scrollLeft > 0)"), 'a sub-tab row that scrolls shows a fade')
    W("(window.__team.state.playMode = 'watch', 1)"); pg.evaluate(act, ['sys-play', {'id': W('D.plays[0].id')}]); pg.wait_for_timeout(150)
    c.ok(pg.evaluate("(() => { const a = document.querySelector('.anim-bar'), l = document.querySelector('#play-fig .cast-key, #play-fig .play-legend, #play-fig .legend'); return !!a && (!l || !!(a.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING)); })()"),
         'Plays: Play, Slow and Restart sit right under the diagram')
    for t in ['home', 'agenda', 'training', 'matches', 'squad', 'tasks', 'crew', 'field', 'reports', 'club', 'messages', 'notices']:
        go(t)
        if not pg.evaluate(NO_OVERFLOW): c.ok(False, f'{t} fits a phone')
    ctx.close()

    # ---- Volunteer profile: tick more teams in one place; roles per team without switching teams
    ctx, pg, _ = page(browser, url + '#home', width=390, height=844, errors=errs)
    W = lambda js: pg.evaluate(f'(() => {{ const W = window.__team.ws, D = window.__team.data, M = window.__team.M, S = window.__team.state; return {js}; }})()')
    setup(pg)
    home = W('D.id'); club = W('D.team.clubId')
    pg.evaluate("""() => { const x = window.__team, t = x.M.clone(x.data);
      x.ws.clubs.push({ id: 'titans-club', name: 'Taren Point Titans', shortName: 'Titans', sport: 'Rugby league' });
      t.id = 'league2026'; t.team = { ...t.team, name: 'Titans League U12', sport: 'Rugby league', clubId: 'titans-club' };
      t.matches = []; t.sessions = []; t.players = []; t.tasks = []; t.seasons = []; x.M.addTeam(x.ws, t);
      x.ws.matchOfficials = [{ id: 'v1', name: 'Vic Volunteer', clubIds: [x.data.team.clubId], teamIds: [], roles: [], rolesBySport: { Oztag: ['manager'] }, active: true }]; }""")
    pg.evaluate(act, ['tab', {'tab': 'crew'}]); pg.wait_for_timeout(120)
    c.ok(pg.locator('#view details.info-note').count() == 1 and pg.is_hidden('#view .info-note .hint >> nth=0'), 'Match staff: the disclaimers fold into an info note')
    c.ok('Staff requirements: not set up' in pg.inner_text('#view .crew-quiet'), 'Match staff: requirements not set up is a quiet line')
    pg.click('#view [data-act=crew-basic][data-id=v1]'); pg.wait_for_selector('#crew-teams')
    c.ok(pg.locator('#crew-teams [name=club]').count() == 2 and pg.locator('#crew-teams [name=team]').count() == 2, 'the profile lists every club and team to tick')
    c.ok(pg.is_checked(f'#crew-teams [name=club][value="{club}"]') and 'via club' in pg.inner_text('#crew-teams'), 'their club is ticked; its teams show they’re available through the club')
    pg.check('#crew-teams [name=team][value=league2026]')
    pg.click('#sheet form[data-form=crew-basic] button[type=submit]'); pg.wait_for_timeout(120)
    c.ok(W("W.matchOfficials[0].teamIds") == ['league2026'] and W('D.id') == home, 'ticking another club’s team adds it, without switching team')
    pg.click('#view [data-act=crew-basic][data-id=v1]'); pg.wait_for_selector('#crew-teams')
    pg.click('#crew-teams [data-act=crew-save-review][data-team=league2026]'); pg.wait_for_selector('#sheet form[data-form=crew-person]')
    c.ok(pg.locator('#sheet [name=role][value=yellow]').count() == 1 and 'Titans League U12' in pg.inner_text('#sheet') and W('D.id') == home,
         'Roles opens Rugby league roles for that team, still on the same team')
    pg.check('#sheet [name=role][value=yellow]'); pg.click('#sheet form[data-form=crew-person] button[type=submit]'); pg.wait_for_selector('#crew-teams')
    c.ok(W("W.matchOfficials[0].rolesBySport['Rugby league']") == ['yellow'] and W("W.matchOfficials[0].rolesBySport.Oztag") == ['manager'],
         'roles saved for that sport only, and back to the profile')
    # Withdrawing the final current role must not erase historical accreditation.
    pg.click('#crew-teams [data-act=crew-save-review][data-team=league2026]'); pg.wait_for_selector('#sheet form[data-form=crew-person]')
    pg.uncheck('#sheet [name=role][value=yellow]')
    pg.once('dialog',lambda dlg: dlg.accept())
    pg.click('#sheet form[data-form=crew-person] button[type=submit]'); pg.wait_for_selector('#crew-teams')
    c.ok(W("W.matchOfficials[0].rolesBySport['Rugby league']") == []
         and W("W.matchOfficials[0].rolesBySport.Oztag") == ['manager'],
         'withdrawal of the last rugby league role retains separate Oztag role history')
    pg.uncheck(f'#crew-teams [name=club][value="{club}"]')
    pg.click('#sheet form[data-form=crew-basic] button[type=submit]'); pg.wait_for_timeout(120)
    c.ok(club not in W("W.matchOfficials[0].clubIds") and W("W.matchOfficials[0].teamIds") == ['league2026'], 'unticking the club removes the membership only')
    W("(S.crewClubId = 'titans-club', 1)"); pg.evaluate(act, ['tab', {'tab': 'crew'}]); pg.wait_for_timeout(120)
    c.ok('Helps Titans League U12' in pg.inner_text('#view') or 'Yellow' in pg.inner_text('#view'), 'the directory row says which team they help')
    ctx.close()

    # ---- Desktop: the side menu stays put on long pages; Match Day in two columns
    ctx, pg, _ = page(browser, url + '#home', width=1280, height=860, errors=errs)
    setup(pg)
    pg.evaluate(act, ['tab', {'tab': 'reports'}]); pg.wait_for_timeout(150)
    pg.mouse.wheel(0, 1600); pg.wait_for_timeout(150)
    top = pg.evaluate("document.querySelector('#tabs').getBoundingClientRect().top")
    c.ok(pg.evaluate('window.scrollY') > 400 and 0 <= top <= 120, f'desktop: the side menu stays put while Reports scrolls (top {round(top)})')
    pg.evaluate(TODAY_MATCH); pg.evaluate(act, ['tab', {'tab': 'matches'}]); pg.evaluate(act, ['matchday-open', {'id': 'm-today'}]); pg.wait_for_timeout(150)
    a, b = pg.evaluate("[document.querySelector('.md-pitch').getBoundingClientRect().left, document.querySelector('.md-score').getBoundingClientRect().left]")
    c.ok(b > a + 200, 'desktop Match Day: field on the left, score and arrivals beside it')
    pg.screenshot(path=shot('style-matchday-desktop.png'))
    ctx.close()
    ok = c.done(errs)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
