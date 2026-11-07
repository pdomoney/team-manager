# Mobile-first play board visual and interaction regression.
# No play geometry, editor, stored instructions, permission or shared library changes.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv,url=serve()
checks,errors=Check(),[]
act="([a,ds])=>{const b=document.createElement('button');b.dataset.act=a;Object.assign(b.dataset,ds||{});document.body.appendChild(b);b.click();b.remove();}"
stable="async () => (await import('./test-library.js')).stable(window.__team.ws)"

with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
        ctx,pg,_=page(browser,url+'#home',width=width,height=865,errors=errors)
        pg.get_by_text('Load a sample squad').click()
        pg.goto(url+'#plays')
        pg.locator('.play-row[data-id=quickie-out]').click()
        source=pg.evaluate(stable)
        fig=pg.locator('#play-fig')
        checks.ok(fig.locator('.play-presentation').count()==0 and
                  fig.get_attribute('class').find('play-presentation')>=0 and
                  fig.locator('.play-board-field svg.pf').count()==1 and
                  fig.locator('#anim-seek').count()==1,
                  f'[{width}] existing Coach Watch mode uses styled field and retains animation controls')
        actual_title=fig.locator('.play-board-title').text_content()
        actual_kicker=fig.locator('.play-board-kicker').text_content()
        checks.ok('Quickie Out' in actual_title,
                  f'[{width}] original play title shown; received {actual_title!r}')
        checks.ok('Oztag' in actual_kicker,
                  f'[{width}] sport shown on board; received {actual_kicker!r}')
        dark=fig.evaluate("""el=>{
          const a=getComputedStyle(el),f=getComputedStyle(el.querySelector('.play-board-field'));
          return {background:a.backgroundColor,field:f.backgroundColor,color:a.color};
        }""")
        checks.ok(dark['field']=='rgb(40, 50, 59)' and dark['color']=='rgb(244, 246, 246)',
                  f'[{width}] high contrast dark field skin applies only to viewer')

        pg.locator('[data-act=play-mode][data-mode=learn]').click()
        fig=pg.locator('#play-fig')
        rail=fig.locator('.study-step-list')
        count=rail.locator('[data-act=study-pick]').count()
        checks.ok(count>=3 and
                  fig.locator('.study-cue h3').count()==1 and
                  fig.locator('.study-cue p').count()>=2 and
                  fig.locator('.play-board-field svg.pf.study').count()==1,
                  f'[{width}] new learning board includes diagram, numbered steps and instructions')
        checks.ok(rail.locator('[aria-current=step]').count()==1 and
                  rail.locator('[data-i="0"][aria-pressed=true]').count()==1 and
                  fig.locator('.study-progress').inner_text().startswith('Step 1 of'),
                  f'[{width}] correct first step is selected and accessible')
        checks.ok(fig.evaluate("""el=>{
          const field=el.querySelector('.play-board-field'),
            steps=el.querySelector('.study-step-rail'),
            cue=el.querySelector('.study-cue');
          return !!(field.compareDocumentPosition(steps)&Node.DOCUMENT_POSITION_FOLLOWING) &&
                 !!(steps.compareDocumentPosition(cue)&Node.DOCUMENT_POSITION_FOLLOWING);
        }"""), f'[{width}] eye follows diagram, step rail and coaching cue in that order')
        first=fig.locator('.study-cue h3').inner_text()
        rail.locator('[data-i="1"]').click()
        checks.ok(pg.evaluate('window.__team.state.studyIndex')==1 and
                  rail.locator('[data-i="1"][aria-current=step]').count()==1 and
                  fig.locator('.study-cue h3').inner_text()!=first,
                  f'[{width}] selecting numbered step advances the actual instruction')
        checks.ok(rail.locator('[data-i="1"]').evaluate('el=>document.activeElement===el'),
                  f'[{width}] numbered step remains keyboard focused after screen rerender')
        pg.evaluate(act,['study-pick',{'i':'999'}])
        pg.evaluate(act,['study-pick',{'i':'-1'}])
        pg.evaluate(act,['study-pick',{'i':'bad'}])
        checks.ok(pg.evaluate('window.__team.state.studyIndex')==1,
                  f'[{width}] forged, negative and out-of-range step selections do nothing')
        pg.locator('[data-act=study-next]').click()
        checks.ok(pg.evaluate('window.__team.state.studyIndex')==2,
                  f'[{width}] previous Next step workflow is retained')
        pg.locator('[data-act=study-prev]').click()
        checks.ok(pg.evaluate('window.__team.state.studyIndex')==1,
                  f'[{width}] previous Previous step workflow is retained')
        pg.locator('[data-change=study-role]').select_option('LM')
        checks.ok(fig.locator('.plg.study-target').count()==1 and
                  fig.locator('.plg.study-soft').count()>=1,
                  f'[{width}] choose-my-role highlighting still uses original source geometry')
        pg.locator('[data-act=play-side][data-side=left]').click()
        checks.ok(fig.locator('svg.pf.study').get_attribute('aria-label').endswith('attacking left'),
                  f'[{width}] mirroring works on styled board')
        checks.ok(pg.evaluate(stable)==source,
                  f'[{width}] step, role, and direction navigation never mutate saved plays')

        # Test horizontal step navigation at realistic phone width with a
        # deliberately long synthetic teaching sequence (not saved).
        pg.evaluate("""() => {
          const d=window.__team.data,p=d.plays.find(x=>x.id==='quickie-out');
          p.study=Array.from({length:12},(_,i)=>({
            title:'Instruction '+(i+1),text:'LM and RM rehearse cue '+(i+1),
            moves:[],roles:['LM']
          }));
        }""")
        pg.locator('[data-act=play-mode][data-mode=watch]').click()
        pg.locator('[data-act=play-mode][data-mode=learn]').click()
        checks.ok(pg.locator('#play-fig [data-act=study-pick]').count()==12,
                  f'[{width}] all twelve coach-authored instructions remain individually selectable')
        pg.locator('#play-fig [data-act=study-pick][data-i="11"]').click()
        geom=pg.evaluate("""() => {
          const row=document.querySelector('#play-fig .study-step-list'),
            el=row.querySelector('[data-i="11"]'),
            a=row.getBoundingClientRect(),b=el.getBoundingClientRect();
          return {visible:b.left>=a.left-2&&b.right<=a.right+2,
            scroll:row.scrollLeft,max:row.scrollWidth-row.clientWidth};
        }""")
        last_title=pg.locator('#play-fig .study-cue h3').text_content()
        checks.ok(geom['visible'],
                  f'[{width}] late step visible within rail; measured {geom!r}')
        checks.ok(width>=1000 or geom['scroll']>0,
                  f'[{width}] mobile rail scrolled to later step; measured {geom!r}')
        checks.ok(last_title=='Instruction 12',
                  f'[{width}] last coaching cue matches selected step; got {last_title!r}')

        # Player mode is still read-only, and editing remains coach-only.
        pg.evaluate(act,['preview-on',{}])
        pg.locator('[data-act=play-back]').click()
        pg.locator('.play-row[data-id=quickie-out]').click()
        checks.ok(pg.locator('[data-act=play-mode][data-mode=learn][aria-pressed=true]').count()==1 and
                  pg.locator('#play-fig .play-board-field svg.pf.study').count()==1 and
                  pg.locator('[data-act=play-edit], [data-act=play-del]').count()==0,
                  f'[{width}] player sees learning board but never editor or deletion controls')
        checks.ok(pg.evaluate('document.documentElement.scrollWidth <= innerWidth+1'),
                  f'[{width}] long step rail does not create horizontal page overflow')
        ctx.close()
    ok=checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
