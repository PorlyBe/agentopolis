// window-heatmap: today's tool calls per local hour, across every transcript touched today (sessions, subagents,
// workflow agents). Each tool_use id counts once (a resumed or forked transcript repeats its parent's lines). Files are
// entered at local midnight by bisection, then only their appended bytes are read (like cost-jar).
// Attaches snap.heatmap = { day, hours: [24 counts] }.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { StringDecoder } from 'node:string_decoder'

const PROJECTS = path.join(os.homedir(), '.claude', 'projects')
const CHUNK = 4 * 1024 * 1024, PROBE = 256 * 1024, DAY = 24 * 3600_000
const USE = /"type":"tool_use","id":"([^"]+)"/g

const files = new Map()   // file -> { offset, rest, dec, fresh, skip }
const seen = new Set()
let hours = new Array(24).fill(0), list = [], listedAt = 0, crawling = false, crawledAt = 0, day = 0
const midnight = () => new Date().setHours(0, 0, 0, 0)
const tsOf = l => { const i = l.indexOf('"timestamp":"'); return i < 0 ? 0 : Date.parse(l.slice(i + 13, l.indexOf('"', i + 13))) || 0 }
const dir = async d => { try { return await fs.promises.readdir(d) } catch { return [] } }

async function listFiles(today) {
  const out = []
  const touched = async f => { try { return (await fs.promises.stat(f)).mtimeMs >= today } catch { return false } }
  for (const proj of await dir(PROJECTS)) {
    const pd = path.join(PROJECTS, proj)
    for (const f of await dir(pd)) {
      if (!f.endsWith('.jsonl')) continue
      const id = f.slice(0, -6), main = path.join(pd, f)
      let st; try { st = await fs.promises.stat(main) } catch { continue }
      if (st.mtimeMs < today - DAY) continue
      if (st.mtimeMs >= today) out.push(main)
      const sub = path.join(pd, id, 'subagents')
      const agents = async d => (await dir(d)).filter(x => x.startsWith('agent-') && x.endsWith('.jsonl')).map(x => path.join(d, x))
      for (const a of await agents(sub)) if (await touched(a)) out.push(a)
      for (const wf of await dir(path.join(sub, 'workflows'))) for (const a of await agents(path.join(sub, 'workflows', wf))) if (await touched(a)) out.push(a)
    }
  }
  return out
}

async function seekToday(fh, size, today) {
  let lo = 0, hi = size
  while (hi - lo > PROBE) {
    const mid = Math.floor((lo + hi) / 2), buf = Buffer.alloc(Math.min(PROBE, size - mid))
    const { bytesRead } = await fh.read(buf, 0, buf.length, mid)
    const t = buf.subarray(0, bytesRead).toString('utf8').split('\n').slice(1, -1).map(tsOf).find(Boolean)
    if (!t) return lo
    if (t < today) lo = mid; else hi = mid
  }
  return lo
}

function line(l, today) {
  if (!l.includes('"type":"tool_use"') || !l.includes('"type":"assistant"')) return
  const at = tsOf(l)
  if (at < today || at >= today + DAY) return
  const h = new Date(at).getHours()
  for (const m of l.matchAll(USE)) if (!seen.has(m[1])) { seen.add(m[1]); hours[h]++ }
}

async function read(file, size, today) {
  let s = files.get(file)
  if (!s || size < s.offset) { s = { offset: 0, rest: '', dec: new StringDecoder('utf8'), fresh: true }; files.set(file, s) }
  if (size <= s.offset) return
  const fh = await fs.promises.open(file, 'r')
  try {
    if (s.fresh) { s.fresh = false; s.offset = await seekToday(fh, size, today); if (s.offset) s.skip = true }
    while (s.offset < size) {
      const buf = Buffer.alloc(Math.min(CHUNK, size - s.offset))
      const { bytesRead } = await fh.read(buf, 0, buf.length, s.offset)
      if (!bytesRead) break
      s.offset += bytesRead
      const lines = (s.rest + s.dec.write(buf.subarray(0, bytesRead))).split('\n')
      s.rest = lines.pop()
      if (s.skip) { lines.shift(); s.skip = false }
      for (const l of lines) if (l) line(l, today)
    }
  } finally { await fh.close() }
}

async function crawl() {
  if (crawling) return
  crawling = true
  try {
    const today = midnight(), t0 = Date.now()
    if (today !== day) { day = today; hours = new Array(24).fill(0); seen.clear(); files.clear(); listedAt = 0 }
    if (t0 - listedAt > 20_000) { list = await listFiles(today); listedAt = t0 }
    for (const file of list) {
      let st; try { st = await fs.promises.stat(file) } catch { continue }
      await read(file, st.size, today)
    }
  } catch (e) { console.error('[window-heatmap crawl]', e.message) } finally { crawling = false; crawledAt = Date.now() }
}

export default {
  snapshot(snap) {
    if (!crawling && snap.now - crawledAt > 3000) crawl()
    if (day) snap.heatmap = { day, hours: [...hours] }
  },
}
