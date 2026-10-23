# P07D: browser qualification for local multi-club schedule visibility.
# Synthetic data only; no official feed, remote publication or real Safari claim.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv, url = serve()
c = Check()
act = "([a, ds]) => { const b = document.createElement('button'); b.dataset.act = a; Object.assign(b.dataset, ds || {}); document.body.appendChild(b); b.click(); b.remove(); }"
with sync_playwright() as p:
    b = p.chromium.launch()
    for width in (390, 1280):
        ctx, pg, errs = page(b, url + '#home', width=width)
        pg.click('text=Load a sample squad')
        pg.wait_for_timeout(250)
        # Add a second fictional club and local match sharing the same time.
        # In-memory only: do not touch encrypted workspace files or shared settings.
        seed = pg.evaluate("""() => {
          const ws=window.__team.ws, M=window.__team.M;
          const date=M.addDays(M.isoDay(),2);
          const rootClub=ws.team.clubId || ws.clubs[0]?.id || 'p07droot';
          if(!ws.clubs.some(c=>c.id===rootClub))
            ws.clubs.push({id:rootClub,name:'P07D Root Club',sport:'Oztag'});
          ws.team.clubId=rootClub;
          ws.matches.push({id:'p07d-local-a',date,start:'09:30',
            opponent:'P07D Synthetic A',venue:'Synthetic Park',status:'scheduled',
            result:{},coachNotes:'P07D SECRET COACH A'});
          ws.clubs.push({id:'p07dclub',name:'P07D Other Club',sport:'Oztag'});
          ws.teams.push({id:'p07dteam',team:{name:'P07D Second Team',sport:'Oztag',
            clubId:'p07dclub'},matches:[{id:'p07d-local-b',date,start:'09:30',
            opponent:'P07D Synthetic B',venue:'Synthetic Park',status:'scheduled',
            coachNotes:'P07D SECRET COACH B',result:{}}],
            players:[],sessions:[],tasks:[],seasons:[]});
          return {date,rootClub};
        }""")
        pg.evaluate(act, ['tab', {'tab': 'agenda'}])
        pg.wait_for_selector('#view .calendar-local-overview')
        panel = pg.locator('#view .calendar-local-overview')
        details = panel.inner_text()
        c.ok('P07D Synthetic A' in details and 'P07D Synthetic B' in details,
             f'{width}: different clubs at same time remain separate local entries')
        c.ok('official fixtures are not independently verified' in details,
             f'{width}: unverified provenance warning persists')
        c.ok('P07D SECRET' not in details,
             f'{width}: coach notes excluded from calendar projection')
        c.ok(panel.locator('select[name=agendaClubId]').count() == 1,
             f'{width}: multiple clubs give explicit filter')
        pg.select_option('#view select[name=agendaClubId]', 'p07dclub')
        pg.wait_for_timeout(150)
        scoped = pg.locator('#view .calendar-local-overview').inner_text()
        c.ok('P07D Synthetic B' in scoped and 'P07D Synthetic A' not in scoped,
             f'{width}: second club filter excludes first club')
        pg.select_option('#view select[name=agendaClubId]', seed['rootClub'])
        pg.wait_for_timeout(150)
        scoped = pg.locator('#view .calendar-local-overview').inner_text()
        c.ok('P07D Synthetic A' in scoped and 'P07D Synthetic B' not in scoped,
             f'{width}: first club filter excludes second club')
        pg.select_option('#view select[name=agendaClubId]', '')
        pg.wait_for_timeout(120)
        c.ok('P07D Synthetic B' in pg.locator('#view .calendar-local-overview').inner_text(),
             f'{width}: all-clubs filter restores local entries without joining them')
        pg.evaluate(act, ['preview-on', {}])
        pg.wait_for_timeout(120)
        c.ok(pg.locator('#view .calendar-local-overview').count() == 0,
             f'{width}: player preview does not render coach-only cross-club calendar')
        c.ok('P07D SECRET' not in pg.inner_text('#view'),
             f'{width}: player view never exposes coach-only fixture reasons')
        pg.screenshot(path=shot(f'p07d-player-{width}.png'), full_page=True)
        c.ok(not errs, f'{width}: no browser console/page errors; captured={errs[:8]!r}')
        ctx.close()
    ok = c.done()
    b.close()
srv.shutdown()
sys.exit(0 if ok else 1)
