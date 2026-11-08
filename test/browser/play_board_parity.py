# E2: play presentation parity and safe starter title upgrades.
# The original starter IDs and one workspace are protected throughout.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv,url=serve()
c,errors=Check(),[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
        ctx,pg,_=page(browser,url+'#home',width=width,height=865,errors=errors)
        pg.get_by_text('Load a sample squad').click()
        pg.goto(url+'#plays')
        out=pg.locator('.play-row[data-id=quickie-out]')
        step_in=pg.locator('.play-row[data-id=quickie-in]')
        c.ok(out.count()==1 and step_in.count()==1 and
             'Step Out' in out.inner_text() and 'Step In' in step_in.inner_text(),
             f'[{width}] original starter IDs now show requested Step In and Step Out titles')
        thumb=out.locator('.play-thumb svg.pf.thumb')
        cols=thumb.evaluate("""svg=>{
          const pitch=svg.querySelector('.pf-turf');
          return {pitch:getComputedStyle(pitch).fill,
            key:getComputedStyle(svg.querySelector('.mv.key')).stroke,
            title:svg.getAttribute('aria-label')};
        }""")
        c.ok(cols['pitch']=='rgb(40, 50, 59)' and
             cols['key']=='rgb(241, 199, 117)' and
             'Step Out' in cols['title'],
             f'[{width}] library play icon uses same dark board and amber movement emphasis')
        existing=pg.evaluate("""() => {
          const w=window.__team.ws,d=window.__team.data;
          return {clubs:w.clubs.map(c=>c.id),teams:window.__team.M.teamsOf(w).map(t=>t.id),
            id:d.plays.find(p=>p.id==='quickie-out').id,
            moves:JSON.stringify(d.plays.find(p=>p.id==='quickie-out').moves)};
        }""")
        out.click()
        c.ok('Step Out' in pg.locator('#play-fig .play-board-title').text_content(),
             f'[{width}] viewer shares canonical title with list')
        pg.locator('[data-act=play-edit]').click()
        pg.locator('[data-act=ped-tab][data-tab=teach]').click()
        preview=pg.locator('.teach-preview.play-editor-preview')
        c.ok(preview.count()==1 and
             preview.locator('.play-card.play-presentation .pf.study').count()==1,
             f'[{width}] teaching editor preview uses same board graphics as player viewer')
        bg=preview.evaluate("el=>getComputedStyle(el).backgroundColor")
        c.ok(bg=='rgb(27, 36, 45)',
             f'[{width}] teaching preview has dark presentation background')
        pg.locator('[data-act=ped-tab][data-tab=diagram]').click()
        c.ok(pg.locator('#ped-diagram .ped-card.play-presentation .pf.editor').count()==1 and
             pg.locator('#ped-tools button').count()>=4,
             f'[{width}] advanced diagram editor shares board visuals and retains all drawing tools')
        pg.locator('#sheet .panel-head [data-act=close-sheet]').click()
        after=pg.evaluate("""() => {
          const w=window.__team.ws,d=window.__team.data;
          return {clubs:w.clubs.map(c=>c.id),teams:window.__team.M.teamsOf(w).map(t=>t.id),
            id:d.plays.find(p=>p.id==='quickie-out').id,
            moves:JSON.stringify(d.plays.find(p=>p.id==='quickie-out').moves)};
        }""")
        c.ok(existing==after, f'[{width}] visual redesign leaves clubs, teams and play geometry unchanged')

        # Simulate an older local saved copy: a built-in title, plus a coach
        # edited version of Step In; migration must keep the custom steps.
        pg.evaluate("""() => {
          const key='tm-test-data',w=JSON.parse(localStorage.getItem(key));
          const out=w.plays.find(x=>x.id==='quickie-out'),
                inside=w.plays.find(x=>x.id==='quickie-in');
          out.name='Quickie Out';inside.name='Quickie In';
          inside.edited=true;inside.steps='A coach-edited drill that must survive';
          localStorage.setItem(key,JSON.stringify(w));
        }""")
        pg.reload();pg.wait_for_selector('.play-row[data-id=quickie-out]')
        renamed=pg.evaluate("""() => {
          const ps=window.__team.data.plays;
          return [ps.find(x=>x.id==='quickie-out'),ps.find(x=>x.id==='quickie-in')];
        }""")
        c.ok(renamed[0]['name']=='Step Out' and renamed[1]['name']=='Step In'
             and renamed[1]['steps']=='A coach-edited drill that must survive'
             and renamed[1]['id']=='quickie-in',
             f'[{width}] legacy starter titles upgrade on reload without changing coach-edited notes')
        c.ok(pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),
             f'[{width}] updated play list creates no horizontal page overflow')
        ctx.close()
    ok=c.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
