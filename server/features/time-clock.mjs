// time-clock: when each session clocked in today (its transcript's first entry stamped since local midnight) and the
// local hours of the day it wrote anything in. session.ext['time-clock'] = { in, hours: [0..23] } or undefined before
// today's first entry. The first look at a file binary-searches to midnight; after that only appended bytes are read.
import fs from 'node:fs'

const PROBE = 256 * 1024, CHUNK = 4 * 1024 * 1024
const files = new Map()   // file -> { day, offset, rest, first, hours: Set }
const midnight = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() }
// the entry's own stamp follows its message, so the last one on the line is the entry's
const tsOf = l => { const i = l.lastIndexOf('"timestamp":"'); return i < 0 ? 0 : Date.parse(l.slice(i + 13, l.indexOf('"', i + 13))) || 0 }

function seekToday(fd, size, today) {
  let lo = 0, hi = size
  while (hi - lo > PROBE) {
    const mid = Math.floor((lo + hi) / 2), buf = Buffer.alloc(Math.min(PROBE, size - mid))
    const n = fs.readSync(fd, buf, 0, buf.length, mid)
    const t = buf.subarray(0, n).toString('utf8').split('\n').slice(1, -1).map(tsOf).find(Boolean)
    if (!t) return lo
    if (t < today) lo = mid; else hi = mid
  }
  return lo
}

function timeClock({ file, stat }) {
  const today = midnight()
  let st = files.get(file)
  if (!st || st.day !== today || stat.size < st.offset) st = { day: today, offset: null, rest: '', first: 0, hours: new Set() }
  files.set(file, st)
  if (stat.mtimeMs < today) return undefined
  let fd
  try {
    fd = fs.openSync(file, 'r')
    if (st.offset == null) st.offset = seekToday(fd, stat.size, today)
    while (st.offset < stat.size) {
      const buf = Buffer.alloc(Math.min(CHUNK, stat.size - st.offset))
      const n = fs.readSync(fd, buf, 0, buf.length, st.offset)
      if (!n) break
      st.offset += n
      const lines = (st.rest + buf.subarray(0, n).toString('utf8')).split('\n')
      st.rest = lines.pop()
      if (st.rest.length > 64 * 1024 * 1024) st.rest = ''
      for (const l of lines) {
        const t = tsOf(l)
        if (t < today) continue
        if (!st.first) st.first = t
        st.hours.add(new Date(t).getHours())
      }
    }
  } catch { return undefined } finally { if (fd != null) fs.closeSync(fd) }
  return st.first ? { in: st.first, hours: [...st.hours].sort((a, b) => a - b) } : undefined
}

export default { session: timeClock }
