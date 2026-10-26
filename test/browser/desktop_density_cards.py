# Compact Home refinements: multi-competition cards and action list must get genuinely shorter.
# Browser zoom must remain unchanged, and all labels/actions preserved.
import sys
from harness import *
from playwright.sync_api import sync_playwright
build(); srv,url=serve()
c=Check(); errors=[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (1280,1660):
        ctx,pg,_=page(browser,url+'#home',width=width,height=900,errors=errors)
        pg.wait_for_selector('#view [data-act=test-library]')
        pg.click('#view [data-act=test-library]')
        pg.wait_for_selector('#view .home-cols .comp-live')
        pg.wait_for_selector('#view .home-act .act-row')
        baseline=pg.evaluate('JSON.stringify(window.__team.ws)')
        def snapshot():
            return pg.evaluate("""() => {
              const comp=document.querySelector('#view .home-cols .comp-live'),
                    action=document.querySelector('#view .home-act .act-row'),
                    stats=comp.querySelector('.cl-rec'),
                    hdr=comp.querySelector('.cl-head'),
                    btn=comp.querySelector('[data-act=home-go]'),
                    css=e=>getComputedStyle(e);
              return {
                competitionHeight:comp.getBoundingClientRect().height,
                actionHeight:action.getBoundingClientRect().height,
                headHeight:hdr.getBoundingClientRect().height,
                recordHeight:stats.getBoundingClientRect().height,
                competitionPadding:parseFloat(css(comp).paddingTop),
                competitionTitle:comp.querySelector('h2').innerText,
                results:stats.innerText,actionText:action.innerText,
                actionSelector:action.getAttribute('data-act'),
                competitionButton:btn?.getAttribute('data-act'),
                buttonHeight:btn?.getBoundingClientRect().height ?? 0,
                zoom:css(document.documentElement).zoom
              };
            }""")
        comfy=snapshot()
        pg.click('#density-btn')
        dense=snapshot()
        c.ok(pg.evaluate("document.body.classList.contains('density-compact')"),
             f'[{width}] only explicit density toggle enters compact mode')
        c.ok(dense['competitionHeight']+15 < comfy['competitionHeight'],
             f'[{width}] live competition card height visibly reduced ({comfy["competitionHeight"]:.1f} -> {dense["competitionHeight"]:.1f})')
        c.ok(dense['actionHeight']+5 < comfy['actionHeight'],
             f'[{width}] outstanding action row shorter ({comfy["actionHeight"]:.1f} -> {dense["actionHeight"]:.1f})')
        c.ok(dense['headHeight']<comfy['headHeight'] and dense['recordHeight']<comfy['recordHeight'],
             f'[{width}] trophy/header and results compress independently')
        c.ok(dense['competitionTitle']==comfy['competitionTitle'] and dense['results']==comfy['results'] and
             dense['actionText']==comfy['actionText'],
             f'[{width}] no competition/result/action content hidden in compact')
        c.ok(dense['actionSelector']==comfy['actionSelector']=='home-go' and
             dense['competitionButton']==comfy['competitionButton']=='home-go' and dense['buttonHeight']>=36,
             f'[{width}] original action buttons remain operable')
        c.ok(dense['zoom']==comfy['zoom'] and pg.evaluate('window.devicePixelRatio')>0,
             f'[{width}] no browser zoom alteration')
        c.ok(pg.evaluate('JSON.stringify(window.__team.ws)')==baseline,
             f'[{width}] layout has not changed any team/competition information')
        c.ok(pg.evaluate('document.documentElement.scrollWidth <= innerWidth+1'),
             f'[{width}] compact result does not overflow desktop')
        pg.click('#density-btn')
        restored=snapshot()
        c.ok(abs(restored['competitionHeight']-comfy['competitionHeight'])<1 and
             abs(restored['actionHeight']-comfy['actionHeight'])<1,
             f'[{width}] comfortable mode completely restores original proportions')
        ctx.close()
    ctx,pg,_=page(browser,url+'#home',width=390,height=844,errors=errors)
    pg.wait_for_selector('#view [data-act=test-library]')
    pg.evaluate("localStorage.setItem('tm-density','compact')")
    pg.click('#view [data-act=test-library]')
    pg.wait_for_selector('#view .home-cols .comp-live')
    c.ok(not pg.evaluate("document.body.classList.contains('density-compact')"),
         '[390] dense desktop competition rules cannot activate on phone')
    c.ok(pg.evaluate("getComputedStyle(document.querySelector('#view .comp-live')).paddingTop")!='9px',
         '[390] phone live competition card retains normal spacing')
    c.ok(pg.evaluate('document.documentElement.scrollWidth <= innerWidth+1'),
         '[390] no horizontal overflow introduced')
    ctx.close()
    passed=c.done(errors); browser.close()
srv.shutdown()
sys.exit(0 if passed else 1)
