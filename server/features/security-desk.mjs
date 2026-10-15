// security-desk: today's guardrail stops across every transcript touched today (sessions, subagents, workflow agents):
// a rejected permission prompt, a hook or harness block, an auto-mode classifier denial. Each names the tool it stopped,
// found through its tool_use id. Files are read once from the start, then only their appended bytes, asynchronously.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { StringDecoder } from 'node:string_decoder'

const PROJECTS = path.join(os.homedir(), '.claude', 'projects')
const CHUNK = 4 * 1024 * 1024, KEEP = 80, TICK = 15_000
const KINDS = [
  ['classifier', /auto mode classifier|classifier (?:gave no verdict|judged)/i],
  ['rejected', /doesn't want to proceed|tool use was rejected|was rejected by the user|Permission for this action/],
  ['hook', /^(?:<tool_use_error>)?Blocked:|PreToolUse:?\S* hook|hook (?:blocked|denied|error)|blocked by (?:a |the )?hook/i],
]
const MARK = /auto mode classifier|doesn't want to proceed|was rejected|Permission for this action|Blocked:|hook/
const USE = /"type":"tool_use","id":"(toolu_\w+)","name":"([^"]+)","input":(\{.{0,600})/g
const files = new Map()
let stops = [], crawling = false, crawledAt = 0, day = 0

const midnight = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() }
const dir = async d => { try { return await fs.promises.readdir(d) } catch { return [] } }

async function listFiles(since) {
  const out = []
  const agentsIn = async d => (await dir(d)).filter(f => f.startsWith('agent-') && f.endsWith('.jsonl')).map(f => path.join(d, f))
  for (const proj of await dir(PROJECTS)) {
    const pd = path.join(PROJECTS, proj)
    for (const f of await dir(pd)) {
      if (!f.endsWith('.jsonl')) continue
      const sub = path.join(pd, f.slice(0, -6), 'subagents')
      const all = [path.join(pd, f), ...await agentsIn(sub)]
      for (const wf of await dir(path.join(sub, 'workflows'))) all.push(...await agentsIn(path.join(sub, 'workflows', wf)))
      for (const file of all) { try { if ((await fs.promises.stat(file)).mtimeMs >= since) out.push(file) } catch {} }
    }
  }
  return out
}

function fresh(file) {
  const rel = path.relative(PROJECTS, file).split(path.sep)
  const agent = rel.at(-1).startsWith('agent-') ? rel.at(-1).slice(6, -6) : null
  return { offset: 0, rest: '', dec: new StringDecoder('utf8'), session: agent ? rel[1] : rel[1].slice(0, -6), agent, title: null, uses: new Map() }
}
const what = (name, raw) => {
  const pick = k => raw.match(new RegExp(`"${k}":"((?:[^"\\\\]|\\\\.){1,160})`))?.[1]?.replace(/\\n/g, ' ').replace(/\\(.)/g, '$1')
  return (name === 'Bash' ? pick('description') || pick('command') : pick('file_path') || pick('description') || pick('command') || pick('url') || pick('skill') || pick('query')) || null
}

function line(s, l, today) {
  if (!s.agent && l.length < 2000 && l.includes('"ai-title"')) { try { s.title = JSON.parse(l).aiTitle || s.title } catch {} return }
  if (l.includes('"type":"tool_use"')) {
    for (const m of l.matchAll(USE)) { s.uses.set(m[1], { tool: m[2], what: what(m[2], m[3]) }); if (s.uses.size > 400) s.uses.delete(s.uses.keys().next().value) }
    return
  }
  if (!l.includes('"tool_result"') || !MARK.test(l)) return
  let e; try { e = JSON.parse(l) } catch { return }
  const t = Date.parse(e.timestamp) || 0
  if (t < today) return
  for (const b of Array.isArray(e.message?.content) ? e.message.content : []) {
    if (b.type !== 'tool_result') continue
    const out = (typeof b.content === 'string' ? b.content : Array.isArray(b.content) ? b.content.map(x => x.text || '').join(' ') : '').slice(0, 400)
    if (!b.is_error && !out.startsWith('<tool_use_error>')) continue
    const kind = KINDS.find(([, re]) => re.test(out))?.[0]
    if (!kind) continue
    const u = s.uses.get(b.tool_use_id) || {}
    const reason = kind === 'classifier' ? out.match(/Reason: \[([^\]]+)\]/)?.[1] || (/no verdict/.test(out) ? 'no verdict' : 'judged dangerous')
      : kind === 'hook' ? out.replace(/^<tool_use_error>/, '').replace(/<\/tool_use_error>$/, '').slice(0, 120) : 'prompt rejected'
    stops.push({ id: b.tool_use_id || `${t}`, t, kind, tool: u.tool || null, what: u.what || null, reason, session: s.session, agent: s.agent, fileTitle: s.title })
  }
}

async function read(file, size, today) {
  let s = files.get(file)
  if (!s || size < s.offset) { s = fresh(file); files.set(file, s) }
  if (size <= s.offset) return
  const fh = await fs.promises.open(file, 'r')
  try {
    while (s.offset < size) {
      const buf = Buffer.alloc(Math.min(CHUNK, size - s.offset))
      const { bytesRead } = await fh.read(buf, 0, buf.length, s.offset)
      if (!bytesRead) break
      s.offset += bytesRead
      const lines = (s.rest + s.dec.write(buf.subarray(0, bytesRead))).split('\n')
      s.rest = lines.pop()
      for (const l of lines) if (l) line(s, l, today)
    }
  } finally { await fh.close() }
}

async function crawl() {
  if (crawling) return
  crawling = true
  try {
    const today = midnight()
    if (today !== day) { day = today; stops = []; files.clear() }
    for (const f of await listFiles(today)) {
      let st; try { st = await fs.promises.stat(f) } catch { continue }
      await read(f, st.size, today)
    }
    const seen = new Set()
    stops = stops.filter(x => x.t >= today && !seen.has(x.id) && seen.add(x.id)).sort((a, b) => a.t - b.t).slice(-KEEP)
    crawledAt = Date.now()
  } catch (e) { console.error('[security-desk]', e.message) } finally { crawling = false }
}

export default {
  snapshot(snap) {
    if (Date.now() - crawledAt > TICK) crawl()
    const titles = new Map(), agents = new Map()
    for (const s of snap.sessions) { titles.set(s.id, s.title); for (const g of s.agents || []) agents.set(g.id, g.description || g.type) }
    snap.securityDesk = { day, ready: crawledAt > 0, stops: stops.map(({ fileTitle, ...x }) => ({ ...x, sessionTitle: titles.get(x.session) || fileTitle || x.session.slice(0, 8), agentName: x.agent ? agents.get(x.agent) || null : null })) }
  },
}
