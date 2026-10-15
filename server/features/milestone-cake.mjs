// milestone-cake: today's tool calls per session (its transcript plus its subagents' and workflow agents'), and the
// last milestone passed (100, 500, 1000, then every 1000) with when its call was made. Each file is read from local
// midnight (found by bisecting on timestamps), then only its appended bytes.
import fs from 'node:fs'
import path from 'node:path'
import { StringDecoder } from 'node:string_decoder'

const CHUNK = 4 * 1024 * 1024, PROBE = 64 * 1024
const scans = new Map() // file -> { day, offset, rest, dec, calls: [ms] }
const dirs = new Map()  // session id -> { sessionDir, file }
const TS = /"timestamp":"([^"]+)"/
const ls = d => { try { return fs.readdirSync(d) } catch { return [] } }
const midnight = () => new Date().setHours(0, 0, 0, 0)

export const milestoneOf = n => n >= 1000 ? Math.floor(n / 1000) * 1000 : n >= 500 ? 500 : n >= 100 ? 100 : 0

// the first timestamp at or after offset (skipping the partial line there)
function tsAt(fd, off) {
  const buf = Buffer.alloc(PROBE), n = fs.readSync(fd, buf, 0, PROBE, off)
  const lines = buf.subarray(0, n).toString('utf8').split('\n')
  for (const l of lines.slice(off ? 1 : 0, -1)) { const m = l.match(TS); if (m) return Date.parse(m[1]) }
  return null
}
function startOf(file, size, day) {
  const fd = fs.openSync(file, 'r')
  try {
    let lo = 0, hi = size
    while (hi - lo > PROBE) {
      const mid = Math.floor((lo + hi) / 2), t = tsAt(fd, mid)
      if (t == null || t >= day) hi = mid; else lo = mid
    }
    return lo
  } finally { fs.closeSync(fd) }
}

function line(s, l, day) {
  if (!l.includes('"role":"assistant"') || !l.includes('"type":"tool_use"')) return
  const at = Date.parse(l.match(TS)?.[1]) || 0
  if (at < day) return
  for (let i = l.indexOf('"type":"tool_use"'); i >= 0; i = l.indexOf('"type":"tool_use"', i + 1)) s.calls.push(at)
}

function scan(file, size, day) {
  let s = scans.get(file)
  if (!s || size < s.offset || s.day !== day) {
    const offset = s && s.day !== day && size >= s.offset ? s.offset : startOf(file, size, day)
    s = { day, offset, rest: '', dec: new StringDecoder('utf8'), calls: [], skip: offset > 0 && !(s && s.day !== day) }
    scans.set(file, s)
  }
  if (size > s.offset) {
    const fd = fs.openSync(file, 'r')
    try {
      while (s.offset < size) {
        const buf = Buffer.alloc(Math.min(CHUNK, size - s.offset))
        const n = fs.readSync(fd, buf, 0, buf.length, s.offset)
        if (!n) break
        s.offset += n
        const lines = (s.rest + s.dec.write(buf.subarray(0, n))).split('\n')
        s.rest = lines.pop()
        if (s.skip) { lines.shift(); s.skip = false }
        for (const l of lines) if (l) line(s, l, day)
      }
    } finally { fs.closeSync(fd) }
  }
  return s.calls
}

function agentFiles(sessionDir) {
  const sub = path.join(sessionDir, 'subagents'), out = []
  const visit = d => { for (const f of ls(d)) if (f.startsWith('agent-') && f.endsWith('.jsonl')) out.push(path.join(d, f)) }
  visit(sub)
  for (const wf of ls(path.join(sub, 'workflows'))) visit(path.join(sub, 'workflows', wf))
  return out
}

export default {
  session({ id, sessionDir, file }) { dirs.set(id, { sessionDir, file }) },
  snapshot(snap) {
    const day = midnight()
    for (const s of snap.sessions) {
      const d = dirs.get(s.id); if (!d) continue
      const calls = []
      for (const f of [d.file, ...agentFiles(d.sessionDir)]) {
        let st; try { st = fs.statSync(f) } catch { continue }
        if (st.mtimeMs < day) continue
        for (const t of scan(f, st.size, day)) calls.push(t)
      }
      const n = calls.length, m = milestoneOf(n)
      if (!n) { delete s.ext['milestone-cake']; continue }
      let at = null
      if (m) { calls.sort((a, b) => a - b); at = calls[m - 1] }
      s.ext['milestone-cake'] = { today: n, milestone: m, at }
    }
    for (const f of scans.keys()) if (!fs.existsSync(f)) scans.delete(f)
  },
}
