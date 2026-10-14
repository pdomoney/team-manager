// Minimal GitHub API client used by the coach's browser to publish.
//
// Publishing writes the two encrypted files to the `data` branch in a single commit, then starts
// the Publish workflow, which rebuilds the site and deploys it to GitHub Pages (the same way the
// rail disruptions site is deployed). The token stays on the coach's device.
//
// Fine-grained token permissions needed, on this repository only:
//   Contents: Read and write   (commit to the data branch)
//   Actions:  Read and write   (start the Publish workflow)

export const DATA_BRANCH = 'data';
export const WORKFLOW = 'publish.yml';

export function repoFromLocation(loc = globalThis.location) {
  const m = loc && /^([a-z0-9-]+)\.github\.io$/i.exec(loc.hostname || '');
  if (!m) return {};
  const first = (loc.pathname || '/').split('/').filter(Boolean)[0];
  return { owner: m[1], repo: first && !first.includes('.') ? first : `${m[1]}.github.io` };
}

function decodeText(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function apiError(r) {
  let detail = '';
  try { detail = (await r.json()).message || ''; } catch (e) { /* not JSON */ }
  const ff = r.status === 422 && /fast.?forward/i.test(detail);
  const msg =
    r.status === 401 ? "GitHub didn't accept the token. It may have expired." :
    r.status === 403 ? "The token isn't allowed to do that. Give it Contents and Actions: Read and write on this repository." :
    r.status === 404 ? 'Not found on GitHub. Check the repository name and that the token can access it.' :
    r.status === 409 ? 'The repository is empty. Push the app files to it first.' :
    ff ? 'Someone else published at the same moment. Try again.' :
    `GitHub error ${r.status}${detail ? `: ${detail}` : ''}`;
  return Object.assign(new Error(msg), { status: r.status, code: ff ? 'CONFLICT' : 'API' });
}

export class GitHub {
  constructor({ owner, repo, token, branch = DATA_BRANCH, workflow = WORKFLOW }) {
    this.owner = String(owner || '').trim();
    this.repo = String(repo || '').trim();
    this.token = String(token || '').trim();
    this.branch = branch;
    this.workflow = workflow;
  }

  async req(method, path, body) {
    const url = `https://api.github.com/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}${path}`;
    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${this.token}`,
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (body) headers['Content-Type'] = 'application/json';
    let r;
    try {
      r = await fetch(url, { method, headers, cache: 'no-store', body: body ? JSON.stringify(body) : undefined });
    } catch (e) {
      throw Object.assign(new Error("Couldn't reach GitHub. Check your connection."), { code: 'NETWORK' });
    }
    if (!r.ok) throw await apiError(r);
    return r.status === 204 || r.status === 205 ? null : r.json();
  }

  async repoInfo() { return this.req('GET', ''); }

  // Latest commit on the data branch, or null if the branch doesn't exist yet.
  async head() {
    try { return (await this.req('GET', `/git/ref/heads/${this.branch}`)).object.sha; }
    catch (e) { if (e.status === 404) return null; throw e; }
  }

  async readJson(name, ref) {
    const j = await this.req('GET', `/contents/${encodeURIComponent(name)}?ref=${encodeURIComponent(ref || this.branch)}`);
    return JSON.parse(decodeText(j.content));
  }

  // Write several files in one commit on top of `parent` (null creates the branch).
  async commitFiles(files, parent, message) {
    let baseTree;
    if (parent) baseTree = (await this.req('GET', `/git/commits/${parent}`)).tree.sha;
    const tree = await this.req('POST', '/git/trees', {
      base_tree: baseTree,
      tree: Object.entries(files).map(([path, content]) => ({ path, mode: '100644', type: 'blob', content }))
    });
    const commit = await this.req('POST', '/git/commits', { message, tree: tree.sha, parents: parent ? [parent] : [] });
    if (parent) await this.req('PATCH', `/git/refs/heads/${this.branch}`, { sha: commit.sha, force: false });
    else await this.req('POST', '/git/refs', { ref: `refs/heads/${this.branch}`, sha: commit.sha });
    return commit.sha;
  }

  async startPublish(ref) {
    await this.req('POST', `/actions/workflows/${this.workflow}/dispatches`, { ref });
  }
}
