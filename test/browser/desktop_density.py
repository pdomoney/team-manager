# Desktop screen-density UI: preserve phone sizing, no CSS zoom and no team data mutations.
import sys
from harness import *
from playwright.sync_api import sync_playwright
build(); srv,url=serve()
c=Check(); errors=[]
act="([a, ds]) => { const b=document.createElement('button');b.dataset.act=a; Object.assign(b.dataset,ds||{});document.body.appendChild(b);b.click();b.remove(); }"
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (1280,1660):
        ctx,pg,_=page(browser,url+'#home',width=width,height=900,errors=errors)
        pg.wait_for_selector('#view [data-act=test-library]')
        pg.click('#view [data-act=test-library]'); pg.wait_for_timeout(150)
        data_before=pg.evaluate('JSON.stringify(window.__team.ws)')
        c.ok(pg.locator('#density-btn').count()==0,f'[{width}] redundant header Compact shortcut removed')
        c.ok(not pg.evaluate("document.body.classList.contains('density-compact')"),
             f'[{width}] default remains comfortable for existing users')
        comfortable=pg.evaluate("""() => ({
            mainPadding:parseFloat(getComputedStyle(document.querySelector('main')).paddingTop),
            headerHeight:document.querySelector('.top').getBoundingClientRect().height,
            sidebarWidth:document.querySelector('#tabs').getBoundingClientRect().width,
            fontSize:parseFloat(getComputedStyle(document.body).fontSize)
          })""")
        pg.evaluate(act,['settings',{'sec':'layout'}])
        pg.wait_for_selector('#sheet [data-act=layout-density][data-v=compact]')
        pg.click('#sheet [data-act=layout-density][data-v=compact]')
        pg.wait_for_timeout(50)
        compact=pg.evaluate("""() => ({
            mainPadding:parseFloat(getComputedStyle(document.querySelector('main')).paddingTop),
            headerHeight:document.querySelector('.top').getBoundingClientRect().height,
            sidebarWidth:document.querySelector('#tabs').getBoundingClientRect().width,
            fontSize:parseFloat(getComputedStyle(document.body).fontSize)
          })""")
        c.ok(pg.evaluate("document.body.classList.contains('density-compact')") and
             pg.get_attribute('#sheet [data-act=layout-density][data-v=compact]','aria-pressed')=='true',
             f'[{width}] Settings enables compact CSS and announces state')
        c.ok(compact['mainPadding'] < comfortable['mainPadding'] and
             compact['sidebarWidth'] < comfortable['sidebarWidth'] and
             compact['fontSize'] < comfortable['fontSize'],
             f'[{width}] tighter desktop metrics without browser zoom {comfortable} -> {compact}')
        c.ok(pg.evaluate("localStorage.getItem('tm-density')")=='compact',
             f'[{width}] density remembered only on this browser')
        c.ok(pg.evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'),
             f'[{width}] compact dashboard no horizontal overflow')
        c.ok(pg.get_attribute('#sheet [data-act=layout-density][data-v=compact]','aria-pressed')=='true',
             f'[{width}] Settings reports compact mode accurately')
        pg.click('#sheet [data-act=layout-density][data-v=comfortable]')
        c.ok(not pg.evaluate("document.body.classList.contains('density-compact')") and
             pg.get_attribute('#sheet [data-act=layout-density][data-v=comfortable]','aria-pressed')=='true',
             f'[{width}] Settings restores comfortable mode')
        pg.click('#sheet [data-act=layout-density][data-v=compact]')
        pg.keyboard.press('Escape')
        pg.reload(); pg.wait_for_selector('#menu-btn:visible')
        c.ok(pg.evaluate("document.body.classList.contains('density-compact')"),
             f'[{width}] reloading preserves locally selected compact mode')
        c.ok(pg.evaluate('JSON.stringify(window.__team.ws)')==data_before,
             f'[{width}] density toggle/reload never changes team records')
        pg.set_viewport_size({'width':820,'height':900}); pg.wait_for_timeout(120)
        c.ok(not pg.evaluate("document.body.classList.contains('density-compact')") and pg.locator('#density-btn').count()==0,
             f'[{width}] narrower layout uses regular spacing without header density shortcut')
        pg.set_viewport_size({'width':width,'height':900}); pg.wait_for_timeout(120)
        c.ok(pg.evaluate("document.body.classList.contains('density-compact')") and pg.locator('#density-btn').count()==0,
             f'[{width}] wide layout restores preference without header shortcut or data mutation')
        ctx.close()
    ctx,pg,_=page(browser,url+'#home',width=390,height=844,errors=errors)
    pg.wait_for_selector('#view [data-act=test-library]')
    pg.evaluate("localStorage.setItem('tm-density','compact')")
    pg.click('#view [data-act=test-library]');pg.wait_for_timeout(120)
    c.ok(pg.locator('#density-btn').count()==0 and not pg.evaluate("document.body.classList.contains('density-compact')"),
         '[390] phone ignores the compact preference and keeps normal controls')
    c.ok(pg.evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'),
         '[390] compact preference does not cause mobile horizontal overflow')
    ctx.close()
    passed=c.done(errors); browser.close()
srv.shutdown()
sys.exit(0 if passed else 1)
