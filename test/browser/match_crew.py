# Private match staff registry and verified match coverage, phone and desktop.
# Uses only synthetic data from sample squad; never touches real MySideline records.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv, url = serve()
c, errs = Check(), []
act = "([a, ds]) => { const b = document.createElement('button'); b.dataset.act = a; Object.assign(b.dataset, ds || {}); document.body.appendChild(b); b.click(); b.remove(); }"
with sync_playwright() as p:
    browser = p.chromium.launch()
    for width in (390, 1280):
        ctx, pg, _ = page(browser, url + '#home', width=width, height=860, errors=errs)
        pg.get_by_text('Load a sample squad').click()
        info = pg.evaluate("""() => ({ id: window.__team.data.matches[0].id,
          year: window.__team.data.matches[0].date.slice(0,4) })""")
        pg.goto(url + '#crew')
        pg.wait_for_selector('[data-act=crew-new]')
        c.ok('Oztag' in pg.inner_text('#view'), f'[{width}] staff page uses the team sport')
        pg.locator('[data-act=crew-new]').click()
        c.ok(pg.locator('#sheet form[data-form=crew-intake-start] [name=method]').count()==3
             and 'Only clubs in this encrypted coach workspace' in pg.inner_text('#sheet'),
             f'[{width}] club-first entry offers manual, existing and email routes without pretending to have accounts')
        pg.locator('#sheet [data-act=close-sheet]').last.click()
        c.ok('Match-day staff' in pg.inner_text('#view'), f'[{width}] match staff route is coach-only')
        for name, role, member in [('Casey Coach', 'coach','coach'), ('Morgan Manager', 'manager','volunteer'), ('Frances First Aid', 'firstAid','trainer')]:
            pg.locator('[data-act=crew-new]').click()
            pg.locator('#sheet form[data-form=crew-intake-start] button[type=submit]').click()
            c.ok(pg.locator('#sheet form[data-form=crew-manual]').count()==1,
                 f'[{width}] manual path opens club-first name/email form')
            pg.fill('#sheet form[data-form=crew-manual] input[name=name]',name)
            team_id=pg.evaluate('window.__team.data.id')
            pg.locator('#sheet form[data-form=crew-manual] select[name=teamId]').select_option(team_id)
            pg.locator('#sheet form[data-form=crew-manual] button[type=submit]').click()
            c.ok(pg.locator('#sheet input[name=role][value=yellow]').count()==0
                 and pg.locator('#sheet input[name=role][value=green]').count()==0
                 and pg.locator('#sheet input[name=role][value=firstAid]').count()==1
                 and 'Assemble' in pg.inner_text('#sheet'),
                 f'[{width}] manual team allocation opens correct Oztag role/editor and provider')
            pg.locator(f'#sheet input[name=role][value={role}]').check()
            pg.fill(f'#sheet input[name=reg-{member}]', info['year'])
            pg.fill('#sheet input[name=squad-year]', info['year'])
            if role != 'manager':
                pg.fill(f'#sheet input[name=acc-{role}]', '2036-12-31')
            pg.locator('#sheet input[name=wwccChecked]').check()
            pg.fill('#sheet input[name=wwccExpiry]', '2036-12-31')
            pg.locator('#sheet form[data-form=crew-person] button[type=submit]').click()
            pg.wait_for_timeout(60)
        people = pg.evaluate("window.__team.ws.matchOfficials")
        scope = pg.evaluate("() => ({club: window.__team.data.team.clubId, team: window.__team.data.id})")
        c.ok(len(people) == 3 and all(
             x['wwccStatus'] == 'checked' and (scope['club'] in x['clubIds'] if scope['club'] else scope['team'] in x['teamIds'])
             for x in people),
             f'[{width}] directory stores role and verification, scoped to the actual club or team')
        pg.locator('[data-act=crew-policy-open]').click()
        pg.fill('#sheet [name=year]', info['year'])
        pg.fill('#sheet [name=source]', f'{info["year"]} local age-group requirements (synthetic test)')
        for k in ['coach','manager','firstAid']:
            pg.fill('#sheet input[name=min-' + k + ']', '1')
        pg.locator('#sheet form[data-form=crew-policy] button[type=submit]').click()
        pg.evaluate(act, ['match-open', {'id':info['id']}])
        c.ok('staffing needs attention' in pg.inner_text('#sheet') or 'staff' in pg.inner_text('#sheet').lower(),
             f'[{width}] game reports staff required before assigning anyone')
        pg.locator('#sheet [data-act=crew-match-open]').click()
        ids = {x['name']:x['id'] for x in people}
        for i,(name,role) in enumerate([('Casey Coach','coach'),('Morgan Manager','manager'),('Frances First Aid','firstAid')]):
            row = pg.locator('#sheet .crew-assign-row').nth(i)
            row.locator('select[name=crew-person]').select_option(ids[name])
            row.locator('select[name=crew-role]').select_option(role)
            row.locator('input[type=checkbox]').check()
        pg.locator('#sheet form[data-form=crew-match] button[type=submit]').click()
        pg.wait_for_timeout(60)
        c.ok('All configured roles covered' in pg.inner_text('#sheet'),
             f'[{width}] confirmed registered eligible staff meet three distinct roles')
        pg.locator('#sheet [data-act=crew-policy-open]').click()
        c.ok(pg.locator('#sheet input[name=matchId]').input_value() == info['id'],
             f'[{width}] match requirements can override team-wide rules')
        pg.fill('#sheet input[name=min-matchDelegate]', '1')
        pg.locator('#sheet form[data-form=crew-policy] button[type=submit]').click()
        c.ok('needs attention' in pg.inner_text('#sheet') and 'Game-day delegate' in pg.inner_text('#sheet'),
             f'[{width}] game-specific delegate minimum is sport-appropriate')
        pg.locator('#sheet [data-act=crew-policy-open]').click()
        pg.locator('#sheet [data-act=crew-policy-reset]').click()
        c.ok('All configured roles covered' in pg.inner_text('#sheet'),
             f'[{width}] removing a game override returns to team rules without losing assignments')
        pg.locator('#sheet [data-act=crew-match-open]').click()
        pg.locator('#sheet .crew-assign-row').nth(2).locator('input[type=checkbox]').uncheck()
        pg.locator('#sheet form[data-form=crew-match] button[type=submit]').click()
        c.ok('needs attention' in pg.inner_text('#sheet'),
             f'[{width}] unconfirmed first aid coverage blocks readiness')
        c.ok('1 missing' in pg.inner_text('#sheet'),
             f'[{width}] shortfall is visible by requirement')
        c.ok(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth'),
             f'[{width}] match check does not create horizontal overflow')
        pg.evaluate("""() => {
          const x=window.__team, t=x.M.clone(x.data);
          // A different rugby league CLUB, not just another team in the Oztag club.
          x.ws.clubs.push({id:'titans-club',name:'Taren Point Titans',shortName:'Titans',sport:'Rugby league'});
          t.id='league2026';t.team={...t.team,name:'Titans League U12',sport:'Rugby league',clubId:'titans-club'};
          t.matches=[];t.sessions=[];t.players=[];t.tasks=[];t.seasons=[];
          x.M.addTeam(x.ws,t);
        }""")
        pg.evaluate(act, ['crew-switch', {}])
        c.ok(pg.locator('#sheet [name=teamId] option').count()>=2,
             f'[{width}] team selection includes the other club team')
        c.ok('Titans League U12' in pg.locator('#sheet [name=teamId]').inner_text()
             and 'Rugby league' in pg.locator('#sheet [name=teamId]').inner_text(),
             f'[{width}] picker exposes teams from the other club with their true sport')
        pg.locator('#sheet [name=teamId]').select_option('league2026')
        pg.locator('#sheet form[data-form=crew-pick-view] button[type=submit]').click()
        c.ok('Titans League U12' in pg.inner_text('#view'),
             f'[{width}] active match staff context follows chosen team')
        c.ok('Frances First Aid' not in pg.inner_text('#view'),
             f'[{width}] unrelated Oztag club staff are not silently pooled into Titans club')
        # Club-only manual record: team selection and qualifications are optional.
        pg.locator('#view [data-act=crew-new]').click()
        pg.locator('#sheet form[data-form=crew-intake-start] button[type=submit]').click()
        pg.fill('#sheet form[data-form=crew-manual] input[name=name]', 'New Club Only')
        pg.locator('#sheet form[data-form=crew-manual] button[type=submit]').click()
        c.ok('New Club Only' in pg.inner_text('#view')
             and pg.evaluate("window.__team.ws.matchOfficials.find(x=>x.name==='New Club Only').teamIds.length===0"),
             f'[{width}] club-only manual volunteer is saved without a team or qualification')
        # Link the ORIGINAL Oztag volunteer to a second club, without duplicating ID.
        before=pg.evaluate("window.__team.ws.matchOfficials.filter(p=>p.name==='Casey Coach').length")
        pg.locator('#view [data-act=crew-new]').click()
        pg.locator('#sheet input[name=method][value=existing]').check()
        pg.locator('#sheet form[data-form=crew-intake-start] button[type=submit]').click()
        pg.locator('#sheet form[data-form=crew-existing] select[name=personId]').select_option(ids['Casey Coach'])
        pg.locator('#sheet form[data-form=crew-existing] select[name=teamId]').select_option('league2026')
        pg.locator('#sheet form[data-form=crew-existing] button[type=submit]').click()
        c.ok(pg.locator('#sheet input[name=role][value=yellow]').count()==1
             and pg.locator('#sheet input[name=role][value=blue]').count()==1
             and 'MySideline' in pg.inner_text('#sheet')
             and not pg.locator('#sheet input[name=role][value=coach]').is_checked(),
             f'[{width}] second club uses Rugby League roles without automatically granting previous Oztag coach clearance')
        c.ok(pg.evaluate("window.__team.ws.matchOfficials.filter(p=>p.name==='Casey Coach').length")==before
             and pg.evaluate("window.__team.ws.matchOfficials.find(p=>p.name==='Casey Coach').clubIds.includes('titans-club')"),
             f'[{width}] existing person reused across clubs without a duplicate')
        pg.locator('#sheet [data-act=close-sheet]').last.click()
        # Email route prepares a draft only, with no fake enrolment link or account.
        pg.locator('#view [data-act=crew-new]').click()
        pg.locator('#sheet input[name=method][value=invite]').check()
        pg.locator('#sheet form[data-form=crew-intake-start] button[type=submit]').click()
        c.ok(pg.locator('#sheet form[data-form=crew-invite-draft]').count()==1
             and 'does not yet provide user accounts' in pg.inner_text('#sheet')
             and 'Open email draft' in pg.inner_text('#sheet'),
             f'[{width}] invitation entry makes no account or delivery claim')
        pg.locator('#sheet [data-act=close-sheet]').last.click()
        pg.evaluate(act, ['preview-on', {}])
        c.ok(pg.locator('.nav-sub [data-tab=crew], .subnav [data-tab=crew]').count() == 0,
             f'[{width}] players do not get the private officials tab')
        c.ok('Casey Coach' not in pg.inner_text('#view'),
             f'[{width}] private coach roster not rendered on player screen')
        ctx.close()
    ok = c.done(errs)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
