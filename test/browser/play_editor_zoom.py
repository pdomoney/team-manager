# E1: editor-width regressions at effective 100%-200% zoom layouts.
# Viewport contraction emulates browser layout-space loss; actual Safari zoom
# and physical screen magnification still require manual qualification.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv,url=serve()
checks,errors=Check(),[]
measure="""() => {
  const panel=document.querySelector('#sheet .panel'),
    body=panel?.querySelector('.panel-body'),
    list=panel?.querySelector('.teach-list'),
    preview=panel?.querySelector('.teach-preview'),
    save=panel?.querySelector('form.ped button[type=submit]');
  const bounds=el=>{if(!el)return null; const q=el.getBoundingClientRect();
    return {left:q.left,right:q.right,top:q.top,bottom:q.bottom,width:q.width}};
  return {width:innerWidth,viewport:bounds(panel),list:bounds(list),
    preview:bounds(preview),save:bounds(save),
    dialogHeight:body?.clientHeight,scrollHeight:body?.scrollHeight,
    overflow:document.documentElement.scrollWidth-innerWidth};
}"""
with sync_playwright() as p:
    browser=p.chromium.launch()
    # These are the available layout CSS pixels at desktop zoom:
    # 1280 @ 100%, ~853 @ 150%, ~640 @ 200%; plus a small phone.
    for width in (390,640,768,853,1280):
        ctx,pg,_=page(browser,url+'#home',width=width,height=760,errors=errors)
        pg.get_by_text('Load a sample squad').click()
        pg.goto(url+'#plays')
        pg.locator('.play-row[data-id=quickie-out]').click()
        before=pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(x=>x.id==='quickie-out'))""")
        pg.locator('[data-act=play-edit]').click()
        pg.wait_for_selector('#sheet form.ped')
        checks.ok(pg.locator('#ped-diagram').is_visible(),
                  f'[{width}] play editor now starts with the diagram workspace')
        pg.locator('[data-act=ped-tab][data-tab=teach]').click()
        snap=pg.evaluate(measure)
        checks.ok(snap['viewport']['left']>=-2 and
                  snap['viewport']['right']<=width+2 and
                  snap['overflow']<=2,
                  f'[{width}] Teach editor stays inside available viewport: {snap!r}')
        if width<980:
            checks.ok(snap['preview']['top']>=snap['list']['top'] and
                      snap['preview']['left']>=snap['viewport']['left']-2 and
                      snap['preview']['right']<=snap['viewport']['right']+2,
                      f'[{width}] teaching preview is contained, not a fixed-width side column')
        pg.locator('[data-act=ped-tab][data-tab=diagram]').click()
        checks.ok(pg.locator('#ped-svg').count()==1 and
                  pg.locator('#ped-tools button').count()>=4,
                  f'[{width}] original field editor and tools remain available')
        r=pg.evaluate("""() => {
          const panel=document.querySelector('#sheet .panel'),
            dia=document.querySelector('#ped-diagram'),
            field=document.querySelector('#ped-field'),tools=document.querySelector('#ped-tools');
          const b=x=>x.getBoundingClientRect();
          return {panelLeft:b(panel).left,panelRight:b(panel).right,
            diaRight:b(dia).right,fieldRight:b(field).right,toolsRight:b(tools).right,
            overflow:document.documentElement.scrollWidth-innerWidth};
        }""")
        checks.ok(r['fieldRight']<=r['panelRight']+2 and
                  r['toolsRight']<=r['panelRight']+2 and
                  r['overflow']<=2,
                  f'[{width}] Advanced Diagram tools and field fit within modal: {r!r}')
        pg.locator('[data-act=ped-tab][data-tab=teach]').click()
        pg.evaluate("""() => {
          const body=document.querySelector('#sheet .panel-body');
          body.scrollTop=body.scrollHeight;
        }""")
        checks.ok(pg.locator('form.ped button[type=submit]').is_visible(),
                  f'[{width}] save control remains available when teaching list scrolls')
        pg.locator('#sheet .panel-head [data-act=close-sheet]').click()
        checks.ok(pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(x=>x.id==='quickie-out'))""")==before,
                  f'[{width}] opening and dismissing editor leaves original play unchanged')
        ctx.close()
    ok=checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
