// report-card: today's totals for the daily report card (app/features/report-card.js) — sessions and subagents
// started today, tool calls by name, the longest session span and the most repeated shell command. One incremental
// crawl of every transcript touched today (entered at local midnight by bisecting, then only appended bytes),
// at most every 30 s, off the snapshot path. Attaches snap.reportCard.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { StringDecoder } from 'node:string_decoder'

const PROJECTS = path.join(os.homedir(), '.claude', 'projects')
const CHUNK = 4 * 1024 * 1024, PROBE = 64 * 1024, EVERY = 30_000, DAY = 24 * 3600_000
const TS = /"timestamp":"([^"]+)"/
const USE = /"type":"tool_use","id":"([^"]+)","name":"([^"]+)"(,"input":\{"command":"((?:[^"\\]|\\.){0,400})")?/g
const midnight = () => new Date().setHours(0, 0, 0, 0)

const files = new Map()   // file -> { offset, rest, dec, skip, session, main, first, last }
let day = 0, ids = new Set(), tools = new Map(), cmds = new Map(), agentsToday = new Set()
let busy = false, at = 0, ready = false

const dir = async d => { try { return await fs.promises.readdir(d) } catch { return [] } }

async function list(today) {
  const out = []
  for (const proj of await dir(PROJECTS)) {
    const pd = path.join(PROJECTS, proj)
    for (const f of await dir(pd)) {
      if (!f.endsWith('.jsonl')) continue
      const id = f.slice(0, -6), main = path.join(pd, f)
      let st; try { st = await fs.promises.stat(main) } catch { continue }
      if (st.mtimeMs < today - DAY) continue
      if (st.mtimeMs >= today) out.push([main, id, true, st])
      const sub = path.join(pd, id, 'subagents')
      const agents = async d => (await dir(d)).filter(x => x.startsWith('agent-') && x.endsWith('.jsonl')).map(x => path.join(d, x))
      const add = async a => { try { const s = await fs.promises.stat(a); if (s.mtimeMs >= today) out.push([a, id, false, s]) } catch {} }
      for (const a of await agents(sub)) await add(a)
      for (const wf of await dir(path.join(sub, 'workflows'))) for (const a of await agents(path.join(sub, 'workflows', wf))) await add(a)
    }
  }
  return out
}

async function seek(fh, size, today) {
  let lo = 0, hi = size
  while (hi - lo > PROBE) {
    const mid = Math.floor((lo + hi) / 2), buf = Buffer.alloc(PROBE)
    const { bytesRead } = await fh.read(buf, 0, PROBE, mid)
    const t = buf.subarray(0, bytesRead).toString('utf8').split('\n').slice(1, -1).map(l => Date.parse(l.match(TS)?.[1]) || 0).find(Boolean)
    if (!t || t >= today) hi = mid; else lo = mid
  }
  return lo
}

function line(s, l, today) {
  const t = Date.parse(l.match(TS)?.[1]) || 0
  if (t < today) return
  s.first ||= t; if (t > s.last) s.last = t
  if (!l.includes('"type":"tool_use"')) return
  for (const m of l.matchAll(USE)) {
    if (ids.has(m[1])) continue
    ids.add(m[1]); tools.set(m[2], (tools.get(m[2]) || 0) + 1)
    if (m[2] === 'Bash' && m[4] != null) {
      let c; try { c = JSON.parse(`"${m[4]}"`) } catch { continue }
      c = c.split('\n')[0].trim().slice(0, 120)
      if (c) cmds.set(c, (cmds.get(c) || 0) + 1)
    }
  }
}

async function read(file, session, main, st, today) {
  let s = files.get(file)
  if (!s || st.size < s.offset) {
    s = { offset: 0, rest: '', dec: new StringDecoder('utf8'), session, main, first: 0, last: 0, fresh: true }
    files.set(file, s)
  }
  if (!main && (st.birthtimeMs || 0) >= today) agentsToday.add(file)
  if (st.size <= s.offset) return
  const fh = await fs.promises.open(file, 'r')
  try {
    if (s.fresh) { s.fresh = false; s.offset = await seek(fh, st.size, today); s.skip = s.offset > 0 }
    while (s.offset < st.size) {
      const buf = Buffer.alloc(Math.min(CHUNK, st.size - s.offset))
      const { bytesRead } = await fh.read(buf, 0, buf.length, s.offset)
      if (!bytesRead) break
      s.offset += bytesRead
      const lines = (s.rest + s.dec.write(buf.subarray(0, bytesRead))).split('\n')
      s.rest = lines.pop()
      if (s.skip) { lines.shift(); s.skip = false }
      for (const l of lines) if (l) line(s, l, today)
    }
  } finally { await fh.close() }
}

async function crawl() {
  busy = true
  try {
    const today = midnight()
    if (today !== day) { day = today; files.clear(); ids = new Set(); tools = new Map(); cmds = new Map(); agentsToday = new Set() }
    for (const [file, id, main, st] of await list(today)) { try { await read(file, id, main, st, today) } catch {} }
    ready = true
  } catch (e) { console.error('[report-card]', e.message) } finally { busy = false; at = Date.now() }
}

function snapshot(snap) {
  if (!busy && Date.now() - at > EVERY) crawl()
  if (!ready) { snap.reportCard = { ready: false }; return }
  const spans = new Map()
  for (const s of files.values()) {
    if (!s.first) continue
    const b = spans.get(s.session) || { first: Infinity, last: 0, main: false }
    b.first = Math.min(b.first, s.first); b.last = Math.max(b.last, s.last); b.main ||= s.main
    spans.set(s.session, b)
  }
  const longest = [...spans].sort((a, b) => (b[1].last - b[1].first) - (a[1].last - a[1].first))[0]
  const top = [...tools].sort((a, b) => b[1] - a[1]).slice(0, 3)
  const retried = [...cmds].sort((a, b) => b[1] - a[1])[0]
  snap.reportCard = {
    ready: true, day,
    sessions: [...spans.values()].filter(b => b.main).length,
    agents: agentsToday.size,
    tools: ids.size,
    top,
    longest: longest ? { id: longest[0], ms: longest[1].last - longest[1].first } : null,
    retried: retried && retried[1] > 2 ? { cmd: retried[0], n: retried[1] } : null,
  }
}

export default { snapshot }
