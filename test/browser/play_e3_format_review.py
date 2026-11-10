# E3.3: source-backed coach format review is a real, read-only journey.
# Synthetic local Chromium; no physical Safari, official formation or data publish.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv,url=serve()
checks,errors=Check(),[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
        ctx,pg,_=page(browser,url+'#home',width=width,height=865,errors=errors)
        pg.get_by_text('Load a sample squad').click()
        pg.goto(url+'#plays')
        pg.locator('.play-row[data-id=quickie-out]').click()
        snapshot=pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(p=>p.id==='quickie-out'))""")
        baseline=pg.evaluate("""() => JSON.stringify({
          clubs:window.__team.ws.clubs.map(c=>c.id),
          teams:window.__team.M.teamsOf(window.__team.ws).map(t=>t.id),
          library:window.__team.ws.library
        })""")
        button=pg.locator('[data-act=play-format-review]')
        checks.ok(button.count()==1 and button.is_visible(),
                  f'[{width}] coach has format review next to existing play actions')
        button.click()
        form=pg.locator('#sheet form[data-form=play-format-review]')
        checks.ok(form.count()==1 and form.is_visible() and
                  pg.locator('#sheet [name=referenceId] option').count()==2 and
                  'eight-slot drawing' in pg.locator('#sheet').inner_text(),
                  f'[{width}] local Oztag play has exact source choice, no League default')
        pg.locator('#sheet [name=referenceId]').select_option('oztag-eight-reference')
        pg.locator('#sheet [name=competition]').fill('Fictional test league')
        pg.locator('#sheet [name=grade]').fill('Open')
        pg.locator('#sheet [name=season]').fill('2026')
        pg.locator('#sheet [name=rulesEdition]').fill('2026 fictional edition')
        pg.locator('#sheet [name=localSourceUrl]').fill('https://example.org/rules?token=DO_NOT_COPY')
        pg.locator('#sheet [name=formatNotes]').fill('Reviewer must confirm actual field and roles.')
        pg.locator('#sheet [data-form=play-format-review] button[type=submit]').click()
        outcome=pg.locator('#sheet .sport-format-result')
        brief=pg.locator('#sheet #sport-format-brief')
        checks.ok(outcome.is_visible() and
                  'Concept only' in outcome.inner_text() and
                  'authorised sporting reviewer' in outcome.inner_text() and
                  'not a verified formation shape' in outcome.inner_text(),
                  f'[{width}] complete local scope still cannot certify the Oztag formation')
        checks.ok(pg.locator('#sheet a[href="https://www.oztag.com.au/resources/rules"]').count()==1
                  and brief.is_visible() and
                  'Fictional test league' in brief.input_value() and
                  '2026' in brief.input_value() and
                  'No formation' in brief.input_value(),
                  f'[{width}] source link and honest reviewer brief are available without saving')
        checks.ok(pg.locator('#sheet details.e34-local-checks > summary').count()==1 and
                  'sporting reviewer' in pg.locator('#sheet details.e34-local-checks > summary').inner_text().lower(),
                  f'[{width}] real format-specific local rules questions are available without clutter')
        pg.locator('#sheet details.e34-local-checks > summary').click()
        checks.ok(pg.locator('#sheet details.e34-local-checks').get_attribute('open') is not None and
                  pg.locator('#sheet details.e34-local-checks li').count()==6 and
                  'Oztag eight-on-field reference' in pg.locator('#sheet details.e34-local-checks').inner_text() and
                  'not been independently verified' in pg.locator('#sheet details.e34-local-checks').inner_text(),
                  f'[{width}] expanded review contains six source-backed questions and no approved formation')
        checks.ok('E3.4.4 SPORT-SPECIFIC LOCAL RULES RECONCILIATION' in brief.input_value() and
                  '[PENDING]' in brief.input_value() and
                  'Under 13–15' not in brief.input_value() and
                  'No reviewer verification recorded' in brief.input_value(),
                  f'[{width}] copied Oztag brief contains appropriate local questions without cross-code guidance')
        checks.ok(pg.locator('#sheet .e34-evidence-checklist li').count()==6 and
                  pg.locator('#sheet .e34-evidence-checklist li').filter(has_text='Input supplied').count()==3 and
                  pg.locator('#sheet .e34-evidence-checklist li').filter(has_text='Not approved').count()==3 and
                  '2026 fictional edition' in brief.input_value() and
                  'https://example.org/rules' in brief.input_value() and
                  'token=DO_NOT_COPY' not in brief.input_value() and
                  'No local rules independently verified' in brief.input_value(),
                  f'[{width}] E3.4 source evidence is visible but never implies sporting approval')
        checks.ok(pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(p=>p.id==='quickie-out'))""")==snapshot,
                  f'[{width}] local evidence fields cannot persist in play')
        checks.ok(pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(p=>p.id==='quickie-out'))""")==snapshot and
                  pg.evaluate("""() => JSON.stringify({
                    clubs:window.__team.ws.clubs.map(c=>c.id),
                    teams:window.__team.M.teamsOf(window.__team.ws).map(t=>t.id),
                    library:window.__team.ws.library
                  })""")==baseline,
                  f'[{width}] format review cannot write play, clubs, teams or shared library')
        pg.locator('#sheet [data-act=play-format-change]').click()
        checks.ok(form.is_visible() and pg.locator('#sheet [name=grade]').input_value()=='' and
                  pg.locator('#sheet [name=rulesEdition]').input_value()=='' and
                  pg.locator('#sheet [name=localSourceUrl]').input_value()=='',
                  f'[{width}] opening another review does not persist competition or evidence')
        pg.locator('#sheet [name=referenceId]').select_option('oztag-eight-reference')
        pg.locator('#sheet [name=competition]').fill('fictional league')
        pg.locator('#sheet [name=grade]').fill('open')
        pg.locator('#sheet [name=season]').fill('2026')
        pg.locator('#sheet [name=rulesEdition]').fill('2026')
        pg.locator('#sheet [name=localSourceUrl]').fill('http://127.0.0.1/internal')
        pg.locator('#sheet [data-form=play-format-review] button[type=submit]').click()
        checks.ok(pg.locator('#sheet [role=alert]').count()==1 and
                  'local-source-url-invalid' in pg.locator('#sheet #sport-format-brief').input_value() and
                  'http://127.0.0.1' not in pg.locator('#sheet #sport-format-brief').input_value(),
                  f'[{width}] unsafe local source URL is rejected without being copied')
        pg.locator('#sheet [data-act=close-sheet]').last.click()
        checks.ok(pg.locator('[data-act=play-edit]').is_visible() and
                  pg.locator('#play-fig .play-board-field svg.pf').count()==1,
                  f'[{width}] close returns to accepted viewing/coach edit journey')
        # Player preview must omit format authoring and ignore a forged action.
        pg.evaluate("""() => {
          const b=document.createElement('button');b.dataset.act='preview-on';
          document.body.append(b);b.click();b.remove();
        }""")
        pg.locator('[data-act=play-back]').click()
        pg.locator('.play-row[data-id=quickie-out]').click()
        checks.ok(pg.locator('[data-act=play-format-review], [data-act=play-edit]').count()==0,
                  f'[{width}] player view is read-only with no coach format review')
        pg.evaluate("""() => {
          const b=document.createElement('button');b.dataset.act='play-format-review';
          b.dataset.id='quickie-out';document.body.append(b);b.click();b.remove();
        }""")
        checks.ok(pg.locator('#sheet form[data-form=play-format-review]').count()==0 and
                  pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(p=>p.id==='quickie-out'))""")==snapshot,
                  f'[{width}] forged player action does not open coach review or alter source')
        checks.ok(pg.evaluate('document.documentElement.scrollWidth<=innerWidth+2'),
                  f'[{width}] extra coach button never creates page horizontal overflow')
        ctx.close()
    passed=checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if passed else 1)
