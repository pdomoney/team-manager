# A new team is fresh by default, regardless of the currently selected team or club.
# Copying an existing setup is a separate deliberate coach action, with safe restrictions.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv, url = serve()
c = Check()
act = "([a, ds]) => { const b = document.createElement('button'); b.dataset.act = a; Object.assign(b.dataset, ds || {}); document.body.appendChild(b); b.click(); b.remove(); }"
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx, pg, errs = page(b, url + '#home', width=390, height=844)
    W = lambda js: pg.evaluate(f'(() => {{ const W = window.__team.ws, D = window.__team.data, M = window.__team.M; return {js}; }})()')
    pg.wait_for_selector('text=Load a sample squad')
    pg.click('[data-act=sample]')
    pg.wait_for_timeout(130)
    # Give the current Oztag team distinctive, non-shareable values.
    W("(D.team.trainingVenue='Private DragonTag Ground',D.team.trainingStart='06:15',D.team.venue='Coffs only',D.team.tasksContact={name:'Coach Private',phone:'0400 888 111'},D.team.bylaws=[{id:'sourcebylaw',topic:'Other',text:'Oztag only'}],D.team.staff=[{name:'Other coach',role:'Trainer',phone:'0400 555 222'}],1)")
    pg.goto(url + '#teams')
    pg.click('[data-act=club-new]')
    pg.wait_for_selector('#sheet form[data-form=club]')
    pg.fill('#sheet form[data-form=club] input[name=name]', 'Taren Point Titans')
    pg.select_option('#sheet form[data-form=club] select[name=sport]', 'Rugby league')
    pg.click('#sheet form[data-form=club] button[type=submit]')
    pg.wait_for_timeout(100)
    club = W("W.clubs.find(x=>x.name==='Taren Point Titans').id")
    pg.goto(url + '#teams')
    pg.click('[data-act=team-new]')
    pg.wait_for_selector('#sheet form[data-form=team-new]')
    c.ok(pg.locator('#sheet input[name=copySettings]').count() == 0, 'fresh New Team has no previous-team copy prompt')
    c.ok(pg.locator('#sheet input[name=withLibrary]').count() == 0, 'fresh New Team does not suggest copying shared library')
    c.ok(pg.locator('#sheet input[name=sourceTeamId]').count() == 0, 'fresh New Team has no source team identity')
    c.ok(pg.input_value('#sheet input[name=event]') == '' and pg.input_value('#sheet input[name=eventStart]') == '',
         'fresh team does not prefill DragonTag tournament or dates')
    c.ok(pg.input_value('#sheet select[name=clubId]') == '', 'fresh team does not silently use on-screen club')
    pg.fill('#sheet input[name=name]', 'Titans Under 16 Boys')
    pg.select_option('#sheet select[name=clubId]', club)
    pg.select_option('#sheet select[name=category]', 'boys')
    c.ok('Rugby league positions' in pg.inner_text('[data-sport-guide]'), 'new club default is used for positions')
    pg.click('#sheet form[data-form=team-new] button[type=submit]')
    pg.wait_for_timeout(140)
    c.ok(W("D.team.clubId") == club and W("D.team.name") == 'Titans Under 16 Boys', 'new team created in Titans')
    c.ok(W("D.team.trainingVenue") == '' and W("D.team.trainingStart") == '' and W("D.team.venue") == '',
         'not copied source training venue/time or tournament venue')
    c.ok(W("D.team.tasksContact.phone") == '' and W("D.team.staff.length") == 0 and W("D.team.bylaws.length") == 0,
         'not copied source staff, private contacts or by-laws')
    c.ok(W("D.players.length") == 0 and W("D.matches.length") == 0 and W("D.sessions.length") == 0,
         'new team does not copy players, matches or sessions')
    c.ok(W("M.teamSport(D.team,M.clubOf(W,D))") == 'Rugby league', 'new team inherits Titans club sport')
    # Deliberate setup reuse: separate picker, explicit source, same club and sport.
    W("(D.team.trainingVenue='Titans Oval',D.team.trainingStart='17:15',D.team.venue='Titans Ground',D.team.event='U16 Secret Cup',D.team.eventStart='2027-03-11',D.team.eventEnd='2027-03-13',D.team.bylaws=[{id:'u16rule',topic:'Other',text:'U16 restriction'}],D.team.tasksContact={name:'Private Coach',phone:'0400 111 777'},D.team.staff=[{name:'Secret Assistant',role:'Assistant coach'}],1)")
    original = W("D.id")
    pg.goto(url + '#teams')
    pg.wait_for_selector('[data-act=team-template-choose]')
    pg.click('[data-act=team-template-choose]')
    pg.wait_for_selector('#sheet [data-act=team-template-source]')
    c.ok('Only selected setup values' in pg.inner_text('#sheet'), 'source picker makes copied scope explicit')
    pg.click('#sheet [data-act=team-template-source][data-id="' + original + '"]')
    pg.wait_for_selector('#sheet form[data-form=team-new]')
    c.ok(pg.input_value('#sheet input[name=sourceTeamId]') == original, 'explicit source team chosen by ID')
    c.ok(pg.is_checked('#sheet input[name=copySettings]'), 'source-specific copy deliberately enabled')
    c.ok(pg.input_value('#sheet input[name=event]') == '' and pg.input_value('#sheet input[name=eventStart]') == '',
         'even an explicit setup source does not prefill previous competition or dates')
    c.ok(pg.locator('#sheet input[name=withLibrary]:checked').count() == 0, 'shared library copy opt-in not automatic')
    pg.fill('#sheet input[name=name]', 'Titans Under 15 Boys')
    # Wrong club is rejected before constructing the target team.
    pg.select_option('#sheet select[name=clubId]', 'stgeorge')
    count = W("M.teamsOf(W).length")
    pg.click('#sheet form[data-form=team-new] button[type=submit]')
    pg.wait_for_timeout(70)
    c.ok(W("M.teamsOf(W).length") == count and pg.locator('#sheet [aria-invalid=true]').count() > 0,
         'copying setup across clubs is rejected atomically')
    pg.select_option('#sheet select[name=clubId]', club)
    # Even within one club, copying League/Touch/Netball setup across different
    # sports must require the coach to start fresh, not import incompatible rules.
    pg.select_option('#sheet select[name=teamSport]', 'League tag')
    pg.click('#sheet form[data-form=team-new] button[type=submit]')
    pg.wait_for_timeout(80)
    c.ok(W("M.teamsOf(W).length") == count and pg.locator('#sheet select[name=teamSport][aria-invalid=true]').count() == 1,
         'copying setup across sports within the same club is rejected atomically')
    pg.select_option('#sheet select[name=teamSport]', '')
    pg.click('#sheet form[data-form=team-new] button[type=submit]')
    pg.wait_for_timeout(160)
    c.ok(W("D.team.trainingVenue") == 'Titans Oval' and W("D.team.trainingStart") == '17:15',
         'only explicit template copies training setup')
    c.ok(W("D.team.bylaws.some(x=>x.id==='u16rule')"), 'deliberate same-sport template may copy by-laws')
    c.ok(W("D.team.event") == '' and W("D.team.eventStart") == '',
         'new season does not inherit the source competition identity')
    c.ok(W("D.team.tasksContact.phone") == '' and W("D.team.staff.length") == 0,
         'even explicit template does not transfer coach contact or staff')
    c.ok(W("D.players.length") == 0 and W("D.matches.length") == 0 and W("D.sessions.length") == 0,
         'template never imports squad or past season activity')
    c.ok(W("D.id") != original and W("M.findTeam(W,'" + original + "').team.trainingVenue") == 'Titans Oval',
         'source team untouched and new team ID distinct')
    pg.goto(url + '#teams')
    pg.click('[data-act=team-new]')
    pg.wait_for_selector('#sheet form[data-form=team-new]')
    c.ok(pg.locator('#sheet input[name=sourceTeamId], #sheet input[name=copySettings]').count() == 0,
         'normal New Team remains fresh after previously using a source template')
    pg.fill('#sheet input[name=name]', 'Titans Under 14 Girls')
    pg.select_option('#sheet select[name=clubId]', club)
    pg.select_option('#sheet select[name=teamSport]', 'League tag')
    pg.click('#sheet form[data-form=team-new] button[type=submit]')
    pg.wait_for_timeout(150)
    c.ok(W("D.team.name") == 'Titans Under 14 Girls' and W("D.team.clubId") == '" + club + "',
         'new squad created in same club as other existing squads')
    c.ok(W("D.team.trainingVenue") == '' and W("D.team.trainingStart") == '' and W("D.team.venue") == '',
         'same-club fresh team does not inherit another team venue or training times')
    c.ok(W("D.team.staff.length") == 0 and W("D.team.bylaws.length") == 0 and W("D.team.tasksContact.phone") == '',
         'same-club fresh team does not inherit another team staff, contacts or by-laws')
    c.ok(W("D.players.length") == 0 and W("D.team.event") == '' and W("D.team.eventStart") == '',
         'same-club fresh team has no players or borrowed competition identity')
    for width in (390, 1280):
        pg.set_viewport_size({'width': width, 'height': 900})
        pg.goto(url + '#teams')
        pg.wait_for_timeout(90)
        c.ok(pg.evaluate('document.documentElement.scrollWidth <= innerWidth'),
             f'[{width}] club/team manager no sideways overflow')
    ok = c.done(errs)
    b.close()
srv.shutdown()
sys.exit(0 if ok else 1)
