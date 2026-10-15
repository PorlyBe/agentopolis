// ivy-wear: how old things are, for the tower's ivy, plaque patina and weathered base. session.ext['ivy-wear'] = { start }
// (the transcript's first stamped entry, read once per file) and snap.ivyWear = { repoBorn } (the oldest root commit of the
// repo most live sessions work in; read-only git, cached for hours).
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'

const HEAD = 64 * 1024, REPO_MS = 6 * 3600_000
const starts = new Map()   // file -> first timestamp ms | 0
const roots = new Map()    // cwd -> repo root | null (pending: undefined)
const born = new Map()     // root -> { at, ms }
const run = (args) => new Promise(resolve => execFile('git', args, { timeout: 20_000, maxBuffer: 1 << 20 }, (err, out) => resolve(err ? null : String(out))))

function startOf(file, stat) {
  if (starts.has(file)) return starts.get(file)
  let t = 0, fd
  try {
    fd = fs.openSync(file, 'r')
    const buf = Buffer.alloc(Math.min(HEAD, stat.size)), n = fs.readSync(fd, buf, 0, buf.length, 0)
    const m = buf.subarray(0, n).toString('utf8').match(/"timestamp":"([^"]+)"/)
    t = m ? Date.parse(m[1]) || 0 : 0
  } catch {} finally { if (fd != null) try { fs.closeSync(fd) } catch {} }
  if (!t) t = Math.round(stat.birthtimeMs || stat.mtimeMs || 0)
  starts.set(file, t)
  return t
}

function pickRoot(sessions) {
  const count = new Map()
  for (const s of sessions) {
    if (!s.running || !s.cwd) continue
    if (!roots.has(s.cwd)) {
      roots.set(s.cwd, undefined)
      run(['-C', s.cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir']).then(out => roots.set(s.cwd, out ? path.dirname(out.trim()) : null))
    }
    const r = roots.get(s.cwd); if (r) count.set(r, (count.get(r) || 0) + 1)
  }
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

function repoBorn(root, now) {
  const b = born.get(root)
  if (!b || (now - b.at > REPO_MS && !b.busy)) {
    const e = b || { at: 0, ms: null }
    e.busy = true; e.at = now; born.set(root, e)
    run(['-C', root, 'log', '--max-parents=0', '--format=%ct', 'HEAD']).then(out => {
      const ts = (out || '').split('\n').map(Number).filter(n => n > 0)
      if (ts.length) e.ms = Math.min(...ts) * 1000
      e.busy = false
    })
  }
  return born.get(root).ms
}

export default {
  session: ({ file, stat }) => ({ start: startOf(file, stat) }),
  snapshot(snap) {
    const root = pickRoot(snap.sessions)
    snap.ivyWear = { repoBorn: root ? repoBorn(root, snap.now) : null }
  },
}
