// milestone-cake: today's tool calls per session (its transcript plus its subagents' and workflow agents'), and the
// last milestone passed (100, 500, 1000, then every 1000) with when its call was made. Each file is read from local
// midnight (found by bisecting on timestamps), then only its appended bytes.
import fs from 'node:fs'
import { readSync, tailState } from '../lib/tail.mjs'
import { transcriptsOf, sweep } from '../lib/transcripts.mjs'

const PROBE = 64 * 1024
const scans = new Map() // file -> { day, offset, rest, skip, calls: [ms] }
const TS = /"timestamp":"([^"]+)"/
const midnight = () => new Date().setHours(0, 0, 0, 0)

const milestoneOf = n => n >= 1000 ? Math.floor(n / 1000) * 1000 : n >= 500 ? 500 : n >= 100 ? 100 : 0

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
    const was = s
    const offset = s && s.day !== day && size >= s.offset ? s.offset : startOf(file, size, day)
    s = tailState(offset, { day, calls: [] })
    s.skip = offset > 0 && !(was && was.day !== day)
    scans.set(file, s)
  }
  readSync(s, file, size, l => line(s, l, day))
  return s.calls
}

export default {
  snapshot(snap) {
    const day = midnight()
    for (const s of snap.sessions) {
      const calls = []
      for (const { file: f, stat: st } of transcriptsOf(s.id)) {
        if (st.mtimeMs < day) continue
        try { for (const t of scan(f, st.size, day)) calls.push(t) } catch {}
      }
      const n = calls.length, m = milestoneOf(n)
      if (!n) { delete s.ext['milestone-cake']; continue }
      let at = null
      if (m) { calls.sort((a, b) => a - b); at = calls[m - 1] }
      s.ext['milestone-cake'] = { today: n, milestone: m, at }
    }
    sweep(scans)
  },
}
