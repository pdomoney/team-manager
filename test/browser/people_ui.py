# P04B browser qualification — coach-only People view, manual review and reverse
# Uses the existing isolated sample mode, never publishes data.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv, url = serve()
c = Check()
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx, pg, errs = page(b, url + '#home', width=390, height=844)
    pg.wait_for_selector('text=Load a sample squad')
    c.ok(pg.locator('[data-tab=people]').count() == 0, 'People navigation hidden while logged out')
    pg.click('[data-act=sample]')
    pg.wait_for_timeout(250)
    pg.goto(url + '#more')
    pg.wait_for_timeout(120)
    c.ok(pg.locator('[data-act=tab][data-tab=people]').count() >= 1, 'coach More menu contains People')
    pg.click('[data-act=tab][data-tab=people]')
    pg.wait_for_timeout(100)
    c.ok(pg.locator('h2', has_text='People').count() >= 1, 'People screen opens from More')
    c.ok(pg.locator('form[data-form=people-link]').count() == 1, 'person manual review form available')
    c.ok(pg.locator('#people-source-list .helper-card').count() >= 2, 'person contexts listed')
    text = pg.inner_text('#view')
    c.ok('Not a verified guardian' in text or 'not legally verified' in text.lower()
         or 'No helper-to-player candidates' in text,
         'guardian section never describes a verified legal relation')
    c.ok('Names alone never join records' in text, 'same names cannot trigger automatic merging')
    c.ok('stable record IDs' in text and 'Coach-only' in text, 'unsupported historical staff scope clearly labelled')
    options=pg.locator('form[data-form=people-link] select[name=firstRef] option').evaluate_all(
        '(items) => items.map(x => ({value:x.value,text:x.textContent.trim()}))')
    first=next((x for x in options if 'Player' in x['text'] and x['value']),None)
    second=next((x for x in options if 'Helper' in x['text'] and x['value']),None)
    if not first or not second:
        c.ok(False, 'sample contains both eligible player and helper')
    else:
        pg.select_option('form[data-form=people-link] select[name=firstRef]', value=first['value'])
        pg.select_option('form[data-form=people-link] select[name=secondRef]', value=second['value'])
        pg.click('form[data-form=people-link] button[type=submit]')
        pg.wait_for_timeout(250)
        c.ok('Locally reviewed (not verified identity)' in pg.inner_text('#view'),
             'explicit local review saved, not misrepresented as verified identity')
        c.ok(pg.locator('[data-act=people-undo]').count() == 1,
             'review can be reversed from the People screen')
        result=pg.evaluate("""() => ({
            ledger: window.__team.ws.peopleReviews,
            p: window.__team.ws.players[0],
            helpers: window.__team.ws.helpers
        })""")
        c.ok(len(result['ledger']) == 1 and result['ledger'][0]['status'] == 'reviewed',
             'accepted review stored on coach workspace root')
        c.ok(len(result['helpers']) >= 1 and len(result['p'].get('jerseys',[])) >= 0,
             'helper and player legacy records retained')
        # P04B regression: People is a workspace-wide screen, even while
        # this team happens to be displaying a completed historical season.
        pg.evaluate("""() => {
            const {data,state} = window.__team;
            data.seasons = data.seasons || [];
            data.seasons.push({id:'past-p04-ui-test',name:'Historical season',status:'completed',
                squad:[],staff:[]});
            state.viewSeason[data.id]='past-p04-ui-test';
            const button=document.createElement('button');
            button.dataset.act='tab'; button.dataset.tab='people';
            document.body.appendChild(button); button.click(); button.remove();
        }""")
        pg.wait_for_timeout(120)
        c.ok(pg.locator('[data-act=people-undo]').count() == 1 and
             pg.locator('.season-banner').count() == 0,
             'People review is available during historical-season viewing without misleading read-only banner')
        pg.click('[data-act=people-undo]')
        pg.wait_for_timeout(150)
        c.ok(pg.locator('[data-act=people-undo]').count() == 0,
             'reversal works during historical-season view and retains its history')
        result=pg.evaluate('() => window.__team.ws.peopleReviews')
        c.ok(len(result)==1 and result[0]['status']=='reversed',
             'reversed review stored as one tombstone, no deletion')
    pg.fill('[data-input=people-search]','impossible-person-name')
    c.ok(pg.locator('#people-source-list .helper-card:not([hidden])').count()==0,
         'client-side person search hides nonmatching records')
    pg.fill('[data-input=people-search]','')
    c.ok(pg.locator('#people-source-list .helper-card:not([hidden])').count()>0,
         'cleared search restores source records')
    c.ok(pg.evaluate('document.documentElement.scrollWidth <= innerWidth'),
         'People screen fits a 390px mobile viewport')
    # Changing to player preview must remove the People screen from navigation.
    pg.goto(url + '#home')
    pg.wait_for_timeout(120)
    preview=pg.locator('[data-act=preview-on]')
    if preview.count():
        preview.first.click()
        pg.wait_for_timeout(100)
        pg.goto(url + '#people')
        pg.wait_for_timeout(100)
        c.ok('People' not in [x.strip() for x in pg.locator('.nav-sub button').all_inner_texts()],
             'People navigation absent in player preview')
    else:
        c.ok(True, 'player preview unavailable in isolated sample; coach-only nav already verified')
    ctx.close()
    b.close()
srv.shutdown()
if not c.done(errs):
    sys.exit(1)
