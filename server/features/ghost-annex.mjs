// ghost-annex: sessions this server saw running today that have since closed, for the tower's ghost wing
// (snap.ghostAnnex). Kept in memory and in ~/.agentopolis/annex.json for the day, so a restart keeps today's ghosts.
// session(): when the transcript opened, how many tool calls it holds (counted incrementally over the whole file)
// and its last tool, so a ghost can still say so after it left the snapshot.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const NAME = 'ghost-annex', MAX = 24
const DIR = path.join(os.homedir(), '.agentopolis'), FILE = path.join(DIR, 'annex.json')
const LIVE = path.join(os.homedir(), '.claude', 'sessions')
const NEEDLE = Buffer.from('"type":"tool_use"')
const counts = new Map()   // file -> { offset, n, opened }
const dayOf = t => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` }

function opened(file) {
  let fd
  try {
    fd = fs.openSync(file, 'r'); const b = Buffer.alloc(65536), n = fs.readSync(fd, b, 0, b.length, 0)
    const m = b.toString('utf8', 0, n).match(/"timestamp":"([^"]+)"/)
    return m ? Date.parse(m[1]) || null : null
  } catch { return null } finally { if (fd != null) try { fs.closeSync(fd) } catch {} }
}
function countCalls(file, size) {
  let s = counts.get(file)
  if (!s || size < s.offset) { s = { offset: 0, n: 0, opened: opened(file) }; counts.set(file, s) }
  if (size <= s.offset) return s
  let fd
  try {
    fd = fs.openSync(file, 'r')
    const CH = 4 << 20, b = Buffer.alloc(CH + NEEDLE.length)
    // re-reading the last needle-1 bytes can never re-find a whole match, only finish one cut at the edge
    let pos = Math.max(0, s.offset - NEEDLE.length + 1)
    while (pos < size) {
      const n = fs.readSync(fd, b, 0, Math.min(CH, size - pos), pos)
      if (!n) break
      for (let i = b.indexOf(NEEDLE, 0); i !== -1 && i + NEEDLE.length <= n; i = b.indexOf(NEEDLE, i + 1)) s.n++
      pos += n
      if (pos < size) pos -= NEEDLE.length - 1
    }
    s.offset = size
  } catch {} finally { if (fd != null) try { fs.closeSync(fd) } catch {} }
  return s
}

function session(ctx) {
  const s = countCalls(ctx.file, ctx.stat.size)
  let last = null
  for (let i = ctx.entries.length - 1; i >= 0 && !last; i--) {
    const c = ctx.entries[i].message?.content
    if (ctx.entries[i].type === 'assistant' && Array.isArray(c)) for (let j = c.length - 1; j >= 0; j--) if (c[j]?.type === 'tool_use') { last = String(c[j].name || '').split('__').pop().slice(0, 40); break }
  }
  return { opened: s.opened || Math.round(ctx.stat.birthtimeMs) || null, calls: s.n, last }
}

let store = { day: dayOf(Date.now()), seen: {}, ghosts: [] }
try { const f = JSON.parse(fs.readFileSync(FILE, 'utf8')); if (f?.day === store.day) store = { day: f.day, seen: f.seen || {}, ghosts: f.ghosts || [] } } catch {}
let dirty = false, liveAt = 0, liveSet = new Set()

function live(now) {
  if (now - liveAt < 10_000) return liveSet
  liveAt = now; liveSet = new Set()
  let files = []; try { files = fs.readdirSync(LIVE) } catch {}
  for (const f of files) {
    if (!f.endsWith('.json')) continue
    try { const d = JSON.parse(fs.readFileSync(path.join(LIVE, f), 'utf8')); if (d?.sessionId && Number.isInteger(d.pid)) { process.kill(d.pid, 0); liveSet.add(d.sessionId) } } catch {}
  }
  return liveSet
}
// Another server on this HOME (a dev copy beside the live one) writes the same file: merge its ghosts in first, so
// neither drops the other's. Its sessions still seen running stay its own business (only ghosts are shared).
function save() {
  dirty = false
  try {
    fs.mkdirSync(DIR, { recursive: true })
    try {
      const disk = JSON.parse(fs.readFileSync(FILE, 'utf8'))
      if (disk?.day === store.day && Array.isArray(disk.ghosts)) {
        const mine = new Set(store.ghosts.map(g => g.id)), live = new Set(Object.keys(store.seen))
        for (const g of disk.ghosts) if (g?.id && !mine.has(g.id) && !live.has(g.id)) store.ghosts.push(g)
        store.ghosts.sort((a, b) => b.closed - a.closed)
        store.ghosts.length = Math.min(store.ghosts.length, MAX)
      }
    } catch {}
    const tmp = `${FILE}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(store))
    fs.renameSync(tmp, FILE)
  } catch {}
}

function snapshot(snap) {
  const now = snap.now || Date.now()
  if (dayOf(now) !== store.day) { store = { day: dayOf(now), seen: {}, ghosts: [] }; dirty = true }
  const present = new Map(snap.sessions.map(s => [s.id, s]))
  for (const s of snap.sessions) {
    if (!s.running) continue
    const x = s.ext?.[NAME] || {}, prev = store.seen[s.id]
    store.seen[s.id] = { id: s.id, title: s.title, branch: s.branch || null, worktree: s.worktree || null, opened: x.opened || prev?.opened || now,
      calls: x.calls ?? prev?.calls ?? 0, last: x.last || s.tool || prev?.last || null, state: s.state, agents: s.agents?.length || 0, seenAt: now }
    if (!prev) dirty = true
    const g = store.ghosts.findIndex(g => g.id === s.id)   // resumed: the ghost comes back to life
    if (g !== -1) { store.ghosts.splice(g, 1); dirty = true }
  }
  for (const [id, r] of Object.entries(store.seen)) {
    const s = present.get(id)
    if (s?.running) continue
    if (!s && live(now).has(id)) continue          // still running, only idle past the window
    const closed = s?.endedAt || r.seenAt
    delete store.seen[id]
    store.ghosts.unshift({ ...r, closed })
    store.ghosts.sort((a, b) => b.closed - a.closed)
    store.ghosts.length = Math.min(store.ghosts.length, MAX)
    dirty = true
  }
  if (dirty) save()
  snap.ghostAnnex = { day: store.day, ghosts: store.ghosts.map(({ seenAt, ...g }) => g) }
}

export default { serves: ['ghost-annex'], session, snapshot }   // off: no ghosts recorded, annex.json untouched
