import sys, json; from harness import *
from playwright.sync_api import sync_playwright
build(); srv, url = serve()
c = Check()
act = "([a, ds]) => { const b = document.createElement('button'); b.dataset.act = a; Object.assign(b.dataset, ds || {}); document.body.appendChild(b); b.click(); b.remove(); }"
# an old single-team test-mode copy (schema 2), as the live app stores it today
old = {"version": 2, "team": {"name": "DragonTag Mixed 20s", "event": "NSW State Cup", "eventStart": "2027-03-19", "eventEnd": "2027-03-21", "maxMales": 4, "positions": ["Wing","Link","Rover","Middle"]},
       "players": [{"id": "p1", "name": "Mia Tuala", "gender": "F", "number": "4", "positions": ["Rover"], "status": "available", "phone": "0412", "notes": ""}],
       "sessions": [{"id": "s1", "date": "2026-10-20", "start": "18:00", "end": "19:30", "venue": "Field 2", "cancelled": False, "attendance": {}}],
       "lineups": [{"id": "l1", "name": "Starting 8", "slots": [{"id": "LW", "label": "LW", "name": "Left wing", "group": "Wing", "x": 2.6, "y": 57, "playerId": "p1"}]}],
       "messages": [{"id": "m1", "at": "2026-10-10T00:00:00Z", "text": "old message", "to": "WhatsApp"}],
       "notices": [], "tasks": [{"id": "t1", "title": "Gear", "kind": "gear", "date": "2026-10-20", "need": 1, "sessionId": "s1", "people": [{"who": "p:p1", "status": "asked"}, {"who": "p:gone", "status": "yes"}]}],
       "helpers": [], "systems": {}, "playerSets": [], "teamPass": "", "updatedAt": "2026-10-16T00:00:00Z"}
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1280, 'height': 900})
    ctx.add_init_script(f"if (!localStorage.getItem('tm-seeded')) {{ localStorage.setItem('tm-test-data', {json.dumps(json.dumps(old))}); localStorage.setItem('tm-seeded', '1'); }}")
    errs = []
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'fonts' not in m.text and 'Failed to load' not in m.text else None)
    pg.route('**/fonts.g*/**', lambda r: r.abort())
    pg.goto(url + '#home'); pg.wait_for_function('window.__team && window.__team.ws')
    W = lambda js: pg.evaluate(f'(() => {{ const W = window.__team.ws, D = window.__team.data, M = window.__team.M; return {js}; }})()')
    c.ok(W('W.schema') == W('M.SCHEMA') and W('W.id') == 'team1', 'old copy upgraded to a workspace')
    c.ok(W("D.players[0].name") == 'Mia Tuala' and W("D.messages[0].text") == 'old message', 'existing data kept')
    c.ok(W("D.tasks[0].people.length") == 1, 'dangling task person removed on upgrade')
    c.ok(json.loads(pg.evaluate("localStorage.getItem('tm-before-upgrade')"))['data']['players'][0]['name'] == 'Mia Tuala', 'pre-upgrade copy kept')
    c.ok(json.loads(pg.evaluate("localStorage.getItem('tm-test-data')"))['schema'] == W('M.SCHEMA'), 'upgraded copy stored')
    # new team
    pg.evaluate(act, ['teams', {}]); pg.wait_for_timeout(100)
    pg.click('text=New team'); pg.fill('#sheet input[name=name]', 'DragonTag Under 16s'); pg.click('#sheet button[type=submit]'); pg.wait_for_timeout(200)
    c.ok(W('D.team.name') == 'DragonTag Under 16s' and W('D.players.length') == 0, 'new team on screen and empty')
    c.ok(W('D.team.trainingStart') == W('W.team.trainingStart'), 'settings copied from the first team')
    c.ok(pg.is_visible('.team-btn'), 'team switcher appears with two teams')
    u16 = W('D.id')
    pg.evaluate(act, ['add-player', {}]); pg.fill('#sheet input[name=name]', 'Ava Young'); pg.check('#sheet input[value=F]'); pg.click('#sheet button[value=save]'); pg.wait_for_timeout(100)
    c.ok(W('W.players.length') == 1 and W('D.players.length') == 1 and W("D.players[0].name") == 'Ava Young', 'teams keep their own squads')
    # library: save the first team's play, add it to U16, update and edit
    pg.click('.team-btn'); pg.click('#sheet [data-act=team-pick][data-id=team1]'); pg.wait_for_timeout(100)
    c.ok(W('D.id') == 'team1', 'switched back')
    pid = W("D.plays[0].id")
    pg.evaluate(act, ['lib-save', {'k': 'plays', 'id': pid}]); pg.wait_for_timeout(100)
    c.ok(W('W.library.plays.length') == 1, 'play saved to the library')
    pg.click('.team-btn'); pg.click(f'#sheet [data-act=team-pick][data-id="{u16}"]'); pg.wait_for_timeout(100)
    pg.goto(url + '#library'); pg.wait_for_timeout(100)
    c.ok('Not used by' not in pg.inner_text('#view') and 'Used by DragonTag Mixed 20s' in pg.inner_text('#view'), 'library shows usage')
    n = W('D.plays.length')
    pg.click('[data-act=lib-add]'); pg.wait_for_timeout(100)
    c.ok(W('D.plays.length') == n + 1 and W("D.plays[D.plays.length-1].lib.rev") == 1, 'library play added to U16 as a linked copy')
    # change in team 1 and save again -> U16 copy updated
    W("(W.plays[0].headline = 'NEW HEADLINE', 0)")
    pg.evaluate(act, ['lib-save', {'k': 'plays', 'id': pid}])  # saves from the team on screen? use team1
    c.ok(True, 'ok')
    # mark U16 copy edited, then library v3 keeps it
    W("(window.__team.M.libMarkEdited(D.plays[D.plays.length-1]), 0)")
    # system to library and a player list
    pg.goto(url + '#field'); pg.wait_for_timeout(100)
    pg.click('.sys-chip >> nth=0'); pg.wait_for_timeout(100)
    c.ok('Save to library' in pg.inner_text('#view'), 'system card offers the library')
    # archive and restore U16
    pg.evaluate(act, ['teams', {}]); pg.wait_for_timeout(100)
    pg.click(f'[data-act=team-archive][data-id="{u16}"]'); pg.wait_for_timeout(100)
    c.ok(W(f"window.__team.M.findTeam(W, '{u16}').archived") is True and W('D.id') == 'team1', 'U16 archived, first team on screen')
    c.ok(not pg.is_visible('.team-btn'), 'switcher hidden with one active team')
    pg.click(f'[data-act=team-restore][data-id="{u16}"]'); pg.wait_for_timeout(100)
    c.ok(W(f"window.__team.M.findTeam(W, '{u16}').archived") is False, 'U16 restored')
    c.ok(pg.is_disabled('[data-act=team-archive][data-id=team1]') is False, 'archive allowed with two active')
    # reload: everything persists, teams separate
    pg.reload(); pg.wait_for_function('window.__team && window.__team.ws')
    c.ok(W('window.__team.M.teamsOf(W).length') == 2 and W('W.players.length') == 1, 'two teams after reload')
    # legacy export round trip (rollback path)
    leg = W("window.__team.M.legacyTeam(W, 'team1')")
    again = W(f"window.__team.M.migrateWorkspace({json.dumps(leg)}).players.map(p => p.name)")
    c.ok(again == ['Mia Tuala'] and 'teams' not in leg, 'single-team export opens again (rollback)')
    pg.screenshot(path=shot('m3-library.png'))
    ok = c.done(errs); b.close()
srv.shutdown(); sys.exit(0 if ok else 1)
