// GitHub issue status bars for the current-app phase roadmap.
// Runs only against main following PR merges/phase issue changes. No app data access.
import { readFile } from 'node:fs/promises';

export const ISSUE_START = '<!-- team-manager-phase-progress:start -->';
export const ISSUE_END = '<!-- team-manager-phase-progress:end -->';
export const ROADMAP_START = '<!-- team-manager-roadmap-progress:start -->';
export const ROADMAP_END = '<!-- team-manager-roadmap-progress:end -->';

const number = v => Number.isInteger(v) && v > 0;
const bodyText = v => String(v || '');
const summary = n => `${Math.round(n * 100)}%`;
export function bar(completed, total, cells = 20) {
  const filled = total ? Math.max(0, Math.min(cells, Math.round(cells * completed / total))) : 0;
  return '█'.repeat(filled) + '░'.repeat(cells - filled);
}
export function checkedGate(body, pattern) {
  return bodyText(body).split(/\r?\n/).some(line =>
    /^\s*-\s*\[[xX]\]/.test(line) && pattern.test(line));
}
export function computeProgress(issue, phase, mergedPulls = new Set()) {
  const pulls = [...new Set((phase.pulls || []).filter(number))];
  const finished = issue.state === 'closed' && issue.state_reason !== 'not_planned';
  const deferred = issue.state === 'closed' && issue.state_reason === 'not_planned';
  const merged = pulls.filter(p => mergedPulls.has(p)).length;
  // A formally completed phase is accepted even when legacy checklist ticks were not backfilled.
  const manual = finished || checkedGate(issue.body, /Required Safari\/mobile and representative user-journey tests recorded/i);
  const owner = finished || checkedGate(issue.body, /Product owner explicitly accepts this phase/i);
  const total = pulls.length + 3; // manual acceptance, explicit owner sign-off, issue completed
  const done = finished ? total : merged + Number(manual) + Number(owner);
  const pct = Math.round(100 * done / total);
  return Object.freeze({
    phase: phase.phase, issue:phase.issue, complete:deferred ? 0 : pct,
    remaining:deferred ? 100 : 100 - pct,
    done:deferred ? 0 : done, total, merged, planned:pulls.length,
    manual, owner, accepted:finished, deferred, unscoped:!pulls.length && !finished
  });
}
export function replaceBlock(body, start, end, inner) {
  const input = bodyText(body), first = input.indexOf(start), last = input.indexOf(end);
  const block = `${start}\n${inner.trim()}\n${end}`;
  if ((first < 0) !== (last < 0)) throw new Error('Progress markers must be paired: ' + start);
  if (first < 0) return block + '\n\n' + input;
  if (last < first || input.indexOf(start, first + start.length) !== -1 ||
      input.indexOf(end, last + end.length) !== -1) throw new Error('Duplicate or unordered progress markers');
  return input.slice(0, first) + block + input.slice(last + end.length);
}
export function phaseBlock(result) {
  const {phase,complete,remaining,done,total,merged,planned,unscoped,deferred,accepted,manual,owner} = result;
  const state = deferred ? 'Deferred / not planned' :
    accepted ? 'Formally accepted and closed' :
    unscoped ? 'Scope and delivery milestones not yet baselined' :
    'Implementation and acceptance in progress';
  const milestoneNote = unscoped ? 'No delivery PR checkpoints registered yet; the 0% is a planning placeholder.' :
    `${merged}/${planned} tracked PR milestones merged · manual Safari/user-journey acceptance ${manual?'recorded':'pending'} · explicit owner acceptance ${owner?'recorded':'pending'}.`;
  return `### ${phase} progress

**\`${bar(done,total)}\` ${complete}% complete · ${remaining}% remaining**

Tracked checkpoints: **${done}/${total}** · ${state}.  
${milestoneNote}

<sub>This is a checkpoint ratio, not an effort estimate or a claim of secure multi-tenant readiness. Updated from GitHub merged PRs and phase acceptance state.</sub>`;
}
export function roadmapBlock(results) {
  const completed = results.filter(x=>x.accepted).length, total = results.length;
  const percentage = Math.round(completed*100/total);
  const header = `### Roadmap progress

**\`${bar(completed,total)}\` ${percentage}% complete · ${100-percentage}% remaining** · ${completed}/${total} phases formally accepted and closed.

| Phase | Progress | Complete | Remaining | Phase issue |
| --- | --- | ---: | ---: | --- |`;
  const rows = results.map(x=>
    `| ${x.phase} | \`${bar(x.done,x.total,10)}\` | ${x.complete}% | **${x.remaining}%** | [#${x.issue}](https://github.com/pdomoney/team-manager/issues/${x.issue}) |`).join('\n');
  return header + '\n' + rows + '\n\n*Each percentage counts configured delivery milestones and acceptance gates—not elapsed effort. Unscoped future phases show 0% until their plan is baselined.*';
}
// Retry only transient provider errors. Authentication/permission errors remain actionable.
// Dependency injection makes the bounded retry policy testable without network calls.
export async function github(path, token, method='GET', payload, request=fetch, pause=ms=>new Promise(done=>setTimeout(done,ms))) {
  const url = `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/${path}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    let response;
    try {
      response = await request(url,{method,headers:{
        'Accept':'application/vnd.github+json',
        'Authorization':`Bearer ${token}`,
        'X-GitHub-Api-Version':'2022-11-28',
        'Content-Type':'application/json'
      },...(payload ? {body:JSON.stringify(payload)}:{})});
    } catch (error) {
      // Intermittent transport failure: retry without discarding prior issue updates.
      if (attempt === 4) throw new Error(`GitHub API ${method} ${path} transport failed after 5 attempts: ${String(error)}`);
      await pause(Math.min(8000, 500 * (2 ** attempt)));
      continue;
    }
    if (response.ok) return response.json();
    const rateLimited = response.status === 403 && (
      response.headers?.get('x-ratelimit-remaining') === '0' ||
      response.headers?.has('retry-after'));
    const retry = [429,500,502,503,504].includes(response.status) || rateLimited;
    if (!retry || attempt === 4)
      throw new Error(`GitHub API ${method} ${path}: ${response.status} ${await response.text()} (attempt ${attempt+1}/5)`);
    const retryAfter = Number(response.headers?.get('retry-after'));
    const wait = retryAfter > 0 && Number.isFinite(retryAfter)
      ? Math.min(8000, retryAfter * 1000) : Math.min(8000, 500 * (2 ** attempt));
    await pause(wait);
  }
  throw new Error('Unreachable: GitHub retries exhausted');
}
export async function updateProgress(config, client, log = console) {
  const results = [];
  for (const phase of config.phases) {
    const issue = await client.getIssue(phase.issue);
    const mergedPulls = new Set();
    for (const n of phase.pulls || []) {
      const pr = await client.getPull(n);
      if(pr.merged_at) mergedPulls.add(n);
    }
    const calculated = computeProgress(issue,phase,mergedPulls);
    results.push(calculated);
    const updated = replaceBlock(issue.body,ISSUE_START,ISSUE_END,phaseBlock(calculated));
    if (updated !== issue.body) await client.updateIssue(phase.issue,updated);
    log.info(`${phase.phase} issue #${phase.issue}: ${calculated.complete}% complete / ${calculated.remaining}% remaining`);
  }
  const master = await client.getIssue(config.roadmapIssue);
  const refreshed = replaceBlock(master.body,ROADMAP_START,ROADMAP_END,roadmapBlock(results));
  if (refreshed !== master.body) await client.updateIssue(config.roadmapIssue,refreshed);
  return results;
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  const token=process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token || !process.env.GITHUB_REPOSITORY) throw new Error('GH_TOKEN and GITHUB_REPOSITORY required');
  const config=JSON.parse(await readFile(new URL('../config/issue-progress.json',import.meta.url),'utf8'));
  const client={
    getIssue: n=>github(`issues/${n}`,token),
    getPull: n=>github(`pulls/${n}`,token),
    updateIssue: (n,body)=>github(`issues/${n}`,token,'PATCH',{body})
  };
  await updateProgress(config,client);
}
