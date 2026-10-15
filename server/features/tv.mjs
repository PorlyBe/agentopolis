// tv: wall-TV stats and the printer's commits, from one incremental crawl of every transcript touched this week.
// Each file is read once from the start, then only its appended bytes; reads are async so a cold start never blocks a poll.
// trophies.mjs reads the PR links this crawl collects through prsSince(); achievements.mjs reads today's per-file facts through dayFacts().
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { StringDecoder } from 'node:string_decoder'

const PROJECTS = path.join(os.homedir(), '.claude', 'projects')
const MIN = 60_000, HOUR = 60 * MIN, WEEK = 7 * 24 * HOUR
const CHUNK = 4 * 1024 * 1024
const COMMIT = /(?:^|[;&|(\n])\s*git(?:\s+-C\s+\S+)?\s+commit\b/  // a command, not the words inside a script
const COMMIT_OUT = /^\[([^\]\n]+?) ([0-9a-f]{7,40})\] (.+)$/gm
const NOT_A_BUG = /doesn't want to proceed|was rejected|Request interrupted|Permission for this action/
const HEREDOC = /<<-?\s*['"]?(\w+)['"]?\n([^\n]*)/, DASH_M = /\s-\w*m\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)')/
// Commits are often made with -q, so the message usually has to come from the command itself.
function messageOf(cmd) {
  const rest = cmd.slice(cmd.search(COMMIT)), h = rest.match(HEREDOC), m = rest.match(DASH_M)
  const msg = h && (!m || h.index < m.index + 12) ? h[2] : m ? (m[1] ?? m[2]).replace(/\\(.)/g, '$1') : ''
  return msg.split('\n')[0].trim().slice(0, 120)
}
const files = new Map() // file -> per-transcript state
const prs = new Map() // repo#n -> { n, url, repo, at }
const commits = new Map() // hash -> { id, t, msg, branch, file }
let list = [], listedAt = 0, crawling = false, ready = false, crawledAt = 0, cache = null

const midnight = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() }
const tsOf = l => {
  const i = l.lastIndexOf('"timestamp":"'); if (i < 0) return 0
  return Date.parse(l.slice(i + 13, l.indexOf('"', i + 13))) || 0
}

async function listFiles(now) {
  const out = []
  const dir = async d => { try { return await fs.promises.readdir(d) } catch { return [] } }
  const agentsIn = async d => (await dir(d)).filter(f => f.startsWith('agent-') && f.endsWith('.jsonl')).map(f => path.join(d, f))
  for (const proj of await dir(PROJECTS)) {
    const pd = path.join(PROJECTS, proj)
    for (const f of await dir(pd)) {
      if (!f.endsWith('.jsonl')) continue
      const file = path.join(pd, f)
      let st; try { st = await fs.promises.stat(file) } catch { continue }
      if (now - st.mtimeMs > WEEK) continue
      out.push(file)
      const sub = path.join(pd, f.slice(0, -6), 'subagents')
      out.push(...await agentsIn(sub))
      for (const wf of await dir(path.join(sub, 'workflows'))) out.push(...await agentsIn(path.join(sub, 'workflows', wf)))
    }
  }
  return out
}

function fresh(file) {
  const rel = path.relative(PROJECTS, file).split(path.sep)
  const agent = rel.at(-1).startsWith('agent-') ? rel.at(-1).slice(6, -6) : null
  return { offset: 0, rest: '', dec: new StringDecoder('utf8'), mtime: 0, project: rel[0], session: agent ? rel[1] : rel[1].slice(0, -6), agent,
    wf: agent && rel[2] === 'subagents' && rel[3] === 'workflows' ? rel[4] : null, title: null,
    mins: new Map(), tok: new Map(), day: 0, pending: new Map(), who: undefined, ...dayFresh(0) }
}
// today's facts per file, for achievements: tool calls per minute, tool errors, successful commits, first/last activity,
// and when a compact followed a context that had passed 90%
const dayFresh = today => ({ factDay: today, calls: new Map(), errs: [], commitTs: [], first: 0, last: 0, maxUsed: 0, bigAt: 0 })

function line(s, l, now, today) {
  if (s.factDay !== today) Object.assign(s, dayFresh(today))
  if (!s.agent && l.length < 2000 && l.includes('"ai-title"')) { try { s.title = JSON.parse(l).aiTitle || s.title } catch {} return }
  if (l.length < 1000 && l.includes('"type":"pr-link"')) {
    let e; try { e = JSON.parse(l) } catch { return }
    if (e.type === 'pr-link' && e.prNumber && e.prUrl) {
      const key = `${e.prRepository}#${e.prNumber}`, at = Date.parse(e.timestamp) || 0
      const had = prs.get(key)
      if (!had || at < had.at) prs.set(key, { n: e.prNumber, url: e.prUrl, repo: e.prRepository, at, session: s.session })
      return
    }
  }
  const assistant = l.includes('"type":"assistant"'), failed = l.includes('"is_error":true'), compact = !s.agent && l.includes('"compact_boundary"')
  if (!assistant && !failed && !compact && !(s.pending.size && l.includes('"tool_result"'))) return
  const t = tsOf(l), inHour = t > now - HOUR, isToday = t >= today
  if (!inHour && !isToday) return
  let e; try { e = JSON.parse(l) } catch { return }
  if (compact && e.subtype === 'compact_boundary') {
    const pre = Math.max(s.maxUsed, e.compactMetadata?.preTokens || 0)
    if (isToday && !s.bigAt && pre / (pre > 200_000 ? 1_000_000 : 200_000) >= 0.9) s.bigAt = t
    s.maxUsed = 0; return
  }
  const content = Array.isArray(e.message?.content) ? e.message.content : []
  if (e.type === 'assistant') {
    const u = e.message.usage
    if (isToday && u && e.message.id) {
      if (s.day !== today) { s.tok.clear(); s.day = today }
      const used = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.output_tokens || 0)
      s.tok.set(e.message.id, [used, u.output_tokens || 0])
      if (used > s.maxUsed) s.maxUsed = used
    }
    if (isToday) { if (!s.first) s.first = t; s.last = t }
    for (const b of content) {
      if (b.type !== 'tool_use') continue
      const m = Math.floor(t / MIN)
      if (inHour) s.mins.set(m, (s.mins.get(m) || 0) + 1)
      if (isToday) s.calls.set(m, (s.calls.get(m) || 0) + 1)
      const cmd = b.name === 'Bash' ? String(b.input?.command || '') : ''
      if (COMMIT.test(cmd) && isToday) s.pending.set(b.id, messageOf(cmd))
    }
  } else if (e.type === 'user') {
    if (failed && isToday) for (const b of content) {
      if (b.type !== 'tool_result' || !b.is_error) continue
      const out = typeof b.content === 'string' ? b.content : JSON.stringify(b.content || '')
      if (!NOT_A_BUG.test(out.slice(0, 300))) s.errs.push(t)
    }
    for (const b of content) {
      if (b.type !== 'tool_result' || !s.pending.has(b.tool_use_id)) continue
      const msg = s.pending.get(b.tool_use_id)
      s.pending.delete(b.tool_use_id)
      const out = typeof b.content === 'string' ? b.content : (b.content || []).map(x => x.text || '').join('\n')
      if (b.is_error || /nothing to commit|no changes added/.test(out)) continue
      s.commitTs.push(t || now)
      if (t && t < now - 30 * MIN) continue
      const found = [...out.matchAll(COMMIT_OUT)]
      for (const m of found) if (!commits.has(m[2])) commits.set(m[2], { id: m[2], t: t || now, msg: m[3].trim().slice(0, 120), branch: m[1].replace(/ \(root-commit\)$/, ''), file: s.file })
      if (!found.length) commits.set(b.tool_use_id, { id: b.tool_use_id, t: t || now, msg: msg || 'commit', branch: '', file: s.file })
    }
  }
}

async function read(file, size, now, today) {
  let s = files.get(file)
  if (!s || size < s.offset) { s = fresh(file); s.file = file; files.set(file, s) }
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
      for (const l of lines) if (l) line(s, l, now, today)
    }
  } finally { await fh.close() }
}

// Relist the tree every 20 s; between relists only stat files touched in the last hour.
async function crawl() {
  if (crawling) return
  crawling = true
  try {
    const now = Date.now(), today = midnight(), relist = now - listedAt > 20_000
    if (relist) { list = await listFiles(now); listedAt = now }
    for (const file of list) {
      const s = files.get(file)
      if (!relist && s && now - s.mtime > HOUR) continue
      let st; try { st = await fs.promises.stat(file) } catch { continue }
      if (now - st.mtimeMs > WEEK) continue
      await read(file, st.size, now, today)
      files.get(file).mtime = st.mtimeMs
    }
    ready = true
  } catch (e) { console.error('[tv crawl]', e.message) } finally { crawling = false; crawledAt = Date.now() }
}

export const prsSince = t => [...prs.values()].filter(p => p.at >= t)
export const crawlReady = () => ready
export const dayFacts = () => { const today = midnight(); return { today, files: [...files.values()].filter(s => s.factDay === today && (s.first || s.bigAt)) } }
export const titleOf = session => { for (const s of files.values()) if (!s.agent && s.session === session) return s.title || projectName(s.project); return null }

const projectName = p => p.replace(/^-Users-[^-]+-/, '').split(/--claude-worktrees-/)[0].split('-').filter(Boolean).at(-1) || p

function whoOf(s, names) {
  if (s.agent) {
    if (names.agents.has(s.agent)) return names.agents.get(s.agent)
    if (s.who === undefined) {
      try { const m = JSON.parse(fs.readFileSync(s.file.replace(/\.jsonl$/, '.meta.json'), 'utf8')); s.who = m.description || m.agentType || null } catch { s.who = null }
    }
    return s.who || 'agent · ' + projectName(s.project)
  }
  return names.sessions.get(s.session) || projectName(s.project)
}

function aggregate(snap) {
  const now = snap.now, today = midnight(), m0 = Math.floor(now / MIN)
  const names = { sessions: new Map(), agents: new Map() }
  for (const x of snap.sessions) { names.sessions.set(x.id, x.title); for (const a of x.agents) names.agents.set(a.id, a.description || a.type) }
  const spark = new Array(60).fill(0)
  let tokens = 0, out = 0, busiest = null
  for (const s of files.values()) {
    let recent = 0
    for (const [m, n] of s.mins) {
      if (m <= m0 - 60) { s.mins.delete(m); continue }
      spark[59 - (m0 - m)] += n
      if (m > m0 - 10) recent += n
    }
    if (recent && (!busiest || recent > busiest.calls)) busiest = { s, calls: recent }
    if (s.day === today) for (const [a, b] of s.tok.values()) { tokens += a; out += b }
  }
  for (const [id, c] of commits) if (now - c.t > 30 * MIN) commits.delete(id)
  const live = snap.sessions.filter(x => x.state !== 'idle').length
  return {
    ready,
    spark, toolsHour: spark.reduce((a, b) => a + b, 0),
    tokensToday: tokens, outToday: out,
    prsWeek: prsSince(now - WEEK).length, mergedWeek: snap.trophies?.merged ?? null,
    busiest: busiest && { name: whoOf(busiest.s, names), calls: busiest.calls, agent: !!busiest.s.agent },
    online: { sessions: snap.sessions.length, active: live, agents: snap.sessions.reduce((n, x) => n + x.agents.filter(a => a.state !== 'done' && a.state !== 'idle').length, 0) },
    commits: [...commits.values()].sort((a, b) => a.t - b.t).slice(-12).map(c => {
      const s = files.get(c.file)
      return { id: c.id, t: c.t, msg: c.msg, branch: c.branch, who: s ? whoOf(s, names) : '' }
    }),
  }
}

export default {
  snapshot(snap) {
    if (!crawling && snap.now - crawledAt > 1000) crawl()
    if (!cache || snap.now - cache.at > 1200) cache = { at: snap.now, data: aggregate(snap) }
    snap.tv = cache.data
  },
}
