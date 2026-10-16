// skyline-towers: the other git repos the live sessions work in (not the street's), for the distant towers behind the
// street. Only each live session's cwd is looked at — `git remote get-url origin` (or the repo folder's name when
// there is no remote), once per cwd; no GitHub calls, nothing watched. snap.skyline = { main, repos: [{ name, full, sessions }] }.
import * as exec from '../lib/exec.mjs'
import path from 'node:path'

const MAX = 6
const repos = new Map()   // cwd -> { name, full } | null (not a repo) ; a pending lookup has no entry yet
const pending = new Set()
const git = (cwd, args) => exec.git(cwd, args, { timeout: 5000 }).then(out => out?.trim() ?? null)
const nameOf = url => url.replace(/\.git$/, '').replace(/\/+$/, '').match(/([^/:]+\/[^/:]+)$/)?.[1] ?? null

async function lookup(cwd) {
  pending.add(cwd)
  let r = null
  const url = await git(cwd, ['remote', 'get-url', 'origin'])
  const full = url && nameOf(url)
  if (full) r = { full, name: full.split('/').pop() }
  else {
    const common = await git(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
    if (common) { const n = path.basename(common === '.git' || common.endsWith('/.git') ? path.dirname(common) : common); r = { full: n, name: n } }
  }
  if (repos.size > 200) repos.delete(repos.keys().next().value)
  repos.set(cwd, r); pending.delete(cwd)
}

export default {
  serves: ['skyline-towers'],
  after: ['github-street'],   // reads snap.street
  snapshot(snap) {
    const live = snap.sessions.filter(s => s.running !== false && s.cwd)
    for (const s of live) if (!repos.has(s.cwd) && !pending.has(s.cwd)) lookup(s.cwd)
    const by = new Map()
    for (const s of live) { const r = repos.get(s.cwd); if (r) (by.get(r.full) || by.set(r.full, { ...r, sessions: [] }).get(r.full)).sessions.push(s.id) }
    const streetRepo = snap.street?.repo || null
    const main = streetRepo && by.has(streetRepo) ? streetRepo : streetRepo || [...by.values()].sort((a, b) => b.sessions.length - a.sessions.length)[0]?.full || null
    snap.skyline = { main, repos: [...by.values()].filter(r => r.full !== main).sort((a, b) => b.sessions.length - a.sessions.length || a.full.localeCompare(b.full)).slice(0, MAX) }
  },
}
