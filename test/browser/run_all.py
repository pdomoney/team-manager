# Sequential reproducible qualification. Python Playwright/Chromium required.
# CI runs npm test in a separate job (--skip-unit); pull requests include synthetic
# photo capacity, normal main pushes may use --skip-capacity for a faster gate.
import argparse
import datetime
import json
import os
import re
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
WORK = os.path.join(tempfile.gettempdir(), 'team-manager-browser')
SKIP = {'harness.py', 'ghmock.py', 'run_all.py'}

parser = argparse.ArgumentParser()
parser.add_argument('--out', default='qualification.json')
parser.add_argument('--skip-unit', action='store_true')
parser.add_argument('--skip-capacity', action='store_true')
args = parser.parse_args()

def git(*argv):
    try:
        return subprocess.run(['git', *argv], cwd=REPO, text=True,
                              capture_output=True, check=False).stdout.strip()
    except OSError:
        return ''

def browser_version():
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            b = p.chromium.launch()
            version = b.version
            b.close()
            return version
    except Exception as e:
        return 'unavailable: ' + str(e)

suites = sorted(f for f in os.listdir(HERE) if f.endswith('.py') and f not in SKIP
                and not (args.skip_capacity and f == 'capacity.py'))
res = {
    'commit': git('rev-parse', 'HEAD'),
    'headCommit': os.environ.get('HEAD_SHA') or git('rev-parse', 'HEAD'),
    'branch': os.environ.get('HEAD_REF') or git('rev-parse', '--abbrev-ref', 'HEAD'),
    'uncommittedChanges': bool(git('status', '--porcelain', '--untracked-files=no')),
    'started': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
    'browser': 'Chromium ' + browser_version(),
    'capacityIncluded': not args.skip_capacity,
    'unitIncluded': not args.skip_unit,
    'notCovered': ['Safari (macOS)', 'Safari (iOS)', 'physical devices', 'real GitHub production publishing'],
    'unit': {'skipped': True, 'reason': 'unit tests run in separate CI job'} if args.skip_unit else {},
    'browserSuites': [],
}
os.makedirs(WORK, exist_ok=True)
capacity_path = os.path.join(WORK, 'capacity-results.json')
if os.path.exists(capacity_path):
    os.remove(capacity_path)
t0 = time.time()

if not args.skip_unit:
    u = subprocess.run(['npm', 'test'], cwd=REPO, capture_output=True, text=True)
    def n(k):
        m = re.search(r'^# ' + k + r' (\d+)', u.stdout, re.M)
        return int(m.group(1)) if m else 0
    res['unit'] = {
        'tests': n('tests'), 'pass': n('pass'), 'fail': n('fail'),
        'ok': u.returncode == 0, 'seconds': round(time.time() - t0, 1),
    }
    if u.returncode:
        res['unit']['tail'] = (u.stdout + u.stderr)[-2000:]
    print('unit: {}/{} passed'.format(res['unit']['pass'], res['unit']['tests']), flush=True)

for suite in suites:
    start = time.time()
    try:
        p = subprocess.run([sys.executable, '-u', os.path.join(HERE, suite)], cwd=REPO,
                           capture_output=True, text=True, timeout=1800)
        output = p.stdout + p.stderr
        exited_clean = p.returncode == 0
    except subprocess.TimeoutExpired as e:
        raw = e.stdout or b''
        output = raw.decode(errors='replace') if isinstance(raw, bytes) else raw
        output += '\nTIMEOUT after 1800 seconds'
        exited_clean = False
    matches = re.findall(r'^(\d+)/(\d+) checks passed([^\r\n]*)', output, re.M)
    passed, total = map(int, matches[-1][:2]) if matches else (0, 0)
    failures = [line.strip()[5:] for line in output.splitlines() if line.startswith('  FAIL')]
    row = {
        'suite': suite[:-3], 'passed': passed, 'checks': total,
        'ok': exited_clean and bool(matches) and passed == total,
        'failures': failures, 'seconds': round(time.time() - start, 1),
    }
    if not row['ok']:
        row['tail'] = output[-2500:]
    res['browserSuites'].append(row)
    print('{}: {}/{}{} ({:.1f}s)'.format(suite[:-3], passed, total,
          '' if row['ok'] else ' FAILED', row['seconds']), flush=True)

rows = res['browserSuites']
res['browserTotals'] = {
    'suites': len(rows),
    'suitesPassed': sum(1 for row in rows if row['ok']),
    'checks': sum(row['checks'] for row in rows),
    'checksPassed': sum(row['passed'] for row in rows),
}
if os.path.exists(capacity_path):
    with open(capacity_path, encoding='utf-8') as source:
        res['capacity'] = json.load(source)
res['ok'] = res['unit'].get('ok', True) and all(row['ok'] for row in rows)
res['seconds'] = round(time.time() - t0, 1)
res['ended'] = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')
with open(args.out, 'w', encoding='utf-8') as dest:
    json.dump(res, dest, indent=2)
t = res['browserTotals']
print('{} at {}: browser {}/{} in {}/{} suites. Safari/real devices not covered. Evidence: {}'.format(
    'PASS' if res['ok'] else 'FAIL', res['headCommit'][:12], t['checksPassed'], t['checks'],
    t['suitesPassed'], t['suites'], os.path.abspath(args.out)), flush=True)
sys.exit(0 if res['ok'] else 1)
