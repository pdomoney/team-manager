# An in-memory stand-in for the GitHub API calls the app makes, with the Publish workflow's effect:
# a dispatch rebuilds the site from the data branch (only encrypted files survive build.js).
import json, base64, hashlib, os, shutil, re
from harness import build, WORK

class GitHubMock:
    def __init__(self):
        self.commits = {}; self.trees = {}; self.head = None; self.fail_next = []; self.dispatches = 0; self.log = []; self.workflows = []
    def sha(self, obj):
        return hashlib.sha1(json.dumps(obj, sort_keys=True).encode() + os.urandom(4)).hexdigest()
    def files(self, sha=None):
        sha = sha or self.head
        return dict(self.trees[self.commits[sha]['tree']]) if sha else {}
    def deploy(self):
        d = os.path.join(WORK, 'ghdata'); shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
        for k, v in self.files().items():
            open(os.path.join(d, k), 'w').write(v)
        build(d)
    def handle(self, route, request):
        u = request.url.split('api.github.com/repos/o/r', 1)[1]; m = request.method
        path, _, q = u.partition('?')
        self.log.append(f'{m} {path}')
        if self.fail_next:
            code = self.fail_next.pop(0)
            return route.fulfill(status=code, content_type='application/json', body=json.dumps({'message': 'Update is not a fast forward' if code == 422 else 'boom'}))
        body = json.loads(request.post_data) if request.post_data else None
        J = lambda o, s=200: route.fulfill(status=s, content_type='application/json', body=json.dumps(o))
        if m == 'GET' and path == '': return J({'default_branch': 'main'})
        if m == 'GET' and path == '/git/ref/heads/data':
            return J({'object': {'sha': self.head}}) if self.head else J({'message': 'Not Found'}, 404)
        if m == 'GET' and path.startswith('/contents/'):
            name = path[len('/contents/'):]; ref = re.search(r'ref=([^&]+)', q).group(1)
            f = self.files(ref).get(name)
            return J({'content': base64.b64encode(f.encode()).decode()}) if f is not None else J({'message': 'Not Found'}, 404)
        if m == 'GET' and path.startswith('/git/commits/'): return J({'tree': {'sha': self.commits[path.split('/')[-1]]['tree']}})
        if m == 'GET' and path.startswith('/git/trees/'): return J({'tree': [{'path': k} for k in self.trees[path.split('/')[-1]]]})
        if m == 'POST' and path == '/git/trees':
            t = dict(self.trees[body['base_tree']]) if body.get('base_tree') else {}
            for e in body['tree']:
                if e.get('sha', 1) is None:
                    if e['path'] not in t: return J({'message': 'tree.sha does not exist'}, 422)
                    t.pop(e['path'])
                else: t[e['path']] = e['content']
            s = self.sha(t); self.trees[s] = t; return J({'sha': s}, 201)
        if m == 'POST' and path == '/git/commits':
            s = self.sha(body); self.commits[s] = {'tree': body['tree'], 'parents': body['parents']}; return J({'sha': s}, 201)
        if m == 'PATCH' and path == '/git/refs/heads/data':
            if self.commits[body['sha']]['parents'] != [self.head]: return J({'message': 'Update is not a fast forward'}, 422)
            self.head = body['sha']; return J({'object': {'sha': self.head}})
        if m == 'POST' and path == '/git/refs':
            if self.head: return J({'message': 'Reference already exists'}, 422)
            self.head = body['sha']; return J({'object': {'sha': self.head}}, 201)
        if m == 'POST' and path.startswith('/actions/workflows/'):
            self.dispatches += 1; self.workflows.append(path.split('/')[3]); self.deploy(); return route.fulfill(status=204, body='')
        return J({'message': f'mock: unhandled {m} {path}'}, 500)
