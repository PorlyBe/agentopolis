// fire-drill: is the default branch red? A workflow is red when its newest finished push run on the branch failed and
// no newer run of it succeeded. One read-only gh run list a minute; the repo and branch come from deploys' part of the snapshot.
import { execFile } from 'node:child_process'

const TICK = 60_000
const state = { status: 'loading', repo: null, branch: null, runs: [], at: 0, busy: false, downAt: 0 }
let last = null, timer = null

const gh = args => new Promise(resolve => execFile('gh', args, { timeout: 30_000, maxBuffer: 8 * 1024 * 1024 }, (err, out) => {
  if (err) { if (err.code === 'ENOENT' || /auth|401/i.test(String(err.message))) state.downAt = Date.now(); return resolve(null) }
  try { resolve(JSON.parse(out)) } catch { resolve(null) }
}))

async function tick() {
  const repo = last?.deploys?.repo || last?.street?.repo, branch = last?.deploys?.branch
  if (state.busy || !repo || !branch || (state.downAt && Date.now() - state.downAt < 5 * 60_000)) return
  state.busy = true
  try {
    if (repo !== state.repo || branch !== state.branch) { state.repo = repo; state.branch = branch; state.runs = [] }
    const j = await gh(['run', 'list', '-R', repo, '--branch', branch, '--event', 'push', '--limit', '60',
      '--json', 'databaseId,status,conclusion,workflowName,createdAt,updatedAt,displayTitle,headSha'])
    if (!Array.isArray(j)) return
    state.runs = j; state.at = Date.now(); state.status = 'ok'
  } catch (e) { console.error('[fire-drill]', e.message) } finally { state.busy = false }
}

function red() {
  const by = new Map()
  for (const r of [...state.runs].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))) {
    if (r.status !== 'completed' || (r.conclusion !== 'success' && r.conclusion !== 'failure') || by.has(r.workflowName)) continue
    by.set(r.workflowName, r)
  }
  return [...by.values()].filter(r => r.conclusion === 'failure').map(r => ({
    id: r.databaseId, workflow: r.workflowName.replace(/^\W+/u, '').trim() || r.workflowName, title: r.displayTitle, sha: r.headSha?.slice(0, 7),
    failedAt: Date.parse(r.updatedAt) || Date.parse(r.createdAt), url: `https://github.com/${state.repo}/actions/runs/${r.databaseId}`,
  }))
}

export default {
  snapshot(snap) {
    last = snap
    if (!timer) { timer = setInterval(tick, TICK); timer.unref?.(); setTimeout(tick, 5000) }
    snap.fireDrill = { status: state.status, repo: state.repo, branch: state.branch, fetchedAt: state.at, red: state.status === 'ok' ? red() : [] }
  },
}
