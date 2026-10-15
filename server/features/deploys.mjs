// deploys: the deploy workflow runs on the repo's default branch (cd, web-cd, migrate, rollback — any run whose name
// ends in "cd", "deploy", "migrate" or "rollback"), from one read-only gh run list every 30 s. The repo and the merged
// PRs come from github-street's part of the previous snapshot (this feature sorts first, so it reads it a tick late).
// Each deploy carries the PRs merged since the previous run of its workflow (or the #N in its title).
import { execFile } from 'node:child_process'

const TICK = 30_000, KEEP = 6 * 3600_000, MAX = 12
const DEPLOY = /(^|[^a-z])(cd|deploy|migrate|rollback)$/i
const state = { status: 'loading', repo: null, branch: null, runs: [], at: 0, busy: false, downAt: 0 }
let last = null, timer = null

const gh = args => new Promise(resolve => execFile('gh', args, { timeout: 30_000, maxBuffer: 8 * 1024 * 1024 }, (err, out) => {
  if (err) { if (err.code === 'ENOENT' || /auth|401/i.test(String(err.message))) state.downAt = Date.now(); return resolve(null) }
  try { resolve(JSON.parse(out)) } catch { resolve(null) }
}))

async function tick() {
  const repo = last?.street?.repo
  if (state.busy || !repo || (state.downAt && Date.now() - state.downAt < 5 * 60_000)) return
  state.busy = true
  try {
    if (repo !== state.repo) { state.repo = repo; state.branch = null; state.runs = [] }
    state.branch ||= (await gh(['repo', 'view', repo, '--json', 'defaultBranchRef']))?.defaultBranchRef?.name || null
    if (!state.branch) return
    const j = await gh(['run', 'list', '-R', repo, '--branch', state.branch, '--limit', '40',
      '--json', 'databaseId,status,conclusion,workflowName,createdAt,updatedAt,event,displayTitle,headSha'])
    if (!Array.isArray(j)) return
    state.runs = j.filter(r => DEPLOY.test(r.workflowName.trim()) && r.event !== 'pull_request')
    state.at = Date.now(); state.status = 'ok'
  } catch (e) { console.error('[deploys]', e.message) } finally { state.busy = false }
}

// typical run time per workflow (median of completed, non-skipped runs), the client's climb scale
function typical() {
  const by = new Map()
  for (const r of state.runs) if (r.status === 'completed' && r.conclusion !== 'skipped') {
    const s = (Date.parse(r.updatedAt) - Date.parse(r.createdAt)) / 1000
    if (s > 0) by.set(r.workflowName, [...(by.get(r.workflowName) || []), s])
  }
  return w => { const l = (by.get(w) || []).sort((a, b) => a - b); return l.length ? l[l.length >> 1] : 60 }
}

function build(merged) {
  const now = Date.now(), typ = typical()
  const runs = state.runs.filter(r => now - Date.parse(r.createdAt) < KEEP).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
  const prev = new Map(), out = []
  for (const r of runs) {
    const at = Date.parse(r.createdAt), since = prev.get(r.workflowName) ?? at - 15 * 60_000
    prev.set(r.workflowName, at)
    const n = Number(r.displayTitle?.match(/\(#(\d+)\)\s*$/)?.[1]) || null
    const prs = merged.filter(p => { const m = Date.parse(p.mergedAt); return p.number === n || (m > since && m <= at + 30_000) })
      .sort((a, b) => Date.parse(b.mergedAt) - Date.parse(a.mergedAt)).slice(0, 5)
      .map(p => ({ number: p.number, title: p.title, author: p.author, url: p.url }))
    if (n && !prs.some(p => p.number === n)) prs.unshift({ number: n, title: r.displayTitle.replace(/\s*\(#\d+\)\s*$/, ''), author: null, url: `https://github.com/${state.repo}/pull/${n}` })
    out.push({
      id: r.databaseId, workflow: r.workflowName, status: r.status, conclusion: r.conclusion || null, event: r.event,
      title: r.displayTitle, sha: r.headSha?.slice(0, 7), createdAt: r.createdAt, updatedAt: r.updatedAt, typical: typ(r.workflowName),
      url: `https://github.com/${state.repo}/actions/runs/${r.databaseId}`, prs,
    })
  }
  return out.slice(-MAX)
}

export default {
  snapshot(snap) {
    const merged = last?.street?.merged || []
    last = snap
    if (!timer) { timer = setInterval(tick, TICK); timer.unref?.(); setTimeout(tick, 3000) }
    snap.deploys = { status: state.status, repo: state.repo, branch: state.branch, fetchedAt: state.at, list: state.status === 'ok' ? build(merged) : [] }
  },
}
