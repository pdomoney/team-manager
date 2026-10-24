# P09A — accessible shared intake controls, synthetic coach workspace.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv,url=serve()
c,errs=Check(),[]
act="([a,ds]) => {const b=document.createElement('button');b.dataset.act=a;Object.assign(b.dataset,ds||{});document.body.appendChild(b);b.click();b.remove();}"
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
        ctx,pg,_=page(browser,url+'#home',width=width,height=860,errors=errs)
        pg.get_by_text('Load a sample squad').click()
        pg.goto(url+'#crew')
        pg.wait_for_selector('[data-act=crew-new]')
        pg.click('[data-act=crew-new]')
        pg.wait_for_selector('#sheet form[data-form=crew-intake-start]')
        choices=pg.locator('#sheet .crew-entry-choices [type=radio][name=method]')
        c.ok(choices.count()==3 and pg.locator('#sheet [name=method]:checked').input_value()=='manual',
             f'{width}: native three-choice intake retains manual default')
        c.ok(pg.locator('#sheet .crew-entry-choices legend').inner_text().startswith('How would you like'),
             f'{width}: choices remain semantically grouped by a visible legend')
        selected=pg.evaluate("""() => {
          const input=document.querySelector('#sheet input[name=method]:checked');
          const box=input.nextElementSibling,help=box.querySelector('small'),mark=getComputedStyle(box,'::after');
          return {bg:getComputedStyle(box).backgroundColor,color:getComputedStyle(help).color,
            mark:mark.content, height:box.getBoundingClientRect().height};
        }""")
        c.ok(selected['color']=='rgb(255, 255, 255)' and selected['bg']!='rgb(255, 255, 255)'
             and '✓' in selected['mark'] and selected['height']>=44,
             f'{width}: selection is clearly indicated, helpers remain white, and target >=44px')
        # Reach the selected radio by keyboard rather than script focus, which
        # does not necessarily activate :focus-visible after pointer interaction.
        pg.locator('#sheet form[data-form=crew-intake-start] button[type=submit]').focus()
        pg.keyboard.press('Shift+Tab')
        focus=pg.evaluate("""() => {
          const target=document.querySelector('#sheet input[name=method]:checked');
          return [document.activeElement===target,getComputedStyle(target.nextElementSibling).outlineStyle];
        }""")
        c.ok(focus[0] and focus[1]!='none',f'{width}: native radio keyboard focus is visibly outlined')
        pg.locator('#sheet input[name=method][value=invite]').check()
        pg.locator('#sheet form[data-form=crew-intake-start] button[type=submit]').click()
        c.ok(pg.locator('#sheet form[data-form=crew-invite-draft] input[name=email][required]').count()==1
             and pg.locator('#sheet form[data-form=crew-invite-draft] select[name=teamId]').count()==1
             and 'does not yet provide user accounts' in pg.inner_text('#sheet'),
             f'{width}: email path is a local draft only with mandatory recipient')
        pg.locator('#sheet [data-act=crew-intake-back]').click()
        pg.locator('#sheet input[name=method][value=existing]').check()
        pg.locator('#sheet form[data-form=crew-intake-start] button[type=submit]').click()
        existing=pg.locator('#sheet form[data-form=crew-existing]')
        existing_text=pg.inner_text('#sheet')
        # A fresh sample may contain no recorded volunteers yet. The safe
        # empty state disables linking; a populated test library offers only
        # workspace-local people, never a remote/global account lookup.
        no_people='No existing volunteers are recorded in this workspace' in existing_text
        person_select=existing.locator('select[name=personId]')
        c.ok(existing.count()==1 and existing.locator('select[name=teamId]').count()==1
             and 'previously entered in this workspace' in existing_text
             and ((no_people and person_select.count()==0 and existing.locator('button[type=submit]').is_disabled())
                  or (not no_people and person_select.count()==1)),
             f'{width}: existing route correctly handles local people or safe empty state')
        pg.locator('#sheet [data-act=crew-intake-back]').click()
        pg.locator('#sheet form[data-form=crew-intake-start] button[type=submit]').click()
        manual=pg.locator('#sheet form[data-form=crew-manual]')
        c.ok(manual.count()==1 and pg.locator('#sheet input[name=name][required]').count()==1
             and pg.locator('#sheet input[name=email]:not([required])').count()==1
             and pg.locator('#sheet select[name=teamId] option[value=""]').count()==1,
             f'{width}: manual form preserves mandatory name, optional email/team')
        c.ok(pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),
             f'{width}: shared intake controls do not cause horizontal overflow')
        pg.fill('#sheet input[name=name]','P09A Synthetic Club Volunteer')
        manual.locator('button[type=submit]').click()
        c.ok(pg.evaluate("""() => window.__team.ws.matchOfficials.some(p=>
          p.name==='P09A Synthetic Club Volunteer' && p.teamIds.length===0)"""),
          f'{width}: manual club-only record retains no implied team clearance')
        ctx.close()
    ok=c.done(errs)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
