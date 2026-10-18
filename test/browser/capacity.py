# Player photo capacity: 30, 60 and 100 players with photos across three teams and two seasons each,
# added through the real player form. For each size: the coach's workspace, the encrypted coach file,
# the draft kept on the phone, browser storage used, save and reload, publishing (and a second device
# opening it), and backup and restore. Then what happens when the phone's storage is full.
# Photos are synthetic (gradients and shapes drawn on a canvas); no real photos or people.
# Results are written to capacity-results.json in the browser test folder (see harness.WORK).
import sys, json, base64, time; from harness import *; from ghmock import GitHubMock
from playwright.sync_api import sync_playwright
build(); srv, url = serve(); gh = GitHubMock()
c = Check(); errs = []
act = "([a, ds]) => { const b = document.createElement('button'); b.dataset.act = a; Object.assign(b.dataset, ds || {}); document.body.appendChild(b); b.click(); b.remove(); }"
GH = json.dumps({'owner': 'o', 'repo': 'r', 'token': 'tok', 'autoPublish': False})
COACH, TEAMPW = 'capacity coach password', 'capacity team password'
def device(b, width=390, github=True):
    ctx = b.new_context(viewport={'width': width, 'height': 860}, accept_downloads=True)
    if github: ctx.add_init_script(f"if (!localStorage.getItem('tm-github')) localStorage.setItem('tm-github', {json.dumps(GH)});")
    ctx.route('https://api.github.com/**', gh.handle)
    ctx.route('**/fonts.g*/**', lambda r: r.abort()); ctx.route('https://wa.me/**', lambda r: r.fulfill(body='wa'))
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    return ctx, pg
def W(pg, js): return pg.evaluate(f'(() => {{ const W = window.__team.ws, D = window.__team.data, M = window.__team.M, S = window.__team.S; return {js}; }})()')
def wait_pub(pg, t=60000): pg.wait_for_function("!window.__team.S.publishing && window.__team.S.pub !== 'busy'", timeout=t); pg.wait_for_timeout(100)
def settle(pg): pg.wait_for_timeout(150); pg.evaluate("() => new Promise(r => setTimeout(r, 50))")
# every photo in the workspace, in a fixed order, and a fingerprint of them all
PHOTOS = "M.teamsOf(W).flatMap(t => t.players.filter(p => p.photo).map(p => p.id + ':' + p.photo))"
FP = f"(() => {{ const s = {PHOTOS}.join('|'); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return [{PHOTOS}.length, s.length, h]; }})()"
LS = "(() => { let n = 0; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); n += k.length + localStorage.getItem(k).length; } return n; })()"
SYNTH = """n => { const out = [];
  for (let i = 0; i < n; i++) {
    const cv = document.createElement('canvas'); cv.width = 900; cv.height = 1200; const g = cv.getContext('2d');
    let s = 1000 + i * 7919; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const gr = g.createLinearGradient(0, 0, 900, 1200); gr.addColorStop(0, `hsl(${rnd() * 360},45%,62%)`); gr.addColorStop(1, `hsl(${rnd() * 360},40%,28%)`);
    g.fillStyle = gr; g.fillRect(0, 0, 900, 1200);
    for (let k = 0; k < 60; k++) { g.fillStyle = `hsla(${rnd() * 360},40%,${25 + rnd() * 55}%,0.55)`; g.beginPath(); g.ellipse(rnd() * 900, rnd() * 1200, 20 + rnd() * 220, 20 + rnd() * 280, rnd() * 3, 0, 7); g.fill(); }
    // fine detail, so the photos are about as hard to compress as busy real ones
    for (let k = 0; k < 3000; k++) { g.fillStyle = `hsla(${rnd() * 360},35%,${20 + rnd() * 60}%,0.5)`; g.beginPath(); g.arc(rnd() * 900, rnd() * 1200, 3 + rnd() * 12, 0, 7); g.fill(); }
    const d = g.getImageData(0, 0, 900, 1200); for (let p = 0; p < d.data.length; p += 4) { const v = (rnd() - 0.5) * 40; d.data[p] += v; d.data[p + 1] += v; d.data[p + 2] += v; } g.putImageData(d, 0, 0);
    out.push(cv.toDataURL('image/jpeg', 0.92).split(',')[1]);
  }
  return out; }"""
results = {'browser': 'Chromium (Playwright, headless)', 'datasets': []}
with sync_playwright() as p:
    b = p.chromium.launch()
    # How much this browser lets one site keep: fill a fresh origin's storage until it refuses.
    qctx, qpg = device(b, github=False); qpg.goto(url + '#home'); qpg.wait_for_function('window.__team')
    quota = qpg.evaluate("""() => { localStorage.clear(); const chunk = 'x'.repeat(256 * 1024); let n = 0, i = 0;
      try { for (;;) { localStorage.setItem('fill' + i++, chunk); n += chunk.length + String('fill' + i).length; } } catch (e) {}
      let step = 128 * 1024; while (step >= 64) { try { localStorage.setItem('fill' + i, 'x'.repeat(step)); n += step + String('fill' + i).length; i++; } catch (e) { step >>= 1; } }
      localStorage.clear(); return n; }""")
    results['localStorageQuotaChars'] = quota; qctx.close()
    print(f'localStorage quota in this browser: about {quota:,} characters')
    # Synthetic photos (big phone-sized JPEGs) saved as files, picked through the real photo field.
    imgs = []
    ctx1, d1 = device(b); d1.goto(url + '#home'); d1.click('text=Load a sample squad'); d1.wait_for_timeout(200)
    for i, b64 in enumerate(d1.evaluate(SYNTH, 12)):
        path = os.path.join(WORK, f'synthetic-{i:02d}.jpg'); open(path, 'wb').write(base64.b64decode(b64)); imgs.append(path)
    results['sourceImageBytes'] = sorted(os.path.getsize(x) for x in imgs)
    # Three teams, the sample team's players replaced with numbered synthetic players
    for name in ['Capacity B', 'Capacity C']:
        d1.evaluate(act, ['teams', {}]); d1.click('text=New team'); d1.fill('#sheet input[name=name]', name); d1.click('#sheet button[type=submit]'); d1.wait_for_timeout(150)
    W(d1, "(M.teamsOf(W).forEach(t => { t.players = []; }), 1)")
    d1.evaluate(act, ['go-live', {}]); d1.fill('#sheet input[name=coach]', COACH); d1.fill('#sheet input[name=coach2]', COACH)
    d1.fill('#sheet input[name=team]', TEAMPW); d1.fill('#sheet input[name=team2]', TEAMPW); d1.click('#sheet button[type=submit]')
    d1.wait_for_function('window.__team.S.trial === false', timeout=30000); wait_pub(d1)
    teams = W(d1, "M.teamsOf(W).map(t => t.id)")
    c.ok(len(teams) == 3, f'three teams {teams}')
    made = 0
    def add_players(upto):
        global made
        while made < upto:
            tid = teams[made % 3]
            if W(d1, 'D.id') != tid: d1.evaluate(act, ['team-pick', {'id': tid}]); d1.wait_for_timeout(100)
            n = made + 1
            d1.evaluate(act, ['add-player', {}]); d1.wait_for_selector('#sheet form[data-form=player]')
            d1.fill('#sheet input[name=name]', f'Synthetic Player {n:03d}'); d1.fill('#sheet input[name=number]', str(n))
            d1.set_input_files('#sheet input[data-change=player-photo]', imgs[made % len(imgs)])
            d1.wait_for_function("document.querySelector('#sheet [name=photo]') && document.querySelector('#sheet [name=photo]').value.startsWith('data:image')", timeout=10000)
            d1.click('#sheet button[value=save]'); d1.wait_for_function("!document.querySelector('#sheet form[data-form=player]')", timeout=10000)
            made += 1
    def rollover_all():
        # every team gets a second season carrying its whole squad (seasons hold player ids, not copies)
        for tid in teams:
            W(d1, f"(() => {{ const t = M.findTeam(W, '{tid}'); if (t.seasons.length > 1) return 0; M.rollover(t, {{ name: 'Second season', activate: true, carry: t.players.map(p => ({{ playerId: p.id, number: p.number }})) }}); return 1; }})()")
        d1.evaluate(act, ['add-notice', {}]); d1.fill('#sheet textarea[name=text]', 'Capacity notice'); d1.click('#sheet button[type=submit]'); settle(d1)
    for size in [30, 60, 100]:
        t0 = time.time(); add_players(size)
        if size == 30: rollover_all()
        settle(d1); d1.wait_for_timeout(400)
        fp = W(d1, FP); ws_json = W(d1, 'JSON.stringify(W).length')
        photos = W(d1, f"{PHOTOS}.map(x => x.length - x.indexOf(':') - 1)")
        draft = d1.evaluate("(localStorage.getItem('tm-coach-draft') || '').length")
        draft_parts = d1.evaluate("(() => { const d = JSON.parse(localStorage.getItem('tm-coach-draft') || '{}'); return [JSON.stringify(d.file || '').length, JSON.stringify(d.baseFile || '').length]; })()")
        ls = d1.evaluate(LS)
        d1.evaluate(act, ['publish', {}]); wait_pub(d1)
        pub_ok = W(d1, 'S.pub') == 'ok'; files = gh.files()
        coach_file = len(files.get('coach.enc.json', '')); team_files = {k: len(v) for k, v in files.items() if k != 'coach.enc.json'}
        # the players' files: open one with the team password and look for photos
        tf = files.get('team.enc.json')
        team_view = d1.evaluate("async ([f, pw]) => { const V = await import('./vault.js'); const v = (await V.openFile(JSON.parse(f), pw, 'team')).value; return [JSON.stringify(v).includes('data:image'), (v.players || []).length]; }", [tf, TEAMPW]) if tf else [None, 0]
        # save and reload: the same photos come back
        d1.reload(); d1.wait_for_function('window.__team && window.__team.ws', timeout=30000); d1.wait_for_timeout(300)
        fp_reload = W(d1, FP)
        # another device signs in and gets them from what was published
        ctx2, d2 = device(b, 1280); d2.goto(url + '#home'); d2.wait_for_selector("text=I'm the coach"); d2.click("text=I'm the coach")
        d2.fill('input[name=password]', COACH); d2.click('button[type=submit]'); d2.wait_for_function('window.__team && window.__team.ws', timeout=60000)
        fp_other = W(d2, FP); ctx2.close()
        row = {'players': size, 'teams': 3, 'seasonsPerTeam': W(d1, "M.teamsOf(W).map(t => t.seasons.length)"), 'photos': fp[0],
               'photoChars': {'min': min(photos), 'avg': round(sum(photos) / len(photos)), 'max': max(photos), 'total': sum(photos)},
               'workspaceJsonChars': ws_json, 'coachFileChars': coach_file, 'playersFilesChars': team_files,
               'draftChars': draft, 'draftParts': {'workspace': draft_parts[0], 'lastPublished': draft_parts[1]},
               'localStorageChars': ls, 'localStorageShareOfQuota': round(ls / quota, 3), 'published': pub_ok,
               'reloadSame': fp_reload == fp, 'otherDeviceSame': fp_other == fp, 'photosInPlayersFile': team_view[0], 'secondsToAdd': round(time.time() - t0, 1)}
        results['datasets'].append(row)
        print(json.dumps(row))
        c.ok(fp[0] == size, f'{size}: every player has a photo ({fp[0]})')
        c.ok(pub_ok and coach_file > 0, f'{size}: published')
        c.ok(team_view[0] is False and team_view[1] > 0, f'{size}: photos stay out of the players’ file')
        c.ok(fp_reload == fp, f'{size}: the same photos after a reload')
        c.ok(fp_other == fp, f'{size}: the same photos on another device signing in')
        c.ok(ls < quota, f'{size}: fits in this browser’s storage ({ls:,} of {quota:,})')
    # Backup and restore at 100
    fp = W(d1, FP)
    with d1.expect_download() as dl: d1.evaluate(act, ['export', {}])
    path = dl.value.path(); bk = open(path).read()
    results['backupChars'] = len(bk)
    c.ok(json.loads(bk).get('format') == 'team-manager' and 'Synthetic Player' not in bk, 'backup is encrypted')
    W(d1, "(M.teamsOf(W).forEach(t => t.players.forEach(p => { p.photo = ''; })), 1)")
    d1.evaluate("() => { window.__team.state.importKind = 'backup'; }")
    d1.set_input_files('#import-file', path); d1.wait_for_selector('#sheet [data-act=import-do]')
    d1.click('#sheet [data-act=import-do][data-m=all]'); d1.wait_for_timeout(500)
    c.ok(W(d1, FP) == fp, 'backup restored every photo')
    results['restoreSame'] = W(d1, FP) == fp
    d1.evaluate(act, ['publish', {}]); wait_pub(d1)
    # Storage full, using this browser's real limit: fill the rest of the site's storage, then make changes.
    BRIM = """() => { const k = 'zz-filler'; let cur = (localStorage.getItem(k) || '').length, step = 1 << 22;
      while (step >= 16) { try { localStorage.setItem(k, 'x'.repeat(cur + step)); cur += step; } catch (e) { step >>= 1; } } return cur; }"""
    DRAFT = """async pw => { const V = await import('./vault.js'); const d = JSON.parse(localStorage.getItem('tm-coach-draft'));
      const ws = (await V.openFile(d.file, pw, 'coach')).value; return { at: d.at, base: !!d.baseFile, notices: (ws.notices || []).map(n => n.text) }; }"""
    def notice(text): d1.evaluate(act, ['add-notice', {}]); d1.fill('#sheet textarea[name=text]', text); d1.click('#sheet button[type=submit]'); d1.wait_for_timeout(1500)
    settle(d1); d1.wait_for_timeout(300)
    d1.evaluate(BRIM)
    notice('Notice with the base dropped')
    step1 = d1.evaluate(DRAFT, COACH)
    c.ok('Notice with the base dropped' in step1['notices'] and not step1['base'] and 'storage' not in d1.inner_text('#status').lower(),
         'nearly full: the copy it started from is dropped first, and the change is still kept on the phone')
    d1.evaluate(BRIM)
    notice('Notice when storage is full')
    status = d1.inner_text('#status'); toast_txt = d1.inner_text('#toast')
    step2 = d1.evaluate(DRAFT, COACH)
    results['storageFull'] = {'status': status, 'toast': toast_txt, 'lastGoodDraftKept': step2['at'] == step1['at'], 'newChangeInDraft': 'Notice when storage is full' in step2['notices']}
    print(json.dumps(results['storageFull']))
    c.ok('storage' in status.lower() and 'aren’t saved on this phone' in status and d1.locator('#status [data-act=export]').count() == 1, f'full: the warning says the change isn’t saved here, with Export backup: {status!r}')
    c.ok('Not saved on this phone' in toast_txt, f'full: no “saved” message left standing: {toast_txt!r}')
    c.ok(step2['at'] == step1['at'] and 'Notice with the base dropped' in step2['notices'] and 'Notice when storage is full' not in step2['notices'], 'full: the last good copy on the phone is kept as it was')
    c.ok(W(d1, "D.notices.some(n => n.text === 'Notice when storage is full')"), 'full: the change is still on screen, not discarded')
    d1.evaluate(act, ['publish', {}]); wait_pub(d1)
    c.ok(W(d1, 'S.pub') == 'ok', 'storage full: publishing still keeps the change online')
    with d1.expect_download() as dl2: d1.locator('#status [data-act=export]').click()
    c.ok(json.loads(open(dl2.value.path()).read()).get('format') == 'team-manager', 'storage full: Export backup from the warning works')
    # Room again: the next change is kept and the warning goes
    d1.evaluate("localStorage.removeItem('zz-filler')")
    notice('Notice after making room')
    step3 = d1.evaluate(DRAFT, COACH)
    c.ok('storage' not in d1.inner_text('#status').lower(), 'room again: the warning clears')
    c.ok(step3['at'] != step1['at'] and 'Notice when storage is full' in step3['notices'] and 'Notice after making room' in step3['notices'], 'room again: everything, including the change made while full, is saved on the phone')
    # What the limits allow: photos at the largest size accepted (older photos), and at this run's average
    last = results['datasets'][-1]; other = last['workspaceJsonChars'] - last['photoChars']['total']
    per = lambda chars: chars * 4 / 3   # each character of a photo in the encrypted file
    results['projection'] = {f'photosThatFit_{k}': {'draftWithBase': int((quota - 2 * per(other)) / (2 * per(v))), 'draftAlone': int((quota - per(other)) / per(v))}
                             for k, v in [('average', last['photoChars']['avg']), ('at80000', 80000)]}
    print(json.dumps(results['projection']))
    open(os.path.join(WORK, 'capacity-results.json'), 'w').write(json.dumps(results, indent=1))
    ok = c.done(errs); b.close()
srv.shutdown(); sys.exit(0 if ok else 1)
