// tamagotchi-plant: the days the user used Claude Code, from the timestamps in the main transcripts of the last
// LOOKBACK days (subagent files add nothing: their parent is busy the same day). A file seen for the first time is not
// read whole: transcripts are in time order, so each active day is found by bisecting to the first entry at or after
// the previous day's end. After that only its appended bytes are read. All reads are async, off the request path;
// ready is false until every file has had its first look.
// snap.tamagotchiPlant = { streak (run ending today, or yesterday if today is still empty), best, today, yesterday, last, ready }.
import fs from 'node:fs'
import path from 'node:path'
import { readAsync, tailState } from '../lib/tail.mjs'
import { PROJECTS } from '../lib/transcripts.mjs'

const LOOKBACK = 60, DAY = 86_400_000, WALK_MS = 60_000, HOUR = 3600_000, PROBE = 64 * 1024, MAX_LINE_SCAN = 8 * 1024 * 1024
const TS = /"timestamp":"(\d{4}-\d\d-\d\dT\d\d)[^"]*"/g
const files = new Map()   // path -> { offset, rest, skip, days: Set, mtime }
let list = [], walkedAt = 0, busy = false, ready = false, cache = null

const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const localDay = h => dayKey(Date.parse(h + ':30:00Z'))   // 'YYYY-MM-DDTHH' (UTC) -> local day
const dir = async d => { try { return await fs.promises.readdir(d, { withFileTypes: true }) } catch { return [] } }

async function walk(now) {
  const cut = now - LOOKBACK * DAY, out = []
  for (const p of await dir(PROJECTS)) if (p.isDirectory()) for (const f of await dir(path.join(PROJECTS, p.name))) {
    if (!f.isFile() || !f.name.endsWith('.jsonl')) continue
    const file = path.join(PROJECTS, p.name, f.name)
    try { const st = await fs.promises.stat(file); if (st.mtimeMs >= cut) out.push({ file, size: st.size }) } catch {}
  }
  return out.sort((a, b) => b.size - a.size)
}

// the entry's own (last) timestamp of the first whole line starting after byte `at` (at 0: the first line) that has
// one, and the offset just past that line; null when none follows
async function stampAfter(fh, size, at) {
  let pos = at, rest = null, skip = at > 0
  while (pos < size && pos - at < MAX_LINE_SCAN) {
    const buf = Buffer.allocUnsafe(Math.min(PROBE, size - pos)), { bytesRead } = await fh.read(buf, 0, buf.length, pos)
    if (!bytesRead) break
    let data = buf.subarray(0, bytesRead), base = pos
    if (rest) { data = Buffer.concat([rest, data]); base = pos - rest.length }
    pos += bytesRead
    let a = 0
    for (let i = data.indexOf(10); i !== -1; i = data.indexOf(10, a)) {
      if (skip) skip = false
      else {
        const l = data.toString('utf8', a, i), k = l.lastIndexOf('"timestamp":"')
        const t = k < 0 ? 0 : Date.parse(l.slice(k + 13, l.indexOf('"', k + 13))) || 0
        if (t) return { t, end: base + i + 1 }
      }
      a = i + 1
    }
    rest = a < data.length ? data.subarray(a) : null
  }
  return null
}

// first entry stamped at or after `since`, assuming entries are in time order: { t, end } or null
async function firstSince(fh, size, since) {
  let lo = 0, hi = size
  while (hi - lo > PROBE) {
    const mid = Math.floor((lo + hi) / 2), x = await stampAfter(fh, size, mid)
    if (x && x.t < since) lo = mid; else hi = mid
  }
  for (let at = lo, x; (x = await stampAfter(fh, size, at)); at = x.end - 1) if (x.t >= since) return x
  return null
}

async function firstLook(file, size, now) {
  const s = tailState(size, { days: new Set(), mtime: 0 })
  s.skip = false   // a last line still being written arrives whole-enough when it completes: only its stamps are read
  const fh = await fs.promises.open(file, 'r')
  try {
    let since = new Date(now - LOOKBACK * DAY).setHours(0, 0, 0, 0)
    for (let x; (x = await firstSince(fh, size, since));) {
      const h = new Date(x.t).toISOString().slice(0, 13)
      s.days.add(localDay(h))
      since = new Date(Date.parse(h + ':30:00Z')).setHours(24, 0, 0, 0)   // the next local day
    }
  } finally { await fh.close() }
  return s
}

async function update(now) {
  busy = true
  try {
    const walked = now - walkedAt > WALK_MS
    if (walked) { walkedAt = now; list = await walk(now) }
    let all = true
    for (const { file } of list) {
      let s = files.get(file)
      if (s && !walked && now - s.mtime > HOUR) continue   // between walks, only recently touched files can grow
      let st; try { st = await fs.promises.stat(file) } catch { continue }
      if (s && st.size < s.offset) { files.delete(file); s = null }
      try {
        if (!s) { s = await firstLook(file, st.size, now); files.set(file, s) }
        else if (st.size > s.offset) await readAsync(s, file, st.size, l => { let last = ''; for (const m of l.matchAll(TS)) if (m[1] !== last) { last = m[1]; s.days.add(localDay(m[1])) } })
        s.mtime = st.mtimeMs
      } catch { all = false }
    }
    if (walked) { const keep = new Set(list.map(x => x.file)); for (const f of files.keys()) if (!keep.has(f)) files.delete(f) }
    ready = all
  } catch (e) { console.error('[tamagotchi-plant]', e.message) } finally { busy = false; cache = null }
}

function summary(days, now) {
  const today = dayKey(now), yest = dayKey(now - DAY)
  const run = from => { let n = 0, t = from; while (days.has(dayKey(t))) { n++; t -= DAY } return n }
  const has = { today: days.has(today), yesterday: days.has(yest) }
  const streak = has.today ? run(now) : has.yesterday ? run(now - DAY) : 0
  let best = 0, cur = 0, last = 0
  for (let i = LOOKBACK; i >= 0; i--) {
    if (days.has(dayKey(now - i * DAY))) { cur++; best = Math.max(best, cur); last = cur } else cur = 0
  }
  return { streak, best, ...has, last }
}

export default {
  serves: ['tamagotchi-plant'],   // only its own tower feature reads it
  snapshot(snap) {
    const now = snap.now || Date.now()
    if (!busy && now - (cache?.at || 0) > 1500) update(now)
    if (!cache || now - cache.at > 1500) {
      const days = new Set()
      for (const s of files.values()) for (const d of s.days) days.add(d)
      cache = { at: now, value: { ...summary(days, now), ready } }
    }
    snap.tamagotchiPlant = cache.value
  },
}
