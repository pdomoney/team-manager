# B4.8: Watch animation should retain a lean, readable diagram while
# respecting its original player paths, seek timing, directions and phases.
# Synthetic Chromium only. Owner Safari visual acceptance is separate.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv,url=serve()
checks,errors=Check(),[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,853,1280):
        ctx,pg,_=page(browser,url+'#home',width=width,height=820,errors=errors)
        pg.get_by_text('Load a sample squad').click()
        pg.goto(url+'#plays')
        pg.locator('.play-row[data-id=quickie-out]').click()
        stored=pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(q=>q.id==='quickie-out'))""")
        checks.ok(pg.locator('#play-fig svg.pf.watch-art').count()==1,
                  f'[{width}] default Coach Watch view receives compact artwork immediately')
        pg.locator('[data-act=play-mode][data-mode=watch]').click()

        def art():
            return pg.evaluate("""() => {
              const svg=document.querySelector('#play-fig .play-board-field svg.pf');
              const player=svg.querySelector('[data-pl="LM"]');
              const icon=player.querySelector('circle.pl');
              const path=svg.querySelector('path.mv:not(.mv-hit)');
              const font=svg.querySelector('text.pf-note');
              const ball=svg.querySelector('.ball');
              const scale=svg.getBoundingClientRect().width/svg.viewBox.baseVal.width;
              return {
                watch:svg.classList.contains('watch-art'),
                factor:Number(svg.dataset.watchArtScale||0),
                symbol:icon.getBoundingClientRect().width,
                line:parseFloat(getComputedStyle(path).strokeWidth)*scale,
                font:font ? parseFloat(getComputedStyle(font).fontSize)*scale : 0,
                playerTransform:player.getAttribute('transform'),
                ballTransform:ball?.getAttribute('transform'),
                width:svg.getBoundingClientRect().width,
                bodyOverflow:document.documentElement.scrollWidth-innerWidth,
                pct:document.querySelector('#anim-pct')?.textContent,
                animTime:window.__team.anim.t,
                playing:window.__team.anim.playing
              };
            }""")
        start=art()
        expected_start=(27 if start['width']<=420 else 36 if start['width']>=760
                        else 27+(start['width']-420)*9/340)
        checks.ok(start['watch'] and abs(start['symbol']-expected_start)<=2,
                  f'[{width}] Watch begins with responsive phone/desktop badge size: {start!r}, target={expected_start}')
        checks.ok(start['factor']>0 and 0<start['line']<=4 and
                  (start['font']==0 or 11<=start['font']<=23),
                  f'[{width}] line ink and visible annotations keep lean readable size')
        checks.ok(start['bodyOverflow']<=2,
                  f'[{width}] Watch field keeps whole page inside viewport')

        # Tick actual animation. The movement code used to replace SVG
        # transforms on each frame; it must preserve the new symbol scale.
        pg.locator('[data-act=anim-play]').click()
        pg.wait_for_timeout(160)
        moving=art()
        checks.ok(moving['playing'] and 'scale(' in moving['playerTransform'] and
                  'scale(' in moving['ballTransform'],
                  f'[{width}] moving actors and ball retain scaled artwork at each frame')
        pg.locator('[data-act=anim-slow]').click()
        pg.locator('#anim-seek').evaluate("""e => {
          e.value='65';e.dispatchEvent(new Event('input',{bubbles:true}));
        }""")
        sought=art()
        checks.ok(sought['pct']=='65%' and not sought['playing'] and
                  'scale(' in sought['playerTransform'] and
                  'scale(' in sought['ballTransform'],
                  f'[{width}] Slow/seek keeps scaled actors without changing original timing controls')

        # Browser zoom / rotation changes the available Watch board width.
        # The board should re-density its art and retain the scrubbed phase.
        newWidth={390:540,853:1050,1280:980}[width]
        pg.set_viewport_size({'width':newWidth,'height':820})
        pg.wait_for_function("""previous => {
          const svg=document.querySelector('#play-fig svg.pf.watch-art');
          if (!svg) return false;
          const width=svg.getBoundingClientRect().width;
          if (Math.abs(width-previous)<=5) return false;
          // Resize, CSS breakpoint layout and the redraw may settle in
          // different animation frames. Verify the artwork is sized against
          // the actual *new* board width before inspecting the paused path.
          const target=width<=420?27:width>=760?36:27+(width-420)*9/340;
          const expected=Math.round(Math.max(.28,Math.min(2,target*380/(24*width)))*1000)/1000;
          return Math.abs(Number(svg.dataset.watchArtScale)-expected)<.005;
        }""", arg=start['width'])
        resized=art()
        expected_resize=(27 if resized['width']<=420 else 36 if resized['width']>=760
                         else 27+(resized['width']-420)*9/340)
        checks.ok(abs(resized['symbol']-expected_resize)<=2 and
                  abs(resized['symbol']-start['symbol'])<=10,
                  f'[{width}] Watch badge follows intentional device density after resize: {start!r} -> {resized!r}')
        checks.ok(resized['pct']=='65%' and not resized['playing'] and
                  abs(resized['animTime']-sought['animTime'])<=.02 and
                  'scale(' in resized['playerTransform'],
                  f'[{width}] responsive redraw preserves paused seek position and actor transforms: {sought!r} -> {resized!r}')
        pg.locator('[data-act=anim-restart]').click()
        checks.ok(pg.locator('#anim-pct').inner_text()=='0%',
                  f'[{width}] Restart remains at phase beginning')

        pg.locator('[data-act=play-side][data-side=left]').click()
        checks.ok(pg.locator('#play-fig svg.pf.watch-art').count()==1 and
                  pg.locator('#play-fig svg.pf').get_attribute('aria-label').endswith('attacking left'),
                  f'[{width}] mirrored Watch view keeps one scaled diagram')
        pg.locator('[data-act=play-mode][data-mode=learn]').click()
        checks.ok(pg.locator('#play-fig svg.pf.study:not(.watch-art)').count()==1 and
                  pg.locator('#play-fig svg.pf').get_attribute('data-watch-art-scale') is None,
                  f'[{width}] Learn teaching diagram retains its own appearance and interaction')
        pg.locator('[data-act=play-mode][data-mode=watch]').click()
        checks.ok(pg.locator('#play-fig svg.pf.watch-art').count()==1 and
                  pg.locator('#play-fig [data-act=anim-play]').count()==1,
                  f'[{width}] returning to Watch restores compact animated art and controls')
        checks.ok(pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(q=>q.id==='quickie-out'))""")==stored,
                  f'[{width}] all Watch/seek/mirror/resize operations preserve stored Step Out')
        ctx.close()
    ok=checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
