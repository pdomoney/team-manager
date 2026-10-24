# P08C — sport-aware play and teaching coverage, synthetic coach data.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv,url=serve()
c=Check()
errors=[]
act="([a,ds]) => {const b=document.createElement('button');b.dataset.act=a;Object.assign(b.dataset,ds||{});document.body.appendChild(b);b.click();b.remove();}"

with sync_playwright() as p:
    b=p.chromium.launch()
    for width in (390,1280):
        ctx,pg,_=page(b,url+'#home',width=width,errors=errors)
        pg.get_by_text('Load a sample squad').click()
        pg.goto(url+'#plays')
        pg.wait_for_selector('.play-row[data-id="quickie-out"]')
        pg.click('.play-row[data-id="quickie-out"]')
        c.ok(pg.locator('#view .play-sport-context').count()==0,
             f'{width}: original Oztag starter retains its native teaching workflow')
        pg.evaluate("""() => {
          const D=window.__team.data, starter=D.plays.find(x=>x.id==='quickie-out');
          D.team.sport='Touch football';
          D.plays.push({...JSON.parse(JSON.stringify(starter)),
            id:'p08c-touch',name:'P08C Touch Concept',sport:'Touch football',builtin:false});
          const old={...JSON.parse(JSON.stringify(starter)),
            id:'p08c-legacy',name:'P08C Older Custom',builtin:false};
          delete old.sport;delete old.originSport;
          D.plays.push(old);
        }""")
        pg.goto(url+'#plays')
        pg.wait_for_selector('.play-row[data-id="p08c-touch"]')
        c.ok(pg.locator('.play-row[data-id="p08c-touch"] .pill').all_text_contents().count('Teaching canvas')==1,
             f'{width}: touch play labelled a teaching canvas')
        c.ok('Review sport' in pg.locator('.play-row[data-id="p08c-legacy"]').inner_text(),
             f'{width}: legacy custom play is not silently inferred as Oztag')
        pg.click('.play-row[data-id="p08c-touch"]')
        pg.wait_for_selector('#view .play-sport-context')
        note=pg.locator('#view .play-sport-context').inner_text()
        c.ok('eight-slot teaching canvas' in note and 'not a validated Touch football formation' in note,
             f'{width}: touch playback distinguishes concept from formation')
        c.ok(pg.locator('#view [data-act=play-transfer]').count()==1,
             f'{width}: explicit coach-only adaptation remains available')
        pg.evaluate(act,['preview-on',{}])
        pg.wait_for_timeout(100)
        c.ok(pg.locator('#view [data-act=play-transfer]').count()==0,
             f'{width}: player preview omits coach-only adaptation')
        c.ok('PRIVATE HEALTH' not in pg.inner_text('#view'),
             f'{width}: player preview does not expose private source notes')
        pg.evaluate(act,['preview-off',{}])
        pg.goto(url+'#plays')
        pg.click('.play-row[data-id="p08c-legacy"]')
        pg.wait_for_selector('#view .play-sport-context')
        c.ok('no confirmed sport' in pg.locator('#view .play-sport-context').inner_text(),
             f'{width}: untagged custom play visibly requires sport review')
        pg.locator('#view [data-act=play-transfer]').click()
        pg.wait_for_selector('#sheet form[data-form=transfer-choose]')
        c.ok(pg.locator('#sheet select[name=source]').input_value()=='',
             f'{width}: unknown original sport defaults to unselected')
        pg.locator('#sheet select[name=source]').select_option('Oztag')
        pg.locator('#sheet select[name=target]').select_option('Rugby league')
        pg.locator('#sheet form[data-form=transfer-choose] button[type=submit]').click()
        pg.wait_for_selector('#sheet form[data-form=transfer-notes]')
        c.ok('not automatically converted' in pg.locator('#sheet').inner_text(),
             f'{width}: deliberate sport selection allows non-automated concept briefing')
        ctx.close()
    result=c.done(errors)
    b.close()
srv.shutdown()
sys.exit(0 if result else 1)
