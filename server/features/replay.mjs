// replay: a compact timeline of every session and agent over the last N hours, for the "while you were away" view.
// GET /api/replay/?hours=8 -> { now, from, to, windowMs, sessions: [{ id, title, cwd, branch, ev, agents: [...] }] }
// ev: [[sec since from, code, tool?, detail?]], codes t tool, k thinking, w waiting/done, i idle.
// Files are read async in 1 MB chunks from a binary-searched offset, cached by size and extended as they grow.
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import zlib from 'node:zlib'

const PROJECTS = path.join(os.homedir(), '.claude', 'projects')
const argv = process.argv.slice(2), wi = argv.indexOf('--window-min')
const WINDOW_MS = (wi === -1 ? 30 : Number(argv[wi + 1])) * 60_000
const LOOKBACK = WINDOW_MS                 // state before the window, so the first frame is right
const IDLE_MS = 5 * 60_000
const SESSION_CAP = 600, AGENT_CAP = 200
const cache = new Map()                    // file -> parsed state
const meta = new Map()                     // json file -> { mtimeMs, v }
let built = null                           // { key, at, promise }

const tick = () => new Promise(r => setImmediate(r))
const B = s => Buffer.from(s)
const TS = B('"timestamp":"'), ASSIST = B('"type":"assistant"')

function tsOf(b, s, e) {
  const i = b.lastIndexOf(TS, e)
  if (i < s) return null
  const t = Date.parse(b.toString('latin1', i + 13, i + 37).split('"')[0])
  return Number.isFinite(t) ? t : null
}

// Calls onLine(buf, start, end) per complete line in [start, end); returns the offset after the last complete line.
async function eachLine(fh, start, end, skipPartial, onLine) {
  let pos = start, carry = null, base = start, skip = skipPartial
  while (pos < end) {
    const buf = Buffer.allocUnsafe(Math.min(1 << 20, end - pos))
    const { bytesRead } = await fh.read(buf, 0, buf.length, pos)
    if (!bytesRead) break
    const b = carry ? Buffer.concat([carry, buf.subarray(0, bytesRead)]) : buf.subarray(0, bytesRead)
    let s = 0, i
    while ((i = b.indexOf(10, s)) !== -1) {
      if (skip) skip = false; else if (i > s) onLine(b, s, i)
      s = i + 1
    }
    base += s; carry = s < b.length ? Buffer.from(b.subarray(s)) : null
    pos += bytesRead
    await tick()
  }
  return base
}

async function firstTs(fh, at, size) {
  const len = Math.min(512 * 1024, size - at), b = Buffer.allocUnsafe(len)
  await fh.read(b, 0, len, at)
  let s = b.indexOf(10) + 1, i
  while (s > 0 && (i = b.indexOf(10, s)) !== -1) { const t = tsOf(b, s, i); if (t) return t; s = i + 1 }
  return null
}

// Smallest offset (within 256 KB) at or before the first line stamped >= target; timestamps are append-ordered.
async function seek(fh, size, target) {
  let lo = 0, hi = size
  while (hi - lo > 256 * 1024) {
    const mid = Math.floor((lo + hi) / 2), t = await firstTs(fh, mid, size)
    if (t == null || t >= target) hi = mid; else lo = mid
  }
  return lo
}

const detailOf = (i = {}) => String(i.description || i.file_path || i.pattern || i.url || i.query || i.command || i.skill || i.prompt || '')
  .split(os.homedir()).join('~').split('\n')[0].trim().slice(0, 60)

function push(c, t, code, tool = null, detail = null) {
  const last = c.ev.at(-1)
  if (last && last[1] === code && (last[2] ?? null) === tool && ((last[3] ?? null) === detail || t - last[0] < 15_000)) return
  c.ev.push(tool ? [t, code, tool, detail] : [t, code])
}

function onLine(c, b, s, e) {
  const head = b.toString('latin1', s, Math.min(e, s + 400))
  if (head.startsWith('{"type":"')) {
    if (!/^\{"type":"(ai-title|custom-title)"/.test(head) || e - s > 4000) return
    try { const m = JSON.parse(b.toString('utf8', s, e)); if (m.aiTitle) c.title = m.aiTitle; if (m.customTitle) c.custom = m.customTitle } catch {}
    return
  }
  if (head.includes('"type":"user"')) {
    const t = tsOf(b, s, e); if (!t) return
    let done = false
    if (e - s < 20_000 && c.uses?.length) {
      try {
        const content = JSON.parse(b.toString('utf8', s, e)).message?.content
        const ok = Array.isArray(content) ? content.filter(x => x.type === 'tool_result' && !x.is_error) : []
        done = c.uses.some(u => u.name === 'StructuredOutput' && ok.some(r => r.tool_use_id === u.id))
      } catch {}
    }
    c.start ??= t
    return push(c, t, done ? 'w' : 'k')
  }
  if (head.includes('"attachment":') || head.includes('"type":"system"')) return
  const ai = b.lastIndexOf(ASSIST, e); if (ai < s) return
  let m; try { m = JSON.parse(b.toString('utf8', s, e)) } catch { return }
  const t = Date.parse(m.timestamp); if (!t) return
  c.start ??= t
  if (m.cwd) c.cwd = m.cwd
  if (m.gitBranch) c.branch = m.gitBranch
  const blocks = Array.isArray(m.message?.content) ? m.message.content : []
  const uses = blocks.filter(x => x.type === 'tool_use')
  if (uses.length) { c.uses = uses; const u = uses.at(-1); return push(c, t, 't', u.name, detailOf(u.input)) }
  const stop = m.message?.stop_reason
  push(c, t, stop === 'end_turn' || stop === 'stop_sequence' ? 'w' : 'k')
}

async function parse(file, st, from) {
  let c = cache.get(file)
  if (c && c.size === st.size && c.mtimeMs === st.mtimeMs && from >= c.from) return c
  const fresh = !c || from < c.from || st.size < c.size
  if (fresh) c = { from, pos: 0, size: 0, ev: [], title: null, custom: null, cwd: null, branch: null, uses: null, start: null }
  const fh = await fsp.open(file, 'r')
  try {
    if (fresh) {
      const at = await seek(fh, st.size, from - LOOKBACK)
      c.pos = await eachLine(fh, at, st.size, at > 0, (b, s, e) => onLine(c, b, s, e))
      if (!c.title && !c.custom && at > 0) {
        const sink = { ev: [] }
        await eachLine(fh, Math.max(0, at - 256 * 1024), at, true, (b, s, e) => onLine(sink, b, s, e))
        c.title = sink.title ?? null; c.custom = sink.custom ?? null
      }
    } else c.pos = await eachLine(fh, c.pos, st.size, false, (b, s, e) => onLine(c, b, s, e))
  } finally { await fh.close() }
  c.size = st.size; c.mtimeMs = st.mtimeMs
  const old = c.ev.findIndex(x => x[0] >= from - LOOKBACK)
  if (old > 1) c.ev.splice(0, old - 1)
  cache.set(file, c)
  return c
}

const readJson = async f => {
  try {
    const st = await fsp.stat(f), hit = meta.get(f)
    if (hit && hit.mtimeMs === st.mtimeMs) return hit.v
    const v = JSON.parse(await fsp.readFile(f, 'utf8')); meta.set(f, { mtimeMs: st.mtimeMs, v }); return v
  } catch { return null }
}
const ls = async d => { try { return await fsp.readdir(d) } catch { return [] } }
const stat = async f => { try { return await fsp.stat(f) } catch { return null } }

// Events from `from` on, plus the last one before it (negative offset); idle marks where a non-waiting state went silent.
function timeline(c, from, to, cap) {
  let i = c.ev.findIndex(x => x[0] >= from)
  if (i === -1) i = c.ev.length
  const src = c.ev.slice(Math.max(0, i - 1))
  const out = []
  for (let k = 0; k < src.length; k++) {
    const [t, code] = src[k], next = src[k + 1]?.[0] ?? to
    out.push(src[k])
    if (code !== 'w' && next - t > IDLE_MS) out.push([t + IDLE_MS, 'i'])
  }
  const kept = out.length > cap ? thin(out, from, to, cap) : out
  return kept.map(x => [Math.round((x[0] - from) / 1000), ...x.slice(1)])
}
// Keep the last event of each time bucket: the state that held at the bucket's end.
function thin(ev, from, to, cap) {
  const w = (to - from) / cap, out = []
  for (const x of ev) {
    const bk = Math.floor((x[0] - from) / w)
    if (out.length && Math.floor((out.at(-1)[0] - from) / w) === bk) out[out.length - 1] = x; else out.push(x)
  }
  return out
}

const workflowName = async (sessionDir, wf) => (await readJson(path.join(sessionDir, 'workflows', `${wf}.json`)))?.script?.match(/name:\s*['"`]([^'"`]+)['"`]/)?.[1] ?? wf

async function agentsOf(sessionDir, from, to) {
  const out = []
  const visit = async (dir, workflow, workflowRun) => {
    for (const f of await ls(dir)) {
      if (!f.startsWith('agent-') || !f.endsWith('.jsonl')) continue
      const file = path.join(dir, f), st = await stat(file)
      if (!st || st.mtimeMs < from) continue
      const c = await parse(file, st, from)
      const ev = timeline(c, from, to, AGENT_CAP)
      if (!ev.some(x => x[0] >= 0)) continue
      const m = await readJson(file.replace(/\.jsonl$/, '.meta.json')) || {}
      const lastCode = c.ev.at(-1)?.[1]
      out.push({
        id: f.slice(6, -6), type: m.agentType || 'agent', description: m.description || '', phase: m.workflowPhase || null,
        workflow, workflowRun, start: Math.round((Math.max(c.start ?? from, from) - from) / 1000),
        end: Math.round((c.ev.at(-1)[0] - from) / 1000), done: lastCode === 'w', ev,
      })
    }
  }
  const sub = path.join(sessionDir, 'subagents')
  await visit(sub, null, null)
  for (const wf of await ls(path.join(sub, 'workflows'))) await visit(path.join(sub, 'workflows', wf), await workflowName(sessionDir, wf), wf)
  return out
}

async function build(hours) {
  const to = Date.now(), from = to - hours * 3_600_000, t0 = performance.now()
  const sessions = []
  for (const proj of await ls(PROJECTS)) {
    const projDir = path.join(PROJECTS, proj)
    for (const f of await ls(projDir)) {
      if (!f.endsWith('.jsonl')) continue
      const id = f.slice(0, -6), file = path.join(projDir, f), st = await stat(file)
      // a workflow can leave its session's own transcript quiet for hours
      if (!st || st.mtimeMs < from - 6 * 3_600_000) continue
      const sessionDir = path.join(projDir, id)
      const agents = await agentsOf(sessionDir, from, to)
      const c = st.mtimeMs >= from ? await parse(file, st, from) : null
      const ev = c ? timeline(c, from, to, SESSION_CAP) : []
      if (!ev.some(x => x[0] >= 0) && !agents.length) continue
      const custom = (await readJson(path.join(sessionDir, 'custom-title.json')))?.customTitle
      sessions.push({ id, title: custom || c?.custom || c?.title || id.slice(0, 8), cwd: c?.cwd ?? null, branch: c?.branch ?? null, ev, agents })
    }
  }
  sessions.sort((a, b) => a.id.localeCompare(b.id))
  for (const f of cache.keys()) if (!fs.existsSync(f)) cache.delete(f)
  return { now: to, from, to, windowMs: WINDOW_MS, buildMs: Math.round(performance.now() - t0), sessions }
}

async function route(req, res, url) {
  const hours = Math.max(1, Math.min(24, Number(url.searchParams.get('hours')) || 8))
  try {
    if (!built || built.hours !== hours || Date.now() - built.at > 10_000) {
      const promise = build(hours).then(d => { const json = JSON.stringify(d); return { json, gz: zlib.gzipSync(json) } })
      built = { hours, at: Date.now(), promise }
    }
    const { json, gz } = await built.promise
    const zip = /\bgzip\b/.test(req.headers['accept-encoding'] || '')
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', ...(zip ? { 'content-encoding': 'gzip' } : {}) })
    res.end(zip ? gz : json)
  } catch (e) {
    built = null
    res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: e.message }))
  }
}

export default { routes: { '/api/replay/': route } }
