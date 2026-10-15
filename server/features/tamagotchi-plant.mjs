// tamagotchi-plant: the days the user used Claude Code, from the timestamps in the main transcripts of the last
// LOOKBACK days (subagent files add nothing: their parent is busy the same day). Each file is read once, then only
// its appended bytes; a call reads at most BUDGET bytes so the first full scan spreads over a few polls (ready: false).
// snap.tamagotchiPlant = { streak (run ending today, or yesterday if today is still empty), best, today, yesterday, last, ready }.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const PROJECTS = path.join(os.homedir(), '.claude', 'projects')
const LOOKBACK = 60, DAY = 86_400_000, BUDGET = 48 * 1024 * 1024, CHUNK = 4 * 1024 * 1024, WALK_MS = 60_000
const TS = /"timestamp":"(\d{4}-\d\d-\d\dT\d\d)[^"]*"/g
const files = new Map()   // path -> { offset, rest, days: Set }
const hourDay = new Map() // 'YYYY-MM-DDTHH' (UTC) -> local day key
let list = [], walkedAt = 0

const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const ls = d => { try { return fs.readdirSync(d, { withFileTypes: true }) } catch { return [] } }
const localDay = h => { let k = hourDay.get(h); if (!k) { k = dayKey(Date.parse(h + ':30:00Z')); hourDay.set(h, k) } return k }

function walk(now) {
  const cut = now - LOOKBACK * DAY, out = []
  for (const p of ls(PROJECTS)) if (p.isDirectory()) for (const f of ls(path.join(PROJECTS, p.name))) {
    if (!f.isFile() || !f.name.endsWith('.jsonl')) continue
    const file = path.join(PROJECTS, p.name, f.name)
    try { const st = fs.statSync(file); if (st.mtimeMs >= cut) out.push({ file, size: st.size }) } catch {}
  }
  return out.sort((a, b) => b.size - a.size)
}

function read(file, size, budget) {
  let s = files.get(file)
  if (!s || size < s.offset) { s = { offset: 0, rest: '', days: new Set() }; files.set(file, s) }
  if (size <= s.offset) return 0
  const fd = fs.openSync(file, 'r'); let used = 0
  try {
    while (s.offset < size && used < budget) {
      const buf = Buffer.alloc(Math.min(CHUNK, size - s.offset)), n = fs.readSync(fd, buf, 0, buf.length, s.offset)
      if (!n) break
      s.offset += n; used += n
      const text = s.rest + buf.toString('utf8', 0, n), cut = text.lastIndexOf('\n')
      s.rest = cut < 0 ? text.slice(-200) : text.slice(cut + 1)
      const body = cut < 0 ? '' : text.slice(0, cut)
      let last = ''
      for (const m of body.matchAll(TS)) if (m[1] !== last) { last = m[1]; s.days.add(localDay(m[1])) }
    }
  } finally { fs.closeSync(fd) }
  return used
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
  snapshot(snap) {
    const now = snap.now || Date.now()
    if (now - walkedAt > WALK_MS) { walkedAt = now; list = walk(now) }
    let left = BUDGET, ready = true
    for (const { file } of list) {
      let size; try { size = fs.statSync(file).size } catch { continue }
      if (left <= 0) { if (size > (files.get(file)?.offset ?? 0)) ready = false; continue }
      left -= read(file, size, left)
      if (size > files.get(file).offset) ready = false
    }
    const keep = new Set(list.map(x => x.file)), days = new Set()
    for (const [f, s] of files) { if (!keep.has(f)) { files.delete(f); continue } for (const d of s.days) days.add(d) }
    snap.tamagotchiPlant = { ...summary(days, now), ready }
  },
}
