// lost-found: the worktrees of the live sessions' repo under .claude/worktrees that no live session is working in, each with its branch,
// age (directory mtime), whether it has uncommitted changes and the user's PR for that branch (merged / open / closed).
// Read-only: git worktree list + git --no-optional-locks status, and one gh pr list of the user's PRs, all via execFile
// and cached. Nothing here ever modifies or removes a worktree.
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'

const LIST_MS = 60_000, PRS_MS = 10 * 60_000, PRS_RETRY_MS = 3 * 60_000, DIRTY_MS = 10 * 60_000, DIRTY_PER_TICK = 3
const roots = new Map() // session cwd -> main checkout of its repo | null
const state = { root: null, list: [], listAt: 0, listBusy: false, prs: null, prsAt: 0, prsBusy: false, repo: null, dirty: new Map(), dirtyBusy: 0 }

const run = (cmd, args, opts = {}) => new Promise(resolve =>
  execFile(cmd, args, { timeout: 30_000, maxBuffer: 8 * 1024 * 1024, ...opts }, (err, out) => resolve(err ? null : String(out))))

function parse(out) {
  const list = []
  for (const block of out.split('\n\n')) {
    const w = {}
    for (const l of block.split('\n')) {
      const [k, ...v] = l.split(' ')
      if (k === 'worktree') w.path = v.join(' ')
      else if (k === 'branch') w.branch = v.join(' ').replace(/^refs\/heads\//, '')
      else if (k === 'HEAD') w.head = v[0]
      else if (k === 'detached') w.detached = true
      else if (k === 'prunable') w.prunable = true
      else if (k === 'locked') w.locked = true
    }
    if (!w.path || !w.path.includes(`${path.sep}.claude${path.sep}worktrees${path.sep}`)) continue
    let mtime = null
    try { mtime = fs.statSync(w.path).mtimeMs } catch {}
    list.push({ name: path.basename(w.path), path: w.path, branch: w.branch || null, head: w.head?.slice(0, 9) || null, mtime, prunable: !!w.prunable, locked: !!w.locked })
  }
  return list
}

// the main checkout the most live sessions work in (a worktree's common git dir sits in it)
function pickRoot(sessions) {
  const count = new Map()
  for (const s of sessions) {
    if (!s.running || !s.cwd) continue
    if (!roots.has(s.cwd)) {
      roots.set(s.cwd, null)
      run('git', ['-C', s.cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir']).then(out => roots.set(s.cwd, out ? path.dirname(out.trim()) : null))
    }
    const r = roots.get(s.cwd); if (r) count.set(r, (count.get(r) || 0) + 1)
  }
  const best = [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  if (best !== state.root) { state.root = best; state.list = []; state.listAt = 0; state.repo = null; state.prs = null; state.prsAt = 0 }
}

async function refreshList() {
  state.listBusy = true
  const out = await run('git', ['-C', state.root, 'worktree', 'list', '--porcelain'])
  if (out != null) { state.list = parse(out); state.listAt = Date.now() }
  else state.listAt = Date.now() - LIST_MS + 15_000
  state.listBusy = false
}

async function refreshPrs() {
  state.prsBusy = true
  if (!state.repo) {
    const url = await run('git', ['-C', state.root, 'remote', 'get-url', 'origin'])
    state.repo = url?.trim().match(/github\.com[:/]([^/]+\/[^/.\s]+)/)?.[1] ?? null
  }
  const out = state.repo && await run('gh', ['pr', 'list', '-R', state.repo, '--author', '@me', '--state', 'all', '--limit', '400', '--json', 'number,title,headRefName,state,mergedAt,closedAt,url'])
  let j = null; try { j = out && JSON.parse(out) } catch {}
  if (j) { state.prs = j; state.prsAt = Date.now() } else state.prsAt = Date.now() - PRS_MS + PRS_RETRY_MS
  state.prsBusy = false
}

const checking = new Set()
function checkDirty(w) {
  if (checking.has(w.path)) return
  checking.add(w.path); state.dirtyBusy++
  run('git', ['-C', w.path, '--no-optional-locks', 'status', '--porcelain']).then(out => {
    state.dirty.set(w.path, { at: Date.now(), dirty: out == null ? null : out.split('\n').filter(Boolean).length })
    state.dirtyBusy--; checking.delete(w.path)
  })
}

const RANK = { MERGED: 0, OPEN: 1, CLOSED: 2 }
function prFor(branch) {
  if (!branch || !state.prs) return null
  const hits = state.prs.filter(p => p.headRefName === branch).sort((a, b) => RANK[a.state] - RANK[b.state] || b.number - a.number)
  const p = hits[0]
  return p ? { number: p.number, title: p.title, state: p.state, url: p.url, mergedAt: p.mergedAt ? Date.parse(p.mergedAt) : null } : null
}

export default {
  snapshot(snap) {
    const now = Date.now()
    pickRoot(snap.sessions)
    if (!state.root) { snap.lostFound = { at: 0, prsAt: null, prsKnown: false, repo: null, total: 0, inUse: 0, crates: [] }; return }
    if (!state.listBusy && now - state.listAt > LIST_MS) refreshList()
    if (!state.prsBusy && now - state.prsAt > PRS_MS) refreshPrs()
    if (snap.street?.repo && !state.repo) state.repo = snap.street.repo
    const live = new Map()
    for (const s of snap.sessions) if (s.running && s.worktree) live.set(s.worktree, s.id)
    const crates = []
    for (const w of state.list) {
      if (live.has(w.name)) continue
      const d = state.dirty.get(w.path)
      if ((!d || now - d.at > DIRTY_MS) && state.dirtyBusy < DIRTY_PER_TICK) checkDirty(w)
      const pr = prFor(w.branch), dirty = d?.dirty ?? null
      crates.push({ ...w, pr, dirty, safe: pr?.state === 'MERGED' && dirty === 0 })
    }
    for (const p of state.dirty.keys()) if (!state.list.some(w => w.path === p)) state.dirty.delete(p)
    crates.sort((a, b) => (a.mtime ?? 0) - (b.mtime ?? 0))
    snap.lostFound = { at: state.listAt, prsAt: state.prsAt || null, prsKnown: !!state.prs, repo: state.repo, total: state.list.length, inUse: live.size, crates }
  },
}
