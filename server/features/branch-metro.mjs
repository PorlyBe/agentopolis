// branch-metro: the last two weeks of the live sessions' repo as a metro map for the subway's back wall. Trunk is the
// first-parent history of the default branch; a branch forks where its merge base sits on trunk (behind count) and is
// merged either as an ancestor of trunk or by a squash commit whose subject carries the branch's ticket token
// (feature/abc-12-x ↔ "... [ABC-12]"). Read-only git via execFile, refreshed at most every two minutes.
import path from 'node:path'
import { execFile } from 'node:child_process'

const REFRESH_MS = 2 * 60_000, RETRY_MS = 30_000, SPAN_MS = 14 * 86400_000, MAX = 10, MERGED_MAX = 5, PROBE = 60
const roots = new Map()
const state = { root: null, busy: false, at: 0, data: null }

const run = (args, opts = {}) => new Promise(resolve =>
  execFile('git', args, { timeout: 30_000, maxBuffer: 16 * 1024 * 1024, ...opts }, (err, out) => resolve(err ? null : String(out))))

function pickRoot(sessions) {
  const count = new Map()
  for (const s of sessions) {
    if (!s.running || !s.cwd) continue
    if (!roots.has(s.cwd)) {
      roots.set(s.cwd, null)
      run(['-C', s.cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir']).then(out => roots.set(s.cwd, out ? path.dirname(out.trim()) : null))
    }
    const r = roots.get(s.cwd); if (r) count.set(r, (count.get(r) || 0) + 1)
  }
  const best = [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  if (best !== state.root) { state.root = best; state.at = 0; state.data = null }
}

async function trunkRef(root) {
  const head = (await run(['-C', root, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD']))?.trim()
  if (head) return head
  for (const r of ['origin/main', 'origin/master', 'origin/trunk', 'main', 'master', 'trunk']) if (await run(['-C', root, 'rev-parse', '--verify', '-q', r])) return r
  return null
}

const tokens = name => [...name.matchAll(/([a-z][a-z0-9]{1,9})-(\d+)/gi)].map(m => `${m[1]}-${m[2]}`.toLowerCase())

async function refresh() {
  state.busy = true
  const root = state.root, now = Date.now(), since = now - SPAN_MS
  try {
    const trunk = await trunkRef(root); if (!trunk) throw 0
    const short = trunk.replace(/^origin\//, '')
    const log = await run(['-C', root, 'log', '--first-parent', '--format=%ct%x09%s', `--since=${Math.floor(since / 1000)}`, trunk]); if (log == null) throw 0
    const commits = log.split('\n').filter(Boolean).map(l => { const [t, ...s] = l.split('\t'); return { t: +t * 1000, s: s.join('\t') } })   // newest first
    const refs = await run(['-C', root, 'for-each-ref', '--sort=-committerdate', '--format=%(refname)%09%(committerdate:unix)%09%(contents:subject)', 'refs/heads', 'refs/remotes/origin']); if (refs == null) throw 0
    const seen = new Map()
    for (const l of refs.split('\n')) {
      const [ref, t, ...s] = l.split('\t'); if (!ref) continue
      const remote = ref.startsWith('refs/remotes/'), name = ref.replace(/^refs\/(heads|remotes\/origin)\//, '')
      if (name === 'HEAD' || name === short || +t * 1000 < since) continue
      const b = seen.get(name)
      if (b) { b.local ||= !remote; b.remote ||= remote; continue }
      seen.set(name, { name, ref, last: +t * 1000, subject: s.join('\t').slice(0, 120), local: !remote, remote })
    }
    const out = []
    for (const b of [...seen.values()].slice(0, PROBE)) {
      const lr = (await run(['-C', root, 'rev-list', '--left-right', '--count', `${trunk}...${b.ref}`]))?.trim().split(/\s+/).map(Number)
      if (!lr || lr.length !== 2) continue
      const [behind, ahead] = lr, fork = commits[behind]?.t ?? null
      let merged = null, mergedSubject = null
      const tk = tokens(b.name)
      if (tk.length) for (let i = Math.min(behind, commits.length) - 1; i >= 0; i--) {
        const s = commits[i].s.toLowerCase()
        if (tk.some(k => new RegExp(`(^|[^a-z0-9])${k}([^0-9]|$)`).test(s))) { merged = commits[i].t; mergedSubject = commits[i].s.slice(0, 120); break }
      }
      if (!merged && ahead === 0) { if (behind === 0) continue; merged = b.last }
      out.push({ name: b.name, fork, last: b.last, subject: b.subject, ahead, behind, merged, mergedSubject, local: b.local, remote: b.remote })
    }
    const merged = out.filter(b => b.merged).sort((a, b) => b.merged - a.merged).slice(0, MERGED_MAX)
    const open = out.filter(b => !b.merged).sort((a, b) => b.last - a.last).slice(0, MAX - merged.length)
    let repo = (await run(['-C', root, 'remote', 'get-url', 'origin']))?.trim().match(/github\.com[:/]([^/]+\/[^/.\s]+)/)?.[1] ?? null
    state.data = { at: now, since, repo, trunk: short, commits: commits.slice(0, 800).map(c => ({ t: c.t, s: c.s.slice(0, 90) })), branches: [...merged, ...open] }
    state.at = now
  } catch { state.at = now - REFRESH_MS + RETRY_MS }
  state.busy = false
}

export default {
  snapshot(snap) {
    pickRoot(snap.sessions)
    if (!state.root) { snap.branchMetro = null; return }
    if (!state.busy && Date.now() - state.at > REFRESH_MS) refresh()
    snap.branchMetro = state.data
  },
}
