# P09B — shared player, helper and volunteer fields; synthetic data only.
import sys, json
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
        pg.wait_for_selector('#view')
        pid=pg.evaluate("window.__team.data.players.find(p=>p.name==='Mia Tuala').id")
        before=pg.evaluate("""id => {
          const p=window.__team.data.players.find(p=>p.id===id);
          return {id:p.id,number:p.number,personId:p.personId||'',seasons:JSON.stringify(p.seasonIds||[]),
            jerseys:JSON.stringify(p.jerseys||[]),positions:JSON.stringify(p.positions||[])};
        }""",pid)
        pg.evaluate(act,['edit-player',{'id':pid}])
        player=pg.locator('#sheet form[data-form=player]')
        c.ok(player.count()==1 and player.locator('input[name=name][required][autocapitalize=words]').count()==1
             and player.locator('input[name=phone][type=tel]').count()==1
             and player.locator('input[name=notes]').count()==1,
             f'{width}: player common name/mobile/notes fields and legacy form actions retained')
        c.ok(player.locator('input[name=photo][type=hidden]').count()==1
             and player.locator('.player-crop-panel').count()==1
             and player.locator('input[name=number]').count()==1
             and player.locator('input[name=positions]').count()>0,
             f'{width}: photo crop, jersey and sport-specific positions remain separate')
        pg.fill('#sheet form[data-form=player] input[name=phone]','0400 123 987')
        player.locator('button[type=submit][value=save]').click()
        updated=pg.evaluate("""id => {
          const p=window.__team.data.players.find(p=>p.id===id);
          return {id:p.id,number:p.number,personId:p.personId||'',seasons:JSON.stringify(p.seasonIds||[]),
            jerseys:JSON.stringify(p.jerseys||[]),positions:JSON.stringify(p.positions||[]),phone:p.phone};
        }""",pid)
        # Saving an existing player legitimately synchronises outstanding jersey
        # issues for their active season (M.syncJerseys). Do not assert an
        # identical jersey array; preserve all historical issue IDs and allow
        # the normal new issue when an assigned number had not yet been issued.
        old_jerseys=json.loads(before['jerseys'])
        new_jerseys=json.loads(updated['jerseys'])
        old_seasons=json.loads(before['seasons'])
        new_seasons=json.loads(updated['seasons'])
        problems=[k for k in ('id','number','personId')
                  if updated[k]!=before[k]]
        # Preferred positions are a checkbox *set*, not an ordered ranking.
        # Saving emits the sport's display order, which can differ from legacy
        # insertion order without adding/removing any preferred positions.
        original_positions=json.loads(before['positions'])
        saved_positions=json.loads(updated['positions'])
        if set(original_positions)!=set(saved_positions) or len(saved_positions)!=len(set(saved_positions)):
            problems.append('changed preferred position membership')
        if not all(j in new_jerseys for j in old_jerseys): problems.append('lost historical jersey issue')
        if not all(s in new_seasons for s in old_seasons): problems.append('lost season')
        if updated['phone']!='0400 123 987': problems.append('contact not saved')
        c.ok(not problems,
             f'{width}: player contact edit retains identity/history/sport; discrepancies: {problems}')
        pg.evaluate(act,['helper-new',{}])
        helper=pg.locator('#sheet form[data-form=helper]')
        c.ok(helper.count()==1 and helper.locator('input[name=name][required]').count()==1
             and helper.locator('input[name=relation]').count()==1
             and helper.locator('select[name=playerId]').count()==1
             and helper.locator('input[name=notes]').count()==1,
             f'{width}: helper-only relationship and player fields preserved')
        c.ok('Coach only. For asking them on WhatsApp.' in pg.inner_text('#sheet'),
             f'{width}: helper contact privacy wording preserved')
        pg.fill('#sheet form[data-form=helper] input[name=name]','Synthetic P09B Helper')
        pg.fill('#sheet form[data-form=helper] input[name=phone]','0400 123 123')
        pg.fill('#sheet form[data-form=helper] input[name=relation]','Guardian volunteer')
        pg.select_option('#sheet form[data-form=helper] select[name=playerId]',pid)
        helper.locator('button[type=submit]').click()
        c.ok(pg.evaluate("""id => {
          const h=window.__team.data.helpers.find(h=>h.name==='Synthetic P09B Helper');
          return !!h && h.playerId===id && h.phone==='0400 123 123';
        }""",pid),f'{width}: helper retains selected local player ID and private phone')
        pg.goto(url+'#crew')
        pg.wait_for_selector('[data-act=crew-new]')
        pg.click('[data-act=crew-new]')
        pg.locator('#sheet form[data-form=crew-intake-start] button[type=submit]').click()
        manual=pg.locator('#sheet form[data-form=crew-manual]')
        c.ok(manual.count()==1 and manual.locator('input[name=name][maxlength="120"]').count()==1
             and manual.locator('input[name=email][type=email][maxlength="254"]').count()==1
             and manual.locator('input[name=phone][type=tel][maxlength="40"]').count()==1,
             f'{width}: volunteer contact fields preserve their validation boundaries')
        c.ok(manual.locator('select[name=teamId] option[value=""]').count()==1
             and 'Qualifications are not verified automatically.' in pg.inner_text('#sheet'),
             f'{width}: club-only volunteer remains possible without inferred clearance')
        pg.fill('#sheet form[data-form=crew-manual] input[name=name]','Synthetic P09B Volunteer')
        pg.fill('#sheet form[data-form=crew-manual] input[name=email]','safe@example.test')
        manual.locator('button[type=submit]').click()
        person=pg.evaluate("""() => {
          const p=window.__team.ws.matchOfficials.find(p=>p.name==='Synthetic P09B Volunteer');
          return p ? {id:p.id,email:p.email,teams:p.teamIds,wwcc:p.wwccStatus} : null;
        }""")
        c.ok(bool(person) and person['email']=='safe@example.test' and not person['teams']
             and person['wwcc']=='unverified',
             f'{width}: volunteer remains club-only and unverified after manual save')
        pg.evaluate(act,['crew-basic',{'id':person['id']}])
        profile=pg.locator('#sheet form[data-form=crew-basic]')
        c.ok(profile.count()==1 and profile.locator('input[name=name][required][maxlength="120"]').count()==1
             and profile.locator('input[name=email][type=email]').count()==1
             and profile.locator('input[name=phone][type=tel]').count()==1
             and profile.locator('input[name=photo][type=hidden]').count()==1,
             f'{width}: volunteer profile reuses contact fields without losing photo/data')
        c.ok(pg.evaluate("document.documentElement.scrollWidth<=innerWidth+1"),
             f'{width}: shared person forms do not introduce horizontal overflow')
        ctx.close()
    ok=c.done(errs)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
